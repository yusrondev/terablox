import * as THREE from 'three';

export class CharacterStudio {
  constructor(editorManager, game) {
    this.editorManager = editorManager;
    this.game = game;
    this.active = false;
    
    // Config options
    this.skinColors = ['#ffe0bd', '#f1c27d', '#e0a96d', '#c68642', '#8d5524'];
    this.clothesColors = ['#ff8b94', '#ffaaa6', '#ffd3b6', '#d4f0f0', '#8fcaca', '#c7ceea', '#3b82f6', '#10b981', '#f59e0b', '#374151', '#ffffff'];
    
    this.currentPreset = {
      skinColor: '#ffe0bd',
      shirtColor: '#88ccff',
      pantsColor: '#5577cc',
      hat: 'none',
      back: 'none'
    };
    
    // UI elements setup
    this.setupUI();
    this.loadPreset();
  }
  
  setupUI() {
    this.pickerSkin = document.getElementById('picker-skin');
    this.pickerShirt = document.getElementById('picker-shirt');
    this.pickerPants = document.getElementById('picker-pants');
    this.selectHat = document.getElementById('select-hat');
    this.selectBack = document.getElementById('select-back');
    this.btnSave = document.getElementById('btn-save-char');
    
    // Generate color pickers
    this.generateSwatches(this.pickerSkin, this.skinColors, 'skinColor');
    this.generateSwatches(this.pickerShirt, this.clothesColors, 'shirtColor');
    this.generateSwatches(this.pickerPants, this.clothesColors, 'pantsColor');
    
    // Dropdowns
    this.selectHat.addEventListener('change', (e) => {
      this.currentPreset.hat = e.target.value;
      this.applyAccessories();
    });
    this.selectBack.addEventListener('change', (e) => {
      this.currentPreset.back = e.target.value;
      this.applyAccessories();
    });
    
    this.btnSave.addEventListener('click', () => {
      this.savePreset();
      alert('Karakter berhasil disimpan!');
    });
  }
  
  generateSwatches(container, colors, presetKey) {
    if (!container) return;
    container.innerHTML = '';
    colors.forEach(color => {
      const swatch = document.createElement('div');
      swatch.className = 'color-swatch';
      swatch.style.backgroundColor = color;
      swatch.setAttribute('data-color', color);
      
      swatch.addEventListener('click', () => {
        // Toggle active
        container.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
        swatch.classList.add('active');
        
        this.currentPreset[presetKey] = color;
        this.applyColors();
      });
      
      container.appendChild(swatch);
    });
  }
  
  activate() {
    this.active = true;
    
    // Set active class on color picker swatches matching preset
    this.syncUI();
    
    // Zoom camera close to player face/body
    if (this.game.cameraManager) {
      this.game.cameraManager.distance = 6;
      this.game.cameraManager.phi = 1.0; // Level with player torso
      this.game.cameraManager.theta = Math.PI + 0.5; // slight angle
    }
  }
  
  deactivate() {
    this.active = false;
  }
  
  syncUI() {
    const setActiveSwatch = (container, color) => {
      if (!container) return;
      container.querySelectorAll('.color-swatch').forEach(s => {
        if (s.getAttribute('data-color') === color) {
          s.classList.add('active');
        } else {
          s.classList.remove('active');
        }
      });
    };
    
    setActiveSwatch(this.pickerSkin, this.currentPreset.skinColor);
    setActiveSwatch(this.pickerShirt, this.currentPreset.shirtColor);
    setActiveSwatch(this.pickerPants, this.currentPreset.pantsColor);
    
    if (this.selectHat) this.selectHat.value = this.currentPreset.hat;
    if (this.selectBack) this.selectBack.value = this.currentPreset.back;
  }
  
  applyColors() {
    const player = this.game.player;
    if (!player) return;
    
    // Update skin color meshes
    const skinMat = new THREE.MeshLambertMaterial({ color: this.currentPreset.skinColor });
    player.head.material = skinMat;
    player.leftArm.children.forEach(c => c.material = skinMat);
    player.rightArm.children.forEach(c => c.material = skinMat);
    
    // Update shirt color
    const shirtMat = new THREE.MeshLambertMaterial({ color: this.currentPreset.shirtColor });
    player.torso.material = shirtMat;
    
    // Update pants color
    const pantsMat = new THREE.MeshLambertMaterial({ color: this.currentPreset.pantsColor });
    player.leftLeg.children.forEach(c => c.material = pantsMat);
    player.rightLeg.children.forEach(c => c.material = pantsMat);
  }
  
