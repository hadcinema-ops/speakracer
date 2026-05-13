const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const passages = [
  "The ancient lighthouse had stood on the rocky promontory for over two hundred years, its weathered stones bearing silent witness to countless storms that had battered the coastline and sent ships scrambling for safe harbor.",
  "She had spent the better part of a decade studying the migratory patterns of monarch butterflies, following them from the milkweed fields of the northern plains all the way down to the oyamel fir forests of central Mexico.",
  "The farmer rose before dawn every morning without fail, walking the fence lines of his property while the stars were still out, checking for breaks in the wire and noting which sections would need repair before the spring rains arrived.",
  "Deep in the basement of the natural history museum, behind locked cabinets and forgotten filing systems, lay thousands of specimens that had never been properly catalogued, each one a potential discovery waiting for the right pair of eyes.",
  "Learning a new language as an adult is not simply a matter of memorizing vocabulary and grammar rules but rather a complete rewiring of the way your brain processes and organizes meaning, context, and human experience.",
  "The old jazz club on the corner had seen better days, its neon sign flickering uncertainly above the entrance, but every Friday night without fail the same trio of musicians took the stage and played until the small hours of the morning.",
  "Mountain rescue teams are trained to make life-or-death decisions in seconds, balancing the safety of the rescuers against the urgency of reaching a stranded climber before the temperature drops and the window of survival closes forever.",
  "The community garden had started with just three plots on a vacant lot and grown over five years into a sprawling green space where neighbors who had never exchanged a word found themselves sharing tools, seeds, and recipes across the fence.",
  "Every civilization in recorded history has developed some form of currency, not because humans are inherently commercial creatures, but because the ability to store and transfer value across time and distance is fundamental to cooperation at scale.",
  "The submarine descended slowly into the crushing darkness of the deep ocean trench, its hull groaning under the immense pressure, while the crew monitored their instruments and waited to catch a glimpse of creatures that had never been photographed alive.",
  "She practiced the piano piece so many times that the notes stopped being notes and became something more like muscle memory encoded directly into her hands, so that even when her mind wandered the music continued to flow perfectly from her fingers.",
  "The library had been built in a different era, when people believed that knowledge was something sacred and worth enshrining in marble and oak, and even now on a gray Tuesday afternoon it retained that sense of hushed and serious purpose.",
  "Competitive speed reading sounds like a contradiction in terms until you realize that elite readers are not racing through words but rather training their eyes to take in entire phrases and sentences in a single fixation without any subvocalization at all.",
  "The fishing village had survived for centuries by reading the sky and the sea, passing down generations of accumulated knowledge about weather patterns, fish behavior, and the subtle changes in current that signal where the best catches will be found.",
  "Scientists studying the gut microbiome have discovered that the trillions of bacteria living in your digestive system influence not only your physical health but also your mood, your decision-making, and even your personality in ways that were completely unimaginable a generation ago.",
];

const rooms = {};

function genRoomId() { return crypto.randomBytes(3).toString('hex').toUpperCase(); }
function getRoomPlayers(roomId) { return Object.values(rooms[roomId]?.players || {}); }

