import * as THREE from 'three';
import { CUSTOM_PRESETS } from './custom-presets.js';

export class CreatorStudio {
  constructor(editorManager, game) {
    this.editorManager = editorManager;
    this.game = game;
    
    this.active = false;
    this.parts = [];
    this.selectedPartId = null;
    
    // Dragging state
    this.isDraggingPart = false;
    this.draggedPart = null;
    this.dragPlane = new THREE.Plane();
    this.dragOffset = new THREE.Vector3();
    
    // Undo history
    this.history = [];
    this.transformBeforeState = null;
    this.dragBeforeState = null;
    
    this.sockets = {
      seat: { x: 0.0, y: 1.0, z: 0.0 },
      wheel: { x: 0.0, y: 1.2, z: 0.6 },
      exit: { x: 0.0, y: 1.0, z: -1.5 }
    };
    this.selectedSocket = 'seat'; // 'seat', 'wheel', 'exit'
    
    this.workspaceCenter = new THREE.Vector3(0, 1000, 0);
    this.studioGroup = new THREE.Group();
    this.studioGroup.visible = false;
    
    this.socketMarkers = {
      seat: null,
      wheel: null,
      exit: null
    };
    
    // UI Elements
    this.partListContainer = document.getElementById('creator-part-list');
    this.transformGroup = document.getElementById('creator-transform-group');
    
    // Part Transform Inputs
    this.rangePx = document.getElementById('range-part-px');
    this.rangePy = document.getElementById('range-part-py');
    this.rangePz = document.getElementById('range-part-pz');
    this.lblPx = document.getElementById('lbl-part-px');
    this.lblPy = document.getElementById('lbl-part-py');
    this.lblPz = document.getElementById('lbl-part-pz');
    
    this.rangeRx = document.getElementById('range-part-rx');
    this.rangeRy = document.getElementById('range-part-ry');
    this.rangeRz = document.getElementById('range-part-rz');
    this.lblRx = document.getElementById('lbl-part-rx');
    this.lblRy = document.getElementById('lbl-part-ry');
    this.lblRz = document.getElementById('lbl-part-rz');
    
    this.rangeSx = document.getElementById('range-part-sx');
    this.rangeSy = document.getElementById('range-part-sy');
    this.rangeSz = document.getElementById('range-part-sz');
    this.lblSx = document.getElementById('lbl-part-sx');
    this.lblSy = document.getElementById('lbl-part-sy');
    this.lblSz = document.getElementById('lbl-part-sz');
    
    this.inputColor = document.getElementById('input-part-color');
    this.rangeRough = document.getElementById('range-part-rough');
    this.rangeMetal = document.getElementById('range-part-metal');
    this.lblRough = document.getElementById('lbl-part-rough');
    this.lblMetal = document.getElementById('lbl-part-metal');
    
    this.btnDuplicate = document.getElementById('btn-part-duplicate');
    this.btnDelete = document.getElementById('btn-part-delete');
    
    // Socket Inputs
    this.socketSelectBtns = document.querySelectorAll('.socket-select-btn');
    this.rangeSocketX = document.getElementById('range-socket-x');
    this.rangeSocketY = document.getElementById('range-socket-y');
    this.rangeSocketZ = document.getElementById('range-socket-z');
    this.lblSocketX = document.getElementById('lbl-socket-x');
    this.lblSocketY = document.getElementById('lbl-socket-y');
    this.lblSocketZ = document.getElementById('lbl-socket-z');
    this.socketGroup = document.getElementById('creator-socket-group');
    
    // Save Inputs
    this.inputAssetName = document.getElementById('input-asset-name');
    this.selectAssetCategory = document.getElementById('select-asset-category');
    this.btnSaveAsset = document.getElementById('btn-save-asset');
    this.btnCancelEdit = document.getElementById('btn-cancel-edit-asset');
    this.selectCreatorLoadAsset = document.getElementById('select-creator-load-asset');
    this.btnCreatorLoadAsset = document.getElementById('btn-creator-load-asset');
    this.btnExportPreset = document.getElementById('btn-creator-export-preset');
    this.editingAssetId = null;
    
    this.init();
  }
  
