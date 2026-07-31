import { Game } from './game.js';
import { MultiplayerManager } from './multiplayer.js';

document.addEventListener('DOMContentLoaded', () => {
  const startScreen = document.getElementById('start-screen');
  const uiLayer = document.getElementById('ui-layer');
  
  const menuMainPanel = document.getElementById('menu-main-panel');
  const mapSelectionModal = document.getElementById('map-selection-modal');
  const multiplayerModal = document.getElementById('multiplayer-modal');
  const joinerWaitingModal = document.getElementById('joiner-waiting-modal');
  
  const btnPlayGame   = document.getElementById('btn-play-game');
  const btnOpenStudio = document.getElementById('btn-open-studio');
  const btnMultiplayer = document.getElementById('btn-multiplayer');
  const btnMapBack    = document.getElementById('btn-map-back');
  const btnMpBack     = document.getElementById('btn-mp-back');
  const btnJoinerBack = document.getElementById('btn-joiner-back');
  const mapList       = document.getElementById('map-list');
  
  // Multiplayer UI elements
  const mpServerUrl  = document.getElementById('mp-server-url');
  const mpUsername   = document.getElementById('mp-username');
  const mpTabHost    = document.getElementById('mp-tab-host');
  const mpTabJoin    = document.getElementById('mp-tab-join');
  const mpPanelHost  = document.getElementById('mp-panel-host');
  const mpPanelJoin  = document.getElementById('mp-panel-join');
  const btnCreateRoom = document.getElementById('btn-create-room');
  const btnJoinRoom   = document.getElementById('btn-join-room');
  const mpJoinCode    = document.getElementById('mp-join-code');
  const mpRoomDisplay = document.getElementById('mp-room-display');
  const mpRoomCode    = document.getElementById('mp-room-code');
  const mpStatus      = document.getElementById('mp-status');
  const mpCopyCode    = document.getElementById('mp-copy-code');

  // Lobby player list DOM elements
  const mpLobbyPlayersContainer = document.getElementById('mp-lobby-players-container');
  const mpLobbyPlayers = document.getElementById('mp-lobby-players');
  const mpLobbyCount = document.getElementById('mp-lobby-count');
  
  const joinerLobbyPlayers = document.getElementById('joiner-lobby-players');
  const joinerLobbyCount = document.getElementById('joiner-lobby-count');
  const mpSetupFields = document.getElementById('mp-setup-fields');

  let activeGame = null;
  let activeMp   = null;
  let selectedMapData = null;

  // Set the default Server URL input to the current page origin (localhost, LAN IP, or ngrok URL)
  // This allows single-port ngrok hosting by using Vite's server proxy rules.
  if (mpServerUrl) {
    mpServerUrl.value = window.location.origin;
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const enterGameLayout = () => {
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
    if (screen.orientation && typeof screen.orientation.lock === 'function') {
      try { screen.orientation.lock('landscape').catch(() => {}); } catch(e) {}
    }
    startScreen.style.display = 'none';
    uiLayer.style.display = 'block';
  };

  const setMpStatus = (msg, type = 'info') => {
    if (!mpStatus) return;
    mpStatus.textContent = msg;
    mpStatus.className = 'mp-status ' + type;
    mpStatus.style.display = msg ? 'block' : 'none';
  };

  const updateLobbyPlayersList = (playersMap, hostId) => {
    const isHost = activeMp && activeMp.isHost;
    
    // Toggle container for host
    if (isHost && mpLobbyPlayersContainer) {
      mpLobbyPlayersContainer.style.display = 'block';
    }
    
    const listEl = isHost ? mpLobbyPlayers : joinerLobbyPlayers;
    const countEl = isHost ? mpLobbyCount : joinerLobbyCount;
    
    if (!listEl || !countEl) return;
    
    listEl.innerHTML = '';
    countEl.textContent = playersMap.size;
    
    playersMap.forEach((player) => {
      const isPlayerHost = player.id === hostId;
      const isMe = player.id === (activeMp ? activeMp.mySessionId : null);
      
      const item = document.createElement('div');
      item.className = 'mp-lobby-item';
      
      const colorHex = '#' + (player.shirtColor || 0x88ccff).toString(16).padStart(6, '0');
      
      item.innerHTML = `
        <div class="mp-lobby-item-left">
          <span class="mp-lobby-dot" style="background-color: ${colorHex}; color: ${colorHex};"></span>
          <span style="font-weight: 600;">${player.username}</span>
        </div>
        <div class="mp-lobby-badge-group">
          ${isPlayerHost ? '<span class="mp-lobby-badge host">Host</span>' : ''}
          ${isMe ? '<span class="mp-lobby-badge you">Kamu</span>' : ''}
        </div>
      `;
      
      listEl.appendChild(item);
    });
  };

  // ── Map Selection ─────────────────────────────────────────────────────────────

  const renderMapSelection = async () => {
    mapList.innerHTML = '';
    
    const defaultItem = document.createElement('div');
    defaultItem.className = 'map-item';
    defaultItem.innerHTML = `
      <div class="map-item-info">
        <span class="map-item-title">Default Procedural City</span>
        <span class="map-item-type">Sistem Generator</span>
      </div>
    `;
    defaultItem.addEventListener('click', () => {
      selectedMapData = null;
      if (activeMp && activeMp.connected) {
        startGameWithMultiplayer();
      } else {
        enterGameLayout();
        const game = new Game();
        game.init();
      }
    });
    mapList.appendChild(defaultItem);
    
    try {
      const res = await fetch('/api/load-maps?t=' + Date.now(), { cache: 'no-store' });
      if (res.ok) {
        const savedMaps = await res.json();
        Object.keys(savedMaps).forEach(mapName => {
          const customItem = document.createElement('div');
          customItem.className = 'map-item';
          customItem.innerHTML = `
            <div class="map-item-info">
              <span class="map-item-title">${mapName}</span>
              <span class="map-item-type">Project Map</span>
            </div>
            <button class="map-item-delete" title="Hapus Map">🗑️</button>
          `;
          customItem.addEventListener('click', (e) => {
            if (e.target.classList.contains('map-item-delete')) return;
            selectedMapData = savedMaps[mapName];
            if (activeMp && activeMp.connected) {
              startGameWithMultiplayer();
            } else {
              enterGameLayout();
              const game = new Game({ mapData: savedMaps[mapName] });
              game.init();
            }
          });
          const deleteBtn = customItem.querySelector('.map-item-delete');
          deleteBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (confirm(`Hapus map "${mapName}"?`)) {
              delete savedMaps[mapName];
              await fetch('/api/save-maps', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(savedMaps)
              });
              renderMapSelection();
            }
          });
          mapList.appendChild(customItem);
        });
      }
    } catch(err) {
      console.error('Failed to load maps:', err);
    }
  };

  const startGameWithMultiplayer = () => {
    // If we are the host, broadcast that the game is starting
    if (activeMp && activeMp.connected && activeMp.isHost) {
      activeMp.sendStartGame(selectedMapData);
    }
    
    enterGameLayout();
    
    const gameOptions = {};
    if (selectedMapData) {
      gameOptions.mapData = selectedMapData;
    } else if (activeMp && activeMp.connected && activeMp.room) {
      gameOptions.seed = activeMp.room.roomId; // Seed with room ID so everyone gets the same city
    }
    
    const game = new Game(gameOptions);
    activeGame = game;
    game.setMultiplayer(activeMp);
    game.init();
  };

  // ── Multiplayer Tab Switching ─────────────────────────────────────────────────
  
  mpTabHost.addEventListener('click', () => {
    mpTabHost.classList.add('active');
    mpTabJoin.classList.remove('active');
    mpPanelHost.style.display = 'block';
    mpPanelJoin.style.display = 'none';
  });

  mpTabJoin.addEventListener('click', () => {
    mpTabJoin.classList.add('active');
    mpTabHost.classList.remove('active');
    mpPanelJoin.style.display = 'block';
    mpPanelHost.style.display = 'none';
  });

  // ── Create Room (Host) ────────────────────────────────────────────────────────

  btnCreateRoom.addEventListener('click', async () => {
    // If room is already created, proceed to map selection
    if (activeMp && activeMp.connected && mpRoomDisplay.style.display !== 'none') {
      multiplayerModal.style.display = 'none';
      mapSelectionModal.style.display = 'flex';
      renderMapSelection();
      return;
    }

    const url = mpServerUrl.value.trim() || 'http://localhost:2567';
    const name = mpUsername.value.trim() || 'Host';

    setMpStatus('Membuat room...', 'loading');
    btnCreateRoom.disabled = true;

    activeMp = new MultiplayerManager(null); // sceneManager will be set later via game
    activeMp.onPlayersUpdated = updateLobbyPlayersList;
    
    const result = await activeMp.createRoom(url, name);

    btnCreateRoom.disabled = false;
    if (result.success) {
      mpRoomCode.textContent = result.roomCode;
      mpRoomDisplay.style.display = 'block';
      
      // Hide upper setup configuration fields
      if (mpSetupFields) mpSetupFields.style.display = 'none';

      setMpStatus(`✅ Room siap! Bagikan kode ke teman.`, 'success');
      
      // Transform button to proceed
      btnCreateRoom.textContent = '👉 Lanjut Pilih Map';
      btnCreateRoom.style.background = 'linear-gradient(135deg, #10b981, #059669)';
      
    } else {
      activeMp = null;
      setMpStatus(`❌ Gagal: ${result.error}`, 'error');
    }
  });

  // ── Join Room ────────────────────────────────────────────────────────────────

  btnJoinRoom.addEventListener('click', async () => {
    const url  = mpServerUrl.value.trim() || 'http://localhost:2567';
    const code = mpJoinCode.value.trim().toUpperCase();
    const name = mpUsername.value.trim() || 'Player';

    if (!code || code.length !== 4) {
      setMpStatus('⚠️ Masukkan kode room 4 karakter!', 'error');
      return;
    }

    setMpStatus('Bergabung ke room...', 'loading');
    btnJoinRoom.disabled = true;

    activeMp = new MultiplayerManager(null);
    
    // Bind callbacks early (before connection resolves)
    activeMp.onPlayersUpdated = updateLobbyPlayersList;
    activeMp.onGameStarted = (mapData) => {
      selectedMapData = mapData;

      // Update joiner waiting screen status to inform them host started
      const statusEl = joinerWaitingModal.querySelector('.mp-status');
      if (statusEl) {
        statusEl.textContent = '🎉 Host telah memulai game!';
        statusEl.className = 'mp-status success';
      }

      // Hide the cancel/exit button
      if (btnJoinerBack) btnJoinerBack.style.display = 'none';

      // Show the manual start button to capture direct user gesture for fullscreen
      const btnJoinerStart = document.getElementById('btn-joiner-start');
      if (btnJoinerStart) {
        btnJoinerStart.style.display = 'block';
        btnJoinerStart.onclick = () => {
          joinerWaitingModal.style.display = 'none';
          startGameWithMultiplayer();
        };
      }
    };

    const result = await activeMp.joinRoom(url, code, name);

    btnJoinRoom.disabled = false;
    if (result.success) {
      setMpStatus(`✅ Bergabung! Menunggu host memulai...`, 'success');

      setTimeout(() => {
        multiplayerModal.style.display = 'none';
        // Only show waiting modal if the game hasn't started already (activeGame is still null)
        if (!activeGame) {
          joinerWaitingModal.style.display = 'flex';
        }
      }, 800);
    } else {
      activeMp = null;
      setMpStatus(`❌ Gagal: ${result.error}`, 'error');
    }
  });

  // Allow only uppercase & letters in join code input
  if (mpJoinCode) {
    mpJoinCode.addEventListener('input', (e) => {
      e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
    });
  }

  // Copy room code to clipboard
  if (mpCopyCode) {
    mpCopyCode.addEventListener('click', () => {
      const code = mpRoomCode.textContent;
      if (code) {
        navigator.clipboard.writeText(code).then(() => {
          mpCopyCode.textContent = '✓ Disalin!';
          setTimeout(() => { mpCopyCode.textContent = 'Salin'; }, 2000);
        });
      }
    });
  }

  // ── Menu Buttons ─────────────────────────────────────────────────────────────

  btnPlayGame.addEventListener('click', () => {
    menuMainPanel.style.display = 'none';
    mapSelectionModal.style.display = 'flex';
    renderMapSelection();
  });

  btnMultiplayer.addEventListener('click', () => {
    menuMainPanel.style.display = 'none';
    multiplayerModal.style.display = 'flex';
    // Reset form
    setMpStatus('', '');
    mpRoomDisplay.style.display = 'none';
    if (mpLobbyPlayersContainer) mpLobbyPlayersContainer.style.display = 'none';
    if (mpSetupFields) mpSetupFields.style.display = 'block';
    btnCreateRoom.textContent = 'Buat Room Baru';
    btnCreateRoom.style.background = ''; // reset to default css
    btnCreateRoom.disabled = false;
    btnJoinRoom.disabled = false;
  });

  btnMapBack.addEventListener('click', () => {
    mapSelectionModal.style.display = 'none';
    menuMainPanel.style.display = 'block';
    // Cancel MP if backed out
    if (activeMp && !activeGame) {
      activeMp.disconnect();
      activeMp = null;
    }
  });

  if (btnMpBack) {
    btnMpBack.addEventListener('click', () => {
      multiplayerModal.style.display = 'none';
      menuMainPanel.style.display = 'block';
      if (mpSetupFields) mpSetupFields.style.display = 'block';
      if (activeMp) {
        activeMp.disconnect();
        activeMp = null;
      }
    });
  }

  if (btnJoinerBack) {
    btnJoinerBack.addEventListener('click', () => {
      joinerWaitingModal.style.display = 'none';
      menuMainPanel.style.display = 'block';
      
      // Reset waiting modal layout
      const statusEl = joinerWaitingModal.querySelector('.mp-status');
      if (statusEl) {
        statusEl.textContent = '⏳ Menunggu Host memilih map dan memulai game...';
        statusEl.className = 'mp-status loading';
      }
      btnJoinerBack.style.display = 'block';
      const btnJoinerStart = document.getElementById('btn-joiner-start');
      if (btnJoinerStart) btnJoinerStart.style.display = 'none';

      if (activeMp) {
        activeMp.disconnect();
        activeMp = null;
      }
    });
  }

  btnOpenStudio.addEventListener('click', () => {
    enterGameLayout();
    const game = new Game({ mode: 'editor' });
    game.init();
  });
});