io.on('connection', (socket) => {

  socket.on('create_room', ({ name }) => {
    const roomId = genRoomId();
    rooms[roomId] = { players: {}, passage: passages[Math.floor(Math.random()*passages.length)], started: false, startTime: null };
    joinRoom(socket, roomId, name);
  });

  socket.on('join_room', ({ roomId, name }) => {
    const id = roomId.toUpperCase().trim();
    if (!rooms[id]) { socket.emit('error_msg', 'Room not found.'); return; }
    if (rooms[id].started) { socket.emit('error_msg', 'Race already started.'); return; }
    if (Object.keys(rooms[id].players).length >= 2) { socket.emit('error_msg', 'Room is full.'); return; }
    joinRoom(socket, id, name);
  });

  function joinRoom(socket, roomId, name) {
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.name = name || 'Player';
    const isHost = Object.keys(rooms[roomId].players).length === 0;
    rooms[roomId].players[socket.id] = { id: socket.id, name: socket.data.name, progress: 0, wpm: 0, done: false, finishTime: null, isHost };
    socket.emit('room_joined', { roomId, passage: rooms[roomId].passage, isHost, players: getRoomPlayers(roomId) });
    io.to(roomId).emit('room_update', { players: getRoomPlayers(roomId) });
  }

  socket.on('change_passage', () => {
    const roomId = socket.data.roomId;
    if (!rooms[roomId]) return;
    if (!rooms[roomId].players[socket.id]?.isHost) return;
    rooms[roomId].passage = passages[Math.floor(Math.random()*passages.length)];
    io.to(roomId).emit('passage_changed', { passage: rooms[roomId].passage });
  });

  socket.on('start_race', () => {
    const roomId = socket.data.roomId;
    if (!rooms[roomId]) return;
    if (!rooms[roomId].players[socket.id]?.isHost) return;
    if (Object.keys(rooms[roomId].players).length < 2) { socket.emit('error_msg', 'Need 2 players to start!'); return; }
    rooms[roomId].started = true;
    Object.values(rooms[roomId].players).forEach(p => { p.progress=0; p.wpm=0; p.done=false; p.finishTime=null; });
    io.to(roomId).emit('race_countdown', { passage: rooms[roomId].passage });
    setTimeout(() => {
      rooms[roomId].startTime = Date.now();
      io.to(roomId).emit('race_start', { passage: rooms[roomId].passage, startTime: rooms[roomId].startTime });
    }, 4000);
  });

  socket.on('progress_update', ({ wordIndex, wpm }) => {
    const roomId = socket.data.roomId;
    if (!rooms[roomId] || !rooms[roomId].players[socket.id]) return;
    rooms[roomId].players[socket.id].progress = wordIndex;
    rooms[roomId].players[socket.id].wpm = wpm;
    socket.to(roomId).emit('opponent_update', { id: socket.id, progress: wordIndex, wpm });
  });

  socket.on('race_finished', ({ wordIndex, wpm, accuracy }) => {
    const roomId = socket.data.roomId;
    if (!rooms[roomId] || !rooms[roomId].players[socket.id]) return;
    const player = rooms[roomId].players[socket.id];
    if (player.done) return;
    player.done = true; player.finishTime = Date.now(); player.progress = wordIndex; player.wpm = wpm; player.accuracy = accuracy;
    const elapsed = rooms[roomId].startTime ? ((Date.now()-rooms[roomId].startTime)/1000).toFixed(1) : '?';
    io.to(roomId).emit('player_finished', { id: socket.id, name: player.name, wpm, accuracy, elapsed, players: getRoomPlayers(roomId) });
    if (Object.values(rooms[roomId].players).every(p=>p.done)) { io.to(roomId).emit('race_over', { players: getRoomPlayers(roomId) }); rooms[roomId].started=false; }
  });

  socket.on('request_rematch', () => {
    const roomId = socket.data.roomId;
    if (!rooms[roomId]) return;
    rooms[roomId].started = false;
    Object.values(rooms[roomId].players).forEach(p => { p.progress=0; p.wpm=0; p.done=false; p.finishTime=null; });
    rooms[roomId].passage = passages[Math.floor(Math.random()*passages.length)];
    io.to(roomId).emit('rematch_ready', { passage: rooms[roomId].passage, players: getRoomPlayers(roomId) });
  });

  // ── WebRTC Signaling ──
  socket.on('webrtc_offer', ({ offer }) => {
    const roomId = socket.data.roomId;
    if (roomId) socket.to(roomId).emit('webrtc_offer', { offer, fromId: socket.id });
  });
  socket.on('webrtc_answer', ({ answer }) => {
    const roomId = socket.data.roomId;
    if (roomId) socket.to(roomId).emit('webrtc_answer', { answer });
  });
  socket.on('webrtc_ice', ({ candidate }) => {
    const roomId = socket.data.roomId;
    if (roomId) socket.to(roomId).emit('webrtc_ice', { candidate });
  });

  socket.on('disconnect', () => {
    const roomId = socket.data.roomId;
    if (!rooms[roomId]) return;
    delete rooms[roomId].players[socket.id];
    if (Object.keys(rooms[roomId].players).length === 0) { delete rooms[roomId]; return; }
    const remaining = Object.values(rooms[roomId].players);
    if (!remaining.some(p=>p.isHost)) remaining[0].isHost = true;
    io.to(roomId).emit('opponent_left', { players: getRoomPlayers(roomId) });
    rooms[roomId].started = false;
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`SpeakRacer on http://localhost:${PORT}`));
