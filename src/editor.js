import * as THREE from 'three';
import { CharacterStudio } from './character-studio.js';
import { MapEditor } from './map-editor.js';
import { CreatorStudio } from './creator-studio.js';

export class EditorManager {
  constructor(game) {
    this.game = game;
    this.activeMode = 'play'; // 'play' or 'editor'
    this.activeTab = 'character'; // 'character', 'props', 'city'
    
    // UI Elements
    this.uiContainer = document.getElementById('editor-ui-container');
    this.btnToggle = document.getElementById('btn-editor-toggle');
    this.btnExit = document.getElementById('btn-editor-exit');
    this.btnPlay = document.getElementById('btn-editor-play');
    this.btnStopPreview = document.getElementById('btn-stop-preview');
    this.tabButtons = document.querySelectorAll('.editor-tab-btn');
    this.tabPanels = document.querySelectorAll('.editor-tab-panel');
    
    // Sub-editors
    this.characterStudio = new CharacterStudio(this, this.game);
    this.mapEditor = new MapEditor(this, this.game);
    this.creatorStudio = new CreatorStudio(this, this.game);
    
    this.initEvents();
  }
  
  initEvents() {
    if (this.btnToggle) {
      this.btnToggle.addEventListener('click', () => this.toggleEditorMode());
    }
    if (this.btnExit) {
      this.btnExit.addEventListener('click', () => this.toggleEditorMode());
    }
    if (this.btnPlay) {
      this.btnPlay.addEventListener('click', () => this.startPreview());
    }
    if (this.btnStopPreview) {
      this.btnStopPreview.addEventListener('click', () => this.stopPreview());
    }
    
    this.tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const tabName = btn.getAttribute('data-tab');
        this.switchTab(tabName);
      });
    });
  }
  
  toggleEditorMode() {
    if (this.activeMode === 'play') {
      this.enterEditorMode();
    } else {
      this.exitEditorMode();
    }
  }
  
  enterEditorMode() {
    this.activeMode = 'editor';
    this.uiContainer.style.display = 'flex';
    if (this.btnStopPreview) this.btnStopPreview.style.display = 'none';
    if (this.btnToggle) this.btnToggle.textContent = '🎮 Play Mode';
    
    // Disable shadow casting to boost rendering performance in editor mode
    if (this.game.sceneManager && this.game.sceneManager.directionalLight) {
      this.game.sceneManager.directionalLight.castShadow = false;
    }
    
    // Hide standard mobile controls
    const mobileControls = document.getElementById('mobile-controls');
    if (mobileControls) mobileControls.style.display = 'none';
    
    // Reset player velocity
    if (this.game.player && this.game.player.body) {
      this.game.player.body.velocity.set(0, 0, 0);
      this.game.player.body.angularVelocity.set(0, 0, 0);
    }
    
    // Default to character tab on enter
    this.switchTab(this.activeTab);
  }
  
  startPreview() {
    this.activeMode = 'play';
    this.uiContainer.style.display = 'none';
    if (this.btnStopPreview) this.btnStopPreview.style.display = 'block';
    
    // Deactivate active sub-editor states (removes ghost)
    this.mapEditor.deactivate();
    this.characterStudio.deactivate();
    this.creatorStudio.deactivate();
    
    // Re-enable shadows
    if (this.game.sceneManager && this.game.sceneManager.directionalLight) {
      this.game.sceneManager.directionalLight.castShadow = true;
    }
    
    // Show standard mobile controls
    const mobileControls = document.getElementById('mobile-controls');
    if (mobileControls && this.game.joystickManager && this.game.joystickManager.isTouchDevice) {
      mobileControls.style.display = 'block';
    }
    
    // Reset player position to where editor target is
    if (this.game.player && this.game.player.body) {
      const targetPos = this.game.cameraManager._target;
      this.game.player.body.position.set(targetPos.x, Math.max(3, targetPos.y + 2), targetPos.z);
      this.game.player.body.velocity.set(0, 0, 0);
      this.game.player.body.angularVelocity.set(0, 0, 0);
    }
    
    // Reset camera orbit to look at player
    if (this.game.cameraManager) {
      this.game.cameraManager.panOffset.set(0, 0, 0); // clear panning during play
      this.game.cameraManager.theta = Math.PI;
      this.game.cameraManager.phi = 0.35;
      this.game.cameraManager.distance = 10;
    }
  }
  
  stopPreview() {
    if (this.btnStopPreview) this.btnStopPreview.style.display = 'none';
    
    // Reset player velocity
    if (this.game.player && this.game.player.body) {
      this.game.player.body.velocity.set(0, 0, 0);
      this.game.player.body.angularVelocity.set(0, 0, 0);
    }
    
    // Reset all dynamic placed vehicles/objects to initial position & zero velocity
    if (this.mapEditor && this.mapEditor.placedObjects) {
      this.mapEditor.placedObjects.forEach(obj => {
        if (obj.body && obj.body.mass > 0) {
          obj.body.position.copy(obj.position);
          obj.body.velocity.set(0, 0, 0);
          obj.body.angularVelocity.set(0, 0, 0);
          
          const qYaw = new CANNON.Quaternion();
          qYaw.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), obj.rotation);
          obj.body.quaternion.copy(qYaw);
          
          obj.mesh.position.copy(obj.position);
          obj.mesh.quaternion.copy(qYaw);
        }
      });
    }
    
    // Re-enter Editor Mode
    this.enterEditorMode();
    
    // Reactivate active sub-editor tab
    if (this.activeTab === 'character') {
      this.characterStudio.activate();
    } else if (this.activeTab === 'creator') {
      this.creatorStudio.activate();
    } else {
      this.mapEditor.activate(this.activeTab);
    }
  }
  
  exitEditorMode() {
    // Reload page to exit cleanly to main menu
    window.location.reload();
  }
  
  switchTab(tabName) {
    this.activeTab = tabName;
    
    // Update UI active tab button
    this.tabButtons.forEach(btn => {
      if (btn.getAttribute('data-tab') === tabName) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
    
    // Update UI panels
    this.tabPanels.forEach(panel => {
      if (panel.id === `tab-${tabName}`) {
        panel.classList.add('active');
      } else {
        panel.classList.remove('active');
      }
    });
    
    // Activate/deactivate modules based on selection
    if (tabName === 'character') {
      this.mapEditor.deactivate();
      this.creatorStudio.deactivate();
      this.characterStudio.activate();
    } else if (tabName === 'creator') {
      this.mapEditor.deactivate();
      this.characterStudio.deactivate();
      this.creatorStudio.activate();
    } else {
      this.characterStudio.deactivate();
      this.creatorStudio.deactivate();
      this.mapEditor.activate(tabName);
    }
  }
}
