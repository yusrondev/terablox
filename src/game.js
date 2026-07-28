import { SceneManager }   from './scene.js';
import { PhysicsManager }  from './physics.js';
import { CameraManager }   from './camera.js';
import { ControlsManager } from './controls.js';
import { JoystickManager } from './joystick.js';
import { Player }          from './player.js';
import { CityGenerator }   from './city.js';
import { UIManager }       from './ui.js';
import { NPCManager }      from './npc.js';

export class Game {
  constructor() {
    this.prevTime = performance.now();
    
    // Order matters: scene before everything
    this.sceneManager   = new SceneManager();
    this.physicsManager = new PhysicsManager();
    this.controlsManager = new ControlsManager();
    this.joystickManager = new JoystickManager(this.controlsManager);
    this.cameraManager  = new CameraManager(this.sceneManager.renderer.domElement);
    this.sceneManager.setCamera(this.cameraManager);
    
    // World & entities
    this.city       = new CityGenerator(this.sceneManager, this.physicsManager);
    this.player     = new Player(this.sceneManager, this.physicsManager, this.cameraManager, this.controlsManager);
    this.npcManager = new NPCManager(this.sceneManager, this.physicsManager);
    this.uiManager  = new UIManager(this.player);
    
    this.loop = this.loop.bind(this);
  }
  
  init() {
    requestAnimationFrame(this.loop);
  }
  
  loop(now) {
    // Delta time in seconds, capped so physics don't explode if tab was backgrounded
    const dt = Math.min((now - this.prevTime) / 1000, 0.05);
    this.prevTime = now;
    
    // 1. Physics (fixed timestep internally)
    this.physicsManager.step(dt);
    
    // 2. Game logic
    this.player.update(dt);
    this.npcManager.update(dt);
    
    // 3. Camera follows player at shoulder height
    const camTarget = this.player.mesh.position.clone();
    camTarget.y += 2.0; // look at chest/head level
    this.cameraManager.update(camTarget);
    
    // 4. UI
    this.uiManager.update();
    
    // 5. Render
    this.sceneManager.render();
    
    requestAnimationFrame(this.loop);
  }
}
