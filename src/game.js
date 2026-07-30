import { SceneManager }   from './scene.js';
import { PhysicsManager }  from './physics.js';
import { CameraManager }   from './camera.js';
import { ControlsManager } from './controls.js';
import { JoystickManager } from './joystick.js';
import { Player }          from './player.js';
import { CityGenerator }   from './city.js';
import { UIManager }       from './ui.js';
import { NPCManager }      from './npc.js';
import { EditorManager }   from './editor.js';

export class Game {
  constructor(options = {}) {
    this.prevTime = performance.now();
    
    // Order matters: scene before everything
    this.sceneManager   = new SceneManager();
    this.physicsManager = new PhysicsManager();
    this.controlsManager = new ControlsManager();
    this.joystickManager = new JoystickManager(this.controlsManager);
    this.cameraManager  = new CameraManager(this.sceneManager.renderer.domElement);
    this.sceneManager.setCamera(this.cameraManager);
    
    // World & entities
    const isCustomMap = !!options.mapData || options.mode === 'editor';
    this.city       = new CityGenerator(this.sceneManager, this.physicsManager, { onlyGround: isCustomMap });
    this.cameraManager.setBuildingBoxes(this.sceneManager.buildingBoxes);
    
    this.player     = new Player(this.sceneManager, this.physicsManager, this.cameraManager, this.controlsManager);
    this.npcManager = new NPCManager(this.sceneManager, this.physicsManager);
    this.uiManager  = new UIManager(this.player, this.sceneManager);
    
    // Wire interaction button logic
    this.uiManager.setInteractAction(() => {
      if (this.currentInteractable) {
        if (this.player.state === 'sitting' || this.player.state === 'driving') {
          this.player.unsit();
        } else {
          this.player.sit(this.currentInteractable);
        }
      }
    });
    
    this.editorManager = new EditorManager(this);
    
    // Load custom map data if provided
    if (options.mapData) {
      this.editorManager.mapEditor.loadMapData(options.mapData);
    }
    
    // Enter editor mode directly if configured
    if (options.mode === 'editor') {
      setTimeout(() => {
        this.editorManager.enterEditorMode();
      }, 50); // small delay to let Three.js scene initialize
    }
    
    this.loop = this.loop.bind(this);
  }
  
  init() {
    requestAnimationFrame(this.loop);
  }
  
  loop(now) {
    // Delta time in seconds, capped so physics don't explode if tab was backgrounded
    const dt = Math.min((now - this.prevTime) / 1000, 0.05);
    this.prevTime = now;

    // Update map editor animatable assets (e.g. fountains)
    if (this.editorManager && this.editorManager.mapEditor) {
      this.editorManager.mapEditor.animate(dt);
    }
    
    const isEditing = this.editorManager && this.editorManager.activeMode === 'editor';
    
    if (!isEditing) {
      // 1. Physics (fixed timestep internally)
      this.physicsManager.step(dt);
      
      // Sync dynamic placed objects (like custom vehicles) from physics simulation
      if (this.editorManager && this.editorManager.mapEditor && this.editorManager.mapEditor.placedObjects) {
        this.editorManager.mapEditor.placedObjects.forEach(obj => {
          if (obj.body && obj.body.mass > 0) {
            obj.mesh.position.copy(obj.body.position);
            obj.mesh.quaternion.copy(obj.body.quaternion);
            
            // Also sync interactable position if this vehicle is registered
            const intr = this.sceneManager.interactables.find(item => item.body === obj.body);
            if (intr) {
              intr.position.copy(obj.body.position);
            }
          }
        });
      }
      
      // 2. Game logic
      this.player.update(dt);
      
      const isDriving = this.player.state === 'driving';
      if (this.joystickManager && this.joystickManager.isDrivingMode !== isDriving) {
        this.joystickManager.toggleDrivingMode(isDriving);
      }
      
      this.npcManager.update(dt);
      if (this.city && this.city.update) {
        this.city.update(dt);
      }
      
      // 3. Camera & Sun follow player
      const camTarget = this.player.mesh.position.clone();
      camTarget.y += 1.0; // look at chest/head level
      this.cameraManager.update(camTarget, dt);
      
      this.sceneManager.updateSun(this.player.mesh.position);
      this.sceneManager.updateWeather(dt, this.player.mesh.position);
      
      // 4. Interaction Proximity Check
      let closestDist = Infinity;
      let closestItem = null;
      
      if (this.player.state !== 'sitting' && this.player.state !== 'driving') {
        for (const item of this.sceneManager.interactables) {
          const dist = this.player.mesh.position.distanceTo(item.position);
          if (dist < 2.5 && dist < closestDist) {
            closestDist = dist;
            closestItem = item;
          }
        }
      } else {
        closestItem = this.currentInteractable;
      }
      
      this.currentInteractable = closestItem;
      
      if (this.currentInteractable) {
        let btnText = 'Duduk';
        if (this.player.state === 'sitting') {
          btnText = 'Berdiri';
        } else if (this.player.state === 'driving') {
          btnText = 'Turun';
        } else if (this.currentInteractable.type === 'vehicle') {
          btnText = 'Kendarai';
        }
        this.uiManager.toggleInteractButton(true, btnText);
      } else {
        this.uiManager.toggleInteractButton(false);
      }
    } else {
      // If editing, camera follows target position with different heights based on tab
      if (this.editorManager && this.editorManager.activeTab === 'creator') {
        this.cameraManager.update(this.editorManager.creatorStudio.workspaceCenter, dt);
      } else {
        const camTarget = this.player.mesh.position.clone();
        if (this.editorManager.activeTab === 'character') {
          camTarget.y += 1.0;
        } else {
          camTarget.y += 0.5; // lower focus for placing props/roads
        }
        this.cameraManager.update(camTarget, dt);
      }
    }
    
    // 5. UI
    this.uiManager.update();
    
    // 6. Render
    const activeTab = this.editorManager ? this.editorManager.activeTab : 'play';
    this.sceneManager.render(activeTab);
    
    requestAnimationFrame(this.loop);
  }
}
