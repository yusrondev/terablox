import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { CUSTOM_PRESETS } from './custom-presets.js';

export class MapEditor {
  constructor(editorManager, game) {
    this.editorManager = editorManager;
    this.game = game;
    this.active = false;
    
    this.subMode = 'props'; // 'props' or 'city'
    this.selectedProp = 'lamp';
    this.selectedBrush = 'road';
    this.snapEnabled = true;
    this.snapSize = 2.0;
    this.rotationAngle = 0; // in radians
    
    this.placedObjects = [];
    this.game.sceneManager.placedObjects = this.placedObjects;
    this.selectedObject = null;
    this.ghostMesh = null;
    
    this.customAssets = [];
    this.selectedCustomAsset = null;
    
    // Raycasting utilities
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); // horizontal y=0 plane
    this.intersectionPoint = new THREE.Vector3();
    
    this.tileColorPickerGroup = document.getElementById('tile-color-picker-group');
    this.tileScaleControlGroup = document.getElementById('tile-scale-control-group');
    this.rangeTileW = document.getElementById('range-tile-w');
    this.rangeTileD = document.getElementById('range-tile-d');
    this.rangeTileH = document.getElementById('range-tile-h');
    this.lblTileW = document.getElementById('lbl-tile-w');
    this.lblTileD = document.getElementById('lbl-tile-d');
    this.lblTileH = document.getElementById('lbl-tile-h');
    this.pickerTile = document.getElementById('picker-tile');
    this.selectedTileColor = '#ffffff';
    this.history = []; // History stack for Ctrl+Z undo
    this.dragStartPos = { x: 0, y: 0 }; // Track camera drags
    this.npcCount = 20; // Default global NPC count
    
