/**
 * multiplayer.js — Terablox MultiplayerManager
 * Handles Colyseus connection, ghost player rendering, and state sync.
 */
import * as THREE from 'three';
import { Client } from '@colyseus/sdk';

// ── Shared NPC/Ghost geometry (reuse to save memory) ──────────────────────────
const _legGeo   = new THREE.BoxGeometry(0.45, 1.5, 0.45);
const _torsoGeo = new THREE.BoxGeometry(1.1, 1.5, 0.55);
const _armGeo   = new THREE.BoxGeometry(0.38, 1.4, 0.38);
const _headGeo  = new THREE.BoxGeometry(0.85, 0.85, 0.85);
const _skinMat  = new THREE.MeshLambertMaterial({ color: 0xffe0bd });
const _pantsMat = new THREE.MeshLambertMaterial({ color: 0x2a2a3a });

// Vibrant shirt colors assigned round-robin to each new player
const SHIRT_COLORS = [
  0x88ccff, // sky blue (default player color)
  0xff4444, // red
  0xff8c00, // orange
  0x44dd44, // green
  0x00cfff, // cyan
  0xff44ff, // magenta
  0xffdd00, // yellow
  0xff69b4, // pink
  0x9b59b6, // purple
  0x20b2aa, // teal
];

function getInteractableId(interactable) {
  if (!interactable || !interactable.position) return null;
  const p = interactable.position;
  return `${Math.round(p.x)}_${Math.round(p.y)}_${Math.round(p.z)}`;
}

// ── GhostPlayer ───────────────────────────────────────────────────────────────
class GhostPlayer {
  constructor(playerData, sceneManager, camera) {
    this.id          = playerData.id;
    this.username    = playerData.username || 'Player';
    this.shirtColor  = playerData.shirtColor || 0x88ccff;
    this.pantsColor  = playerData.pantsColor || 0x5577cc;
    this.skinColor   = playerData.skinColor || 0xffe0bd;
    this.sceneManager = sceneManager;
    this.scene       = sceneManager.scene;
    this.camera      = camera;

    this.targetPos   = new THREE.Vector3(playerData.x || 0, playerData.y || 1, playerData.z || 0);
    this.targetRotY  = playerData.rotY || 0;
    this.state       = playerData.state || 'idle';
    this.animTime    = 0;
    this.interactableId = playerData.interactableId || null;

    this._buildMesh();
    this._buildLabel();
  }

  _buildMesh() {
    this.mesh = new THREE.Group();
    const shirtMat = new THREE.MeshLambertMaterial({ color: this.shirtColor });
    const pantsMat = new THREE.MeshLambertMaterial({ color: this.pantsColor });
    const skinMat = new THREE.MeshLambertMaterial({ color: this.skinColor });

    // Left Leg
    this.leftLeg = new THREE.Group();
    this.leftLeg.position.set(0.28, 1.5, 0);
    const leftLegMesh = new THREE.Mesh(_legGeo, pantsMat);
    leftLegMesh.position.y = -0.75;
    this.leftLeg.add(leftLegMesh);

    // Right Leg
    this.rightLeg = new THREE.Group();
    this.rightLeg.position.set(-0.28, 1.5, 0);
    const rightLegMesh = new THREE.Mesh(_legGeo, pantsMat);
    rightLegMesh.position.y = -0.75;
    this.rightLeg.add(rightLegMesh);

    // Torso
    this.torso = new THREE.Mesh(_torsoGeo, shirtMat);
    this.torso.position.set(0, 2.25, 0);

    // Left Arm
    this.leftArm = new THREE.Group();
    this.leftArm.position.set(0.8, 3.0, 0);
    const leftArmMesh = new THREE.Mesh(_armGeo, skinMat);
    leftArmMesh.position.y = -0.7;
    this.leftArm.add(leftArmMesh);

    // Right Arm
    this.rightArm = new THREE.Group();
    this.rightArm.position.set(-0.8, 3.0, 0);
    const rightArmMesh = new THREE.Mesh(_armGeo, skinMat);
    rightArmMesh.position.y = -0.7;
    this.rightArm.add(rightArmMesh);

    // Head
    const head = new THREE.Mesh(_headGeo, skinMat);
    head.position.set(0, 3.42, 0);

    this.mesh.add(this.leftLeg, this.rightLeg, this.torso, this.leftArm, this.rightArm, head);
    this.mesh.scale.set(0.5, 0.5, 0.5);
    this.mesh.name = 'ghost_player';

    this.mesh.position.copy(this.targetPos);
    this.mesh.rotation.y = this.targetRotY;

    this.scene.add(this.mesh);
  }