  init() {
    this.game.sceneManager.scene.add(this.studioGroup);
    
    // 1. Grid Floor helper
    const gridHelper = new THREE.GridHelper(16, 16, 0x3b82f6, 0x334155);
    gridHelper.position.copy(this.workspaceCenter);
    this.studioGroup.add(gridHelper);
    
    // 2. Light setup for isolated studio
    const studioLight = new THREE.DirectionalLight(0xffffff, 0.8);
    studioLight.position.set(5, 1015, 5);
    studioLight.target.position.copy(this.workspaceCenter);
    this.studioGroup.add(studioLight, studioLight.target);
    
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    this.studioGroup.add(ambientLight);
    
    // Y, X, Z axis color indicators
    const axesHelper = new THREE.AxesHelper(6);
    axesHelper.position.copy(this.workspaceCenter).add(new THREE.Vector3(0, 0.02, 0));
    this.studioGroup.add(axesHelper);
    
    // 3. Socket Markers (spheres)
    this.socketMarkers.seat = new THREE.Mesh(
      new THREE.SphereGeometry(0.25, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.8 })
    );
    this.socketMarkers.wheel = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.8 })
    );
    this.socketMarkers.exit = new THREE.Mesh(
      new THREE.SphereGeometry(0.25, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0x10b981, transparent: true, opacity: 0.8 })
    );
    
    Object.keys(this.socketMarkers).forEach(key => {
      this.studioGroup.add(this.socketMarkers[key]);
    });
    this.updateSocketMarkerPositions();
    
    this.setupListeners();
  }
  
  setupListeners() {
    // 1. Primitives clicks
    document.querySelectorAll('.creator-shape-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const shape = btn.getAttribute('data-shape');
        this.addShape(shape);
      });
    });
    
    // 2. Transform sliders listeners
    const updateTransforms = () => this.updatePartTransforms();
    const transformInputs = [
      this.rangePx, this.rangePy, this.rangePz,
      this.rangeRx, this.rangeRy, this.rangeRz,
      this.rangeSx, this.rangeSy, this.rangeSz,
      this.inputColor, this.rangeRough, this.rangeMetal
    ];
    transformInputs.forEach(inp => {
      if (inp) {
        inp.addEventListener('input', updateTransforms);
        
        // Transform history start capture
        const startRecord = () => this.recordTransformStart();
        inp.addEventListener('mousedown', startRecord);
        inp.addEventListener('focus', startRecord);
        inp.addEventListener('touchstart', startRecord);
        
        // Transform history end capture & push
        inp.addEventListener('change', () => this.recordTransformEnd());
      }
    });
    
    if (this.btnDuplicate) this.btnDuplicate.addEventListener('click', () => this.duplicatePart());
    if (this.btnDelete) this.btnDelete.addEventListener('click', () => this.deletePart());
    
    // Keydown shortcuts (Ctrl+Z undo)
    this.onKeyDown = this.onKeyDown.bind(this);
    window.addEventListener('keydown', this.onKeyDown);
    
    // 3. Socket selectors clicks
    this.socketSelectBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.socketSelectBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.selectedSocket = btn.getAttribute('data-socket');
        this.loadSocketToSliders();
      });
    });
    
    // 4. Socket sliders listeners
    const updateSockets = () => this.updateSocketFromSliders();
    if (this.rangeSocketX) this.rangeSocketX.addEventListener('input', updateSockets);
    if (this.rangeSocketY) this.rangeSocketY.addEventListener('input', updateSockets);
    if (this.rangeSocketZ) this.rangeSocketZ.addEventListener('input', updateSockets);
    
    // 5. Save, Cancel & Load Buttons
    if (this.btnSaveAsset) {
      this.btnSaveAsset.addEventListener('click', () => this.saveAsset());
    }
    if (this.btnCancelEdit) {
      this.btnCancelEdit.addEventListener('click', () => this.cancelEditing());
    }
    if (this.btnCreatorLoadAsset) {
      this.btnCreatorLoadAsset.addEventListener('click', () => {
        const id = this.selectCreatorLoadAsset ? this.selectCreatorLoadAsset.value : '';
        if (!id) {
          alert('Pilih aset kustom terlebih dahulu!');
          return;
        }
        const saved = localStorage.getItem('creator_assets');
        const savedAssets = saved ? JSON.parse(saved) : [];
        
        const merged = [...CUSTOM_PRESETS];
        savedAssets.forEach(sa => {
          const idx = merged.findIndex(a => a.id === sa.id);
          if (idx !== -1) {
            merged[idx] = sa;
          } else {
            merged.push(sa);
          }
        });
        
        const asset = merged.find(a => a.id === id);
        if (asset) {
          this.editAsset(asset);
        }
      });
    }
    if (this.btnExportPreset) {
      this.btnExportPreset.addEventListener('click', () => this.exportPresetsFile());
    }
    
    // 6. Category select toggles socket inputs
    if (this.selectAssetCategory) {
      this.selectAssetCategory.addEventListener('change', (e) => {
        if (e.target.value === 'vehicle') {
          this.socketGroup.style.display = 'block';
          Object.keys(this.socketMarkers).forEach(key => this.socketMarkers[key].visible = true);
        } else {
          this.socketGroup.style.display = 'none';
          Object.keys(this.socketMarkers).forEach(key => this.socketMarkers[key].visible = false);
        }
      });
    }
    
    // Hide socket group initially
    if (this.socketGroup) this.socketGroup.style.display = 'none';
    Object.keys(this.socketMarkers).forEach(key => this.socketMarkers[key].visible = false);
    
    // PC Dragging events
    this.onStudioMouseDown = this.onStudioMouseDown.bind(this);
    this.onStudioMouseMove = this.onStudioMouseMove.bind(this);
    this.onStudioMouseUp = this.onStudioMouseUp.bind(this);
    
    window.addEventListener('mousedown', this.onStudioMouseDown);
    window.addEventListener('mousemove', this.onStudioMouseMove);
    window.addEventListener('mouseup', this.onStudioMouseUp);
  }
  
  activate() {
    this.active = true;
    this.studioGroup.visible = true;
    
    // Deactivate Map Editor interaction/ghost
    if (this.editorManager.mapEditor) {
      if (this.editorManager.mapEditor.ghostMesh) {
        this.editorManager.mapEditor.ghostMesh.visible = false;
      }
      this.editorManager.mapEditor.deselectObject();
    }
    
    // Save original camera target & zoom
    this.originalCameraTarget = this.game.cameraManager._target.clone();
    this.originalCameraDistance = this.game.cameraManager.distance;
    
    // Lock camera focus at studio
    this.game.cameraManager._target.set(0, 1001, 0);
    this.game.cameraManager.distance = 12;
    this.game.cameraManager.phi = 0.8;
    this.game.cameraManager.theta = Math.PI / 4;
    
    // Hide all placed map objects visually so the editor is completely clean
    this.placedObjectsVisibilityStates = [];
    const mapPlaced = this.editorManager.mapEditor.placedObjects || [];
    mapPlaced.forEach(obj => {
      if (obj.mesh) {
        this.placedObjectsVisibilityStates.push({ mesh: obj.mesh, visible: obj.mesh.visible });
        obj.mesh.visible = false;
      }
    });
    
    if (this.game.city && this.game.city.groundMesh) {
      this.originalGroundVisible = this.game.city.groundMesh.visible;
      this.game.city.groundMesh.visible = false;
    }
    
    // Hide player
    if (this.game.player && this.game.player.mesh) {
      this.game.player.mesh.visible = false;
    }
    
    // Hide NPCs
    if (this.game.npcManager && this.game.npcManager.npcs) {
      this.game.npcManager.npcs.forEach(npc => {
        if (npc.mesh) npc.mesh.visible = false;
      });
    }
    
    this.updatePartListUI();
    this.loadSocketToSliders();
    this.populateLoadAssetDropdown();
  }
  
  deactivate() {
    this.active = false;
    this.studioGroup.visible = false;
    
    // Restore map objects visibility
    if (this.placedObjectsVisibilityStates) {
      this.placedObjectsVisibilityStates.forEach(state => {
        state.mesh.visible = state.visible;
      });
    }
    
    if (this.game.city && this.game.city.groundMesh) {
      this.game.city.groundMesh.visible = this.originalGroundVisible !== undefined ? this.originalGroundVisible : true;
    }
    
    // Restore player
    if (this.game.player && this.game.player.mesh) {
      this.game.player.mesh.visible = true;
    }
    
    // Restore NPCs
    if (this.game.npcManager && this.game.npcManager.npcs) {
      this.game.npcManager.npcs.forEach(npc => {
        if (npc.mesh) npc.mesh.visible = true;
      });
    }
    
    // Restore camera
    if (this.originalCameraTarget) {
      this.game.cameraManager._target.copy(this.originalCameraTarget);
      this.game.cameraManager.distance = this.originalCameraDistance;
    }
  }
  
  addShape(type) {
    let geo;
    if (type === 'box') {
      geo = new THREE.BoxGeometry(1, 1, 1);
    } else if (type === 'sphere') {
      geo = new THREE.SphereGeometry(0.6, 16, 16);
    } else if (type === 'cylinder') {
      geo = new THREE.CylinderGeometry(0.5, 0.5, 1, 16);
    } else if (type === 'cone') {
      geo = new THREE.ConeGeometry(0.5, 1, 16);
    } else if (type === 'torus') {
      geo = new THREE.TorusGeometry(0.4, 0.15, 8, 24);
    } else {
      return;
    }
    
    const defaultColor = '#3b82f6';
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(defaultColor),
      roughness: 0.5,
      metalness: 0.1
    });
    
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.copy(this.workspaceCenter).add(new THREE.Vector3(0, 0.5, 0));
    
    this.studioGroup.add(mesh);
    
    const id = THREE.MathUtils.generateUUID();
    const name = `${type.charAt(0).toUpperCase() + type.slice(1)} ${this.parts.length + 1}`;
    
    const part = {
      id,
      type,
      mesh,
      name,
      position: { x: 0.0, y: 0.5, z: 0.0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1.0, y: 1.0, z: 1.0 },
      color: defaultColor,
      roughness: 0.5,
      metalness: 0.1
    };
    
    this.parts.push(part);
    this.selectPart(id);
    this.updatePartListUI();
    
    this.history.push({
      type: 'add',
      partId: id
    });
  }
  
  selectPart(id) {
    // Clear selection style on previous part
    if (this.selectedPartId) {
      const prev = this.parts.find(p => p.id === this.selectedPartId);
      if (prev && prev.mesh) {
        prev.mesh.material.emissive.setHex(0x000000);
      }
    }
    
    this.selectedPartId = id;
    const part = this.parts.find(p => p.id === id);
    if (!part) {
      if (this.transformGroup) this.transformGroup.style.display = 'none';
      return;
    }
    
    // Highlight selected part slightly
    part.mesh.material.emissive.setHex(0x222222);
    
    // Populate sliders
    if (this.transformGroup) this.transformGroup.style.display = 'block';
    
    this.rangePx.value = part.position.x;
    this.rangePy.value = part.position.y;
    this.rangePz.value = part.position.z;
    this.lblPx.textContent = part.position.x.toFixed(1);
    this.lblPy.textContent = part.position.y.toFixed(1);
    this.lblPz.textContent = part.position.z.toFixed(1);
    
    this.rangeRx.value = part.rotation.x;
    this.rangeRy.value = part.rotation.y;
    this.rangeRz.value = part.rotation.z;
    this.lblRx.textContent = part.rotation.x;
    this.lblRy.textContent = part.rotation.y;
    this.lblRz.textContent = part.rotation.z;
    
    this.rangeSx.value = part.scale.x;
    this.rangeSy.value = part.scale.y;
    this.rangeSz.value = part.scale.z;
    this.lblSx.textContent = part.scale.x.toFixed(1);
    this.lblSy.textContent = part.scale.y.toFixed(1);
    this.lblSz.textContent = part.scale.z.toFixed(1);
    
    this.inputColor.value = part.color;
    this.rangeRough.value = part.roughness;
    this.rangeMetal.value = part.metalness;
    this.lblRough.textContent = part.roughness.toFixed(2);
    this.lblMetal.textContent = part.metalness.toFixed(2);
    
    // Focus part list active class
    document.querySelectorAll('.creator-part-item').forEach(item => {
      if (item.getAttribute('data-id') === id) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
  }
  
  updatePartTransforms() {
    if (!this.selectedPartId) return;
    const part = this.parts.find(p => p.id === this.selectedPartId);
    if (!part || !part.mesh) return;
    
    // Read values
    part.position.x = parseFloat(this.rangePx.value);
    part.position.y = parseFloat(this.rangePy.value);
    part.position.z = parseFloat(this.rangePz.value);
    this.lblPx.textContent = part.position.x.toFixed(1);
    this.lblPy.textContent = part.position.y.toFixed(1);
    this.lblPz.textContent = part.position.z.toFixed(1);
    
    part.rotation.x = parseInt(this.rangeRx.value);
    part.rotation.y = parseInt(this.rangeRy.value);
    part.rotation.z = parseInt(this.rangeRz.value);
    this.lblRx.textContent = part.rotation.x;
    this.lblRy.textContent = part.rotation.y;
    this.lblRz.textContent = part.rotation.z;
    
    part.scale.x = parseFloat(this.rangeSx.value);
    part.scale.y = parseFloat(this.rangeSy.value);
    part.scale.z = parseFloat(this.rangeSz.value);
    this.lblSx.textContent = part.scale.x.toFixed(1);
    this.lblSy.textContent = part.scale.y.toFixed(1);
    this.lblSz.textContent = part.scale.z.toFixed(1);
    
    part.color = this.inputColor.value;
    part.roughness = parseFloat(this.rangeRough.value);
    part.metalness = parseFloat(this.rangeMetal.value);
    this.lblRough.textContent = part.roughness.toFixed(2);
    this.lblMetal.textContent = part.metalness.toFixed(2);
    
    // Apply to mesh
    part.mesh.position.copy(this.workspaceCenter).add(new THREE.Vector3(part.position.x, part.position.y, part.position.z));
    part.mesh.rotation.set(
      part.rotation.x * Math.PI / 180,
      part.rotation.y * Math.PI / 180,
      part.rotation.z * Math.PI / 180
    );
    part.mesh.scale.set(part.scale.x, part.scale.y, part.scale.z);
    
    part.mesh.material.color.set(part.color);
    part.mesh.material.roughness = part.roughness;
    part.mesh.material.metalness = part.metalness;
  }
  
  duplicatePart() {
    if (!this.selectedPartId) return;
    const orig = this.parts.find(p => p.id === this.selectedPartId);
    if (!orig) return;
    
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(orig.color),
      roughness: orig.roughness,
      metalness: orig.metalness
    });
    const mesh = new THREE.Mesh(orig.mesh.geometry.clone(), mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    
    const dupOffset = 0.5; // shift duplicate slightly
    mesh.position.copy(orig.mesh.position).add(new THREE.Vector3(dupOffset, 0, dupOffset));
    mesh.rotation.copy(orig.mesh.rotation);
    mesh.scale.copy(orig.mesh.scale);
    
    this.studioGroup.add(mesh);
    
    const id = THREE.MathUtils.generateUUID();
    const name = `${orig.name} (Copy)`;
    
    const dup = {
      id,
      type: orig.type,
      mesh,
      name,
      position: { x: orig.position.x + dupOffset, y: orig.position.y, z: orig.position.z + dupOffset },
      rotation: { ...orig.rotation },
      scale: { ...orig.scale },
      color: orig.color,
      roughness: orig.roughness,
      metalness: orig.metalness
    };
    
    this.parts.push(dup);
    this.selectPart(id);
    this.updatePartListUI();
    
    this.history.push({
      type: 'add',
      partId: id
    });
  }
  
  deletePart() {
    if (!this.selectedPartId) return;
    const index = this.parts.findIndex(p => p.id === this.selectedPartId);
    if (index !== -1) {
      const part = this.parts[index];
      
      this.history.push({
        type: 'delete',
        partId: part.id,
        partData: {
          type: part.type,
          name: part.name,
          position: { ...part.position },
          rotation: { ...part.rotation },
          scale: { ...part.scale },
          color: part.color,
          roughness: part.roughness,
          metalness: part.metalness
        }
      });
      
      if (part.mesh) this.studioGroup.remove(part.mesh);
      this.parts.splice(index, 1);
    }
    this.selectedPartId = null;
    this.updatePartListUI();
    if (this.transformGroup) this.transformGroup.style.display = 'none';
  }
  
  updatePartListUI() {
    if (!this.partListContainer) return;
    this.partListContainer.innerHTML = '';
    
    if (this.parts.length === 0) {
      this.partListContainer.innerHTML = `<div style="color: #888; text-align: center; padding: 10px;">No parts added yet</div>`;
      return;
    }
    
    this.parts.forEach(part => {
      const el = document.createElement('div');
      el.className = `creator-part-item ${part.id === this.selectedPartId ? 'active' : ''}`;
      el.setAttribute('data-id', part.id);
      el.innerHTML = `
        <span class="creator-part-item-name">${part.name}</span>
        <span class="creator-part-item-type">${part.type}</span>
      `;
      el.addEventListener('click', () => this.selectPart(part.id));
      this.partListContainer.appendChild(el);
    });
  }
  
  loadSocketToSliders() {
    const s = this.sockets[this.selectedSocket];
    if (!s) return;
    this.rangeSocketX.value = s.x;
    this.rangeSocketY.value = s.y;
    this.rangeSocketZ.value = s.z;
    this.lblSocketX.textContent = s.x.toFixed(1);
    this.lblSocketY.textContent = s.y.toFixed(1);
    this.lblSocketZ.textContent = s.z.toFixed(1);
  }
  
  updateSocketFromSliders() {
    const s = this.sockets[this.selectedSocket];
    if (!s) return;
    s.x = parseFloat(this.rangeSocketX.value);
    s.y = parseFloat(this.rangeSocketY.value);
    s.z = parseFloat(this.rangeSocketZ.value);
    
    this.lblSocketX.textContent = s.x.toFixed(1);
    this.lblSocketY.textContent = s.y.toFixed(1);
    this.lblSocketZ.textContent = s.z.toFixed(1);
    
    this.updateSocketMarkerPositions();
  }
  
  updateSocketMarkerPositions() {
    Object.keys(this.socketMarkers).forEach(key => {
      const marker = this.socketMarkers[key];
      const coords = this.sockets[key];
      if (marker && coords) {
        marker.position.copy(this.workspaceCenter).add(new THREE.Vector3(coords.x, coords.y, coords.z));
      }
    });
  }
  
  saveAsset() {
    const name = this.inputAssetName ? this.inputAssetName.value.trim() : '';
    if (!name) {
      alert('Nama Aset Kustom tidak boleh kosong!');
      return;
    }
    if (this.parts.length === 0) {
      alert('Tambahkan setidaknya 1 bentuk (shape) untuk merakit komponen!');
      return;
    }
    
    const category = this.selectAssetCategory ? this.selectAssetCategory.value : 'prop';
    
    // Serialize shape parts
    const partsData = this.parts.map(p => ({
      type: p.type,
      position: { ...p.position },
      rotation: { ...p.rotation },
      scale: { ...p.scale },
      color: p.color,
      roughness: p.roughness,
      metalness: p.metalness
    }));
    
    const saved = localStorage.getItem('creator_assets');
    const assetsList = saved ? JSON.parse(saved) : [];
    
    if (this.editingAssetId) {
      const idx = assetsList.findIndex(a => a.id === this.editingAssetId);
      if (idx !== -1) {
        assetsList[idx].name = name;
        assetsList[idx].category = category;
        assetsList[idx].parts = partsData;
        assetsList[idx].sockets = category === 'vehicle' ? { ...this.sockets } : null;
        
        localStorage.setItem('creator_assets', JSON.stringify(assetsList));
        alert(`Sukses memperbarui Aset Kustom "${name}"!`);
        
        // Update live in-memory placements
        if (this.editorManager.mapEditor) {
          const mapIdx = this.editorManager.mapEditor.customAssets.findIndex(a => a.id === this.editingAssetId);
          if (mapIdx !== -1) {
            this.editorManager.mapEditor.customAssets[mapIdx] = assetsList[idx];
          }
          this.editorManager.mapEditor.updatePlacedCustomAssetMeshes(this.editingAssetId, assetsList[idx]);
        }
      }
    } else {
      const assetId = 'custom_' + THREE.MathUtils.generateUUID().substring(0, 8);
      const asset = {
        id: assetId,
        name,
        category,
        parts: partsData,
        sockets: category === 'vehicle' ? { ...this.sockets } : null
      };
      assetsList.push(asset);
      localStorage.setItem('creator_assets', JSON.stringify(assetsList));
      alert(`Sukses menyimpan Aset Kustom "${name}"!`);
    }
    
    // Reset fields
    this.editingAssetId = null;
    if (this.btnSaveAsset) this.btnSaveAsset.textContent = '💾 Save Component';
    if (this.btnCancelEdit) this.btnCancelEdit.style.display = 'none';
    
    this.inputAssetName.value = '';
    this.parts.forEach(p => this.studioGroup.remove(p.mesh));
    this.parts = [];
    this.selectedPartId = null;
    if (this.transformGroup) this.transformGroup.style.display = 'none';
    this.updatePartListUI();
    
    // Reset sockets
    this.sockets = {
      seat: { x: 0.0, y: 1.0, z: 0.0 },
      wheel: { x: 0.0, y: 1.2, z: 0.6 },
      exit: { x: 0.0, y: 1.0, z: -1.5 }
    };
    this.updateSocketMarkerPositions();
    this.loadSocketToSliders();
    
    this.populateLoadAssetDropdown();
    
    // Notify map editor to reload customs catalog list
    if (this.editorManager.mapEditor) {
      this.editorManager.mapEditor.loadCustomAssets();
    }
  }

  onStudioMouseDown(e) {
    if (!this.active) return;
    if (e.target !== this.game.cameraManager.domElement) return;
    
    const mouse = new THREE.Vector2(
      (e.clientX / window.innerWidth) * 2 - 1,
      -(e.clientY / window.innerHeight) * 2 + 1
    );
    
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, this.game.cameraManager.camera);
    
    const partMeshes = this.parts.map(p => p.mesh);
    const intersects = raycaster.intersectObjects(partMeshes, true);
    
    if (intersects.length > 0) {
      let hitMesh = intersects[0].object;
      while (hitMesh.parent && hitMesh.parent !== this.studioGroup) {
        hitMesh = hitMesh.parent;
      }
      
      const part = this.parts.find(p => p.mesh === hitMesh);
      if (part) {
        this.selectPart(part.id);
        this.draggedPart = part;
        this.isDraggingPart = true;
        this.game.cameraManager.dragSuspended = true;
        
        this.dragBeforeState = this.getPartState(part);
        
        this.dragPlane.setFromNormalAndCoplanarPoint(
          new THREE.Vector3(0, 1, 0),
          part.mesh.position
        );
        
        const intersection = new THREE.Vector3();
        raycaster.ray.intersectPlane(this.dragPlane, intersection);
        this.dragOffset.copy(intersection).sub(part.mesh.position);
      }
    }
  }

  onStudioMouseMove(e) {
    if (!this.active || !this.isDraggingPart || !this.draggedPart) return;
    
    const mouse = new THREE.Vector2(
      (e.clientX / window.innerWidth) * 2 - 1,
      -(e.clientY / window.innerHeight) * 2 + 1
    );
    
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, this.game.cameraManager.camera);
    
    const intersection = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(this.dragPlane, intersection)) {
      const newPos = intersection.clone().sub(this.dragOffset);
      
      const relX = newPos.x - this.workspaceCenter.x;
      const relZ = newPos.z - this.workspaceCenter.z;
      
      const clampRange = 8;
      this.draggedPart.position.x = Math.max(-clampRange, Math.min(clampRange, relX));
      this.draggedPart.position.z = Math.max(-clampRange, Math.min(clampRange, relZ));
      
      this.draggedPart.mesh.position.copy(this.workspaceCenter).add(
        new THREE.Vector3(this.draggedPart.position.x, this.draggedPart.position.y, this.draggedPart.position.z)
      );
      
      this.rangePx.value = this.draggedPart.position.x;
      this.rangePz.value = this.draggedPart.position.z;
      this.lblPx.textContent = this.draggedPart.position.x.toFixed(1);
      this.lblPz.textContent = this.draggedPart.position.z.toFixed(1);
    }
  }

  onStudioMouseUp(e) {
    if (this.isDraggingPart) {
      if (this.draggedPart && this.dragBeforeState) {
        const after = this.getPartState(this.draggedPart);
        const changed = JSON.stringify(this.dragBeforeState) !== JSON.stringify(after);
        if (changed) {
          this.history.push({
            type: 'transform',
            partId: this.draggedPart.id,
            before: this.dragBeforeState,
            after: after
          });
        }
      }
      this.dragBeforeState = null;
      this.isDraggingPart = false;
      this.draggedPart = null;
      this.game.cameraManager.dragSuspended = false;
    }
  }

  getPartState(part) {
    if (!part) return null;
    return {
      position: { ...part.position },
      rotation: { ...part.rotation },
      scale: { ...part.scale },
      color: part.color,
      roughness: part.roughness,
      metalness: part.metalness
    };
  }

  recordTransformStart() {
    if (!this.selectedPartId) return;
    const part = this.parts.find(p => p.id === this.selectedPartId);
    if (part && !this.transformBeforeState) {
      this.transformBeforeState = this.getPartState(part);
    }
  }

  recordTransformEnd() {
    if (!this.selectedPartId || !this.transformBeforeState) return;
    const part = this.parts.find(p => p.id === this.selectedPartId);
    if (part) {
      const after = this.getPartState(part);
      const changed = JSON.stringify(this.transformBeforeState) !== JSON.stringify(after);
      if (changed) {
        this.history.push({
          type: 'transform',
          partId: part.id,
          before: this.transformBeforeState,
          after: after
        });
      }
    }
    this.transformBeforeState = null;
  }

  undo() {
    if (this.history.length === 0) return;
    const action = this.history.pop();
    
    if (action.type === 'add') {
      const part = this.parts.find(p => p.id === action.partId);
      if (part) {
        this.studioGroup.remove(part.mesh);
        this.parts = this.parts.filter(p => p.id !== action.partId);
        if (this.selectedPartId === action.partId) {
          this.selectedPartId = null;
          if (this.transformGroup) this.transformGroup.style.display = 'none';
        }
        this.updatePartListUI();
      }
    } else if (action.type === 'delete') {
      const d = action.partData;
      let geom;
      if (d.type === 'box') geom = new THREE.BoxGeometry(1, 1, 1);
      else if (d.type === 'sphere') geom = new THREE.SphereGeometry(0.5, 32, 32);
      else if (d.type === 'cylinder') geom = new THREE.CylinderGeometry(0.5, 0.5, 1, 32);
      else if (d.type === 'cone') geom = new THREE.ConeGeometry(0.5, 1, 32);
      else if (d.type === 'torus') geom = new THREE.TorusGeometry(0.4, 0.15, 16, 100);
      
      const mat = new THREE.MeshStandardMaterial({
        color: d.color,
        roughness: d.roughness,
        metalness: d.metalness
      });
      
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.copy(this.workspaceCenter).add(new THREE.Vector3(d.position.x, d.position.y, d.position.z));
      mesh.rotation.set(
        d.rotation.x * Math.PI / 180,
        d.rotation.y * Math.PI / 180,
        d.rotation.z * Math.PI / 180
      );
      mesh.scale.set(d.scale.x, d.scale.y, d.scale.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      
      this.studioGroup.add(mesh);
      
      const restoredPart = {
        id: action.partId,
        type: d.type,
        name: d.name,
        position: { ...d.position },
        rotation: { ...d.rotation },
        scale: { ...d.scale },
        color: d.color,
        roughness: d.roughness,
        metalness: d.metalness,
        mesh: mesh
      };
      
      this.parts.push(restoredPart);
      this.selectPart(restoredPart.id);
      this.updatePartListUI();
    } else if (action.type === 'transform') {
      const part = this.parts.find(p => p.id === action.partId);
      if (part) {
        const b = action.before;
        part.position = { ...b.position };
        part.rotation = { ...b.rotation };
        part.scale = { ...b.scale };
        part.color = b.color;
        part.roughness = b.roughness;
        part.metalness = b.metalness;
        
        part.mesh.position.copy(this.workspaceCenter).add(new THREE.Vector3(b.position.x, b.position.y, b.position.z));
        part.mesh.rotation.set(
          b.rotation.x * Math.PI / 180,
          b.rotation.y * Math.PI / 180,
          b.rotation.z * Math.PI / 180
        );
        part.mesh.scale.set(b.scale.x, b.scale.y, b.scale.z);
        part.mesh.material.color.set(b.color);
        part.mesh.material.roughness = b.roughness;
        part.mesh.material.metalness = b.metalness;
        
        if (this.selectedPartId === part.id) {
          this.selectPart(part.id);
        }
      }
    }
  }

  onKeyDown(e) {
    if (!this.active) return;
    
    // Check if focused on an input text to avoid capturing typing
    if (document.activeElement && document.activeElement.tagName === 'INPUT' && document.activeElement.type === 'text') {
      return;
    }
    
    const isCtrlZ = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z';
    if (isCtrlZ) {
      e.preventDefault();
      this.undo();
    }
  }

  editAsset(asset) {
    // 1. Reset current studio state
    this.parts.forEach(p => this.studioGroup.remove(p.mesh));
    this.parts = [];
    this.selectedPartId = null;
    this.history = [];
    
    // Set the asset properties (name, category)
    if (this.inputAssetName) this.inputAssetName.value = asset.name;
    if (this.selectAssetCategory) this.selectAssetCategory.value = asset.category;
    
    // Set Save/Cancel button states
    if (this.btnSaveAsset) this.btnSaveAsset.textContent = '💾 Update Component';
    if (this.btnCancelEdit) this.btnCancelEdit.style.display = 'block';
    
    // Store reference to the asset ID we are editing
    this.editingAssetId = asset.id;
    
    // If it has sockets, load sockets
    if (asset.sockets) {
      this.sockets = {
        seat: { ...asset.sockets.seat },
        wheel: { ...asset.sockets.wheel },
        exit: { ...asset.sockets.exit }
      };
      if (this.socketGroup) this.socketGroup.style.display = 'block';
      Object.keys(this.socketMarkers).forEach(key => this.socketMarkers[key].visible = true);
    } else {
      this.sockets = {
        seat: { x: 0.0, y: 1.0, z: 0.0 },
        wheel: { x: 0.0, y: 1.2, z: 0.6 },
        exit: { x: 0.0, y: 1.0, z: -1.5 }
      };
      if (this.socketGroup) this.socketGroup.style.display = 'none';
      Object.keys(this.socketMarkers).forEach(key => this.socketMarkers[key].visible = false);
    }
    this.updateSocketMarkerPositions();
    this.loadSocketToSliders();
    
    // Reconstruct parts
    asset.parts.forEach(pData => {
      let geo;
      const type = pData.type;
      if (type === 'box') geo = new THREE.BoxGeometry(1, 1, 1);
      else if (type === 'sphere') geo = new THREE.SphereGeometry(0.5, 32, 32);
      else if (type === 'cylinder') geo = new THREE.CylinderGeometry(0.5, 0.5, 1, 32);
      else if (type === 'cone') geo = new THREE.ConeGeometry(0.5, 1, 32);
      else if (type === 'torus') geo = new THREE.TorusGeometry(0.4, 0.15, 16, 100);
      
      const mat = new THREE.MeshStandardMaterial({
        color: pData.color,
        roughness: pData.roughness,
        metalness: pData.metalness
      });
      
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.position.copy(this.workspaceCenter).add(new THREE.Vector3(pData.position.x, pData.position.y, pData.position.z));
      mesh.rotation.set(
        pData.rotation.x * Math.PI / 180,
        pData.rotation.y * Math.PI / 180,
        pData.rotation.z * Math.PI / 180
      );
      mesh.scale.set(pData.scale.x, pData.scale.y, pData.scale.z);
      
      this.studioGroup.add(mesh);
      
      const id = THREE.MathUtils.generateUUID();
      const name = pData.name || `${type.charAt(0).toUpperCase() + type.slice(1)} ${this.parts.length + 1}`;
      
      const part = {
        id,
        type,
        mesh,
        name,
        position: { ...pData.position },
        rotation: { ...pData.rotation },
        scale: { ...pData.scale },
        color: pData.color,
        roughness: pData.roughness,
        metalness: pData.metalness
      };
      this.parts.push(part);
    });
    
    if (this.parts.length > 0) {
      this.selectPart(this.parts[0].id);
    }
    this.updatePartListUI();
    
    // Switch to Creator tab
    this.editorManager.switchTab('creator');
  }

  cancelEditing() {
    this.editingAssetId = null;
    
    if (this.btnSaveAsset) this.btnSaveAsset.textContent = '💾 Save Component';
    if (this.btnCancelEdit) this.btnCancelEdit.style.display = 'none';
    
    this.inputAssetName.value = '';
    this.parts.forEach(p => this.studioGroup.remove(p.mesh));
    this.parts = [];
    this.selectedPartId = null;
    if (this.transformGroup) this.transformGroup.style.display = 'none';
    this.updatePartListUI();
    
    this.sockets = {
      seat: { x: 0.0, y: 1.0, z: 0.0 },
      wheel: { x: 0.0, y: 1.2, z: 0.6 },
      exit: { x: 0.0, y: 1.0, z: -1.5 }
    };
    this.updateSocketMarkerPositions();
    this.loadSocketToSliders();
    
    this.editorManager.switchTab('props');
  }

  populateLoadAssetDropdown() {
    if (!this.selectCreatorLoadAsset) return;
    this.selectCreatorLoadAsset.innerHTML = '<option value="">-- Pilih Aset --</option>';
    
    const saved = localStorage.getItem('creator_assets');
    const savedAssets = saved ? JSON.parse(saved) : [];
    
    const merged = [...CUSTOM_PRESETS];
    savedAssets.forEach(sa => {
      const idx = merged.findIndex(a => a.id === sa.id);
      if (idx !== -1) {
        merged[idx] = sa;
      } else {
        merged.push(sa);
      }
    });
    
    merged.forEach(asset => {
      const opt = document.createElement('option');
      opt.value = asset.id;
      opt.textContent = `${asset.name} (${asset.category})`;
      this.selectCreatorLoadAsset.appendChild(opt);
    });
  }

  exportPresetsFile() {
    const saved = localStorage.getItem('creator_assets');
    const savedAssets = saved ? JSON.parse(saved) : [];
    
    const merged = [...CUSTOM_PRESETS];
    savedAssets.forEach(sa => {
      const idx = merged.findIndex(a => a.id === sa.id);
      if (idx !== -1) {
        merged[idx] = sa;
      } else {
        merged.push(sa);
      }
    });

    fetch('/api/save-presets', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ presets: merged })
    })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        const btn = this.btnExportPreset;
        if (btn) {
          const oldText = btn.textContent;
          btn.textContent = '✅ Saved to Project!';
          btn.style.background = '#10b981';
          btn.style.color = '#ffffff';
          setTimeout(() => {
            btn.textContent = oldText;
            btn.style.background = '';
            btn.style.color = '';
          }, 2000);
        }
      } else {
        alert('Gagal menyimpan preset ke project: ' + data.error);
      }
    })
    .catch(err => {
      // Fallback: download file if API fails (e.g., in production static build)
      const fileContent = `export const CUSTOM_PRESETS = ${JSON.stringify(merged, null, 2)};\n`;
      const blob = new Blob([fileContent], { type: 'application/javascript' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'custom-presets.js';
      a.click();
      URL.revokeObjectURL(url);
    });
  }
}
