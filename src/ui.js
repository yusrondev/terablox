export class UIManager {
  constructor(player, sceneManager) {
    this.player = player;
    this.sceneManager = sceneManager;
    
    this.fpsCounter = document.getElementById('fps-counter');
    this.interactBtn = document.getElementById('btn-interact');
    
    this.frames = 0;
    this.lastTime = performance.now();
    
    this.initWeatherButtons();
    this.initInteractButton();
    this.initSettingsPanel();
  }
  
  initInteractButton() {
    this.interactBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (this.onInteract) {
        this.onInteract();
      }
    });
  }
  
  setInteractAction(callback) {
    this.onInteract = callback;
  }
  
  toggleInteractButton(visible, text = 'Duduk') {
    if (visible) {
      if (this.interactBtn.style.display === 'none') {
        this.interactBtn.style.display = 'block';
      }
      this.interactBtn.innerText = '🪑 ' + text;
    } else {
      if (this.interactBtn.style.display !== 'none') {
        this.interactBtn.style.display = 'none';
      }
    }
  }
  
  initWeatherButtons() {
    const buttons = document.querySelectorAll('.weather-btn');
    buttons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const weatherType = btn.getAttribute('data-weather');
        if (weatherType && this.sceneManager && this.sceneManager.weatherManager) {
          this.sceneManager.weatherManager.setWeather(weatherType);
          
          buttons.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
        }
      });
    });
  }
  
  initSettingsPanel() {
    const btnToggle = document.getElementById('btn-settings-toggle');
    const panel = document.getElementById('settings-panel');
    const btnClose = document.getElementById('btn-settings-close');
    
    if (btnToggle && panel) {
      btnToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        panel.classList.toggle('settings-closed');
      });
    }
    
    if (btnClose && panel) {
      btnClose.addEventListener('click', (e) => {
        e.stopPropagation();
        panel.classList.add('settings-closed');
      });
    }
    
    // Close settings panel when clicking outside
    document.addEventListener('click', (e) => {
      if (panel && !panel.classList.contains('settings-closed')) {
        const container = document.getElementById('settings-container');
        if (container && !container.contains(e.target)) {
          panel.classList.add('settings-closed');
        }
      }
    });

    // Initialize Graphics settings buttons
    const graphicsButtons = document.querySelectorAll('.graphics-btn');
    const activeLevel = this.sceneManager ? this.sceneManager.graphicsLevel : 'med';
    
    graphicsButtons.forEach(btn => {
      const level = btn.getAttribute('data-graphics');
      if (level === activeLevel) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
      
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const selectedLevel = btn.getAttribute('data-graphics');
        if (selectedLevel && this.sceneManager) {
          this.sceneManager.setGraphicsLevel(selectedLevel);
          
          graphicsButtons.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
        }
      });
    });
  }
  
  update(activeTab) {
    // Show minimap during gameplay
    const isGameplay = activeTab === 'play' || !activeTab;
    const hudEl = document.getElementById('minimap-hud');
    if (hudEl) {
      hudEl.style.display = isGameplay ? 'flex' : 'none';
      
      // Update player rotation marker (static facing up since map rotates)
      if (isGameplay) {
        const marker = hudEl.querySelector('.minimap-player-marker');
        if (marker) {
          marker.style.transform = 'translate(-50%, -50%)';
        }
      }
    }
    
    // FPS Calculate
    this.frames++;
    const now = performance.now();
    if (now - this.lastTime >= 1000) {
      this.fpsCounter.innerText = `FPS: ${this.frames}`;
      this.frames = 0;
      this.lastTime = now;
    }
  }
}