  _buildLabel() {
    this.labelEl = document.createElement('div');
    this.labelEl.className = 'ghost-player-label';
    this.labelEl.textContent = this.username;
    // Color indicator matches shirt color
    const hex = '#' + this.shirtColor.toString(16).padStart(6, '0');
    this.labelEl.style.cssText = `
      position: fixed;
      pointer-events: none;
      z-index: 1000;
      font-family: 'Inter', sans-serif;
      font-size: 11px;
      font-weight: 700;
      color: white;
      background: rgba(0,0,0,0.65);
      border: 2px solid ${hex};
      border-radius: 12px;
      padding: 2px 8px;
      white-space: nowrap;
      text-shadow: 0 1px 2px rgba(0,0,0,0.8);
      transition: opacity 0.2s;
      display: none;
    `;
    document.body.appendChild(this.labelEl);
  }

  applyState(data) {
    this.targetPos.set(data.x, data.y, data.z);
    this.targetRotY = data.rotY;
    if (data.state) this.state = data.state;
    if (data.animTime !== undefined) this._remoteAnim = data.animTime;
    this.interactableId = data.interactableId || null;
  }

  update(dt, renderer) {
    // Snap ghost player position/rotation to the chair/vehicle if sitting/driving to prevent clipping or desync
    let snapped = false;
    if ((this.state === 'driving' || this.state === 'sitting') && this.interactableId && this.sceneManager) {
      // Find matching interactable by uid (stable even when vehicle moves)
      const intr = this.sceneManager.interactables ? this.sceneManager.interactables.find(item =>
        item.uid === this.interactableId
      ) : null;

      if (intr && intr.mesh) {
        snapped = true;
        if (this.state === 'driving' && intr.asset && intr.asset.sockets && intr.asset.sockets.seat) {
          const s = intr.asset.sockets.seat;
          const seatOffset = new THREE.Vector3(s.x, s.y, s.z);
          seatOffset.applyQuaternion(intr.mesh.quaternion);
          this.mesh.position.copy(intr.mesh.position).add(seatOffset);
          this.mesh.position.y -= 1.4; // Match local player sit() offset
          this.mesh.quaternion.copy(intr.mesh.quaternion);
        } else {
          // Sitting on a bench/chair – show at bench seat height
          this.mesh.position.set(intr.position.x, intr.position.y - 0.60, intr.position.z);
          this.mesh.rotation.set(0, this.targetRotY, 0);
        }
      }
    }

    if (!snapped) {
      // Smooth interpolation of position and rotation for walking/running (independent of frame rate / network latency)
      const lerpSpeed = Math.min(1.0, 10 * dt);
      this.mesh.position.lerp(this.targetPos, lerpSpeed);
      const dy = this.targetRotY - this.mesh.rotation.y;
      // Handle wrap-around for rotation
      const dyClamped = ((dy + Math.PI) % (Math.PI * 2)) - Math.PI;
      this.mesh.rotation.y += dyClamped * lerpSpeed;
    }

    // Walking / sitting animations
    if (this.state === 'driving') {
      // Bent legs & arms reaching handlebars
      this.leftLeg.rotation.x  = -Math.PI / 2;
      this.rightLeg.rotation.x = -Math.PI / 2;
      this.leftArm.rotation.x  = -1.2;
      this.rightArm.rotation.x = -1.2;
    } else if (this.state === 'sitting') {
      // Bent legs & arms resting (bench pose)
      this.leftLeg.rotation.x  = -Math.PI / 2;
      this.rightLeg.rotation.x = -Math.PI / 2;
      this.leftArm.rotation.x  = -Math.PI / 4;
      this.rightArm.rotation.x = -Math.PI / 4;
    } else if (this.state === 'walk' || this.state === 'run' || this.state === 'sprint') {
      this.animTime += dt * (this.state === 'walk' ? 8 : 14);
      const s = Math.sin(this.animTime) * 0.5;
      this.leftArm.rotation.x  =  s;
      this.rightArm.rotation.x = -s;
      this.leftLeg.rotation.x  = -s;
      this.rightLeg.rotation.x =  s;
    } else {
      this.animTime = 0;
      this.leftArm.rotation.x  = 0;
      this.rightArm.rotation.x = 0;
      this.leftLeg.rotation.x  = 0;
      this.rightLeg.rotation.x = 0;
    }

    // Update HTML label position (project 3D → 2D)
    this._updateLabel(renderer);
  }

