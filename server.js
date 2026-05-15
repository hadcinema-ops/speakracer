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

// ── PASSAGES ──
const passages = [
  "The ancient lighthouse had stood on the rocky promontory for over two hundred years, its weathered stones bearing silent witness to countless storms that had battered the coastline and sent ships scrambling for safe harbor in the dead of night.",
  "She had spent the better part of a decade studying the migratory patterns of monarch butterflies, following them from the milkweed fields of the northern plains all the way down to the oyamel fir forests of central Mexico where millions gathered each winter.",
  "The farmer rose before dawn every single morning without fail, walking the fence lines of his property while the stars were still visible, checking for breaks in the wire and noting which sections would need repair before the spring rains arrived and softened the ground.",
  "Deep in the basement of the natural history museum, behind locked cabinets and forgotten filing systems, lay thousands of specimens that had never been properly catalogued, each one a potential discovery waiting patiently for the right pair of eyes to finally find them.",
  "Learning a new language as an adult is not simply a matter of memorizing vocabulary and grammar rules but rather a complete rewiring of the way your brain processes and organizes meaning, context, and the full spectrum of human experience and emotion.",
  "The old jazz club on the corner had seen far better days, its neon sign flickering uncertainly above the entrance, but every Friday night without fail the same trio of aging musicians took the stage and played with ferocious intensity until the small hours of the morning.",
  "Mountain rescue teams are trained to make life and death decisions in mere seconds, carefully balancing the safety of the rescuers against the urgency of reaching a stranded climber before the temperature drops and the narrow window of survival closes permanently.",
  "The community garden had started with just three small plots on a vacant lot and grown over five remarkable years into a sprawling green space where neighbors who had never exchanged a single word found themselves sharing tools, seeds, and family recipes across the fence.",
  "Every civilization in recorded human history has developed some form of currency, not because people are inherently commercial creatures, but because the ability to store and transfer value across time and great distances is absolutely fundamental to cooperation at any meaningful scale.",
  "The submarine descended slowly into the crushing darkness of the deep ocean trench, its reinforced hull groaning under the immense pressure, while the crew monitored their instruments in tense silence and waited to catch a glimpse of creatures that had never been photographed alive.",
  "She practiced the piano piece so many thousands of times that the notes stopped being notes and became something more like muscle memory encoded directly into her hands, so that even when her mind wandered elsewhere the music continued to flow perfectly and effortlessly from her fingers.",
  "The library had been built in a completely different era, when people genuinely believed that knowledge was something sacred and worth enshrining in marble and polished oak, and even now on a gray Tuesday afternoon it retained that sense of hushed and deeply serious purpose.",
  "Competitive speed reading sounds like a fundamental contradiction in terms until you realize that elite readers are not racing through individual words but rather training their eyes to take in entire phrases and full sentences in a single fixation without any internal subvocalization whatsoever.",
  "The fishing village had survived for centuries by carefully reading the sky and the sea, passing down generations of hard-won accumulated knowledge about weather patterns, fish behavior, and the subtle changes in current and tide that signal exactly where the best catches will reliably be found.",
  "Scientists studying the gut microbiome have recently discovered that the trillions of bacteria living in your digestive system influence not only your physical health but also your mood, your decision-making process, and even aspects of your personality in ways that were completely unimaginable just a generation ago.",
];

// ── STATE ──
// queue: [{socketId, name}]
// matches: { roomId: { players:{}, passage, started, startTime } }
const queue = [];
const matches = {};

function randPassage() { return passages[Math.floor(Math.random()*passages.length)]; }
function genRoomId() { return crypto.randomBytes(3).toString('hex').toUpperCase(); }
function getRoomPlayers(roomId) { return Object.values(matches[roomId]?.players || {}); }

// Remove a socket from the queue
function dequeue(socketId) {
  const i = queue.findIndex(q => q.socketId === socketId);
  if (i !== -1) queue.splice(i, 1);
}

