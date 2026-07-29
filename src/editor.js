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
    if (this.btnToggle) {
      this.btnToggle.addEventListener('click', () => this.toggleEditorMode());
    }
    if (this.btnExit) {
      this.btnExit.addEventListener('click', () => this.toggleEditorMode());
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
      this.characterStudio.activate();
    } else {
      this.characterStudio.deactivate();
      this.mapEditor.activate(tabName);
    }
  }
}
