import { Game } from './game.js';

document.addEventListener('DOMContentLoaded', () => {
  const startScreen = document.getElementById('start-screen');
  const uiLayer = document.getElementById('ui-layer');
  
  const menuMainPanel = document.getElementById('menu-main-panel');
  const mapSelectionModal = document.getElementById('map-selection-modal');
  
  const btnPlayGame = document.getElementById('btn-play-game');
  const btnOpenStudio = document.getElementById('btn-open-studio');
  const btnMapBack = document.getElementById('btn-map-back');
  const mapList = document.getElementById('map-list');
  
  // Transition into Fullscreen & Landscape helper
  const enterGameLayout = () => {
    // Enter Fullscreen
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(err => console.log(err));
    }
    
    // Attempt to lock landscape orientation for mobile
    if (screen.orientation && typeof screen.orientation.lock === 'function') {
      try {
        const promise = screen.orientation.lock('landscape');
        if (promise && promise.catch) {
          promise.catch(() => {});
        }
      } catch (e) {}
    }
    
    // Hide start screen overlay & show game UI layer
    startScreen.style.display = 'none';
    uiLayer.style.display = 'block';
  };
  
  // Render Map Selection options
  const renderMapSelection = () => {
    mapList.innerHTML = '';
    
    // 1. Default Map Option
    const defaultItem = document.createElement('div');
    defaultItem.className = 'map-item';
    defaultItem.innerHTML = `
      <div class="map-item-info">
        <span class="map-item-title">Default Procedural City</span>
        <span class="map-item-type">Sistem Generator</span>
      </div>
    `;
    defaultItem.addEventListener('click', () => {
      enterGameLayout();
      const game = new Game();
      game.init();
    });
    mapList.appendChild(defaultItem);
    
    // 2. Custom Maps from LocalStorage
    const savedMaps = JSON.parse(localStorage.getItem('terablox_saved_maps') || '{}');
    Object.keys(savedMaps).forEach(mapName => {
      const customItem = document.createElement('div');
      customItem.className = 'map-item';
      
      customItem.innerHTML = `
        <div class="map-item-info">
          <span class="map-item-title">${mapName}</span>
          <span class="map-item-type">Custom Studio Map</span>
        </div>
        <button class="map-item-delete" title="Hapus Map">🗑️</button>
      `;
      
      // Click row to play
      customItem.addEventListener('click', (e) => {
        if (e.target.classList.contains('map-item-delete')) return; // ignore delete clicks
        
        enterGameLayout();
        const game = new Game({ mapData: savedMaps[mapName] });
        game.init();
      });
      
      // Click delete button
      const deleteBtn = customItem.querySelector('.map-item-delete');
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm(`Apakah Anda yakin ingin menghapus map "${mapName}"?`)) {
          delete savedMaps[mapName];
          localStorage.setItem('terablox_saved_maps', JSON.stringify(savedMaps));
          renderMapSelection();
        }
      });
      
      mapList.appendChild(customItem);
    });
  };
  
  // Menu Buttons Bindings
  btnPlayGame.addEventListener('click', () => {
    menuMainPanel.style.display = 'none';
    mapSelectionModal.style.display = 'flex';
    renderMapSelection();
  });
  
  btnMapBack.addEventListener('click', () => {
    mapSelectionModal.style.display = 'none';
    menuMainPanel.style.display = 'block';
  });
  
  btnOpenStudio.addEventListener('click', () => {
    enterGameLayout();
    // Open in dedicated studio mode
    const game = new Game({ mode: 'editor' });
    game.init();
  });
});