  _updateLabel(renderer) {
    if (!this.camera || !renderer) {
      this.labelEl.style.display = 'none';
      return;
    }

    // World position above the head
    const labelPos = this.mesh.position.clone();
    labelPos.y += 2.1; // above head (mesh is scaled 0.5 so head top ~2.0)

    // Project to screen
    const projected = labelPos.clone().project(this.camera);
    const w = window.innerWidth;
    const h = window.innerHeight;
    const sx = (projected.x * 0.5 + 0.5) * w;
    const sy = (1 - (projected.y * 0.5 + 0.5)) * h;

    // Hide if behind camera or off screen
    if (projected.z > 1 || sx < -100 || sx > w + 100 || sy < -50 || sy > h + 50) {
      this.labelEl.style.display = 'none';
      return;
    }

    this.labelEl.style.display = 'block';
    this.labelEl.style.left = `${sx}px`;
    this.labelEl.style.top  = `${sy}px`;
    this.labelEl.style.transform = 'translate(-50%, -100%)';

    // Fade with distance
    const dist = this.camera.position.distanceTo(this.mesh.position);
    const opacity = Math.max(0, Math.min(1, 1 - (dist - 5) / 50));
    this.labelEl.style.opacity = opacity.toFixed(2);
  }

  dispose() {
    this.scene.remove(this.mesh);
    if (this.labelEl && this.labelEl.parentNode) {
      this.labelEl.parentNode.removeChild(this.labelEl);
    }
  }
}

// ── MultiplayerManager ────────────────────────────────────────────────────────
export class MultiplayerManager {
  constructor(sceneManager) {
    this.sceneManager = sceneManager;
    this.client    = null;
    this.room      = null;
    this.ghosts    = new Map();  // sessionId → GhostPlayer
    this.isHost    = false;
    this.connected = false;
    this.mySessionId = null;

    // Callbacks
    this.onWeatherChange = null;  // (weatherKey) => void — set by game
    this.onHostChanged   = null;  // (isHost) => void
    this.onGameStarted   = null;  // (mapData) => void
    this.onPlayersUpdated = null; // (playersMap, hostId) => void
    
    // Track joined players to defer ghost spawning until sceneManager is loaded
    this.roomPlayers = new Map(); // sessionId -> playerData
    this.hostId = null;
  }

