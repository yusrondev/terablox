export class ControlsManager {
  constructor() {
    this.keys = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      sprint: false,
      jump: false
    };
    
    // Joystick vector for mobile
    this.joystickVector = { x: 0, y: 0 };
    
    this.initKeyboard();
  }
  
  initKeyboard() {
    document.addEventListener('keydown', (e) => this.onKeyDown(e), false);
    document.addEventListener('keyup', (e) => this.onKeyUp(e), false);
  }
  
  onKeyDown(event) {
    switch(event.code) {
      case 'KeyW':
      case 'ArrowUp':
        this.keys.forward = true;
        break;
      case 'KeyS':
      case 'ArrowDown':
        this.keys.backward = true;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        this.keys.left = true;
        break;
      case 'KeyD':
      case 'ArrowRight':
        this.keys.right = true;
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        this.keys.sprint = true;
        break;
      case 'Space':
        this.keys.jump = true;
        break;
    }
  }
  
  onKeyUp(event) {
    switch(event.code) {
      case 'KeyW':
      case 'ArrowUp':
        this.keys.forward = false;
        break;
      case 'KeyS':
      case 'ArrowDown':
        this.keys.backward = false;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        this.keys.left = false;
        break;
      case 'KeyD':
      case 'ArrowRight':
        this.keys.right = false;
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        this.keys.sprint = false;
        break;
      case 'Space':
        this.keys.jump = false;
        break;
    }
  }
  
  // Method to get movement direction relative to camera
  getMovementVector() {
    let x = 0;
    let z = 0;
    
    // PC Keyboard
    if (this.keys.forward) z += 1;
    if (this.keys.backward) z -= 1;
    if (this.keys.left) x += 1;
    if (this.keys.right) x -= 1;
    
    // Mobile Joystick overrides/adds to keyboard
    if (this.joystickVector.x !== 0 || this.joystickVector.y !== 0) {
      x = -this.joystickVector.x;
      z = this.joystickVector.y;
    }
    
    // Normalize vector
    const length = Math.sqrt(x * x + z * z);
    if (length > 0) {
      x /= length;
      z /= length;
    }
    
    return { x, z };
  }
}
