import nipplejs from 'nipplejs';

export class JoystickManager {
  constructor(controlsManager) {
    this.controls = controlsManager;
    this.isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    
    if (this.isTouchDevice) {
      this.initMobileControls();
    }
  }
  
  initMobileControls() {
    // Show UI
    document.getElementById('mobile-controls').style.display = 'block';
    
    // Init Joystick
    const zone = document.getElementById('joystick-zone');
    this.manager = nipplejs.create({
      zone: zone,
      mode: 'static',
      position: { left: '50%', top: '50%' },
      color: 'white',
      size: 100
    });
    
    this.manager.on('move', (evt, data) => {
      // data.vector has x and y from -1 to 1
      this.controls.joystickVector.x = data.vector.x;
      this.controls.joystickVector.y = data.vector.y;
    });
    
    this.manager.on('end', () => {
      this.controls.joystickVector.x = 0;
      this.controls.joystickVector.y = 0;
    });
    
    // Action Buttons
    const btnJump = document.getElementById('btn-jump');
    const btnSprint = document.getElementById('btn-sprint');
    
    btnJump.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.controls.keys.jump = true;
    });
    btnJump.addEventListener('touchend', (e) => {
      e.preventDefault();
      this.controls.keys.jump = false;
    });
    
    btnSprint.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.controls.keys.sprint = true;
    });
    btnSprint.addEventListener('touchend', (e) => {
      e.preventDefault();
      this.controls.keys.sprint = false;
    });
  }
}