io.on('connection', (socket) => {

  // ── MATCHMAKING ──
  socket.on('find_match', ({ name }) => {
    socket.data.name = name || 'Player';
    socket.data.roomId = null;

    // Remove from queue if already in it
    dequeue(socket.id);

    // Is there someone waiting?
    if (queue.length > 0) {
      const opponent = queue.shift();
      const oppSocket = io.sockets.sockets.get(opponent.socketId);

      if (!oppSocket) {
        // Opponent disconnected — put ourselves in queue
        queue.push({ socketId: socket.id, name: socket.data.name });
        socket.emit('queue_update', { position: queue.length });
        return;
      }

      // Create a match
      const roomId = genRoomId();
      const passage = randPassage();
      matches[roomId] = {
        players: {
          [socket.id]: { id: socket.id, name: socket.data.name, progress: 0, wpm: 0, done: false, finishTime: null, isHost: false },
          [opponent.socketId]: { id: opponent.socketId, name: opponent.name, progress: 0, wpm: 0, done: false, finishTime: null, isHost: true },
        },
        passage,
        started: false,
        startTime: null,
      };

      socket.data.roomId = roomId;
      oppSocket.data.roomId = roomId;

      socket.join(roomId);
      oppSocket.join(roomId);

      // Tell both players they're matched
      io.to(roomId).emit('match_found', {
        roomId,
        passage,
        players: getRoomPlayers(roomId),
      });

      // Start countdown automatically — no host button needed
      matches[roomId].started = true;
      setTimeout(() => {
        io.to(roomId).emit('race_countdown', { passage });
      }, 1500); // brief moment to show "match found" before countdown

      setTimeout(() => {
        if (!matches[roomId]) return;
        matches[roomId].startTime = Date.now();
        Object.values(matches[roomId].players).forEach(p => { p.progress=0; p.wpm=0; p.done=false; p.finishTime=null; });
        io.to(roomId).emit('race_start', { passage, startTime: matches[roomId].startTime });
      }, 5500); // 1.5s match screen + 4s countdown

    } else {
      // No one waiting — join queue
      queue.push({ socketId: socket.id, name: socket.data.name });
      socket.emit('queued', { position: queue.length });
    }
  });

  socket.on('cancel_search', () => {
    dequeue(socket.id);
    socket.emit('search_cancelled');
  });

  // ── IN-MATCH EVENTS ──
  socket.on('progress_update', ({ wordIndex, wpm }) => {
    const roomId = socket.data.roomId;
    if (!matches[roomId] || !matches[roomId].players[socket.id]) return;
    matches[roomId].players[socket.id].progress = wordIndex;
    matches[roomId].players[socket.id].wpm = wpm;
    socket.to(roomId).emit('opponent_update', { progress: wordIndex, wpm });
  });

  socket.on('race_finished', ({ wordIndex, wpm, accuracy }) => {
    const roomId = socket.data.roomId;
    if (!matches[roomId] || !matches[roomId].players[socket.id]) return;
    const player = matches[roomId].players[socket.id];
    if (player.done) return;
    player.done = true; player.finishTime = Date.now(); player.progress = wordIndex; player.wpm = wpm; player.accuracy = accuracy;
    const elapsed = matches[roomId].startTime ? ((Date.now()-matches[roomId].startTime)/1000).toFixed(1) : '?';
    io.to(roomId).emit('player_finished', { id: socket.id, name: player.name, wpm, accuracy, elapsed });
    if (Object.values(matches[roomId].players).every(p => p.done)) {
      io.to(roomId).emit('race_over', { players: getRoomPlayers(roomId) });
      matches[roomId].started = false;
    }
  });

  socket.on('play_again', () => {
    // Leave current match and go back to queue
    const roomId = socket.data.roomId;
    if (roomId && matches[roomId]) {
      socket.leave(roomId);
      delete matches[roomId].players[socket.id];
      if (Object.keys(matches[roomId].players).length === 0) delete matches[roomId];
      else socket.to(roomId).emit('opponent_left');
    }
    socket.data.roomId = null;
    socket.emit('returned_to_lobby');
  });

  // ── WebRTC Signaling ──
  socket.on('webrtc_offer', ({ offer }) => {
    const roomId = socket.data.roomId;
    if (roomId) socket.to(roomId).emit('webrtc_offer', { offer });
  });
  socket.on('webrtc_answer', ({ answer }) => {
    const roomId = socket.data.roomId;
    if (roomId) socket.to(roomId).emit('webrtc_answer', { answer });
  });
  socket.on('webrtc_ice', ({ candidate }) => {
    const roomId = socket.data.roomId;
    if (roomId) socket.to(roomId).emit('webrtc_ice', { candidate });
  });

  // ── DISCONNECT ──
  socket.on('disconnect', () => {
    dequeue(socket.id);
    const roomId = socket.data.roomId;
    if (!roomId || !matches[roomId]) return;
    delete matches[roomId].players[socket.id];
    if (Object.keys(matches[roomId].players).length === 0) {
      delete matches[roomId];
    } else {
      socket.to(roomId).emit('opponent_left');
      matches[roomId].started = false;
    }
  });
});

// Queue size broadcast every 3s so players can see how many are searching
setInterval(() => {
  io.emit('queue_size', { count: queue.length });
}, 3000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`SpeakRacer on http://localhost:${PORT}`));
