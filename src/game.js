import { SceneManager }   from './scene.js';
import { PhysicsManager }  from './physics.js';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { CameraManager }   from './camera.js';
import { ControlsManager } from './controls.js';
import { JoystickManager } from './joystick.js';
import { Player }          from './player.js';
import { CityGenerator }   from './city.js';
import { UIManager }       from './ui.js';
import { NPCManager }      from './npc.js';
import { EditorManager }   from './editor.js';
import { MultiplayerManager } from './multiplayer.js';

export class Game {
  constructor(options = {}) {
    this.prevTime = performance.now();
    
    // Order matters: scene before everything
    this.sceneManager   = new SceneManager();
    this.sceneManager.game = this;
    this.physicsManager = new PhysicsManager();
    this.controlsManager = new ControlsManager();
    this.joystickManager = new JoystickManager(this.controlsManager);
    this.cameraManager  = new CameraManager(this.sceneManager.renderer.domElement);
    this.sceneManager.setCamera(this.cameraManager);
    
    // World & entities
    const isCustomMap = !!options.mapData || options.mode === 'editor';
    this.city       = new CityGenerator(this.sceneManager, this.physicsManager, { 
      onlyGround: isCustomMap,
      seed: options.seed
    });
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
      
      // 1. Position player at spawn point if available
      const spawnObj = this.editorManager.mapEditor.placedObjects.find(obj => obj.type === 'spawn_point');
      if (spawnObj && this.player && this.player.body) {
        this.player.body.position.set(spawnObj.position.x, spawnObj.position.y + 1, spawnObj.position.z);
      }
      
      // 2. Configure NPC spawning from map settings
      const roamingCount = (options.mapData.npcCount !== undefined) ? options.mapData.npcCount : 20;
      const fixedNpcSpawns = [];
      this.editorManager.mapEditor.placedObjects.forEach(obj => {
        if (obj.type === 'spawn_npc') {
          fixedNpcSpawns.push(obj.position);
        }
      });
      this.npcManager.spawnNPCs(roamingCount, fixedNpcSpawns);
      
      // 3. Hide spawn indicators in play mode
      this.editorManager.mapEditor.placedObjects.forEach(obj => {
        if (obj.type === 'spawn_point' || obj.type === 'spawn_npc') {
          obj.mesh.visible = false;
        }
      });
    } else {
      // Default sandbox city spawning
      this.npcManager.spawnNPCs(20, []);
    }
    
    // Enter editor mode directly if configured
    if (options.mode === 'editor') {
      setTimeout(() => {
        this.editorManager.enterEditorMode();
      }, 50); // small delay to let Three.js scene initialize
    }
    
    // Pre-compile all WebGL shaders to prevent runtime lag spikes (micro-stutters)
    this.sceneManager.compileShaders();
    
    // Multiplayer manager (set via setMultiplayer() before/after init)
    this.multiplayer = null;
    
