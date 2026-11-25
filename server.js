const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;
const GAMES_FILE = path.join(__dirname, 'custom_games.json');

app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, 'public')));

function loadCustomGames() {
  try {
    if (fs.existsSync(GAMES_FILE)) {
      return JSON.parse(fs.readFileSync(GAMES_FILE, 'utf8'));
    }
  } catch (err) {
    console.error('خطأ في قراءة ملف الألعاب:', err);
  }
  return [];
}

function saveCustomGames(games) {
  try {
    fs.writeFileSync(GAMES_FILE, JSON.stringify(games, null, 2), 'utf8');
  } catch (err) {
    console.error('خطأ في حفظ ملف الألعاب:', err);
  }
}

const players = {};
let customGames = loadCustomGames();

io.on('connection', (socket) => {
  players[socket.id] = {
    id: socket.id,
    name: `لاعب_${socket.id.substring(0, 4)}`,
    game: 'lobby',
    x: 0,
    y: 2,
    z: 0,
    rotY: 0,
    score: 0,
    avatar: {
      skin: '#ffdbac',
      shirt: '#00a2ff',
      pants: '#2c3e50',
      hat: 'none',
      face: 'smile'
    }
  };

  socket.emit('initData', {
    id: socket.id,
    players,
    customGames
  });

  socket.on('updatePlayer', (data) => {
    if (!players[socket.id]) return;
    Object.assign(players[socket.id], data);
    socket.broadcast.emit('playerMoved', players[socket.id]);
    if (data.name || data.avatar || data.game) {
      io.emit('playersList', Object.values(players));
    }
  });

  socket.on('addScore', (points = 10) => {
    if (!players[socket.id]) return;
    players[socket.id].score += points;
    io.emit('playersList', Object.values(players));
  });

  socket.on('chatMessage', (text) => {
    const clean = String(text || '').trim().slice(0, 120);
    if (!clean || !players[socket.id]) return;
    io.emit('chatMessage', {
      sender: players[socket.id].name,
      text: clean
    });
  });

  socket.on('fireBlast', (blastData) => {
    socket.broadcast.emit('remoteBlast', {
      ownerId: socket.id,
      ...blastData
    });
  });

  socket.on('publishStudioGame', (gameData) => {
    const title = String(gameData.title || '').trim().slice(0, 30);
    const desc = String(gameData.desc || '').trim().slice(0, 90) || 'لعبة مخصصة صُممت في Studio';
    const blocks = Array.isArray(gameData.blocks) ? gameData.blocks : [];

    if (!title || blocks.length === 0) return;

    const newGame = {
      id: `custom_${Date.now()}`,
      title,
      desc,
      creator: players[socket.id]?.name || 'مطور',
      blocks
    };

    customGames.push(newGame);
    saveCustomGames(customGames);
    io.emit('customGamesUpdated', customGames);
  });

  socket.on('deleteCustomGame', (gameId) => {
    customGames = customGames.filter((g) => g.id !== gameId);
    saveCustomGames(customGames);
    io.emit('customGamesUpdated', customGames);
  });

  io.emit('playersList', Object.values(players));

  socket.on('disconnect', () => {
    delete players[socket.id];
    io.emit('playerDisconnected', socket.id);
    io.emit('playersList', Object.values(players));
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`ROBLOX WEB Server running on port ${PORT}`);
});