import * as THREE from 'three';

export class CameraManager {
  constructor(rendererDom) {
    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 500);
    this.domElement = rendererDom;
    
    // Orbital angles
    this.theta = Math.PI; // Start behind player (180 degrees)
    this.phi   = 0.35;   // Slight downward look
    
    this.distance = 10;
    this.minDistance = 3;
    this.maxDistance = 18;
    
    this.isDragging = false;
    
    // Smooth target position
    this._target = new THREE.Vector3();
    
    this._initEvents();
  }
  
  _initEvents() {
    // PC Mouse
    this.domElement.addEventListener('mousedown', () => { this.isDragging = true; });
    document.addEventListener('mouseup', () => { this.isDragging = false; });
    document.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;
      this.theta -= e.movementX * 0.004;
      this.phi   -= e.movementY * 0.004;
      this.phi = Math.max(0.05, Math.min(Math.PI / 2 + 0.1, this.phi));
    });
    
    // Zoom
    this.domElement.addEventListener('wheel', (e) => {
      this.distance = Math.max(this.minDistance, Math.min(this.maxDistance, this.distance + e.deltaY * 0.02));
    }, { passive: true });
    
    // Touch drag for mobile (Multitouch safe)
    this.activeTouchId = null;
    let lastX = 0, lastY = 0;
    
    this.domElement.addEventListener('touchstart', (e) => {
      e.preventDefault(); // prevent scroll/zoom
      if (this.activeTouchId === null && e.changedTouches.length > 0) {
        const touch = e.changedTouches[0];
        this.activeTouchId = touch.identifier;
        lastX = touch.clientX;
        lastY = touch.clientY;
      }
    }, { passive: false });
    
    this.domElement.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (this.activeTouchId !== null) {
        for (let i = 0; i < e.changedTouches.length; i++) {
          const touch = e.changedTouches[i];
          if (touch.identifier === this.activeTouchId) {
            this.theta -= (touch.clientX - lastX) * 0.008;
            this.phi   -= (touch.clientY - lastY) * 0.008;
            this.phi = Math.max(0.05, Math.min(Math.PI / 2 + 0.1, this.phi));
            lastX = touch.clientX;
            lastY = touch.clientY;
            break;
          }
        }
      }
    }, { passive: false });
    
    const onTouchEnd = (e) => {
      if (this.activeTouchId !== null) {
        for (let i = 0; i < e.changedTouches.length; i++) {
          if (e.changedTouches[i].identifier === this.activeTouchId) {
            this.activeTouchId = null;
            break;
          }
        }
      }
    };
    
    this.domElement.addEventListener('touchend', onTouchEnd, { passive: false });
    this.domElement.addEventListener('touchcancel', onTouchEnd, { passive: false });
  }
  
  update(targetPosition) {
    // Smooth lerp toward player
    this._target.lerp(targetPosition, 0.15);
    
    // Convert spherical to Cartesian
    const sinPhi = Math.sin(this.phi);
    const cosPhi = Math.cos(this.phi);
    
    this.camera.position.set(
      this._target.x + this.distance * sinPhi * Math.sin(this.theta),
      this._target.y + this.distance * cosPhi,
      this._target.z + this.distance * sinPhi * Math.cos(this.theta)
    );
    
    this.camera.lookAt(this._target);
  }
}