    this.loop = this.loop.bind(this);
  }
  
  // Called by main.js after connecting to multiplayer
  setMultiplayer(mp) {
    this.multiplayer = mp;
    mp.setSceneManager(this.sceneManager);
    
    // Set initial weather button state for multiplayer
    if (this.uiManager) {
      this.uiManager.updateWeatherButtonsState(mp.isHost);
    }
    
    // Apply server-assigned or custom unique colors to local player
    if (this.player) {
      if (mp.myShirtColor) {
        this.player.torso.material = new THREE.MeshLambertMaterial({ color: mp.myShirtColor });
      }
      if (mp.myPantsColor) {
        const pm = new THREE.MeshLambertMaterial({ color: mp.myPantsColor });
        this.player.leftLeg.children.forEach(c => c.material = pm);
        this.player.rightLeg.children.forEach(c => c.material = pm);
      }
      if (mp.mySkinColor) {
        const sm = new THREE.MeshLambertMaterial({ color: mp.mySkinColor });
        this.player.head.material = sm;
        this.player.leftArm.children.forEach(c => c.material = sm);
        this.player.rightArm.children.forEach(c => c.material = sm);
      }
    }
    
    // Hook weather changes to broadcast when host
    if (this.sceneManager && this.sceneManager.weatherManager) {
      const wm = this.sceneManager.weatherManager;
      const origSet = wm.setWeather.bind(wm);
      wm.setWeather = (key) => {
        origSet(key);
        if (this.multiplayer && this.multiplayer.isHost) {
          this.multiplayer.sendWeatherChange(key);
        }
      };
      // When non-host receives weather change
      mp.onWeatherChange = (key) => {
        origSet(key);
        // Sync active class on weather buttons in settings panel
        const buttons = document.querySelectorAll('.weather-btn');
        buttons.forEach(b => {
          if (b.getAttribute('data-weather') === key) {
            b.classList.add('active');
          } else {
            b.classList.remove('active');
          }
        });
      };
    }
    
    // Host changed callback — update UI
    mp.onHostChanged = (isHost) => {
      const badge = document.getElementById('mp-host-badge');
      if (badge) badge.style.display = isHost ? 'flex' : 'none';
      if (this.uiManager) {
        this.uiManager.updateWeatherButtonsState(isHost);
      }
    };
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
            // Find if anyone is driving this vehicle
            let isDrivenByMe = (this.player.state === 'driving' && this.player.currentVehicle && this.player.currentVehicle.body === obj.body);
            let isDrivenByGhost = false;
            
            const intr = this.sceneManager.interactables.find(item => item.body === obj.body);
            if (intr && this.multiplayer && this.multiplayer.connected) {
              for (const ghost of this.multiplayer.ghosts.values()) {
                if (ghost.state === 'driving' && ghost.interactableId === intr.uid) {
                  isDrivenByGhost = true;
                  break;
                }
              }
            }
            
            if (isDrivenByMe || isDrivenByGhost) {
              // If driven by a remote player, set body to KINEMATIC so local physics doesn't fight network positions
              if (isDrivenByGhost && obj.body.type !== CANNON.Body.KINEMATIC) {
                obj.body.type = CANNON.Body.KINEMATIC;
                obj.body.velocity.set(0, 0, 0);
                obj.body.angularVelocity.set(0, 0, 0);
              }
              
              // Copy physics body to mesh (which is updated by incoming remote player network updates)
              obj.mesh.position.copy(obj.body.position);
              obj.mesh.quaternion.copy(obj.body.quaternion);
              if (intr) {
                intr.position.copy(obj.body.position);
              }
            } else {
              // Empty vehicle: restore to DYNAMIC so it obeys gravity
              if (obj.body.type !== CANNON.Body.DYNAMIC) {
                obj.body.type = CANNON.Body.DYNAMIC;
                obj.body.linearDamping = 0.9;
                obj.body.angularDamping = 0.95;
                obj.body.velocity.set(0, 0, 0);
                obj.body.angularVelocity.set(0, 0, 0);
              }
              
              // Perf: skip mesh sync if body is sleeping or barely moving
              const v = obj.body.velocity;
              if (obj.body.sleepState === 2 || (Math.abs(v.x) + Math.abs(v.y) + Math.abs(v.z)) < 0.01) return;
              
              obj.mesh.position.copy(obj.body.position);
              obj.mesh.quaternion.copy(obj.body.quaternion);
              
              if (intr) {
                intr.position.copy(obj.body.position);
              }
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
      
      this.npcManager.update(dt, this.player.mesh.position, this.multiplayer);
      if (this.city && this.city.update) {
        this.city.update(dt);
      }
      
      // Multiplayer: send own state, sync NPC positions as host
      if (this.multiplayer && this.multiplayer.connected) {
        const fc = this.sceneManager._frameCount || 0;
        this.multiplayer.sendPlayerState(this.player, fc);
        if (this.multiplayer.isHost) {
          this.multiplayer.sendNpcState(this.npcManager.npcs, fc);
        }
      }
      
      // 3. Camera & Sun follow player
      const camTarget = this.player.mesh.position.clone();
      camTarget.y += 1.0; // look at chest/head level
      this.cameraManager.update(camTarget, dt);
      
      this.sceneManager.updateSun(this.player.mesh.position);
      this.sceneManager.updateWeather(dt, this.player.mesh.position);
      
      // 4. Interaction Proximity Check (throttled: runs every 3 frames at 60fps = ~50ms delay, imperceptible)
      const frameCount = this.sceneManager._frameCount || 0;
      if (frameCount % 3 === 0) {
        let closestDist = Infinity;
        let closestItem = null;
        
        if (this.player.state !== 'sitting' && this.player.state !== 'driving') {
          for (const item of this.sceneManager.interactables) {
            // Check if this item is already occupied by a ghost player
            let isOccupied = false;
            if (this.multiplayer && this.multiplayer.connected) {
              for (const ghost of this.multiplayer.ghosts.values()) {
                if (ghost.interactableId && item.uid && ghost.interactableId === item.uid) {
                  isOccupied = true;
                  break;
                }
              }
            }
            if (isOccupied) continue; // Skip occupied seats/vehicles

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
      }
      
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
    
    const activeTab = (this.editorManager && this.editorManager.activeMode === 'editor') ? this.editorManager.activeTab : 'play';
    
    // 5. UI
    this.uiManager.update(activeTab);
    
    // 6. Multiplayer ghost players update
    if (this.multiplayer && this.multiplayer.connected) {
      this.multiplayer.update(dt);
    }
    
    // 7. Render
    this.sceneManager.render(activeTab);
    
    requestAnimationFrame(this.loop);
  }
}
