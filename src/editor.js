import * as THREE from 'three';
import { CharacterStudio } from './character-studio.js';
import { MapEditor } from './map-editor.js';

export class EditorManager {
  constructor(game) {
    this.game = game;
    this.activeMode = 'play'; // 'play' or 'editor'
    this.activeTab = 'character'; // 'character', 'props', 'city'
    
    // UI Elements
    this.uiContainer = document.getElementById('editor-ui-container');
    this.btnToggle = document.getElementById('btn-editor-toggle');
    this.btnExit = document.getElementById('btn-editor-exit');
    this.tabButtons = document.querySelectorAll('.editor-tab-btn');
    this.tabPanels = document.querySelectorAll('.editor-tab-panel');
    
    // Sub-editors
    this.characterStudio = new CharacterStudio(this, this.game);
    this.mapEditor = new MapEditor(this, this.game);
    
    this.initEvents();
  }
  
  initEvents() {
    this.btnToggle.addEventListener('click', () => this.toggleEditorMode());
    this.btnExit.addEventListener('click', () => this.toggleEditorMode());
    
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
    this.btnToggle.textContent = '🎮 Play Mode';
    
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
  
  exitEditorMode() {
    this.activeMode = 'play';
    this.uiContainer.style.display = 'none';
    this.btnToggle.textContent = '🛠️ Editor Studio';
    
    // Restore standard mobile controls if touch device
    const mobileControls = document.getElementById('mobile-controls');
    if (mobileControls && this.game.joystickManager && this.game.joystickManager.isTouchDevice) {
      mobileControls.style.display = 'block';
    }
    
    // Deactivate active sub-editor states
    this.mapEditor.deactivate();
    this.characterStudio.deactivate();
    
    // Reset camera to player orbit
    if (this.game.cameraManager) {
      this.game.cameraManager.theta = Math.PI;
      this.game.cameraManager.phi = 0.35;
      this.game.cameraManager.distance = 10;
    }
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
      this.characterStudio.activate();
    } else {
      this.characterStudio.deactivate();
      this.mapEditor.activate(tabName);
    }
  }
}
