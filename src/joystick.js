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
    const btnGas = document.getElementById('btn-gas');
    const btnRem = document.getElementById('btn-rem');
    
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
    
    if (btnGas) {
      btnGas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        this.controls.keys.forward = true;
      });
      btnGas.addEventListener('touchend', (e) => {
        e.preventDefault();
        this.controls.keys.forward = false;
      });
    }
    
    if (btnRem) {
      btnRem.addEventListener('touchstart', (e) => {
        e.preventDefault();
        this.controls.keys.backward = true;
      });
      btnRem.addEventListener('touchend', (e) => {
        e.preventDefault();
        this.controls.keys.backward = false;
      });
    }

    // Steer Left / Right Buttons
    const btnSteerLeft = document.getElementById('btn-steer-left');
    const btnSteerRight = document.getElementById('btn-steer-right');

    if (btnSteerLeft) {
      btnSteerLeft.addEventListener('touchstart', (e) => {
        e.preventDefault();
        this.controls.keys.left = true;
      });
      btnSteerLeft.addEventListener('touchend', (e) => {
        e.preventDefault();
        this.controls.keys.left = false;
      });
    }

    if (btnSteerRight) {
      btnSteerRight.addEventListener('touchstart', (e) => {
        e.preventDefault();
        this.controls.keys.right = true;
      });
      btnSteerRight.addEventListener('touchend', (e) => {
        e.preventDefault();
        this.controls.keys.right = false;
      });
    }
  }

  toggleDrivingMode(isDriving) {
    if (!this.isTouchDevice) return;
    this.isDrivingMode = isDriving;

    const joystickZone = document.getElementById('joystick-zone');
    const steeringButtons = document.getElementById('steering-buttons');
    const btnGas = document.getElementById('btn-gas');
    const btnRem = document.getElementById('btn-rem');
    const btnSprint = document.getElementById('btn-sprint');
    const btnJump = document.getElementById('btn-jump');

    if (isDriving) {
      if (joystickZone) joystickZone.style.display = 'none';
      if (steeringButtons) steeringButtons.style.display = 'flex';
      if (btnSprint) btnSprint.style.display = 'none';
      if (btnJump) btnJump.style.display = 'none';
      if (btnGas) btnGas.style.display = 'block';
      if (btnRem) btnRem.style.display = 'block';
    } else {
      if (joystickZone) joystickZone.style.display = 'block';
      if (steeringButtons) steeringButtons.style.display = 'none';
      if (btnSprint) btnSprint.style.display = 'block';
      if (btnJump) btnJump.style.display = 'block';
      if (btnGas) btnGas.style.display = 'none';
      if (btnRem) btnRem.style.display = 'none';

      // Reset keys
      this.controls.keys.left = false;
      this.controls.keys.right = false;
      this.controls.keys.forward = false;
      this.controls.keys.backward = false;
    }
  }
}
