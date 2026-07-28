import { Game } from './game.js';

document.addEventListener('DOMContentLoaded', () => {
  const btnPlay = document.getElementById('btn-play');
  const startScreen = document.getElementById('start-screen');
  const uiLayer = document.getElementById('ui-layer');
  
  btnPlay.addEventListener('click', () => {
    // Enter Fullscreen
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(err => console.log(err));
    }
    
    // Attempt to lock landscape orientation for mobile (silently ignore on unsupported desktop/devices)
    if (screen.orientation && typeof screen.orientation.lock === 'function') {
      try {
        const promise = screen.orientation.lock('landscape');
        if (promise && promise.catch) {
          promise.catch(() => {});
        }
      } catch (e) {}
    }
    
    // Hide start screen & show UI
    startScreen.style.display = 'none';
    uiLayer.style.display = 'block';
    
    // Init the game after clicking play (so audio/context works properly if added later)
    const game = new Game();
    game.init();
  });
});