  _getCustomPresetColor(presetKey) {
    try {
      const saved = localStorage.getItem('terablox_char_preset');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed[presetKey]) {
          return parsed[presetKey];
        }
      }
    } catch (e) {
      console.error(e);
    }
    return null; // Return null if not customized, so server assigns unique color
  }

  // ── Connection ──────────────────────────────────────────────────────────────

  async createRoom(serverUrl, username) {
    try {
      this.client = new Client(this._normalizeUrl(serverUrl));
      const shirtColor = this._getCustomPresetColor('shirtColor');
      const pantsColor = this._getCustomPresetColor('pantsColor');
      const skinColor = this._getCustomPresetColor('skinColor');
      this.room = await this.client.create('terablox', { username, shirtColor, pantsColor, skinColor });
      this.mySessionId = this.room.sessionId;
      this._setupListeners();
      this.connected = true;
      console.log(`[MP] Created room: ${this.room.roomId}`);
      return { success: true, roomCode: this.room.roomId };
    } catch (err) {
      console.error('[MP] Create failed:', err);
      return { success: false, error: err.message };
    }
  }

  async joinRoom(serverUrl, roomCode, username) {
    try {
      this.client = new Client(this._normalizeUrl(serverUrl));
      const shirtColor = this._getCustomPresetColor('shirtColor');
      const pantsColor = this._getCustomPresetColor('pantsColor');
      const skinColor = this._getCustomPresetColor('skinColor');
      // roomId IS the 4-char code set in GameRoom.onCreate
      this.room = await this.client.joinById(roomCode.toUpperCase(), { username, shirtColor, pantsColor, skinColor });
      this.mySessionId = this.room.sessionId;
      this._setupListeners();
      this.connected = true;
      console.log(`[MP] Joined room: ${this.room.roomId}`);
      return { success: true };
    } catch (err) {
      console.error('[MP] Join failed:', err);
      return { success: false, error: err.message };
    }
  }

  _normalizeUrl(url) {
    // Accept http/https/ws/wss — Colyseus SDK handles upgrade
    if (!url.startsWith('http') && !url.startsWith('ws')) {
      url = 'http://' + url;
    }
    return url;
  }

  // ── Room Event Listeners ───────────────────────────────────────────────────

  _setupListeners() {
    const room = this.room;

    room.onMessage('welcome', (data) => {
      this.mySessionId = data.sessionId;
      this.hostId = data.hostId;
      this.isHost = (data.sessionId === data.hostId);

      // Save our assigned colors
      this.myShirtColor = data.yourColor;
      this.myPantsColor = data.yourPantsColor;
      this.mySkinColor  = data.yourSkinColor;

      // Save player list and spawn ghosts if scene is ready
      Object.values(data.players).forEach(p => {
        this.roomPlayers.set(p.id, p);
        if (p.id === this.mySessionId) return;
        this._spawnGhost(p);
      });

      // Apply current weather
      if (data.weather && this.onWeatherChange) {
        this.onWeatherChange(data.weather);
      }

      // If the game has already started on the host side, proceed immediately
      if (data.gameStarted && this.onGameStarted) {
        this.onGameStarted(data.mapData);
      }

      console.log(`[MP] Welcome! isHost=${this.isHost}, players=${Object.keys(data.players).length}`);

      if (this.onHostChanged) this.onHostChanged(this.isHost);
      if (this.onPlayersUpdated) this.onPlayersUpdated(this.roomPlayers, this.hostId);
    });

    room.onMessage('playerJoined', (data) => {
      this.roomPlayers.set(data.id, data);
      if (data.id !== this.mySessionId) {
        this._spawnGhost(data);
      }
      this._showToast(`${data.username} bergabung`);
      if (this.onPlayersUpdated) this.onPlayersUpdated(this.roomPlayers, this.hostId);
    });

    room.onMessage('playerLeft', (data) => {
      this.roomPlayers.delete(data.id);
      const ghost = this.ghosts.get(data.id);
      if (ghost) {
        this._showToast(`${ghost.username} keluar`);
        ghost.dispose();
        this.ghosts.delete(data.id);
      }
      if (this.onPlayersUpdated) this.onPlayersUpdated(this.roomPlayers, this.hostId);
    });

    room.onMessage('playerMoved', (data) => {
      const ghost = this.ghosts.get(data.id);
      if (ghost) ghost.applyState(data);
    });

    room.onMessage('npcState', (data) => {
      // Non-host: apply NPC positions from host
      if (!this.isHost && data.npcs) {
        this._applyNpcState(data.npcs);
      }
    });

    room.onMessage('weatherChanged', (data) => {
      if (this.onWeatherChange) {
        this.onWeatherChange(data.weather);
      }
    });

    room.onMessage('vehicleMoved', (data) => {
      this._applyVehicleMove(data);
    });

    room.onMessage('hostChanged', (data) => {
      this.hostId = data.hostId;
      const wasHost = this.isHost;
      this.isHost = (data.hostId === this.mySessionId);
      if (this.isHost && !wasHost) {
        this._showToast('Kamu sekarang menjadi Host!');
      }
      if (this.onHostChanged) this.onHostChanged(this.isHost);
      if (this.onPlayersUpdated) this.onPlayersUpdated(this.roomPlayers, this.hostId);
    });

    room.onMessage('gameStarted', (data) => {
      if (this.onGameStarted) {
        this.onGameStarted(data.mapData);
      }
    });

    room.onLeave((code) => {
      console.log(`[MP] Left room. Code: ${code}`);
      this.connected = false;
    });

    room.onError((code, message) => {
      console.error(`[MP] Room error ${code}:`, message);
    });
  }

  // ── Ghost Player Management ─────────────────────────────────────────────────

  setSceneManager(sceneManager) {
    this.sceneManager = sceneManager;
    // Spawn meshes for all players currently in the room (excluding self)
    for (const [id, p] of this.roomPlayers.entries()) {
      if (id !== this.mySessionId) {
        this._spawnGhost(p);
      }
    }
  }

  _spawnGhost(playerData) {
    if (!this.sceneManager) return; // Defer spawning until setSceneManager is called
    if (this.ghosts.has(playerData.id)) return;
    const cam = this.sceneManager.camera ? this.sceneManager.camera.camera : null;
    const ghost = new GhostPlayer(playerData, this.sceneManager, cam);
    this.ghosts.set(playerData.id, ghost);
  }

  // ── State Senders ───────────────────────────────────────────────────────────

  sendStartGame(mapData) {
    if (!this.connected || !this.room || !this.isHost) return;
    this.room.send('startGame', { mapData });
  }

  sendPlayerState(player, frameCount) {
    if (!this.connected || !this.room) return;
    if (frameCount % 3 !== 0) return; // ~20Hz at 60fps

    const pos = player.mesh.position;
    this.room.send('playerMove', {
      x: pos.x,
      y: pos.y,
      z: pos.z,
      rotY: player.mesh.rotation.y,
      state: player.state,
      animTime: player.animTime || 0,
      interactableId: player.currentInteractableId || null,
    });

    // If active driver, broadcast vehicle updates to everyone (whether host or joiner)
    if (player.state === 'driving' && player.currentVehicle && player.currentVehicle.mesh) {
      const vm = player.currentVehicle.mesh;
      this.sendVehicleMove(player.currentInteractableId, vm.position, vm.quaternion);
    }
  }

  sendNpcState(npcs, frameCount) {
    if (!this.connected || !this.room || !this.isHost) return;
    if (frameCount % 6 !== 0) return; // ~10Hz at 60fps

    const npcData = npcs.map((npc, i) => ({
      id: i,
      x: npc.body.position.x,
      y: npc.body.position.y,
      z: npc.body.position.z,
      rotY: npc.mesh.rotation.y,
      state: npc.state,
      animTime: npc.animTime,
    }));
    this.room.send('npcUpdate', { npcs: npcData });
  }

  sendWeatherChange(weather) {
    if (!this.connected || !this.room || !this.isHost) return;
    this.room.send('weatherChange', { weather });
  }

  sendVehicleMove(vehicleId, pos, quat) {
    if (!this.connected || !this.room) return;
    this.room.send('vehicleMove', {
      id: vehicleId,
      x: pos.x, y: pos.y, z: pos.z,
      qx: quat.x, qy: quat.y, qz: quat.z, qw: quat.w,
    });
  }

  // ── State Receivers ─────────────────────────────────────────────────────────

  _applyNpcState(npcsArray) {
    if (!this.sceneManager) return;
    if (!this.sceneManager._remoteNpcTargets) {
      this.sceneManager._remoteNpcTargets = {};
    }
    npcsArray.forEach(n => {
      this.sceneManager._remoteNpcTargets[n.id] = n;
    });
  }

  _applyVehicleMove(data) {
    // Find vehicle by uid (stable across movement)
    const intr = this.sceneManager.interactables ? this.sceneManager.interactables.find(item =>
      item.uid === data.id
    ) : null;

    if (!intr || !intr.mesh) return;

    // Save target transform parameters to interpolate smoothly during frame update
    intr.targetPosition = new THREE.Vector3(data.x, data.y, data.z);
    if (data.qx !== undefined) {
      intr.targetQuaternion = new THREE.Quaternion(data.qx, data.qy, data.qz, data.qw);
    }
  }

  // ── Per-Frame Update ────────────────────────────────────────────────────────

  update(dt) {
    if (!this.connected) return;
    const renderer = this.sceneManager ? this.sceneManager.renderer : null;
    const cam = this.sceneManager && this.sceneManager.camera ? this.sceneManager.camera.camera : null;

    for (const ghost of this.ghosts.values()) {
      if (cam) ghost.camera = cam;
      ghost.update(dt, renderer);
    }

    // Smoothly interpolate all remote-driven vehicles on every frame
    if (this.sceneManager && this.sceneManager.interactables) {
      const lerpSpeed = Math.min(1.0, 10 * dt);
      this.sceneManager.interactables.forEach(intr => {
        if (intr.type === 'vehicle' && intr.targetPosition) {
          let isDrivenByMe = (this.sceneManager.game && this.sceneManager.game.player && this.sceneManager.game.player.state === 'driving' && this.sceneManager.game.player.currentVehicle === intr);
          
          if (!isDrivenByMe) {
            intr.mesh.position.lerp(intr.targetPosition, lerpSpeed);
            if (intr.mesh.quaternion && intr.targetQuaternion) {
              intr.mesh.quaternion.slerp(intr.targetQuaternion, lerpSpeed);
            }
            
            // Sync Cannon physics body to match interpolated mesh coordinates
            if (intr.body) {
              intr.body.position.copy(intr.mesh.position);
              intr.body.quaternion.copy(intr.mesh.quaternion);
              intr.body.velocity.set(0, 0, 0);
              intr.body.angularVelocity.set(0, 0, 0);
            }
          }
        }
      });
    }
  }

  // ── Disconnect ──────────────────────────────────────────────────────────────

  disconnect() {
    if (this.room) {
      try { this.room.leave(); } catch(e) {}
      this.room = null;
    }
    this.ghosts.forEach(g => g.dispose());
    this.ghosts.clear();
    this.connected = false;
    this.isHost = false;
    this.mySessionId = null;
    this.client = null;
  }

  // ── UI Toast ───────────────────────────────────────────────────────────────

  _showToast(message) {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed; bottom: 120px; left: 50%; transform: translateX(-50%);
      background: rgba(0,0,0,0.8); color: white; padding: 8px 16px;
      border-radius: 20px; font-size: 13px; font-family: 'Inter', sans-serif;
      z-index: 9999; pointer-events: none; animation: fadeInUp 0.3s ease;
      border: 1px solid rgba(255,255,255,0.15);
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.transition = 'opacity 0.5s';
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 500);
    }, 2500);
  }
}
