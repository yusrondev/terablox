export class UIManager {
  constructor(player) {
    this.player = player;
    
    this.fpsCounter = document.getElementById('fps-counter');
    this.coordsDisplay = document.getElementById('coordinates');
    
    this.frames = 0;
    this.lastTime = performance.now();
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
