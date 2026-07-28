export class UIManager {
  constructor(player, sceneManager) {
    this.player = player;
    this.sceneManager = sceneManager;
    
    this.fpsCounter = document.getElementById('fps-counter');
    this.coordsDisplay = document.getElementById('coordinates');
    this.interactBtn = document.getElementById('btn-interact');
    
    this.frames = 0;
    this.lastTime = performance.now();
    
    this.initWeatherButtons();
    this.initInteractButton();
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
  
  update() {
    // Coordinate update
    if (this.player && this.player.mesh) {
      const pos = this.player.mesh.position;
      this.coordsDisplay.innerText = `X: ${Math.floor(pos.x)}, Y: ${Math.floor(pos.y)}, Z: ${Math.floor(pos.z)}`;
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
