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
    this.maxDistance = 45; // Increased to wide level
    
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
    
    // Touch drag & Pinch zoom for mobile
    this.activeTouchId = null;
    let lastX = 0, lastY = 0;
    let initialPinchDistance = null;
    let initialCameraDistance = null;

    const getPinchDistance = (touches) => {
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    };

    this.domElement.addEventListener('touchstart', (e) => {
      e.preventDefault(); // prevent scroll/zoom
      if (e.targetTouches.length === 1) {
        // Single touch for rotation
        const touch = e.targetTouches[0];
        this.activeTouchId = touch.identifier;
        lastX = touch.clientX;
        lastY = touch.clientY;
        initialPinchDistance = null;
      } else if (e.targetTouches.length === 2) {
        // Two touches for pinch zoom
        this.activeTouchId = null; // pause rotation
        initialPinchDistance = getPinchDistance(e.targetTouches);
        initialCameraDistance = this.distance;
      }
    }, { passive: false });
    
    this.domElement.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (e.targetTouches.length === 1 && this.activeTouchId !== null) {
        // Rotation
        const touch = e.targetTouches[0];
        if (touch.identifier === this.activeTouchId) {
          this.theta -= (touch.clientX - lastX) * 0.008;
          this.phi   -= (touch.clientY - lastY) * 0.008;
          this.phi = Math.max(0.05, Math.min(Math.PI / 2 + 0.1, this.phi));
          lastX = touch.clientX;
          lastY = touch.clientY;
        }
      } else if (e.targetTouches.length === 2 && initialPinchDistance !== null) {
        // Pinch zoom
        const currentDistance = getPinchDistance(e.targetTouches);
        const zoomFactor = initialPinchDistance / currentDistance;
        // Smoothly adjust distance
        this.distance = Math.max(this.minDistance, Math.min(this.maxDistance, initialCameraDistance * zoomFactor));
      }
    }, { passive: false });
    
    const onTouchEnd = (e) => {
      if (e.targetTouches.length < 2) {
        initialPinchDistance = null;
      }
      if (e.targetTouches.length === 1) {
        // Resume rotation if one finger remains
        const touch = e.targetTouches[0];
        this.activeTouchId = touch.identifier;
        lastX = touch.clientX;
        lastY = touch.clientY;
      } else if (e.targetTouches.length === 0) {
        this.activeTouchId = null;
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
    
    // Prevent camera from clipping through the ground
    if (this.camera.position.y < 0.5) {
      this.camera.position.y = 0.5;
    }
    
    this.camera.lookAt(this._target);
  }
}