  applyAccessories() {
    const player = this.game.player;
    if (!player) return;
    
    // Clear existing accessories on head and torso
    this.removeAccessory(player.head, 'hat');
    this.removeAccessory(player.torso, 'back');
    
    // Apply new Hat
    if (this.currentPreset.hat !== 'none') {
      const hatMesh = this.createHatMesh(this.currentPreset.hat);
      hatMesh.name = 'accessory-hat';
      // Sits on top of the head. Local center of head is y=0, height is 0.85, so place at y=0.425
      hatMesh.position.set(0, 0.425, 0);
      player.head.add(hatMesh);
    }
    
    // Apply new Back Accessory
    if (this.currentPreset.back !== 'none') {
      const backMesh = this.createBackMesh(this.currentPreset.back);
      backMesh.name = 'accessory-back';
      // Torso is height 1.5, thickness 0.55. Place at back (z = -0.275)
      backMesh.position.set(0, 0, -0.3);
      player.torso.add(backMesh);
    }
  }
  
  removeAccessory(parent, prefix) {
    const toRemove = [];
    parent.children.forEach(child => {
      if (child.name === `accessory-${prefix}`) {
        toRemove.push(child);
      }
    });
    toRemove.forEach(child => {
      parent.remove(child);
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    });
  }
  
  createHatMesh(type) {
    const group = new THREE.Group();
    
    if (type === 'cap') {
      // Baseball cap
      const capMat = new THREE.MeshLambertMaterial({ color: 0xff3b30 });
      const capBase = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.2, 0.9), capMat);
      capBase.position.y = 0.1;
      const capBrim = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 0.5), capMat);
      capBrim.position.set(0, 0.05, 0.6); // extending front
      group.add(capBase, capBrim);
    } 
    else if (type === 'crown') {
      // Golden crown
      const goldMat = new THREE.MeshLambertMaterial({ color: 0xffd700, emissive: 0xffaa00, emissiveIntensity: 0.2 });
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.2, 0.9), goldMat);
      
      // Spikes
      const spikeGeo = new THREE.ConeGeometry(0.15, 0.3, 4);
      const spikes = [
        [0.4, 0.2, 0.4], [-0.4, 0.2, 0.4], [0.4, 0.2, -0.4], [-0.4, 0.2, -0.4]
      ];
      spikes.forEach(pos => {
        const spike = new THREE.Mesh(spikeGeo, goldMat);
        spike.position.set(pos[0], pos[1], pos[2]);
        group.add(spike);
      });
      group.add(base);
    } 
    else if (type === 'horns') {
      // Red demon horns
      const redMat = new THREE.MeshLambertMaterial({ color: 0x990000 });
      const hornGeo = new THREE.ConeGeometry(0.12, 0.4, 4);
      
      const leftHorn = new THREE.Mesh(hornGeo, redMat);
      leftHorn.position.set(0.35, 0.2, 0.1);
      leftHorn.rotation.z = -0.3;
      leftHorn.rotation.x = 0.2;
      
      const rightHorn = new THREE.Mesh(hornGeo, redMat);
      rightHorn.position.set(-0.35, 0.2, 0.1);
      rightHorn.rotation.z = 0.3;
      rightHorn.rotation.x = 0.2;
      
      group.add(leftHorn, rightHorn);
    }
    
    // Enable shadows on accessories
    group.traverse(c => {
      if (c.isMesh) {
        c.castShadow = true;
        c.receiveShadow = true;
      }
    });
    
    return group;
  }
  
  createBackMesh(type) {
    const group = new THREE.Group();
    
    if (type === 'cape') {
      // Red hero cape
      const capeMat = new THREE.MeshLambertMaterial({ color: 0xb30000, side: THREE.DoubleSide });
      const cape = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.4, 0.05), capeMat);
      cape.position.y = -0.4;
      cape.rotation.x = 0.1; // flow back slightly
      group.add(cape);
    } 
    else if (type === 'wings') {
      // White angelic wings
      const wingMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
      
      const leftWing = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 0.08), wingMat);
      leftWing.position.set(0.7, 0.1, -0.1);
      leftWing.rotation.y = 0.4;
      leftWing.rotation.z = 0.2;
      
      const rightWing = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 0.08), wingMat);
      rightWing.position.set(-0.7, 0.1, -0.1);
      rightWing.rotation.y = -0.4;
      rightWing.rotation.z = -0.2;
      
      group.add(leftWing, rightWing);
    }
    
    group.traverse(c => {
      if (c.isMesh) {
        c.castShadow = true;
        c.receiveShadow = true;
      }
    });
    
    return group;
  }
  
  savePreset() {
    localStorage.setItem('terablox_char_preset', JSON.stringify(this.currentPreset));
  }
  
  loadPreset() {
    const saved = localStorage.getItem('terablox_char_preset');
    if (saved) {
      try {
        this.currentPreset = JSON.parse(saved);
        // Wait a bit to ensure player is constructed
        setTimeout(() => {
          this.applyColors();
          this.applyAccessories();
        }, 100);
      } catch (e) {
        console.error('Error loading preset', e);
      }
    }
  }
}
