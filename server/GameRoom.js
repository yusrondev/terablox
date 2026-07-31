// Terablox GameRoom — handles all multiplayer state sync
const { Room } = require('colyseus');

// Vibrant shirt colors assigned round-robin to each new player
const SHIRT_COLORS = [
  0xff4444, // red
  0xff8c00, // orange
  0x44dd44, // green
  0x00cfff, // cyan
  0xff44ff, // magenta
  0xffdd00, // yellow
  0xff69b4, // pink
  0x9b59b6, // purple
  0x20b2aa, // teal
  0x88ccff, // sky blue
];

const PANTS_COLORS = [
  0x374151, // dark gray
  0x111827, // black
  0x1e3a8a, // dark blue
  0x064e3b, // dark green
  0x7c2d12, // dark brown
  0x581c87, // dark purple
  0xb30000, // dark red
];

const SKIN_COLORS = [
  0xffe0bd, // pale skin
  0xf1c27d, // medium skin
  0xe0a96d, // tanned skin
  0xc68642, // dark skin
  0x8d5524, // deep brown skin
];

function makeRoomCode() {
  // 4 uppercase letters, avoiding I/O for clarity
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  return Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

class GameRoom extends Room {
  onCreate(options) {
    this.maxClients = 16;

    // In-memory state (manual sync — no Schema decorators needed)
    this.players   = {};
    this.npcs      = {};
    this.weather   = 'mendung';
    this.hostId    = null;
    this._colorIdx = 0;
    this.gameStarted = false;
    this.mapData = null;

    // Override Colyseus roomId with a human-readable 4-char code
    this.roomId = makeRoomCode();

    console.log(`[GameRoom] Created room: ${this.roomId}`);

    // ── Message Handlers ──────────────────────────────────────────────────────

    // Player sends own position/state every ~50ms (20 Hz)
    this.onMessage('playerMove', (client, data) => {
      const p = this.players[client.sessionId];
      if (!p) return;
      p.x              = data.x;
      p.y              = data.y;
      p.z              = data.z;
      p.rotY           = data.rotY;
      p.state          = data.state;
      p.animTime       = data.animTime;
      p.interactableId = data.interactableId;
      // Relay to all other clients
      this.broadcast('playerMoved', {
        id: client.sessionId, x: p.x, y: p.y, z: p.z,
        rotY: p.rotY, state: p.state, animTime: p.animTime,
        interactableId: p.interactableId
      }, { except: client });
    });

    // Host sends NPC positions ~10 Hz
    this.onMessage('npcUpdate', (client, data) => {
      if (client.sessionId !== this.hostId) return;
      // Store and relay
      if (Array.isArray(data.npcs)) {
        data.npcs.forEach(n => { this.npcs[n.id] = n; });
      }
      this.broadcast('npcState', { npcs: data.npcs }, { except: client });
    });

    // Host changes weather
    this.onMessage('weatherChange', (client, data) => {
      if (client.sessionId !== this.hostId) return;
      this.weather = data.weather;
      this.broadcast('weatherChanged', { weather: this.weather }, { except: client });
    });

    // Host or joiner moves a vehicle (placed custom vehicle)
    this.onMessage('vehicleMove', (client, data) => {
      this.broadcast('vehicleMoved', data, { except: client });
    });

    // Host starts game
    this.onMessage('startGame', (client, data) => {
      if (client.sessionId !== this.hostId) return;
      this.gameStarted = true;
      this.mapData = data.mapData;
      this.broadcast('gameStarted', { mapData: data.mapData });
    });
  }

  onJoin(client, options) {
    let color = SHIRT_COLORS[this._colorIdx % SHIRT_COLORS.length];
    let pantsColor = PANTS_COLORS[this._colorIdx % PANTS_COLORS.length];
    let skinColor = SKIN_COLORS[this._colorIdx % SKIN_COLORS.length];
    this._colorIdx++;

    if (options && options.shirtColor) {
      const sc = options.shirtColor;
      if (typeof sc === 'string' && sc.startsWith('#')) {
        color = parseInt(sc.slice(1), 16);
      } else if (typeof sc === 'number') {
        color = sc;
      }
    }

    if (options && options.pantsColor) {
      const pc = options.pantsColor;
      if (typeof pc === 'string' && pc.startsWith('#')) {
        pantsColor = parseInt(pc.slice(1), 16);
      } else if (typeof pc === 'number') {
        pantsColor = pc;
      }
    }

    if (options && options.skinColor) {
      const sk = options.skinColor;
      if (typeof sk === 'string' && sk.startsWith('#')) {
        skinColor = parseInt(sk.slice(1), 16);
      } else if (typeof sk === 'number') {
        skinColor = sk;
      }
    }

    const playerCount = Object.keys(this.players).length;
    const username = (options && options.username && options.username.trim())
      ? options.username.trim().slice(0, 20)
      : `Player${playerCount + 1}`;

    this.players[client.sessionId] = {
      id: client.sessionId,
      x: 0, y: 1, z: 0,
      rotY: 0,
      state: 'idle',
      animTime: 0,
      shirtColor: color,
      pantsColor: pantsColor,
      skinColor: skinColor,
      username,
      interactableId: null,
    };

    // First player becomes host
    if (!this.hostId) {
      this.hostId = client.sessionId;
    }

    console.log(`[GameRoom ${this.roomId}] ${username} (${client.sessionId.slice(0,6)}) joined | host: ${this.hostId.slice(0,6)}`);

    // Send full world state to new joiner
    client.send('welcome', {
      sessionId: client.sessionId,
      hostId:    this.hostId,
      players:   this.players,
      weather:   this.weather,
      npcs:      this.npcs,
      yourColor: color,
      yourPantsColor: pantsColor,
      yourSkinColor: skinColor,
      gameStarted: this.gameStarted,
      mapData:     this.mapData,
    });

    // Notify all others about the new player
    this.broadcast('playerJoined', this.players[client.sessionId], { except: client });
  }

  onLeave(client, consented) {
    const p = this.players[client.sessionId];
    const name = p ? p.username : client.sessionId.slice(0, 6);
    console.log(`[GameRoom ${this.roomId}] ${name} left`);

    delete this.players[client.sessionId];
    this.broadcast('playerLeft', { id: client.sessionId });

    // Re-assign host if the host left
    if (this.hostId === client.sessionId) {
      const remaining = Object.keys(this.players);
      this.hostId = remaining.length > 0 ? remaining[0] : null;
      if (this.hostId) {
        console.log(`[GameRoom ${this.roomId}] New host: ${this.hostId.slice(0, 6)}`);
        this.broadcast('hostChanged', { hostId: this.hostId });
      }
    }
  }

  onDispose() {
    console.log(`[GameRoom ${this.roomId}] Disposed`);
  }
}

module.exports = { GameRoom };
