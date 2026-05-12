const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

app.use(express.static(path.join(__dirname, 'public')));

// ── PASSAGES ──
const passages = [
  "The quick brown fox jumps over the lazy dog near the old wooden fence by the river bank.",
  "Speech recognition technology lets computers understand human language spoken aloud in real time.",
  "Practice speaking clearly and at a steady pace to dramatically improve your recognition score over time.",
  "Technology has fundamentally transformed the way we communicate with each other every single day.",
  "A journey of a thousand miles begins with a single step and a very clear destination in mind.",
  "Pack my box with five dozen liquor jugs and make absolutely sure every single one is properly sealed.",
  "Racing through words as fast as you can speak them out loud is much harder than it first sounds.",
  "The bright morning light filtered through the tall trees casting long shadows across the wet green grass.",
  "Every great human achievement starts with the bold decision to try something new and challenging.",
  "She grabbed the silver key from the dusty shelf and ran down the hallway toward the locked wooden door.",
  "The championship was decided in the final seconds when the crowd erupted into a deafening roar.",
  "Artificial intelligence systems can now process spoken language faster than most humans can type it.",
  "The mountain trail wound steeply upward through dense forest before opening onto a breathtaking summit view.",
  "Scientists discovered that regular exercise improves memory and cognitive function across all age groups significantly.",
  "The old lighthouse keeper watched the storm approach from the east as waves crashed against the rocks below.",
];

// ── ROOMS ──
// rooms[roomId] = { players: {socketId: {name, progress, wpm, done}}, passage, started, startTime, countdown }
const rooms = {};

function randPassage() {
  return passages[Math.floor(Math.random() * passages.length)];
}
function genRoomId() {
  return crypto.randomBytes(3).toString('hex').toUpperCase(); // e.g. "A3F7C2"
}
function getRoomPlayers(roomId) {
  return Object.values(rooms[roomId]?.players || {});
}

// ── SOCKET LOGIC ──
io.on('connection', (socket) => {

  // Create a new room
  socket.on('create_room', ({ name }) => {
    const roomId = genRoomId();
    rooms[roomId] = {
      players: {},
      passage: randPassage(),
      started: false,
      startTime: null,
    };
    joinRoom(socket, roomId, name);
  });

  // Join existing room
  socket.on('join_room', ({ roomId, name }) => {
    const id = roomId.toUpperCase().trim();
    if (!rooms[id]) {
      socket.emit('error_msg', 'Room not found. Check the code and try again.');
      return;
    }
    if (rooms[id].started) {
      socket.emit('error_msg', 'That race already started. Create a new room.');
      return;
    }
    if (Object.keys(rooms[id].players).length >= 2) {
      socket.emit('error_msg', 'Room is full (2 players max).');
      return;
    }
    joinRoom(socket, id, name);
  });

  function joinRoom(socket, roomId, name) {
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.name = name || 'Player';

    const isHost = Object.keys(rooms[roomId].players).length === 0;
    rooms[roomId].players[socket.id] = {
      id: socket.id,
      name: socket.data.name,
      progress: 0,
      wpm: 0,
      done: false,
      finishTime: null,
      isHost,
    };

    socket.emit('room_joined', {
      roomId,
      passage: rooms[roomId].passage,
      isHost,
      players: getRoomPlayers(roomId),
    });

    io.to(roomId).emit('room_update', {
      players: getRoomPlayers(roomId),
    });
  }

  // Host changes passage
  socket.on('change_passage', () => {
    const roomId = socket.data.roomId;
    if (!rooms[roomId]) return;
    const player = rooms[roomId].players[socket.id];
    if (!player?.isHost) return;
    rooms[roomId].passage = randPassage();
    io.to(roomId).emit('passage_changed', { passage: rooms[roomId].passage });
  });

  // Host starts countdown
  socket.on('start_race', () => {
    const roomId = socket.data.roomId;
    if (!rooms[roomId]) return;
    const player = rooms[roomId].players[socket.id];
    if (!player?.isHost) return;
    if (Object.keys(rooms[roomId].players).length < 2) {
      socket.emit('error_msg', 'Need 2 players to start. Share your room code!');
      return;
    }

    rooms[roomId].started = true;

    // Reset progress
    Object.values(rooms[roomId].players).forEach(p => {
      p.progress = 0; p.wpm = 0; p.done = false; p.finishTime = null;
    });

    io.to(roomId).emit('race_countdown', { passage: rooms[roomId].passage });

    // Start race after 3s countdown
    setTimeout(() => {
      rooms[roomId].startTime = Date.now();
      io.to(roomId).emit('race_start', {
        passage: rooms[roomId].passage,
        startTime: rooms[roomId].startTime,
      });
    }, 3500);
  });

  // Player progress update
  socket.on('progress_update', ({ wordIndex, wpm }) => {
    const roomId = socket.data.roomId;
    if (!rooms[roomId] || !rooms[roomId].players[socket.id]) return;
    rooms[roomId].players[socket.id].progress = wordIndex;
    rooms[roomId].players[socket.id].wpm = wpm;
    // Broadcast to others in room
    socket.to(roomId).emit('opponent_update', {
      id: socket.id,
      progress: wordIndex,
      wpm,
    });
  });

  // Player finished
  socket.on('race_finished', ({ wordIndex, wpm, accuracy }) => {
    const roomId = socket.data.roomId;
    if (!rooms[roomId] || !rooms[roomId].players[socket.id]) return;
    const player = rooms[roomId].players[socket.id];
    if (player.done) return;
    player.done = true;
    player.finishTime = Date.now();
    player.progress = wordIndex;
    player.wpm = wpm;
    player.accuracy = accuracy;

    const elapsed = rooms[roomId].startTime
      ? ((Date.now() - rooms[roomId].startTime) / 1000).toFixed(1)
      : '?';

    io.to(roomId).emit('player_finished', {
      id: socket.id,
      name: player.name,
      wpm,
      accuracy,
      elapsed,
      players: getRoomPlayers(roomId),
    });

    // Check if all done
    const allDone = Object.values(rooms[roomId].players).every(p => p.done);
    if (allDone) {
      io.to(roomId).emit('race_over', { players: getRoomPlayers(roomId) });
      rooms[roomId].started = false;
    }
  });

  // Rematch request
  socket.on('request_rematch', () => {
    const roomId = socket.data.roomId;
    if (!rooms[roomId]) return;
    rooms[roomId].started = false;
    Object.values(rooms[roomId].players).forEach(p => {
      p.progress = 0; p.wpm = 0; p.done = false; p.finishTime = null;
    });
    rooms[roomId].passage = randPassage();
    io.to(roomId).emit('rematch_ready', {
      passage: rooms[roomId].passage,
      players: getRoomPlayers(roomId),
    });
  });

  // Disconnect
  socket.on('disconnect', () => {
    const roomId = socket.data.roomId;
    if (!rooms[roomId]) return;
    delete rooms[roomId].players[socket.id];
    if (Object.keys(rooms[roomId].players).length === 0) {
      delete rooms[roomId];
    } else {
      // Reassign host if needed
      const remaining = Object.values(rooms[roomId].players);
      if (!remaining.some(p => p.isHost)) remaining[0].isHost = true;
      io.to(roomId).emit('opponent_left', {
        players: getRoomPlayers(roomId),
      });
      rooms[roomId].started = false;
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`SpeakRacer running on http://localhost:${PORT}`);
});