    this.setupUI();
    this.setupListeners();
    this.loadCustomAssets();
  }
  
  setupUI() {
    this.checkSnap = document.getElementById('check-snap');
    this.catalogList = document.getElementById('props-catalog-list');
    this.brushSelector = document.querySelector('.brush-selector');
    this.heightControlGroup = document.getElementById('height-control-group');
    this.bldHeightWrapper = document.getElementById('bld-height-wrapper');
    this.rangeHeight = document.getElementById('range-bld-height');
    this.lblHeight = document.getElementById('lbl-bld-height');
    this.inputBldColor = document.getElementById('input-bld-color');
    
    this.btnExport = document.getElementById('btn-export-map');
    this.btnImport = document.getElementById('btn-import-map');
    this.btnSaveMap = document.getElementById('btn-save-map');
    
    // Snap toggle
    this.checkSnap.addEventListener('change', (e) => {
      this.snapEnabled = e.target.checked;
    });
    
    // NPC Count Slider
    this.rangeNpcCount = document.getElementById('range-npc-count');
    this.lblNpcCount = document.getElementById('lbl-npc-count');
    if (this.rangeNpcCount && this.lblNpcCount) {
      this.rangeNpcCount.addEventListener('input', (e) => {
        this.npcCount = parseInt(e.target.value);
        this.lblNpcCount.innerText = this.npcCount;
      });
    }
    
    // Props Catalog Click
    if (this.catalogList) {
      this.catalogList.querySelectorAll('.catalog-item').forEach(item => {
        item.addEventListener('click', () => {
          this.catalogList.querySelectorAll('.catalog-item').forEach(i => i.classList.remove('active'));
          if (this.customCatalogList) {
            this.customCatalogList.querySelectorAll('.catalog-item').forEach(i => i.classList.remove('active'));
          }
          item.classList.add('active');
          this.selectedProp = item.getAttribute('data-prop');
          this.selectedCustomAsset = null;
          this.rotationAngle = 0;
          this.deselectObject();
          
          if (this.selectedProp === 'tile') {
            if (this.tileColorPickerGroup) this.tileColorPickerGroup.style.display = 'block';
            if (this.tileScaleControlGroup) {
              this.tileScaleControlGroup.style.display = 'block';
              this.adjustScaleSliders('tile');
            }
          } else {
            if (this.tileColorPickerGroup) this.tileColorPickerGroup.style.display = 'none';
            if (!(this.subMode === 'city' && ['terrain_block', 'water', 'road_ramp', 'terrain_ramp'].includes(this.selectedBrush))) {
              if (this.tileScaleControlGroup) this.tileScaleControlGroup.style.display = 'none';
            }
          }
          
          if (this.active && this.subMode === 'props') {
            this.createGhost(this.selectedProp);
          }
        });
      });
      
      // Tile/object scale slider listeners
      const updateTileDimensions = (e, lbl) => {
        if (lbl) lbl.textContent = e.target.value;
        const activeBrush = (this.subMode === 'props' ? this.selectedProp : this.selectedBrush);
        if (this.active && ['tile', 'terrain_block', 'water', 'road_ramp', 'terrain_ramp'].includes(activeBrush)) {
          this.createGhost(activeBrush);
        }
      };
      if (this.rangeTileW) this.rangeTileW.addEventListener('input', (e) => updateTileDimensions(e, this.lblTileW));
      if (this.rangeTileD) this.rangeTileD.addEventListener('input', (e) => updateTileDimensions(e, this.lblTileD));
      if (this.rangeTileH) this.rangeTileH.addEventListener('input', (e) => updateTileDimensions(e, this.lblTileH));
    }
    
    // Brush buttons
    if (this.brushSelector) {
      this.brushSelector.querySelectorAll('.brush-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          this.brushSelector.querySelectorAll('.brush-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          this.selectedBrush = btn.getAttribute('data-brush');
          this.rotationAngle = 0;
          this.deselectObject();
          
          if (this.selectedBrush === 'building' || this.selectedBrush === 'rumah' || this.selectedBrush === 'ruko') {
            this.heightControlGroup.style.display = 'block';
            if (this.bldHeightWrapper) {
              this.bldHeightWrapper.style.display = (this.selectedBrush === 'building') ? 'block' : 'none';
            }
          } else {
            this.heightControlGroup.style.display = 'none';
          }
          
          if (['terrain_block', 'water', 'road_ramp', 'terrain_ramp'].includes(this.selectedBrush)) {
            if (this.tileScaleControlGroup) {
              this.tileScaleControlGroup.style.display = 'block';
              this.adjustScaleSliders(this.selectedBrush);
            }
          } else {
            if (!(this.subMode === 'props' && this.selectedProp === 'tile')) {
              if (this.tileScaleControlGroup) this.tileScaleControlGroup.style.display = 'none';
            }
          }
          
          if (this.active && this.subMode === 'city') {
            this.createGhost(this.selectedBrush);
          }
        });
      });
    }
    
    // Building height slider
    if (this.rangeHeight) {
      this.rangeHeight.addEventListener('input', (e) => {
        this.lblHeight.textContent = e.target.value;
        if (this.active && this.subMode === 'city' && this.selectedBrush === 'building') {
          this.createGhost('building');
        }
      });
    }
    
    // Building color picker
    if (this.inputBldColor) {
      this.inputBldColor.addEventListener('input', (e) => {
        if (this.active && this.subMode === 'city' && ['building', 'rumah', 'ruko'].includes(this.selectedBrush)) {
          this.createGhost(this.selectedBrush);
        }
      });
    }
    
    // Export / Import
    if (this.btnExport) this.btnExport.addEventListener('click', () => this.exportMap());
    if (this.btnImport) this.btnImport.addEventListener('click', () => this.importMap());
    if (this.btnSaveMap) {
      this.btnSaveMap.addEventListener('click', () => {
        const name = prompt('Masukkan Nama Map:');
        if (name && name.trim()) {
          this.saveMapToServer(name.trim());
        }
      });
    }
    
    // Map Size selector binding
    this.selectMapSize = document.getElementById('select-map-size');
    if (this.selectMapSize) {
      this.selectMapSize.addEventListener('change', (e) => {
        const newSize = parseInt(e.target.value);
        if (this.game.city) {
          this.game.city.rebuildGroundAndBoundaries(newSize);
        }
      });
    }
    
    // Tile Colors setup
    if (this.pickerTile) {
      this.pickerTile.innerHTML = '';
      const tileColors = ['#ff8b94', '#ffaaa6', '#ffd3b6', '#d4f0f0', '#8fcaca', '#c7ceea', '#3b82f6', '#10b981', '#f59e0b', '#374151', '#ffffff'];
      tileColors.forEach(color => {
        const swatch = document.createElement('div');
        swatch.className = 'color-swatch';
        swatch.style.backgroundColor = color;
        swatch.setAttribute('data-color', color);
        swatch.addEventListener('click', () => {
          this.pickerTile.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
          swatch.classList.add('active');
          this.selectedTileColor = color;
          if (this.selectedProp === 'tile') {
            this.createGhost('tile');
          }
        });
        this.pickerTile.appendChild(swatch);
      });
      const swatches = this.pickerTile.querySelectorAll('.color-swatch');
      if (swatches.length > 0) swatches[swatches.length - 1].classList.add('active');
    }
    
    // Sidebar Map List setup
    this.sidebarMapList = document.getElementById('sidebar-map-list');
    this.loadAndRenderSavedMaps();
  }

  loadCustomAssets() {
    this.customCatalogList = document.getElementById('custom-catalog-list');
    const saved = localStorage.getItem('creator_assets');
    const savedAssets = saved ? JSON.parse(saved) : [];
    
    // Merge global presets with local storage custom assets
    const merged = [...CUSTOM_PRESETS];
    savedAssets.forEach(sa => {
      const idx = merged.findIndex(a => a.id === sa.id);
      if (idx !== -1) {
        merged[idx] = sa;
      } else {
        merged.push(sa);
      }
    });
    this.customAssets = merged;
    
    if (!this.customCatalogList) return;
    this.customCatalogList.innerHTML = '';
    
    if (this.customAssets.length === 0) {
      this.customCatalogList.innerHTML = `<div style="color: #888; text-align: center; grid-column: span 2; font-size: 11px; padding: 10px;">Belum ada Custom Asset. Buat di tab "Creator"!</div>`;
      return;
    }
    
    this.customAssets.forEach(asset => {
      const el = document.createElement('div');
      el.className = 'catalog-item';
      el.setAttribute('data-custom-id', asset.id);
      
      let icon = '📦';
      if (asset.category === 'vehicle') icon = '🚗';
      else if (asset.category === 'building') icon = '🏢';
      
      el.innerHTML = `
        <span class="icon">${icon}</span>
        <span class="name">${asset.name}</span>
        <button class="edit-custom-btn" style="position: absolute; right: 5px; top: 5px; background: #3b82f6; border: none; border-radius: 4px; color: white; padding: 2px 6px; font-size: 10px; cursor: pointer; display: none;">✏️</button>
      `;
      
      el.addEventListener('click', (e) => {
        // If click targets edit button
        if (e.target.classList.contains('edit-custom-btn')) {
          e.stopPropagation();
          this.editorManager.creatorStudio.editAsset(asset);
          return;
        }
        
        if (this.catalogList) {
          this.catalogList.querySelectorAll('.catalog-item').forEach(i => i.classList.remove('active'));
        }
        this.customCatalogList.querySelectorAll('.catalog-item').forEach(i => i.classList.remove('active'));
        el.classList.add('active');
        
        this.selectedProp = 'custom_' + asset.id;
        this.selectedCustomAsset = asset;
        this.rotationAngle = 0;
        this.deselectObject();
        
        if (this.tileColorPickerGroup) this.tileColorPickerGroup.style.display = 'none';
        if (this.tileScaleControlGroup) this.tileScaleControlGroup.style.display = 'none';
        
        if (this.active && this.subMode === 'props') {
          this.createGhost(this.selectedProp);
        }
      });
      
      this.customCatalogList.appendChild(el);
    });
  }

  updatePlacedCustomAssetMeshes(assetId, updatedAsset) {
    this.placedObjects.forEach(obj => {
      if (obj.type === 'custom_' + assetId) {
        // Remove old visual mesh from scene
        this.game.sceneManager.scene.remove(obj.mesh);
        
        // Build new visual mesh
        const visualMesh = this.buildCustomAssetMesh(updatedAsset, false);
        visualMesh.position.copy(obj.position);
        visualMesh.rotation.y = obj.rotation;
        visualMesh.castShadow = true;
        visualMesh.receiveShadow = true;
        visualMesh.traverse(child => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        
        // Replace in-memory mesh reference & add back to scene
        obj.mesh = visualMesh;
        this.game.sceneManager.scene.add(visualMesh);
        
        // Update physics shape bounds if category or geometry bounds changed
        if (obj.body) {
          // Remove old shapes
          while (obj.body.shapes.length > 0) {
            obj.body.removeShape(obj.body.shapes[0]);
          }
          
          const box = new THREE.Box3().setFromObject(visualMesh);
          const size = new THREE.Vector3();
          box.getSize(size);
          
          const halfX = Math.max(0.2, size.x / 2);
          const halfY = Math.max(0.2, size.y / 2);
          const halfZ = Math.max(0.2, size.z / 2);
          
          obj.body.addShape(new CANNON.Box(new CANNON.Vec3(halfX, halfY, halfZ)), new CANNON.Vec3(0, halfY, 0));
        }
      }
    });
  }

  buildCustomAssetMesh(asset, wireframe = false) {
    const group = new THREE.Group();
    const parts = asset.parts || [];
    
    parts.forEach(p => {
      let geo;
      if (p.type === 'box') {
        geo = new THREE.BoxGeometry(1, 1, 1);
      } else if (p.type === 'sphere') {
        geo = new THREE.SphereGeometry(0.6, 12, 12);
      } else if (p.type === 'cylinder') {
        geo = new THREE.CylinderGeometry(0.5, 0.5, 1, 12);
      } else if (p.type === 'cone') {
        geo = new THREE.ConeGeometry(0.5, 1, 12);
      } else if (p.type === 'torus') {
        geo = new THREE.TorusGeometry(0.4, 0.15, 6, 16);
      } else {
        return;
      }
      
      let mat;
      if (wireframe) {
        mat = new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true, transparent: true, opacity: 0.6 });
      } else {
        mat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(p.color || '#3b82f6'),
          roughness: p.roughness !== undefined ? p.roughness : 0.5,
          metalness: p.metalness !== undefined ? p.metalness : 0.1
        });
      }
      
      const partMesh = new THREE.Mesh(geo, mat);
      partMesh.position.set(p.position.x, p.position.y, p.position.z);
      partMesh.rotation.set(
        (p.rotation.x || 0) * Math.PI / 180,
        (p.rotation.y || 0) * Math.PI / 180,
        (p.rotation.z || 0) * Math.PI / 180
      );
      partMesh.scale.set(p.scale.x, p.scale.y, p.scale.z);
      partMesh.castShadow = true;
      partMesh.receiveShadow = true;
      group.add(partMesh);
    });
    
    if (asset.category === 'vehicle' && wireframe && asset.sockets) {
      const seatM = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), new THREE.MeshBasicMaterial({ color: 0xef4444 }));
      seatM.position.set(asset.sockets.seat.x, asset.sockets.seat.y, asset.sockets.seat.z);
      const wheelM = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 8), new THREE.MeshBasicMaterial({ color: 0xf59e0b }));
      wheelM.position.set(asset.sockets.wheel.x, asset.sockets.wheel.y, asset.sockets.wheel.z);
      const exitM = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), new THREE.MeshBasicMaterial({ color: 0x10b981 }));
      exitM.position.set(asset.sockets.exit.x, asset.sockets.exit.y, asset.sockets.exit.z);
      group.add(seatM, wheelM, exitM);
    }
    
    group.name = 'custom_prop_group';
    return group;
  }

  adjustScaleSliders(type) {
    if (!this.rangeTileW || !this.rangeTileD || !this.rangeTileH) return;
    
    const label = this.tileScaleControlGroup.querySelector('label');
    
    if (type === 'tile') {
      label.textContent = 'Tile Dimensions';
      this.rangeTileW.min = 1; this.rangeTileW.max = 20; this.rangeTileW.step = 1;
      this.rangeTileD.min = 1; this.rangeTileD.max = 20; this.rangeTileD.step = 1;
      this.rangeTileH.min = 0.1; this.rangeTileH.max = 5.0; this.rangeTileH.step = 0.1;
      
      this.rangeTileW.value = 2;
      this.rangeTileD.value = 2;
      this.rangeTileH.value = 0.1;
    } else if (type === 'terrain_block') {
      label.textContent = 'Hill Dimensions';
      this.rangeTileW.min = 2; this.rangeTileW.max = 40; this.rangeTileW.step = 2;
      this.rangeTileD.min = 2; this.rangeTileD.max = 40; this.rangeTileD.step = 2;
      this.rangeTileH.min = 0.5; this.rangeTileH.max = 20.0; this.rangeTileH.step = 0.5;
      
      this.rangeTileW.value = 10;
      this.rangeTileD.value = 10;
      this.rangeTileH.value = 2.0;
    } else if (type === 'water') {
      label.textContent = 'Water Dimensions';
      this.rangeTileW.min = 2; this.rangeTileW.max = 40; this.rangeTileW.step = 2;
      this.rangeTileD.min = 2; this.rangeTileD.max = 40; this.rangeTileD.step = 2;
      this.rangeTileH.min = 0.5; this.rangeTileH.max = 10.0; this.rangeTileH.step = 0.5;
      
      this.rangeTileW.value = 10;
      this.rangeTileD.value = 10;
      this.rangeTileH.value = 1.9;
    } else if (type === 'road_ramp') {
      label.textContent = 'Ramp Dimensions';
      this.rangeTileW.min = 2; this.rangeTileW.max = 40; this.rangeTileW.step = 2;
      this.rangeTileD.min = 2; this.rangeTileD.max = 40; this.rangeTileD.step = 2;
      this.rangeTileH.min = 0.5; this.rangeTileH.max = 10.0; this.rangeTileH.step = 0.5;
      
      this.rangeTileW.value = 10;
      this.rangeTileD.value = 10;
      this.rangeTileH.value = 2.0;
    }
    
    // Update label displays
    if (this.lblTileW) this.lblTileW.textContent = this.rangeTileW.value;
    if (this.lblTileD) this.lblTileD.textContent = this.rangeTileD.value;
    if (this.lblTileH) this.lblTileH.textContent = this.rangeTileH.value;
  }
  
  setupListeners() {
    this.onMouseMove = this.onMouseMove.bind(this);
    this.onMouseClick = this.onMouseClick.bind(this);
    this.onKeyDown = this.onKeyDown.bind(this);
    this.onMouseDown = this.onMouseDown.bind(this);
  }
  
  activate(subMode = 'props') {
    // Clean up first to prevent duplicate event listeners when switching tabs!
    this.deactivate();
    
    this.active = true;
    this.subMode = subMode;
    this.deselectObject();
    
    // Bind global listeners
    window.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('click', this.onMouseClick);
    window.addEventListener('keydown', this.onKeyDown);
    
    // Set Editor Camera high angle free orbit
    if (this.game.cameraManager) {
      this.game.cameraManager.distance = 25;
      this.game.cameraManager.phi = 0.8; // Looking down diagonally
      this.game.cameraManager.theta = Math.PI;
    }
    
    // Create initial ghost
    const ghostType = (this.subMode === 'props') ? this.selectedProp : this.selectedBrush;
    this.createGhost(ghostType);
  }
  
  deactivate() {
    this.active = false;
    this.deselectObject();
    
    // Unbind listeners
    window.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('click', this.onMouseClick);
    window.removeEventListener('keydown', this.onKeyDown);
    
    // Remove ghost mesh
    if (this.ghostMesh) {
      this.game.sceneManager.scene.remove(this.ghostMesh);
      this.ghostMesh = null;
    }
    
    if (this.tileScaleControlGroup) {
      this.tileScaleControlGroup.style.display = 'none';
    }
  }
  
  createGhost(type) {
    if (this.ghostMesh) {
      this.game.sceneManager.scene.remove(this.ghostMesh);
    }
    
    if (type === 'clear') {
      // Erase tool has a red box wireframe
      const mat = new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true });
      this.ghostMesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), mat);
      this.ghostMesh.position.y = 1.0;
      this.game.sceneManager.scene.add(this.ghostMesh);
      return;
    }
    
    const wireMat = new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true, transparent: true, opacity: 0.6 });
    let mesh;
    
    if (type && type.startsWith('custom_')) {
      const assetId = type.substring(7);
      const asset = this.customAssets.find(a => a.id === assetId);
      if (asset) {
        mesh = this.buildCustomAssetMesh(asset, true);
      }
    } else if (type === 'lamp') {
      const g = new THREE.Group();
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.15, 3.5, 0.15), wireMat);
      p.position.y = 1.75;
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.5, 0.35), wireMat);
      h.position.y = 4.05;
      g.add(p, h);
      mesh = g;
    } else if (type === 'street_light') {
      const g = new THREE.Group();
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.18, 4.5, 0.18), wireMat);
      p.position.y = 2.25;
      const a = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 1.2), wireMat);
      a.position.set(0, 4.41, 0.51);
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.15, 0.6), wireMat);
      h.position.set(0, 4.41, 1.11);
      const coneGeo = new THREE.CylinderGeometry(0.22, 2.5, 4.3, 8, 1, true);
      coneGeo.translate(0, -2.15, 0);
      const cone = new THREE.Mesh(coneGeo, wireMat);
      cone.position.set(0, 4.29, 1.11);
      cone.name = 'light_cone';
      g.add(p, a, h, cone);
      mesh = g;
    } else if (type === 'bench') {
      const g = new THREE.Group();
      const seat = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.1, 0.6), wireMat);
      seat.position.y = 0.55;
      const back = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.4, 0.1), wireMat);
      back.position.set(0, 0.9, 0.25);
      const legL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.5), wireMat);
      legL.position.set(0.8, 0.25, 0);
      const legR = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.5), wireMat);
      legR.position.set(-0.8, 0.25, 0);
      g.add(seat, back, legL, legR);
      mesh = g;
    } else if (type === 'tree') {
      const g = new THREE.Group();
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.6, 3, 0.6), wireMat);
      t.position.y = 1.5;
      const l = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 3), wireMat);
      l.position.y = 4.5;
      g.add(t, l);
      mesh = g;
    } else if (type === 'hydrant') {
      mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1, 8), wireMat);
      mesh.position.y = 0.5;
    } else if (type === 'pine_tree') {
      const g = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.8, 0.35), wireMat);
      trunk.position.y = 0.9;
      g.add(trunk);
      for (let i = 0; i < 3; i++) {
        const cone = new THREE.Mesh(new THREE.ConeGeometry(1.2 - i * 0.3, 1.2, 4), wireMat);
        cone.position.y = 1.8 + i * 0.9;
        g.add(cone);
      }
      mesh = g;
    } else if (type === 'sign_no_parking') {
      const g = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.5, 0.1), wireMat);
      pole.position.y = 1.25;
      const board = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.04), wireMat);
      board.position.set(0, 2.2, 0.06);
      g.add(pole, board);
      mesh = g;
    } else if (type === 'fountain') {
      const g = new THREE.Group();
      const base = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2.0, 0.5, 8), wireMat);
      base.position.y = 0.25;
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 1.5, 8), wireMat);
      pillar.position.y = 1.0;
      const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.0, 0.3, 8), wireMat);
      upper.position.y = 1.6;
      
      // Water drops placeholders
      const waterDrops = [];
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        const drop = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.6, 0.15), wireMat);
        drop.position.set(Math.cos(angle) * 0.7, 1.3, Math.sin(angle) * 0.7);
        drop.rotation.x = 0.3;
        drop.rotation.y = angle;
        g.add(drop);
        waterDrops.push(drop);
      }
      g.add(base, pillar, upper);
      g.userData = { waterDrops: waterDrops, timeOffset: 0 };
      mesh = g;
    } else if (type === 'grass') {
      const g = new THREE.Group();
      const b1 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.6, 0.3), wireMat);
      b1.position.y = 0.3;
      const b2 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.8, 0.2), wireMat);
      b2.position.set(0.15, 0.4, -0.15);
      const b3 = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.5, 0.25), wireMat);
      b3.position.set(-0.2, 0.25, 0.1);
      g.add(b1, b2, b3);
      mesh = g;
    } else if (type === 'tile') {
      const tw = this.rangeTileW ? parseFloat(this.rangeTileW.value) : 2;
      const td = this.rangeTileD ? parseFloat(this.rangeTileD.value) : 2;
      const th = this.rangeTileH ? parseFloat(this.rangeTileH.value) : 0.1;
      const g = new THREE.Group();
      const m = new THREE.Mesh(new THREE.BoxGeometry(tw, th, td), wireMat);
      m.position.y = th / 2;
      g.add(m);
      mesh = g;
    } else if (type === 'tycoon_button') {
      const g = new THREE.Group();
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.1, 16), wireMat);
      base.position.y = 0.05;
      const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.15, 16), wireMat);
      btn.position.y = 0.15;
      g.add(base, btn);
      mesh = g;
    } else if (type === 'road' || type === 'road_roundabout') {
      const g = new THREE.Group();
      const m = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), wireMat);
      m.rotation.x = -Math.PI / 2;
      m.position.y = 0.01;
      g.add(m);
      mesh = g;
    } else if (type === 'terrain_block') {
      const tw = this.rangeTileW ? parseFloat(this.rangeTileW.value) : 10;
      const td = this.rangeTileD ? parseFloat(this.rangeTileD.value) : 10;
      const th = this.rangeTileH ? parseFloat(this.rangeTileH.value) : 2.0;
      const g = new THREE.Group();
      const m = new THREE.Mesh(new THREE.BoxGeometry(tw, th, td), wireMat);
      m.position.y = th / 2;
      g.add(m);
      mesh = g;
    } else if (type === 'water') {
      const tw = this.rangeTileW ? parseFloat(this.rangeTileW.value) : 10;
      const td = this.rangeTileD ? parseFloat(this.rangeTileD.value) : 10;
      const th = this.rangeTileH ? parseFloat(this.rangeTileH.value) : 1.9;
      const g = new THREE.Group();
      const wMesh = new THREE.Mesh(new THREE.BoxGeometry(tw, th, td), wireMat);
      wMesh.position.y = th / 2;
      wMesh.name = 'water_tile';
      g.add(wMesh);
      mesh = g;
    } else if (type === 'road_ramp' || type === 'terrain_ramp') {
      const tw = this.rangeTileW ? parseFloat(this.rangeTileW.value) : 10;
      const td = this.rangeTileD ? parseFloat(this.rangeTileD.value) : 10;
      const th = this.rangeTileH ? parseFloat(this.rangeTileH.value) : 2.0;
      const g = new THREE.Group();
      const slopeLength = Math.sqrt(td * td + th * th);
      const m = new THREE.Mesh(new THREE.BoxGeometry(tw, 0.1, slopeLength), wireMat);
      m.rotation.x = -Math.atan2(th, td);
      m.position.set(0, th / 2, 0);
      g.add(m);
      mesh = g;
    } else if (type === 'building' || type === 'rumah' || type === 'ruko') {
      const g = new THREE.Group();
      const bldColor = this.inputBldColor ? this.inputBldColor.value : '#ffb7b2';
      const bWireMat = new THREE.MeshBasicMaterial({ color: bldColor, wireframe: true, transparent: true, opacity: 0.8 });
      
      if (type === 'building') {
        const h = parseFloat(this.rangeHeight.value) || 15;
        const b = new THREE.Mesh(new THREE.BoxGeometry(8, h, 8), bWireMat);
        b.position.y = h / 2;
        g.add(b);
      } else if (type === 'rumah') {
        const w = 6;
        const d = 8;
        const h = 5;
        const base = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), bWireMat);
        base.position.y = h / 2;
        const roof = new THREE.Mesh(new THREE.ConeGeometry(5, 3, 4), bWireMat);
        roof.rotation.y = Math.PI / 4;
        roof.position.y = h + 1.5;
        g.add(base, roof);
      } else if (type === 'ruko') {
        const w = 7;
        const d = 8;
        const h = 8; // 2 stories
        const base = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), bWireMat);
        base.position.y = h / 2;
        const awning = new THREE.Mesh(new THREE.BoxGeometry(w, 0.2, 3), bWireMat);
        awning.rotation.x = 0.1;
        awning.position.set(0, 3.5, d/2 + 1.5);
        g.add(base, awning);
      }
      mesh = g;
      mesh.position.y = 0;
    } else if (type === 'spawn_point') {
      const g = new THREE.Group();
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.1, 8), wireMat);
      pad.position.y = 0.05;
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.8, 8), wireMat);
      body.position.y = 0.9;
      g.add(pad, body);
      mesh = g;
    } else if (type === 'spawn_npc') {
      const g = new THREE.Group();
      const padMat = new THREE.MeshBasicMaterial({ color: 0xffaa00, wireframe: true, transparent: true, opacity: 0.6 });
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.1, 8), padMat);
      pad.position.y = 0.05;
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.8, 8), padMat);
      body.position.y = 0.9;
      g.add(pad, body);
      mesh = g;
    }
    
    this.ghostMesh = mesh;
    this.game.sceneManager.scene.add(this.ghostMesh);
  }
  
  onMouseMove(e) {
    if (!this.active || !this.ghostMesh) return;
    
    // Ignore moves on UI panel (now moved to the left side)
    if (e.clientX < 340 && e.clientY > 60) return;
    
    this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    
    this.raycaster.setFromCamera(this.mouse, this.game.cameraManager.camera);
    
    // 1. Find intersection with the horizontal y=0 plane for base mouse projection
    this.raycaster.ray.intersectPlane(this.groundPlane, this.intersectionPoint);
    
    // Calculate position with snap-to-grid
    let x = this.intersectionPoint.x;
    let z = this.intersectionPoint.z;
    
    const snap = (this.subMode === 'city') ? 10.0 : this.snapSize; // Larger snap for city builder tiles
    if (this.snapEnabled) {
      x = Math.round(x / snap) * snap;
      z = Math.round(z / snap) * snap;
    }
    
    // 2. Perform downward vertical raycasting at snapped (x, z) to get the top surface of the terrain
    let targetY = 0;
    
    // Collect all ground-like meshes to intersect
    const groundTypes = ['tile', 'road', 'road_roundabout', 'road_ramp', 'terrain_ramp', 'water', 'terrain_block'];
    const groundMeshes = [];
    
    this.placedObjects.forEach(obj => {
      if (groundTypes.includes(obj.type) && obj.mesh) {
        groundMeshes.push(obj.mesh);
      }
    });
    if (this.game.city && this.game.city.groundMesh) {
      groundMeshes.push(this.game.city.groundMesh);
    }
    
    // Hide ghost mesh temporarily to prevent raycast collision with self
    const oldVisible = this.ghostMesh.visible;
    this.ghostMesh.visible = false;
    
    const downRaycaster = new THREE.Raycaster(
      new THREE.Vector3(x, 200, z),
      new THREE.Vector3(0, -1, 0)
    );
    const intersects = downRaycaster.intersectObjects(groundMeshes, true);
    if (intersects.length > 0) {
      targetY = intersects[0].point.y;
    }
    
    this.ghostMesh.visible = oldVisible;
    
    this.ghostMesh.position.x = x;
    this.ghostMesh.position.y = targetY;
    this.ghostMesh.position.z = z;
    this.ghostMesh.rotation.y = this.rotationAngle;
  }
  
  onMouseDown(e) {
    this.dragStartPos.x = e.clientX;
    this.dragStartPos.y = e.clientY;
  }
  
  onMouseClick(e) {
    if (!this.active || !this.ghostMesh) return;
    
    // Ignore clicks on HTML UI elements (Sidebar, HUD, etc)
    if (e.target && e.target.tagName !== 'CANVAS') return;
    
    // Detect if mouse was dragged to rotate or pan camera. If so, ignore click to prevent spawning.
    const dx = e.clientX - this.dragStartPos.x;
    const dy = e.clientY - this.dragStartPos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 5) {
      return;
    }
    
    if (this.selectedBrush === 'clear') {
      this.raycastErase(e);
      return;
    }
    
    // Allow clicking on existing placed objects to select them (unless painting roads/buildings)
    const isPlaceableProp = [
      'lamp', 'street_light', 'bench', 'tree', 'pine_tree', 
      'hydrant', 'sign_no_parking', 'fountain', 'grass', 
      'tile', 'tycoon_button', 'spawn_point', 'spawn_npc'
    ].includes(this.selectedProp) || (this.selectedProp && this.selectedProp.startsWith('custom_'));

    if (this.subMode === 'props' && !isPlaceableProp) {
      this.raycastSelect(e);
      return;
    }
    
    // If not painting tile/road, click selects existing object first
    if (this.subMode === 'props') {
      const selected = this.raycastSelect(e);
      if (selected) return; // selection handled, block placement!
    }
    
    // Place new object
    this.placeObject();
  }
  
  placeObject(forceType = null) {
    const type = forceType || ((this.subMode === 'props') ? this.selectedProp : this.selectedBrush);
    if (type === 'clear') return;
    
    // Check if tile/position is already occupied (only if snap to grid is active)
    if (this.snapEnabled) {
      const occupied = this.placedObjects.some(obj => {
        const objPos = (obj.position && obj.position.isVector3) ? obj.position : new THREE.Vector3(obj.position.x, obj.position.y, obj.position.z);
        return objPos.distanceTo(this.ghostMesh.position) < 0.5 && obj.type === type;
      });
      if (occupied) return;
    }
    
    let visualMesh;
    let physicsBody = null;
    
    // Materials
    const woodMat = new THREE.MeshLambertMaterial({ color: 0xc4956a });
    const leavesMat = new THREE.MeshLambertMaterial({ color: 0x7fc97f });
    const darkGrey = new THREE.MeshLambertMaterial({ color: 0x444444 });
    const redMat = new THREE.MeshLambertMaterial({ color: 0xef4444 });
    
    // Construct real meshes
    if (type && type.startsWith('custom_')) {
      const assetId = type.substring(7);
      const asset = this.customAssets.find(a => a.id === assetId);
      if (asset) {
        visualMesh = this.buildCustomAssetMesh(asset, false);
        
        // Compute bounding box for physics body
        const box = new THREE.Box3().setFromObject(visualMesh);
        const size = new THREE.Vector3();
        box.getSize(size);
        
        const halfX = Math.max(0.2, size.x / 2);
        const halfY = Math.max(0.2, size.y / 2);
        const halfZ = Math.max(0.2, size.z / 2);
        
        if (asset.category === 'vehicle') {
          physicsBody = new CANNON.Body({
            mass: 800, // Heavy dynamic vehicle body to prevent being pushed away easily
            material: this.game.physicsManager.defaultMaterial,
            linearDamping: 0.9, // High damping when parked to prevent drifting/sliding
            angularDamping: 0.95,
            fixedRotation: false
          });
          physicsBody.addShape(new CANNON.Box(new CANNON.Vec3(halfX, halfY, halfZ)), new CANNON.Vec3(0, halfY, 0));
        } else {
          physicsBody = new CANNON.Body({ mass: 0 });
          physicsBody.addShape(new CANNON.Box(new CANNON.Vec3(halfX, halfY, halfZ)), new CANNON.Vec3(0, halfY, 0));
        }
      }
    }
    else if (type === 'lamp') {
      const g = new THREE.Group();
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.15, 3.5, 0.15), darkGrey);
      p.position.y = 1.75;
      
      const tlMainMat  = new THREE.MeshBasicMaterial({ color: 0xffffff, map: this.game.city.createTrafficLightTexture() });
      const tlBlackMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
      const tlMaterials = [
        tlBlackMat, // +X
        tlBlackMat, // -X
        tlBlackMat, // +Y
        tlBlackMat, // -Y
        tlMainMat,  // +Z
        tlMainMat   // -Z
      ];
      
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.5, 0.35), tlMaterials);
      h.position.y = 4.05;
      g.add(p, h);
      visualMesh = g;
      
      // Physics body
      physicsBody = new CANNON.Body({ mass: 0 });
      physicsBody.addShape(new CANNON.Box(new CANNON.Vec3(0.075, 1.75, 0.075)));
    } 
    else if (type === 'street_light') {
      const g = new THREE.Group();
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.18, 4.5, 0.18), darkGrey);
      p.position.y = 2.25;
      const a = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 1.2), darkGrey);
      a.position.set(0, 4.41, 0.51);
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.15, 0.6), new THREE.MeshLambertMaterial({ color: 0x1f2327 }));
      h.position.set(0, 4.41, 1.11);
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.08, 0.45), new THREE.MeshBasicMaterial({ color: 0xffffcc }));
      b.position.set(0, 4.29, 1.11);
      
      // Translucent light beam cone
      const coneGeo = new THREE.CylinderGeometry(0.22, 2.5, 4.3, 8, 1, true);
      coneGeo.translate(0, -2.15, 0);
      const cone = new THREE.Mesh(coneGeo, this.game.sceneManager.streetLightConeMaterial);
      cone.position.set(0, 4.29, 1.11);
      cone.name = 'light_cone';
      
      g.add(p, a, h, b, cone);
      visualMesh = g;
      
      physicsBody = new CANNON.Body({ mass: 0 });
      physicsBody.addShape(new CANNON.Box(new CANNON.Vec3(0.09, 2.25, 0.09)));
    }
    else if (type === 'bench') {
      const g = new THREE.Group();
      const seat = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.1, 0.6), woodMat);
      seat.position.y = 0.55;
      const back = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.4, 0.1), woodMat);
      back.position.set(0, 0.9, 0.25);
      const legL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.5), darkGrey);
      legL.position.set(0.8, 0.25, 0);
      const legR = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.5), darkGrey);
      legR.position.set(-0.8, 0.25, 0);
      g.add(seat, back, legL, legR);
      visualMesh = g;
      
      physicsBody = new CANNON.Body({ mass: 0 });
      physicsBody.addShape(new CANNON.Box(new CANNON.Vec3(1.0, 0.5, 0.3)));
    } 
    else if (type === 'tree') {
      const g = new THREE.Group();
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.6, 3, 0.6), woodMat);
      t.position.y = 1.5;
      const l = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 3), leavesMat);
      l.position.y = 4.5;
      g.add(t, l);
      visualMesh = g;
      
      physicsBody = new CANNON.Body({ mass: 0 });
      physicsBody.addShape(new CANNON.Box(new CANNON.Vec3(0.3, 1.5, 0.3)));
    } 
    else if (type === 'hydrant') {
      visualMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1, 8), redMat);
      visualMesh.position.y = 0.5;
      
      physicsBody = new CANNON.Body({ mass: 0 });
      physicsBody.addShape(new CANNON.Box(new CANNON.Vec3(0.2, 0.5, 0.2)));
    }
    else if (type === 'grass') {
      const g = new THREE.Group();
      const b1 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.6, 0.3), leavesMat);
      b1.position.y = 0.3;
      const b2 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.8, 0.2), new THREE.MeshLambertMaterial({ color: 0x6ab04c }));
      b2.position.set(0.15, 0.4, -0.15);
      const b3 = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.5, 0.25), new THREE.MeshLambertMaterial({ color: 0xbadc58 }));
      b3.position.set(-0.2, 0.25, 0.1);
      g.add(b1, b2, b3);
      visualMesh = g;
      // No physics collider for grass
    }
    else if (type === 'tile') {
      const tw = this.rangeTileW ? parseFloat(this.rangeTileW.value) : 2;
      const td = this.rangeTileD ? parseFloat(this.rangeTileD.value) : 2;
      const th = this.rangeTileH ? parseFloat(this.rangeTileH.value) : 0.1;
      
      const g = new THREE.Group();
      const m = new THREE.Mesh(new THREE.BoxGeometry(tw, th, td), new THREE.MeshLambertMaterial({ color: this.selectedTileColor }));
      m.position.y = th / 2;
      g.add(m);
      visualMesh = g;
      visualMesh.userData = { tileW: tw, tileD: td, tileH: th };
      
      physicsBody = new CANNON.Body({ mass: 0, material: this.game.physicsManager.defaultMaterial });
      physicsBody.addShape(new CANNON.Box(new CANNON.Vec3(tw / 2, th / 2, td / 2)), new CANNON.Vec3(0, th / 2, 0));
    }
    else if (type === 'tycoon_button') {
      const g = new THREE.Group();
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.1, 16), darkGrey);
      base.position.y = 0.05;
      const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.15, 16), redMat);
      btn.position.y = 0.15;
      g.add(base, btn);
      visualMesh = g;
      
      physicsBody = new CANNON.Body({ mass: 0 });
      physicsBody.addShape(new CANNON.Box(new CANNON.Vec3(0.9, 0.1, 0.9)));
    }
    else if (type === 'pine_tree') {
      const g = new THREE.Group();
      const brownMat = new THREE.MeshLambertMaterial({ color: 0x8b5a2b });
      const greenMat = new THREE.MeshLambertMaterial({ color: 0x2e7d32 }); // Dark pine green
      
      const trunk = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.8, 0.35), brownMat);
      trunk.position.y = 0.9;
      trunk.castShadow = true;
      trunk.receiveShadow = true;
      g.add(trunk);
      
      for (let i = 0; i < 3; i++) {
        const coneGeo = new THREE.ConeGeometry(1.2 - i * 0.3, 1.2, 4); // 4-sided blocky pyramids
        const cone = new THREE.Mesh(coneGeo, greenMat);
        cone.position.y = 1.8 + i * 0.9;
        cone.castShadow = true;
        cone.receiveShadow = true;
        g.add(cone);
      }
      visualMesh = g;
      
      physicsBody = new CANNON.Body({ mass: 0 });
      physicsBody.addShape(new CANNON.Box(new CANNON.Vec3(0.18, 0.9, 0.18)));
    }
    else if (type === 'sign_no_parking') {
      const g = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.5, 0.1), darkGrey);
      pole.position.y = 1.25;
      pole.castShadow = true;
      g.add(pole);
      
      const signBoard = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, 0.6, 0.04),
        new THREE.MeshLambertMaterial({ color: 0xffffff, map: this.createNoParkingTexture() })
      );
      signBoard.position.set(0, 2.2, 0.06);
      signBoard.castShadow = true;
      g.add(signBoard);
      visualMesh = g;
      
      physicsBody = new CANNON.Body({ mass: 0 });
      physicsBody.addShape(new CANNON.Box(new CANNON.Vec3(0.05, 1.25, 0.05)));
    }
    else if (type === 'fountain') {
      const g = new THREE.Group();
      const stoneMat = new THREE.MeshLambertMaterial({ color: 0x7f8c8d });
      const waterMat = new THREE.MeshBasicMaterial({ color: 0x00a8ff, transparent: true, opacity: 0.8 });
      
      // Lower basin
      const base = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2.0, 0.5, 8), stoneMat);
      base.position.y = 0.25;
      base.castShadow = true;
      base.receiveShadow = true;
      g.add(base);
      
      // Water inside lower basin
      const waterLower = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 0.1, 8), waterMat);
      waterLower.position.y = 0.45;
      g.add(waterLower);
      
      // Center pillar
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 1.5, 8), stoneMat);
      pillar.position.y = 1.0;
      pillar.castShadow = true;
      g.add(pillar);
      
      // Upper basin
      const upperBase = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.0, 0.3, 8), stoneMat);
      upperBase.position.y = 1.6;
      upperBase.castShadow = true;
      g.add(upperBase);
      
      // Water in upper basin
      const waterUpper = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.08, 8), waterMat);
      waterUpper.position.y = 1.72;
      g.add(waterUpper);
      
      // Shape water jets/splashes (8 blocky drops cascading down)
      const waterDrops = [];
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        const dropGeo = new THREE.BoxGeometry(0.15, 0.6, 0.15);
        const drop = new THREE.Mesh(dropGeo, new THREE.MeshBasicMaterial({ color: 0x00d2d3, transparent: true, opacity: 0.7 }));
        
        const x = Math.cos(angle) * 0.7;
        const z = Math.sin(angle) * 0.7;
        drop.position.set(x, 1.3, z);
        drop.rotation.x = 0.3;
        drop.rotation.y = angle;
        g.add(drop);
        waterDrops.push(drop);
      }
      
      g.userData = {
        waterDrops: waterDrops,
        timeOffset: Math.random() * 100
      };
      visualMesh = g;
      
      physicsBody = new CANNON.Body({ mass: 0 });
      physicsBody.addShape(new CANNON.Box(new CANNON.Vec3(1.8, 0.25, 1.8)));
    }
    else if (type === 'road' || type === 'road_roundabout') {
      const g = new THREE.Group();
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(10, 10),
        new THREE.MeshLambertMaterial({ 
          color: 0xffffff, 
          map: type === 'road' ? this.createRoadTexture() : this.createRoundaboutTexture() 
        })
      );
      m.rotation.x = -Math.PI / 2;
      m.position.y = 0.01;
      m.name = 'road_custom';
      g.add(m);
      g.name = 'road_custom';
      visualMesh = g;
    } 
    else if (type === 'spawn_point') {
      const g = new THREE.Group();
      const greenBasic = new THREE.MeshBasicMaterial({ color: 0x00ff00, side: THREE.DoubleSide });
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.1, 8), greenBasic);
      pad.position.y = 0.05;
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.8, 8), greenBasic);
      body.position.y = 0.9;
      g.add(pad, body);
      visualMesh = g;
    }
    else if (type === 'spawn_npc') {
      const g = new THREE.Group();
      const orangeBasic = new THREE.MeshBasicMaterial({ color: 0xffaa00, side: THREE.DoubleSide });
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.1, 8), orangeBasic);
      pad.position.y = 0.05;
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.8, 8), orangeBasic);
      body.position.y = 0.9;
      g.add(pad, body);
      visualMesh = g;
    } 
    else if (type === 'terrain_block') {
      const tw = this.rangeTileW ? parseFloat(this.rangeTileW.value) : 10;
      const td = this.rangeTileD ? parseFloat(this.rangeTileD.value) : 10;
      const th = this.rangeTileH ? parseFloat(this.rangeTileH.value) : 2.0;
      
      const g = new THREE.Group();
      
      // Grass top
      const grassMat = new THREE.MeshLambertMaterial({ color: 0x7fc97f });
      const grassMesh = new THREE.Mesh(new THREE.BoxGeometry(tw, 0.1, td), grassMat);
      grassMesh.position.y = th - 0.05;
      
      // Dirt base
      const dirtMat = new THREE.MeshLambertMaterial({ color: 0x8d6e63 });
      const dirtMesh = new THREE.Mesh(new THREE.BoxGeometry(tw - 0.1, th - 0.1, td - 0.1), dirtMat);
      dirtMesh.position.y = (th - 0.1) / 2;
      
      g.add(grassMesh, dirtMesh);
      visualMesh = g;
      visualMesh.userData = { tileW: tw, tileD: td, tileH: th };
      
      physicsBody = new CANNON.Body({ mass: 0, material: this.game.physicsManager.defaultMaterial });
      physicsBody.addShape(new CANNON.Box(new CANNON.Vec3(tw / 2, th / 2, td / 2)), new CANNON.Vec3(0, th / 2, 0));
    }
    else if (type === 'water') {
      const tw = this.rangeTileW ? parseFloat(this.rangeTileW.value) : 10;
      const td = this.rangeTileD ? parseFloat(this.rangeTileD.value) : 10;
      const th = this.rangeTileH ? parseFloat(this.rangeTileH.value) : 1.9;
      
      const g = new THREE.Group();
      const waterMat = new THREE.MeshStandardMaterial({
        color: 0x2980b9,
        transparent: true,
        opacity: 0.7,
        roughness: 0.1,
        metalness: 0.1
      });
      const waterMesh = new THREE.Mesh(new THREE.BoxGeometry(tw, th, td), waterMat);
      waterMesh.position.y = th / 2;
      waterMesh.name = 'water_tile';
      g.add(waterMesh);
      visualMesh = g;
      visualMesh.userData = { tileW: tw, tileD: td, tileH: th };
    }
    else if (type === 'road_ramp') {
      const tw = this.rangeTileW ? parseFloat(this.rangeTileW.value) : 10;
      const td = this.rangeTileD ? parseFloat(this.rangeTileD.value) : 10;
      const th = this.rangeTileH ? parseFloat(this.rangeTileH.value) : 2.0;
      
      const g = new THREE.Group();
      const theta = Math.atan2(th, td);
      const slopeLength = Math.sqrt(td * td + th * th);
      
      const roadMat = new THREE.MeshLambertMaterial({ color: 0xffffff, map: this.createRoadTexture() });
      const surface = new THREE.Mesh(new THREE.BoxGeometry(tw, 0.1, slopeLength), roadMat);
      surface.rotation.x = -theta;
      surface.position.set(0, th / 2, 0);
      
      const borderMat = new THREE.MeshLambertMaterial({ color: 0xbdc3c7 });
      const borderL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, slopeLength), borderMat);
      borderL.rotation.x = -theta;
      borderL.position.set(-tw / 2 + 0.1, th / 2 + 0.05, 0);
      
      const borderR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, slopeLength), borderMat);
      borderR.rotation.x = -theta;
      borderR.position.set(tw / 2 - 0.1, th / 2 + 0.05, 0);
      
      g.add(surface, borderL, borderR);
      visualMesh = g;
      visualMesh.userData = { tileW: tw, tileD: td, tileH: th };
      
      physicsBody = new CANNON.Body({ mass: 0, material: this.game.physicsManager.defaultMaterial });
      physicsBody.addShape(new CANNON.Box(new CANNON.Vec3(tw / 2, 0.1, slopeLength / 2)), new CANNON.Vec3(0, th / 2, 0));
    }
    else if (type === 'terrain_ramp') {
      const tw = this.rangeTileW ? parseFloat(this.rangeTileW.value) : 10;
      const td = this.rangeTileD ? parseFloat(this.rangeTileD.value) : 10;
      const th = this.rangeTileH ? parseFloat(this.rangeTileH.value) : 2.0;
      
      const g = new THREE.Group();
      const theta = Math.atan2(th, td);
      const slopeLength = Math.sqrt(td * td + th * th);
      
      // Lapisan rumput di atas (sedikit diperkecil ketebalannya)
      const grassMat = new THREE.MeshLambertMaterial({ color: 0x7fc97f });
      const surface = new THREE.Mesh(new THREE.BoxGeometry(tw, 0.1, slopeLength), grassMat);
      surface.rotation.x = -theta;
      surface.position.set(0, th / 2, 0);
      
      // Tanah padat di bawah (berbentuk prisma segitiga/wedge)
      const dTW = tw - 0.1;
      const dTD = td - 0.1;
      const dTH = th - 0.05; // Mengisi ruang tepat di bawah rumput
      
      const shape = new THREE.Shape();
      shape.moveTo(-dTD/2, 0);
      shape.lineTo(dTD/2, 0);
      shape.lineTo(dTD/2, dTH);
      shape.lineTo(-dTD/2, 0);
      
      const extrudeSettings = { depth: dTW, bevelEnabled: false };
      const wedgeGeo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
      
      const dirtMat = new THREE.MeshLambertMaterial({ color: 0x8d6e63 });
      const dirtMesh = new THREE.Mesh(wedgeGeo, dirtMat);
      dirtMesh.rotation.y = -Math.PI / 2;
      dirtMesh.position.x = dTW / 2;
      
      g.add(surface, dirtMesh);
      visualMesh = g;
      visualMesh.userData = { tileW: tw, tileD: td, tileH: th };
      
      physicsBody = new CANNON.Body({ mass: 0, material: this.game.physicsManager.defaultMaterial });
      physicsBody.addShape(new CANNON.Box(new CANNON.Vec3(tw / 2, 0.1, slopeLength / 2)), new CANNON.Vec3(0, th / 2, 0));
    }
    else if (type === 'building' || type === 'rumah' || type === 'ruko') {
      const g = new THREE.Group();
      const bColorStr = this.inputBldColor ? this.inputBldColor.value : '#ffb7b2';
      const bColor = new THREE.Color(bColorStr);
      const bMat = new THREE.MeshLambertMaterial({ color: bColor });
      
      g.userData = { customColor: bColorStr };
      
      if (type === 'building') {
        const h = parseFloat(this.rangeHeight.value) || 15;
        g.userData.height = h;
        
        const bodyMesh = new THREE.Mesh(new THREE.BoxGeometry(8, h, 8), bMat);
        bodyMesh.position.y = h / 2;
        bodyMesh.castShadow = true;
        bodyMesh.receiveShadow = true;
        g.add(bodyMesh);
        
        const floorSpacing = 2.8;
        const startY = 2.0;
        const endY = h - 1.2;
        const windowFrameGeo = new THREE.BoxGeometry(0.95, 1.35, 0.04);
        const windowGeo      = new THREE.BoxGeometry(0.85, 1.25, 0.06);
        const frameMat = new THREE.MeshLambertMaterial({ color: 0x1a1d20 });
        const winMat   = this.game.sceneManager.windowMaterial;
        
        for (let wy = startY; wy <= endY; wy += floorSpacing) {
          for (let col = 0; col < 3; col++) {
            const wOffset = -2.0 + col * 2.0;
            const fFrame = new THREE.Mesh(windowFrameGeo, frameMat); fFrame.position.set(wOffset, wy, 4.02);
            const fWin = new THREE.Mesh(windowGeo, winMat); fWin.position.set(wOffset, wy, 4.03);
            const bFrame = new THREE.Mesh(windowFrameGeo, frameMat); bFrame.position.set(wOffset, wy, -4.02); bFrame.rotation.y = Math.PI;
            const bWin = new THREE.Mesh(windowGeo, winMat); bWin.position.set(wOffset, wy, -4.03); bWin.rotation.y = Math.PI;
            const rFrame = new THREE.Mesh(windowFrameGeo, frameMat); rFrame.position.set(4.02, wy, wOffset); rFrame.rotation.y = Math.PI / 2;
            const rWin = new THREE.Mesh(windowGeo, winMat); rWin.position.set(4.03, wy, wOffset); rWin.rotation.y = Math.PI / 2;
            const lFrame = new THREE.Mesh(windowFrameGeo, frameMat); lFrame.position.set(-4.02, wy, wOffset); lFrame.rotation.y = -Math.PI / 2;
            const lWin = new THREE.Mesh(windowGeo, winMat); lWin.position.set(-4.03, wy, wOffset); lWin.rotation.y = -Math.PI / 2;
            g.add(fFrame, fWin, bFrame, bWin, rFrame, rWin, lFrame, lWin);
          }
        }
        
        physicsBody = new CANNON.Body({ mass: 0, material: this.game.physicsManager.defaultMaterial });
        physicsBody.addShape(new CANNON.Box(new CANNON.Vec3(4.0, h / 2, 4.0)), new CANNON.Vec3(0, h / 2, 0));
        
      } else if (type === 'rumah') {
        const w = 6;
        const d = 8;
        const h = 5;
        
        const base = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), bMat);
        base.position.y = h / 2;
        base.castShadow = true;
        base.receiveShadow = true;
        
        const roofColor = new THREE.Color('#d35400');
        const roofMat = new THREE.MeshLambertMaterial({ color: roofColor });
        const roof = new THREE.Mesh(new THREE.ConeGeometry(5, 3, 4), roofMat);
        roof.rotation.y = Math.PI / 4;
        roof.position.y = h + 1.5;
        roof.castShadow = true;
        
        const door = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.2, 0.1), new THREE.MeshLambertMaterial({ color: 0x8e44ad }));
        door.position.set(0, 1.1, d/2 + 0.05);
        
        const winGeo = new THREE.BoxGeometry(1.2, 1.2, 0.1);
        const winMat = this.game.sceneManager.windowMaterial;
        const win1 = new THREE.Mesh(winGeo, winMat); win1.position.set(-1.8, 2, d/2 + 0.05);
        const win2 = new THREE.Mesh(winGeo, winMat); win2.position.set(1.8, 2, d/2 + 0.05);
        
        // Jendela belakang rumah
        const win3 = new THREE.Mesh(winGeo, winMat); win3.position.set(-1.5, 2, -d/2 - 0.05);
        const win4 = new THREE.Mesh(winGeo, winMat); win4.position.set(1.5, 2, -d/2 - 0.05);
        
        g.add(base, roof, door, win1, win2, win3, win4);
        
        physicsBody = new CANNON.Body({ mass: 0, material: this.game.physicsManager.defaultMaterial });
        physicsBody.addShape(new CANNON.Box(new CANNON.Vec3(w/2, h/2, d/2)), new CANNON.Vec3(0, h/2, 0));
        
      } else if (type === 'ruko') {
        console.log("DEBUG: Memulai pembuatan ruko!");
        const w = 7;
        const d = 8;
        const h = 8;
        
        const base = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), bMat);
        base.position.y = h / 2;
        base.castShadow = true;
        base.receiveShadow = true;
        
        const awningMat = new THREE.MeshLambertMaterial({ color: 0x2980b9 });
        const awning = new THREE.Mesh(new THREE.BoxGeometry(w, 0.2, 3), awningMat);
        awning.rotation.x = 0.1;
        awning.position.set(0, 3.5, d/2 + 1.5);
        awning.castShadow = true;
        
        const glassGeo = new THREE.BoxGeometry(w - 1, 3, 0.1);
        const winMat = this.game.sceneManager.windowMaterial;
        const glass = new THREE.Mesh(glassGeo, winMat);
        glass.position.set(0, 1.5, d/2 + 0.05);
        
        const win2Geo = new THREE.BoxGeometry(2, 2, 0.1);
        const win2a = new THREE.Mesh(win2Geo, winMat); win2a.position.set(-1.5, 6, d/2 + 0.05);
        const win2b = new THREE.Mesh(win2Geo, winMat); win2b.position.set(1.5, 6, d/2 + 0.05);
        
        // Jendela belakang ruko
        const winB1 = new THREE.Mesh(win2Geo, winMat); winB1.position.set(-1.5, 6, -d/2 - 0.05);
        const winB2 = new THREE.Mesh(win2Geo, winMat); winB2.position.set(1.5, 6, -d/2 - 0.05);
        const winB3 = new THREE.Mesh(glassGeo, winMat); winB3.position.set(0, 2.5, -d/2 - 0.05);
        
        g.add(base, awning, glass, win2a, win2b, winB1, winB2, winB3);
        
        physicsBody = new CANNON.Body({ mass: 0, material: this.game.physicsManager.defaultMaterial });
        physicsBody.addShape(new CANNON.Box(new CANNON.Vec3(w/2, h/2, d/2)), new CANNON.Vec3(0, h/2, 0));
      }
      
      visualMesh = g;
    }
    
    // Set position and rotation
    visualMesh.position.x = this.ghostMesh.position.x;
    visualMesh.position.y = this.ghostMesh.position.y;
    visualMesh.position.z = this.ghostMesh.position.z;
    if (type !== 'road' && type !== 'road_roundabout') {
      visualMesh.rotation.y = this.rotationAngle;
    }
    
    // Enable shadows
    visualMesh.castShadow = true;
    visualMesh.receiveShadow = true;
    visualMesh.traverse(child => {
      if (child.isMesh) {
        if (child.name === 'light_cone') {
          child.castShadow = false;
          child.receiveShadow = false;
        } else {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      }
    });
    
    this.game.sceneManager.scene.add(visualMesh);
    
    // Set up physics body position if exists
    if (physicsBody) {
      let py = visualMesh.position.y;
      if (type === 'hydrant') py += 0.5;
      else if (type === 'lamp') py += 1.75;
      else if (type === 'street_light') py += 2.25;
      else if (type === 'bench') py += 0.25;
      else if (type === 'fountain') py += 0.25;
      else if (type === 'pine_tree') py += 0.9;
      else if (type === 'sign_no_parking') py += 1.25;
      else if (type === 'tycoon_button') py += 0.05;
      
      physicsBody.position.set(visualMesh.position.x, py, visualMesh.position.z);
      if (type === 'road_ramp' || type === 'terrain_ramp') {
        const td = visualMesh.userData.tileD;
        const th = visualMesh.userData.tileH;
        const qYaw = new CANNON.Quaternion();
        qYaw.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), this.rotationAngle);
        const qPitch = new CANNON.Quaternion();
        qPitch.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.atan2(th, td));
        physicsBody.quaternion = qYaw.mult(qPitch);
      }
      else if (type !== 'road' && type !== 'road_roundabout') {
        physicsBody.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), this.rotationAngle);
      }
      this.game.physicsManager.addBody(physicsBody);
    }
    
    // Register interactable for Bench
    if (type === 'bench') {
      this.game.sceneManager.interactables.push({
        type: 'bench',
        position: new THREE.Vector3(visualMesh.position.x, visualMesh.position.y + 0.6, visualMesh.position.z),
        rotation: this.rotationAngle
      });
    }
    
    // Register custom vehicle interactable
    if (type && type.startsWith('custom_')) {
      const assetId = type.substring(7);
      const asset = this.customAssets.find(a => a.id === assetId);
      if (asset && asset.category === 'vehicle') {
        this.game.sceneManager.interactables.push({
          type: 'vehicle',
          asset: asset,
          mesh: visualMesh,
          body: physicsBody,
          position: visualMesh.position, // Reference so proximity check updates dynamically as vehicle moves
          rotation: this.rotationAngle
        });
      }
    }
    
    // Register night lighting coordinates for Street Light
    if (type === 'street_light') {
      const headOffset = new THREE.Vector3(0, 4.29, 1.11);
      headOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.rotationAngle);
      const headWorldPos = visualMesh.position.clone().add(headOffset);
      this.game.sceneManager.streetLightPositions.push(headWorldPos);
    }
    
    // Add to placed list
    const placedObj = {
      id: THREE.MathUtils.generateUUID(),
      type: type,
      mesh: visualMesh,
      body: physicsBody,
      position: visualMesh.position.clone(),
      rotation: this.rotationAngle,
      height: (type === 'building') ? parseFloat(this.rangeHeight.value) : null,
      color: (type === 'tile') ? this.selectedTileColor : (['building', 'rumah', 'ruko'].includes(type) ? visualMesh.userData.customColor : null),
      tileScale: ['tile', 'terrain_block', 'water', 'road_ramp', 'terrain_ramp'].includes(type) ? { w: visualMesh.userData.tileW, d: visualMesh.userData.tileD, h: visualMesh.userData.tileH } : null
    };
    
    this.placedObjects.push(placedObj);
    
    // Log action to history
    this.history.push({
      action: 'place',
      object: placedObj
    });
    
    console.log("DEBUG: Object successfully placed:", placedObj, "Mesh:", visualMesh, "Visible:", visualMesh.visible, "Position:", visualMesh.position);

    this.rebuildCameraBuildingBoxes();
  }
  
  eraseObjectAt(pos) {
    const threshold = 1.0;
    const index = this.placedObjects.findIndex(obj => 
      obj.position.distanceTo(pos) < threshold
    );
    
    if (index !== -1) {
      const obj = this.placedObjects[index];
      
      // Log deletion to history
      this.history.push({
        action: 'delete',
        type: obj.type,
        position: obj.position.clone(),
        rotation: obj.rotation,
        height: obj.height,
        color: obj.color,
        id: obj.id
      });
      
      this.game.sceneManager.scene.remove(obj.mesh);
      if (obj.body) {
        this.game.physicsManager.world.removeBody(obj.body);
      }
      if (obj.type === 'bench') {
        const intIndex = this.game.sceneManager.interactables.findIndex(item => 
          item.position.distanceTo(new THREE.Vector3(obj.position.x, obj.position.y + 0.6, obj.position.z)) < 0.1
        );
        if (intIndex !== -1) {
          this.game.sceneManager.interactables.splice(intIndex, 1);
        }
      }
      if (obj.type === 'street_light') {
        const headOffset = new THREE.Vector3(0, 4.29, 1.11);
        headOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), obj.rotation);
        const headWorldPos = obj.position.clone().add(headOffset);
        const slIndex = this.game.sceneManager.streetLightPositions.findIndex(pos => 
          pos.distanceTo(headWorldPos) < 0.2
        );
        if (slIndex !== -1) {
          this.game.sceneManager.streetLightPositions.splice(slIndex, 1);
        }
      }
      this.placedObjects.splice(index, 1);
    }
    this.rebuildCameraBuildingBoxes();
  }
  
  raycastErase(e) {
    this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    
    this.raycaster.setFromCamera(this.mouse, this.game.cameraManager.camera);
    
    const meshes = this.placedObjects.map(obj => obj.mesh);
    const intersects = this.raycaster.intersectObjects(meshes, true);
    
    if (intersects.length > 0) {
      let hitMesh = intersects[0].object;
      while (hitMesh.parent && hitMesh.parent !== this.game.sceneManager.scene) {
        hitMesh = hitMesh.parent;
      }
      
      const index = this.placedObjects.findIndex(obj => obj.mesh === hitMesh);
      if (index !== -1) {
        const obj = this.placedObjects[index];
        
        // Log deletion to history
        this.history.push({
          action: 'delete',
          type: obj.type,
          position: obj.position.clone(),
          rotation: obj.rotation,
          height: obj.height,
          color: obj.color,
          id: obj.id
        });
        
        this.game.sceneManager.scene.remove(obj.mesh);
        if (obj.body) {
          this.game.physicsManager.world.removeBody(obj.body);
        }
        if (obj.type === 'bench') {
          const intIndex = this.game.sceneManager.interactables.findIndex(item => 
            item.position.distanceTo(new THREE.Vector3(obj.position.x, obj.position.y + 0.6, obj.position.z)) < 0.1
          );
          if (intIndex !== -1) {
            this.game.sceneManager.interactables.splice(intIndex, 1);
          }
        }
        if (obj.type === 'street_light') {
          const headOffset = new THREE.Vector3(0, 4.29, 1.11);
          headOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), obj.rotation);
          const headWorldPos = obj.position.clone().add(headOffset);
          const slIndex = this.game.sceneManager.streetLightPositions.findIndex(pos => 
            pos.distanceTo(headWorldPos) < 0.2
          );
          if (slIndex !== -1) {
            this.game.sceneManager.streetLightPositions.splice(slIndex, 1);
          }
        }
        this.placedObjects.splice(index, 1);
        this.deselectObject();
      }
    }
    this.rebuildCameraBuildingBoxes();
  }
  
  onKeyDown(e) {
    if (!this.active) return;
    
    // Ctrl+Z Undo
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      this.undo();
      return;
    }
    
    if (e.key === 'r' || e.key === 'R') {
      const prevRotation = this.rotationAngle;
      this.rotationAngle = (this.rotationAngle + Math.PI / 2) % (Math.PI * 2);
      if (this.ghostMesh) {
        this.ghostMesh.rotation.y = this.rotationAngle;
      }
      if (this.selectedObject) {
        // Log rotation to history
        this.history.push({
          action: 'rotate',
          object: this.selectedObject,
          prevRotation: prevRotation
        });
        
        this.selectedObject.mesh.rotation.y = this.rotationAngle;
        this.selectedObject.rotation = this.rotationAngle;
        if (this.selectedObject.body) {
          this.selectedObject.body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), this.rotationAngle);
        }
        // Update bench interactable rotation if selected object is a bench
        if (this.selectedObject.type === 'bench') {
          const intItem = this.game.sceneManager.interactables.find(item => 
            item.position.distanceTo(new THREE.Vector3(this.selectedObject.position.x, this.selectedObject.position.y + 0.6, this.selectedObject.position.z)) < 0.1
          );
          if (intItem) {
            intItem.rotation = this.rotationAngle;
          }
        }
        // Update street light position rotation if selected object is a street light
        if (this.selectedObject.type === 'street_light') {
          const oldOffset = new THREE.Vector3(0, 4.29, 1.11).applyAxisAngle(new THREE.Vector3(0, 1, 0), prevRotation);
          const oldHeadWorldPos = this.selectedObject.position.clone().add(oldOffset);
          
          const newOffset = new THREE.Vector3(0, 4.29, 1.11).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.rotationAngle);
          const newHeadWorldPos = this.selectedObject.position.clone().add(newOffset);
          
          const slIndex = this.game.sceneManager.streetLightPositions.findIndex(pos => 
            pos.distanceTo(oldHeadWorldPos) < 0.2
          );
          if (slIndex !== -1) {
            this.game.sceneManager.streetLightPositions[slIndex].copy(newHeadWorldPos);
          }
        }
      }
    }
    
    if (e.key === 'Backspace' || e.key === 'Delete') {
      if (this.selectedObject) {
        this.eraseObjectAt(this.selectedObject.position);
        this.deselectObject();
      }
    }
  }
  
  raycastSelect(e) {
    this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    
    this.raycaster.setFromCamera(this.mouse, this.game.cameraManager.camera);
    
    const meshes = this.placedObjects.map(obj => obj.mesh);
    const intersects = this.raycaster.intersectObjects(meshes, true);
    
    for (let i = 0; i < intersects.length; i++) {
      let hitMesh = intersects[i].object;
      while (hitMesh.parent && hitMesh.parent !== this.game.sceneManager.scene) {
        hitMesh = hitMesh.parent;
      }
      
      const found = this.placedObjects.find(obj => obj.mesh === hitMesh);
      if (found) {
        // If placing props, ignore clicks on ground/buildings to allow layering
        if (this.subMode === 'props' && ['road', 'road_roundabout', 'tile', 'building'].includes(found.type)) {
          continue; // check next intersected object
        }
        
        this.selectObject(found);
        return true;
      }
    }
    
    this.deselectObject();
    return false;
  }
  
  selectObject(obj) {
    this.deselectObject();
    this.selectedObject = obj;
    
    // Create highlight helper
    const box = new THREE.BoxHelper(obj.mesh, 0xffff00);
    box.name = 'selection-helper';
    this.game.sceneManager.scene.add(box);
  }
  
  deselectObject() {
    this.selectedObject = null;
    const helper = this.game.sceneManager.scene.getObjectByName('selection-helper');
    if (helper) {
      this.game.sceneManager.scene.remove(helper);
    }
  }
  
  exportMap() {
    if (this.placedObjects.length === 0) {
      alert('Belum ada objek dekorasi yang ditempatkan!');
      return;
    }
    
    const exportData = {
      mapSize: this.game.city ? this.game.city.citySize : 2,
      npcCount: this.npcCount || 20,
      placements: this.placedObjects.map(obj => ({
        type: obj.type,
        position: { x: obj.position.x, y: obj.position.y, z: obj.position.z },
        rotation: obj.rotation,
        height: obj.height,
        color: obj.color,
        tileScale: obj.tileScale
      })),
      customAssets: this.customAssets
    };
    
    const json = JSON.stringify(exportData, null, 2);
    
    // Copy to clipboard and alert
    navigator.clipboard.writeText(json).then(() => {
      alert('Data Map JSON berhasil disalin ke Clipboard! Simpan teks ini ke file JSON Anda.');
    }).catch(err => {
      // Fallback: prompt showing data
      prompt('Salin data Map JSON berikut:', json);
    });
  }
  
  importMap() {
    const json = prompt('Tempelkan teks Map JSON yang sudah diekspor sebelumnya:');
    if (!json) return;
    
    try {
      const mapData = JSON.parse(json);
      this.applyMapData(mapData);
      alert('Data Map berhasil di-Import!');
    } catch (e) {
      console.error(e);
      alert('Gagal meng-Import Map. Format JSON salah!');
    }
  }

  applyMapData(mapData) {
    // Import custom assets if present
    if (mapData && mapData.customAssets) {
      const saved = localStorage.getItem('creator_assets');
      const assetsList = saved ? JSON.parse(saved) : [];
      mapData.customAssets.forEach(importedAsset => {
        if (!assetsList.some(a => a.id === importedAsset.id)) {
          assetsList.push(importedAsset);
        }
      });
      localStorage.setItem('creator_assets', JSON.stringify(assetsList));
      this.loadCustomAssets();
    }
    
    // Clear current placed objects
    this.placedObjects.forEach(obj => {
      this.game.sceneManager.scene.remove(obj.mesh);
      if (obj.body) this.game.physicsManager.world.removeBody(obj.body);
    });
    this.placedObjects = [];
    
    const placements = Array.isArray(mapData) ? mapData : (mapData.placements || []);
    const mapSize = Array.isArray(mapData) ? 2 : (mapData.mapSize || 2);
    
    // Load NPC settings
    if (mapData && mapData.npcCount !== undefined) {
      this.npcCount = mapData.npcCount;
    } else {
      this.npcCount = 20;
    }
    if (this.rangeNpcCount) this.rangeNpcCount.value = this.npcCount;
    if (this.lblNpcCount) this.lblNpcCount.innerText = this.npcCount;
    
    if (this.game.city) {
      this.game.city.rebuildGroundAndBoundaries(mapSize);
      if (this.selectMapSize) this.selectMapSize.value = mapSize;
    }
    
    let needDestroyGhost = false;
    if (!this.ghostMesh) {
      this.createGhost('hydrant');
      needDestroyGhost = true;
    }
    
    // Rebuild objects
    placements.forEach(data => {
      // Temporarily position ghost mesh to reuse placement logic
      this.rotationAngle = data.rotation;
      this.ghostMesh.position.set(data.position.x, data.position.y, data.position.z);
      
      // Handle building height range input sync
      if (data.type === 'building' && data.height) {
        if (this.rangeHeight) this.rangeHeight.value = data.height;
        if (this.lblHeight) this.lblHeight.textContent = data.height;
      }
      if (['building', 'rumah', 'ruko'].includes(data.type) && data.color && this.inputBldColor) {
        this.inputBldColor.value = data.color;
      }
      if (['tile', 'terrain_block', 'water', 'road_ramp', 'terrain_ramp'].includes(data.type)) {
        if (data.type === 'tile' && data.color) this.selectedTileColor = data.color;
        if (data.tileScale) {
          if (this.rangeTileW) { this.rangeTileW.value = data.tileScale.w; this.lblTileW.textContent = data.tileScale.w; }
          if (this.rangeTileD) { this.rangeTileD.value = data.tileScale.d; this.lblTileD.textContent = data.tileScale.d; }
          if (this.rangeTileH) { this.rangeTileH.value = data.tileScale.h; this.lblTileH.textContent = data.tileScale.h; }
        }
      }
      
      // Instantiate real objects
      this.placeObject(data.type);
    });
    
    if (needDestroyGhost && this.ghostMesh) {
      this.game.sceneManager.scene.remove(this.ghostMesh);
      this.ghostMesh = null;
    }
  }

  async loadAndRenderSavedMaps() {
    if (!this.sidebarMapList) return;
    try {
      const res = await fetch('/api/load-maps?t=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) throw new Error("Failed to load maps");
      const savedMaps = await res.json();
      
      this.sidebarMapList.innerHTML = '';
      const keys = Object.keys(savedMaps);
      if (keys.length === 0) {
        this.sidebarMapList.innerHTML = `<div style="color: #888; text-align: center; font-size: 11px; padding: 10px;">Belum ada map tersimpan.</div>`;
        return;
      }
      
      keys.forEach(mapName => {
        const item = document.createElement('div');
        item.className = 'sidebar-map-item';
        item.innerHTML = `
          <div class="sidebar-map-item-info">
            <span class="sidebar-map-item-title">${mapName}</span>
          </div>
          <div class="sidebar-map-item-actions">
            <button class="sidebar-map-item-btn btn-load" title="Load Map">📂 Load</button>
            <button class="sidebar-map-item-btn btn-delete" title="Hapus Map">🗑️</button>
          </div>
        `;
        
        // Load event
        item.querySelector('.btn-load').addEventListener('click', (e) => {
          e.stopPropagation();
          if (confirm(`Apakah Anda yakin ingin me-load map "${mapName}"? Perubahan saat ini yang belum disimpan akan hilang.`)) {
            this.applyMapData(savedMaps[mapName]);
            alert(`Map "${mapName}" berhasil di-load!`);
          }
        });
        
        // Delete event
        item.querySelector('.btn-delete').addEventListener('click', async (e) => {
          e.stopPropagation();
          if (confirm(`Apakah Anda yakin ingin menghapus map "${mapName}" dari Project?`)) {
            delete savedMaps[mapName];
            try {
              const saveRes = await fetch('/api/save-maps', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(savedMaps)
              });
              if (saveRes.ok) {
                alert(`Map "${mapName}" berhasil dihapus.`);
                this.loadAndRenderSavedMaps();
              } else {
                alert('Gagal menghapus map: Server error');
              }
            } catch (err) {
              alert('Gagal menghapus map: ' + err.message);
            }
          }
        });
        
        this.sidebarMapList.appendChild(item);
      });
    } catch (err) {
      console.error('Error rendering sidebar maps:', err);
      this.sidebarMapList.innerHTML = `<div style="color: #ef4444; text-align: center; font-size: 11px; padding: 10px;">Gagal memuat list map.</div>`;
    }
  }

  async saveMapToServer(name) {
    try {
      let savedMaps = {};
      const res = await fetch('/api/load-maps?t=' + Date.now(), { cache: 'no-store' });
      if (res.ok) {
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          savedMaps = await res.json();
        } else {
          throw new Error("API tidak merespon dengan JSON. Silakan restart Vite dev server Anda (stop terminal dan jalankan `npm run dev` lagi) karena konfigurasi vite.config.js baru saja diubah.");
        }
      }

      if (savedMaps[name]) {
        if (!confirm(`Map dengan nama "${name}" sudah ada. Apakah Anda ingin menimpanya?`)) {
          return;
        }
      }

      const mapData = {
        mapSize: this.game.city ? this.game.city.citySize : 2,
        npcCount: this.npcCount || 20,
        placements: this.placedObjects.map(obj => ({
          type: obj.type,
          position: { x: obj.position.x, y: obj.position.y, z: obj.position.z },
          rotation: obj.rotation,
          height: obj.height,
          color: obj.color,
          tileScale: obj.tileScale
        })),
        customAssets: this.customAssets
      };

      savedMaps[name] = mapData;
      
      const saveRes = await fetch('/api/save-maps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(savedMaps)
      });
      
      if (saveRes.ok) {
        alert(`Map "${name}" berhasil disimpan ke Project!`);
        this.loadAndRenderSavedMaps();
      } else {
        alert(`Gagal menyimpan map: Server error`);
      }
    } catch(err) {
      alert(`Gagal menyimpan map: ` + err.message);
    }
  }

  clearPlacements() {
    this.placedObjects.forEach(obj => {
      this.game.sceneManager.scene.remove(obj.mesh);
      if (obj.body) this.game.physicsManager.world.removeBody(obj.body);
      
      // Clean up interactables if it was a bench
      if (obj.type === 'bench') {
        const intIndex = this.game.sceneManager.interactables.findIndex(item => 
          item.position.distanceTo(new THREE.Vector3(obj.position.x, obj.position.y + 0.6, obj.position.z)) < 0.1
        );
        if (intIndex !== -1) {
          this.game.sceneManager.interactables.splice(intIndex, 1);
        }
      }
      
      // Clean up lighting if it was a street light
      if (obj.type === 'street_light') {
        const headOffset = new THREE.Vector3(0, 4.29, 1.11);
        headOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), obj.rotation);
        const headWorldPos = obj.position.clone().add(headOffset);
        const slIndex = this.game.sceneManager.streetLightPositions.findIndex(pos => 
          pos.distanceTo(headWorldPos) < 0.2
        );
        if (slIndex !== -1) {
          this.game.sceneManager.streetLightPositions.splice(slIndex, 1);
        }
      }
    });
    this.placedObjects = [];
    this.rebuildCameraBuildingBoxes();
  }

  rebuildCameraBuildingBoxes() {
    if (!this.game || !this.game.sceneManager) return;
    this.game.sceneManager.buildingBoxes.length = 0;
    this.placedObjects.forEach(obj => {
      let w = 0, h = 0, d = 0;
      let isBuilding = false;
      
      if (obj.type === 'building') {
        w = 8;
        h = obj.height || 15;
        d = 8;
        isBuilding = true;
      } else if (obj.type === 'rumah') {
        w = 6;
        h = 8;
        d = 8;
        isBuilding = true;
      } else if (obj.type === 'ruko') {
        w = 7;
        h = 8;
        d = 8;
        isBuilding = true;
      } else if (obj.type.startsWith('custom_')) {
        const assetId = obj.type.substring(7);
        const asset = this.customAssets.find(a => a.id === assetId);
        if (asset && asset.category === 'building') {
          w = 8; h = 10; d = 8; // fallback
          if (obj.mesh) {
            const box = new THREE.Box3().setFromObject(obj.mesh);
            const size = new THREE.Vector3();
            box.getSize(size);
            w = size.x || 8;
            h = size.y || 10;
            d = size.z || 8;
          }
          isBuilding = true;
        }
      }
      
      if (isBuilding) {
        const bldBox = new THREE.Box3(
          new THREE.Vector3(obj.position.x - w / 2, 0.4, obj.position.z - d / 2),
          new THREE.Vector3(obj.position.x + w / 2, 0.4 + h, obj.position.z + d / 2)
        );
        this.game.sceneManager.buildingBoxes.push(bldBox);
      }
    });
  }

  loadMapData(mapData) {
    this.clearPlacements();
    if (!mapData) return;

    // Import custom assets if present in mapData
    if (mapData && mapData.customAssets) {
      const saved = localStorage.getItem('creator_assets');
      const assetsList = saved ? JSON.parse(saved) : [];
      mapData.customAssets.forEach(importedAsset => {
        if (!assetsList.some(a => a.id === importedAsset.id)) {
          assetsList.push(importedAsset);
        }
      });
      localStorage.setItem('creator_assets', JSON.stringify(assetsList));
      this.loadCustomAssets();
    }

    // Support backward compatibility (if mapData was just a list of placements)
    const placements = Array.isArray(mapData) ? mapData : (mapData.placements || []);
    const mapSize = Array.isArray(mapData) ? 2 : (mapData.mapSize || 2);

    // Apply map size
    if (this.game.city) {
      this.game.city.rebuildGroundAndBoundaries(mapSize);
      if (this.selectMapSize) this.selectMapSize.value = mapSize;
    }

    // Create a temporary ghost if not active
    let needDestroyGhost = false;
    if (!this.ghostMesh) {
      this.createGhost('hydrant'); // placeholder
      needDestroyGhost = true;
    }

    placements.forEach(data => {
      this.rotationAngle = data.rotation;
      this.ghostMesh.position.set(data.position.x, data.position.y, data.position.z);
      if (data.type === 'building' && data.height) {
        if (this.rangeHeight) this.rangeHeight.value = data.height;
        if (this.lblHeight) this.lblHeight.textContent = data.height;
      }
      if (['building', 'rumah', 'ruko'].includes(data.type) && data.color && this.inputBldColor) {
        this.inputBldColor.value = data.color;
      }
      if (['tile', 'terrain_block', 'water', 'road_ramp', 'terrain_ramp'].includes(data.type)) {
        if (data.type === 'tile' && data.color) this.selectedTileColor = data.color;
        if (data.tileScale) {
          if (this.rangeTileW) { this.rangeTileW.value = data.tileScale.w; this.lblTileW.textContent = data.tileScale.w; }
          if (this.rangeTileD) { this.rangeTileD.value = data.tileScale.d; this.lblTileD.textContent = data.tileScale.d; }
          if (this.rangeTileH) { this.rangeTileH.value = data.tileScale.h; this.lblTileH.textContent = data.tileScale.h; }
        }
      }
      this.placeObject(data.type);
    });

    if (needDestroyGhost && this.ghostMesh) {
      this.game.sceneManager.scene.remove(this.ghostMesh);
      this.ghostMesh = null;
    }
    
    // Clear history stack upon initial load to prevent undoing map initialization
    this.history = [];

    this.rebuildCameraBuildingBoxes();
  }

  undo() {
    if (this.history.length === 0) return;
    const item = this.history.pop();
    
    if (item.action === 'place') {
      // Remove placed object
      const index = this.placedObjects.findIndex(obj => obj.id === item.object.id);
      if (index !== -1) {
        const obj = this.placedObjects[index];
        this.game.sceneManager.scene.remove(obj.mesh);
        if (obj.body) this.game.physicsManager.world.removeBody(obj.body);
        if (obj.type === 'bench') {
          const intIndex = this.game.sceneManager.interactables.findIndex(int => 
            int.position.distanceTo(new THREE.Vector3(obj.position.x, obj.position.y + 0.6, obj.position.z)) < 0.1
          );
          if (intIndex !== -1) this.game.sceneManager.interactables.splice(intIndex, 1);
        }
        if (obj.type === 'street_light') {
          const headOffset = new THREE.Vector3(0, 4.29, 1.11);
          headOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), obj.rotation);
          const headWorldPos = obj.position.clone().add(headOffset);
          const slIndex = this.game.sceneManager.streetLightPositions.findIndex(pos => 
            pos.distanceTo(headWorldPos) < 0.2
          );
          if (slIndex !== -1) {
            this.game.sceneManager.streetLightPositions.splice(slIndex, 1);
          }
        }
        this.placedObjects.splice(index, 1);
        this.deselectObject();
      }
    } 
    else if (item.action === 'delete') {
      // Re-place deleted object
      const prevRotation = this.rotationAngle;
      const prevSelectedProp = this.selectedProp;
      const prevSelectedBrush = this.selectedBrush;
      const prevHeight = this.rangeHeight ? this.rangeHeight.value : null;
      const prevTileColor = this.selectedTileColor;
      
      this.rotationAngle = item.rotation;
      if (item.height && this.rangeHeight) {
        this.rangeHeight.value = item.height;
        if (this.lblHeight) this.lblHeight.textContent = item.height;
      }
      if (item.color) this.selectedTileColor = item.color;
      
      this.ghostMesh.position.copy(item.position);
      
      const origSubMode = this.subMode;
      if (item.type === 'building' || item.type === 'road' || item.type === 'road_roundabout') {
        this.subMode = 'city';
        this.selectedBrush = item.type;
      } else {
        this.subMode = 'props';
        this.selectedProp = item.type;
      }
      
      // Temporarily disable history logs during undo recreation
      const origHistory = this.history;
      this.history = [];
      this.placeObject();
      this.history = origHistory;
      
      // Restore states
      this.rotationAngle = prevRotation;
      this.selectedProp = prevSelectedProp;
      this.selectedBrush = prevSelectedBrush;
      if (prevHeight && this.rangeHeight) {
        this.rangeHeight.value = prevHeight;
        if (this.lblHeight) this.lblHeight.textContent = prevHeight;
      }
      this.selectedTileColor = prevTileColor;
      this.subMode = origSubMode;
      
      // Set the placed object's ID back to the deleted ID so future undos/interactions align
      if (this.placedObjects.length > 0) {
        this.placedObjects[this.placedObjects.length - 1].id = item.id;
      }
    }
    else if (item.action === 'rotate') {
      const obj = item.object;
      const oldRotation = obj.rotation;
      obj.mesh.rotation.y = item.prevRotation;
      obj.rotation = item.prevRotation;
      if (obj.body) {
        obj.body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), item.prevRotation);
      }
      if (obj.type === 'bench') {
        const intItem = this.game.sceneManager.interactables.find(int => 
          int.position.distanceTo(new THREE.Vector3(obj.position.x, obj.position.y + 0.6, obj.position.z)) < 0.1
        );
        if (intItem) intItem.rotation = item.prevRotation;
      }
      if (obj.type === 'street_light') {
        const oldOffset = new THREE.Vector3(0, 4.29, 1.11).applyAxisAngle(new THREE.Vector3(0, 1, 0), oldRotation);
        const oldHeadWorldPos = obj.position.clone().add(oldOffset);
        
        const newOffset = new THREE.Vector3(0, 4.29, 1.11).applyAxisAngle(new THREE.Vector3(0, 1, 0), item.prevRotation);
        const newHeadWorldPos = obj.position.clone().add(newOffset);
        
        const slIndex = this.game.sceneManager.streetLightPositions.findIndex(pos => 
          pos.distanceTo(oldHeadWorldPos) < 0.2
        );
        if (slIndex !== -1) {
          this.game.sceneManager.streetLightPositions[slIndex].copy(newHeadWorldPos);
        }
      }
    }
    this.rebuildCameraBuildingBoxes();
  }

  createRoadTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    
    // Asphalt base
    ctx.fillStyle = '#22252a';
    ctx.fillRect(0, 0, 256, 256);
    
    // Slight noise
    for (let i = 0; i < 1500; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? '#1a1d21' : '#2a2e35';
        ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
    }
    
    // Dashed lines removed for plain asphalt road look
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    if (this.game.sceneManager.renderer) {
      texture.anisotropy = Math.min(4, this.game.sceneManager.renderer.capabilities.getMaxAnisotropy());
    }
    return texture;
  }

  createRoundaboutTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    
    // Resolve grass color
    const grassColorVal = (this.game.city && this.game.city.colors) ? this.game.city.colors.grass : 0xa8d48a;
    const grassColor = '#' + grassColorVal.toString(16).padStart(6, '0');
    
    // 1. Fill entire background with asphalt
    ctx.fillStyle = '#22252a';
    ctx.fillRect(0, 0, 256, 256);
    
    // 2. Draw noise over the entire asphalt area (compressed)
    for (let i = 0; i < 1500; i++) {
        const x = Math.random() * 256;
        const y = Math.random() * 256;
        ctx.fillStyle = Math.random() > 0.5 ? '#1a1d21' : '#2a2e35';
        ctx.fillRect(x, y, 2, 2);
    }
    
    // 3. Draw outer painted line to suggest the circular roundabout path
    ctx.beginPath();
    ctx.arc(128, 128, 120, 0, Math.PI * 2);
    ctx.strokeStyle = '#dcdde1';
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 10]); // dashed line for roundabout entry border
    ctx.stroke();
    ctx.setLineDash([]); // reset line dash for next shapes
    
    // 4. Draw central grass island (radius 65)
    ctx.beginPath();
    ctx.arc(128, 128, 65, 0, Math.PI * 2);
    ctx.fillStyle = grassColor;
    ctx.fill();
    
    // 5. Draw inner curb line (solid white)
    ctx.beginPath();
    ctx.arc(128, 128, 65, 0, Math.PI * 2);
    ctx.strokeStyle = '#dcdde1';
    ctx.lineWidth = 6;
    ctx.stroke();
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    if (this.game.sceneManager.renderer) {
      texture.anisotropy = Math.min(4, this.game.sceneManager.renderer.capabilities.getMaxAnisotropy());
    }
    return texture;
  }

  createNoParkingTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    
    // White background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 64, 64);
    
    // Blue inner circle
    ctx.beginPath();
    ctx.arc(32, 32, 26, 0, Math.PI * 2);
    ctx.fillStyle = '#1e3799';
    ctx.fill();
    
    // Red outer ring border
    ctx.beginPath();
    ctx.arc(32, 32, 26, 0, Math.PI * 2);
    ctx.strokeStyle = '#eb2f06';
    ctx.lineWidth = 6;
    ctx.stroke();
    
    // "P" letter
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 34px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('P', 32, 32);
    
    // Red diagonal strike line
    ctx.beginPath();
    ctx.moveTo(14, 14);
    ctx.lineTo(50, 50);
    ctx.strokeStyle = '#eb2f06';
    ctx.lineWidth = 6;
    ctx.stroke();
    
    const texture = new THREE.CanvasTexture(canvas);
    return texture;
  }

  animate(dt) {
    if (!dt) return;
    
    // Animate fountain water jets
    this.placedObjects.forEach(obj => {
      if (obj.type === 'fountain' && obj.mesh && obj.mesh.userData && obj.mesh.userData.waterDrops) {
        const data = obj.mesh.userData;
        data.timeOffset += dt * 6;
        
        data.waterDrops.forEach((drop, idx) => {
          const wave = Math.sin(data.timeOffset + idx * 1.5);
          // Rise and fall animation
          drop.position.y = 1.35 + wave * 0.16;
          // Pulsing volume animation
          const sc = 0.85 + wave * 0.25;
          drop.scale.set(sc, sc, sc);
        });
      }
      
      // Animate water tiles
      if (obj.type === 'water' && obj.mesh) {
        const wMesh = obj.mesh.getObjectByName('water_tile');
        if (wMesh) {
          if (!obj.waterTime) obj.waterTime = Math.random() * 100;
          obj.waterTime += dt * 2.0;
          wMesh.position.y = 0.95 + Math.sin(obj.waterTime) * 0.04;
        }
      }
    });

    // Animate active ghost if it's a fountain
    if (this.ghostMesh && this.ghostMesh.userData && this.ghostMesh.userData.waterDrops) {
      const data = this.ghostMesh.userData;
      if (!data.timeOffset) data.timeOffset = 0;
      data.timeOffset += dt * 6;
      
      data.waterDrops.forEach((drop, idx) => {
        const wave = Math.sin(data.timeOffset + idx * 1.5);
        drop.position.y = 1.35 + wave * 0.16;
        const sc = 0.85 + wave * 0.25;
        drop.scale.set(sc, sc, sc);
      });
    }

    // Animate active ghost if it's water
    const activeBrush = (this.subMode === 'props') ? this.selectedProp : this.selectedBrush;
    if (this.ghostMesh && activeBrush === 'water') {
      const wMesh = this.ghostMesh.getObjectByName('water_tile');
      if (wMesh) {
        if (!this.ghostWaterTime) this.ghostWaterTime = 0;
        this.ghostWaterTime += dt * 2.0;
        wMesh.position.y = 0.95 + Math.sin(this.ghostWaterTime) * 0.04;
      }
    }
  }
}
