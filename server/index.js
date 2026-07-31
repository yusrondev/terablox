// Terablox Multiplayer Server — Colyseus 0.15
const http = require('http');
const express = require('express');
const { Server } = require('colyseus');
const { WebSocketTransport } = require('@colyseus/ws-transport');
const { GameRoom } = require('./GameRoom');

const app = express();
const port = Number(process.env.PORT || 2567);

// CORS for all origins (supports ngrok, localhost, VPS)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.json());

const httpServer = http.createServer(app);

// Colyseus 0.17 game server
const gameServer = new Server({
  transport: new WebSocketTransport({
    server: httpServer,
    maxPayload: 1024 * 1024 * 50 // 50MB
  })
});
gameServer.define('terablox', GameRoom);

// Health check endpoint
app.get('/health', (req, res) => res.json({ status: 'ok', time: Date.now() }));

gameServer.listen(port).then(() => {
  console.log('\n\x1b[32m🎮 Terablox Multiplayer Server\x1b[0m');
  console.log(`   \x1b[36mPort:\x1b[0m ${port}`);
  console.log(`   \x1b[36mHealth:\x1b[0m http://localhost:${port}/health`);
  console.log('\n   Share via ngrok: \x1b[33mngrok http 2567\x1b[0m\n');
});
