import * as THREE from 'three';
import * as CANNON from 'cannon-es';

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
    this.selectedObject = null;
    this.ghostMesh = null;
    
    // Raycasting utilities
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); // horizontal y=0 plane
    this.intersectionPoint = new THREE.Vector3();
    
    this.tileColorPickerGroup = document.getElementById('tile-color-picker-group');
    this.pickerTile = document.getElementById('picker-tile');
    this.selectedTileColor = '#ffffff';
    this.history = []; // History stack for Ctrl+Z undo
    this.dragStartPos = { x: 0, y: 0 }; // Track camera drags
    
    this.setupUI();
    this.setupListeners();
  }
  
  setupUI() {
    this.checkSnap = document.getElementById('check-snap');
    this.catalogList = document.getElementById('props-catalog-list');
    this.brushSelector = document.querySelector('.brush-selector');
    this.heightControlGroup = document.getElementById('height-control-group');
    this.rangeHeight = document.getElementById('range-bld-height');
    this.lblHeight = document.getElementById('lbl-bld-height');
    
    this.btnExport = document.getElementById('btn-export-map');
    this.btnImport = document.getElementById('btn-import-map');
    this.btnSaveMap = document.getElementById('btn-save-map');
    
    // Snap toggle
    this.checkSnap.addEventListener('change', (e) => {
      this.snapEnabled = e.target.checked;
    });
    
    // Props Catalog Click
    if (this.catalogList) {
      this.catalogList.querySelectorAll('.catalog-item').forEach(item => {
        item.addEventListener('click', () => {
          this.catalogList.querySelectorAll('.catalog-item').forEach(i => i.classList.remove('active'));
          item.classList.add('active');
          this.selectedProp = item.getAttribute('data-prop');
          this.rotationAngle = 0;
          this.deselectObject();
          
          if (this.selectedProp === 'tile') {
            if (this.tileColorPickerGroup) this.tileColorPickerGroup.style.display = 'block';
          } else {
            if (this.tileColorPickerGroup) this.tileColorPickerGroup.style.display = 'none';
          }
          
          if (this.active && this.subMode === 'props') {
            this.createGhost(this.selectedProp);
          }
        });
      });
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
          
          if (this.selectedBrush === 'building') {
            this.heightControlGroup.style.display = 'block';
          } else {
            this.heightControlGroup.style.display = 'none';
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
    
    // Export / Import
    if (this.btnExport) this.btnExport.addEventListener('click', () => this.exportMap());
    if (this.btnImport) this.btnImport.addEventListener('click', () => this.importMap());
    if (this.btnSaveMap) {
      this.btnSaveMap.addEventListener('click', () => {
        const name = prompt('Masukkan Nama Map:');
        if (name && name.trim()) {
          this.saveMapToLocalStorage(name.trim());
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
    
    if (type === 'lamp') {
      const g = new THREE.Group();
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.15, 3.5, 0.15), wireMat);
      p.position.y = 1.75;
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.5, 0.6), wireMat);
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
      mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 0.1, 2), wireMat);
      mesh.position.y = 0.05;
    } else if (type === 'tycoon_button') {
      const g = new THREE.Group();
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.1, 16), wireMat);
      base.position.y = 0.05;
      const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.15, 16), wireMat);
      btn.position.y = 0.15;
      g.add(base, btn);
      mesh = g;
    } else if (type === 'road' || type === 'road_roundabout') {
      mesh = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), wireMat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = 0.01;
    } else if (type === 'building') {
      const h = parseFloat(this.rangeHeight.value);
      const g = new THREE.Group();
      const b = new THREE.Mesh(new THREE.BoxGeometry(8, h, 8), wireMat);
      b.position.y = h / 2;
      g.add(b);
      mesh = g;
      mesh.position.y = 0;
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
    
    // Find intersection with the horizontal y=0 plane
    this.raycaster.ray.intersectPlane(this.groundPlane, this.intersectionPoint);
    
    // Calculate position with snap-to-grid
    let x = this.intersectionPoint.x;
    let z = this.intersectionPoint.z;
    
    if (this.snapEnabled) {
      const snap = (this.subMode === 'city') ? 10.0 : this.snapSize; // Larger snap for city builder tiles
      x = Math.round(x / snap) * snap;
      z = Math.round(z / snap) * snap;
    }
    
    this.ghostMesh.position.x = x;
    this.ghostMesh.position.z = z;
    this.ghostMesh.rotation.y = this.rotationAngle;
  }
  
  onMouseDown(e) {
    this.dragStartPos.x = e.clientX;
    this.dragStartPos.y = e.clientY;
  }
  
  onMouseClick(e) {
    if (!this.active || !this.ghostMesh) return;
    
    // Ignore clicks on UI (now moved to the left side)
    if (e.clientX < 340 && e.clientY > 60) return;
    if (e.clientY < 60) return; // Top HUD clicks
    
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
      'tile', 'tycoon_button'
    ].includes(this.selectedProp);

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
  
  placeObject() {
    const type = (this.subMode === 'props') ? this.selectedProp : this.selectedBrush;
    if (type === 'clear') return;
    
    // Check if tile/position is already occupied (only if snap to grid is active)
    if (this.snapEnabled) {
      const occupied = this.placedObjects.some(obj => 
        obj.position.distanceTo(this.ghostMesh.position) < 0.5 && obj.type === type
      );
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
    // Construct real meshes
    if (type === 'lamp') {
      const g = new THREE.Group();
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.15, 3.5, 0.15), darkGrey);
      p.position.y = 1.75;
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.5, 0.6), new THREE.MeshLambertMaterial({ color: 0xffffff, map: this.game.city.createTrafficLightTexture() }));
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
      visualMesh = new THREE.Mesh(new THREE.BoxGeometry(2, 0.1, 2), new THREE.MeshLambertMaterial({ color: this.selectedTileColor }));
      visualMesh.position.y = 0.05;
      
      physicsBody = new CANNON.Body({ mass: 0 });
      physicsBody.addShape(new CANNON.Box(new CANNON.Vec3(1.0, 0.05, 1.0)));
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
      visualMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(10, 10),
        new THREE.MeshLambertMaterial({ 
          color: 0xffffff, 
          map: type === 'road' ? this.createRoadTexture() : this.createRoundaboutTexture() 
        })
      );
      visualMesh.rotation.x = -Math.PI / 2;
      visualMesh.position.y = 0.01;
    } 
    else if (type === 'building') {
      // Drop custom building with windows
      const h = parseFloat(this.rangeHeight.value);
      const bColor = this.game.city.colors.buildings[Math.floor(Math.random() * this.game.city.colors.buildings.length)];
      
      const g = new THREE.Group();
      const bodyMesh = new THREE.Mesh(
        new THREE.BoxGeometry(8, h, 8),
        new THREE.MeshLambertMaterial({ color: bColor })
      );
      bodyMesh.position.y = h / 2;
      bodyMesh.castShadow = true;
      bodyMesh.receiveShadow = true;
      g.add(bodyMesh);
      
      // Add windows (mirroring default procedural city architecture)
      const floorSpacing = 2.8;
      const startY = 2.0;
      const endY = h - 1.2;
      
      const windowFrameGeo = new THREE.BoxGeometry(0.95, 1.35, 0.04);
      const windowGeo      = new THREE.BoxGeometry(0.85, 1.25, 0.06);
      
      const frameMat = new THREE.MeshLambertMaterial({ color: 0x1a1d20 });
      const winMat   = this.game.sceneManager.windowMaterial; // Emissive yellow glass material
      
      const cols = 3; // Fits nicely on 8m width (x = -2.0, 0.0, 2.0)
      for (let wy = startY; wy <= endY; wy += floorSpacing) {
        for (let col = 0; col < cols; col++) {
          const wOffset = -2.0 + col * 2.0;
          
          // Front (+Z = 4.0)
          const fFrame = new THREE.Mesh(windowFrameGeo, frameMat);
          fFrame.position.set(wOffset, wy, 4.02);
          const fWin = new THREE.Mesh(windowGeo, winMat);
          fWin.position.set(wOffset, wy, 4.03);
          g.add(fFrame, fWin);
          
          // Back (-Z = -4.0)
          const bFrame = new THREE.Mesh(windowFrameGeo, frameMat);
          bFrame.position.set(wOffset, wy, -4.02);
          bFrame.rotation.y = Math.PI;
          const bWin = new THREE.Mesh(windowGeo, winMat);
          bWin.position.set(wOffset, wy, -4.03);
          bWin.rotation.y = Math.PI;
          g.add(bFrame, bWin);
          
          // Right (+X = 4.0)
          const rFrame = new THREE.Mesh(windowFrameGeo, frameMat);
          rFrame.position.set(4.02, wy, wOffset);
          rFrame.rotation.y = Math.PI / 2;
          const rWin = new THREE.Mesh(windowGeo, winMat);
          rWin.position.set(4.03, wy, wOffset);
          rWin.rotation.y = Math.PI / 2;
          g.add(rFrame, rWin);
          
          // Left (-X = -4.0)
          const lFrame = new THREE.Mesh(windowFrameGeo, frameMat);
          lFrame.position.set(-4.02, wy, wOffset);
          lFrame.rotation.y = -Math.PI / 2;
          const lWin = new THREE.Mesh(windowGeo, winMat);
          lWin.position.set(-4.03, wy, wOffset);
          lWin.rotation.y = -Math.PI / 2;
          g.add(lFrame, lWin);
        }
      }
      
      visualMesh = g;
      visualMesh.position.y = 0;
      
      physicsBody = new CANNON.Body({ mass: 0, material: this.game.physicsManager.defaultMaterial });
      physicsBody.addShape(new CANNON.Box(new CANNON.Vec3(4.0, h / 2, 4.0)));
    }
    
    // Set position and rotation
    visualMesh.position.x = this.ghostMesh.position.x;
    visualMesh.position.z = this.ghostMesh.position.z;
    if (type !== 'road') {
      visualMesh.rotation.y = this.rotationAngle;
    }
    
    // Enable shadows
    visualMesh.castShadow = true;
    visualMesh.receiveShadow = true;
    visualMesh.traverse(child => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    
    this.game.sceneManager.scene.add(visualMesh);
    
    // Set up physics body position if exists
    if (physicsBody) {
      let py = 0.05;
      if (type === 'building') py = visualMesh.position.y;
      else if (type === 'hydrant') py = 0.5;
      else if (type === 'lamp') py = 1.75;
      else if (type === 'street_light') py = 2.25;
      else if (type === 'bench') py = 0.25;
      else if (type === 'fountain') py = 0.25;
      else if (type === 'pine_tree') py = 0.9;
      else if (type === 'sign_no_parking') py = 1.25;
      else if (type === 'tycoon_button') py = 0.05;
      
      physicsBody.position.set(visualMesh.position.x, py, visualMesh.position.z);
      if (type !== 'road' && type !== 'road_roundabout') {
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
      color: (type === 'tile') ? this.selectedTileColor : null
    };
    
    this.placedObjects.push(placedObj);
    
    // Log action to history
    this.history.push({
      action: 'place',
      object: placedObj
    });
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
    
    if (intersects.length > 0) {
      let hitMesh = intersects[0].object;
      while (hitMesh.parent && hitMesh.parent !== this.game.sceneManager.scene) {
        hitMesh = hitMesh.parent;
      }
      
      const found = this.placedObjects.find(obj => obj.mesh === hitMesh);
      if (found) {
        this.selectObject(found);
        return true;
      }
    } else {
      this.deselectObject();
    }
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
    
    const mapData = this.placedObjects.map(obj => ({
      type: obj.type,
      position: { x: obj.position.x, y: obj.position.y, z: obj.position.z },
      rotation: obj.rotation,
      height: obj.height
    }));
    
    const json = JSON.stringify(mapData, null, 2);
    
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
      
      // Clear current placed objects
      this.placedObjects.forEach(obj => {
        this.game.sceneManager.scene.remove(obj.mesh);
        if (obj.body) this.game.physicsManager.world.removeBody(obj.body);
      });
      this.placedObjects = [];
      
      // Rebuild objects
      mapData.forEach(data => {
        // Temporarily position ghost mesh to reuse placement logic
        this.rotationAngle = data.rotation;
        this.ghostMesh.position.set(data.position.x, data.position.y, data.position.z);
        
        // Handle building height range input sync
        if (data.type === 'building' && data.height) {
          this.rangeHeight.value = data.height;
          this.lblHeight.textContent = data.height;
        }
        
        // Instantiate real objects
        this.placeObject();
      });
      
      alert('Data Map berhasil di-Import!');
    } catch (e) {
      alert('Gagal meng-Import Map. Format JSON salah!');
    }
  }

  saveMapToLocalStorage(name) {
    const savedMaps = JSON.parse(localStorage.getItem('terablox_saved_maps') || '{}');
    if (savedMaps[name]) {
      if (!confirm(`Map dengan nama "${name}" sudah ada. Apakah Anda ingin menimpanya?`)) {
        return;
      }
    }

    const mapData = {
      mapSize: this.game.city ? this.game.city.citySize : 2,
      placements: this.placedObjects.map(obj => ({
        type: obj.type,
        position: { x: obj.position.x, y: obj.position.y, z: obj.position.z },
        rotation: obj.rotation,
        height: obj.height,
        color: obj.color
      }))
    };

    savedMaps[name] = mapData;
    localStorage.setItem('terablox_saved_maps', JSON.stringify(savedMaps));
    alert(`Map "${name}" berhasil disimpan ke Studio!`);
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
  }

  loadMapData(mapData) {
    this.clearPlacements();
    if (!mapData) return;

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
      if (data.type === 'tile' && data.color) {
        this.selectedTileColor = data.color;
      }
      this.placeObject();
    });

    if (needDestroyGhost && this.ghostMesh) {
      this.game.sceneManager.scene.remove(this.ghostMesh);
      this.ghostMesh = null;
    }
    
    // Clear history stack upon initial load to prevent undoing map initialization
    this.history = [];
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
  }

  createRoadTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    
    // Asphalt base
    ctx.fillStyle = '#22252a';
    ctx.fillRect(0, 0, 512, 512);
    
    // Slight noise
    for (let i = 0; i < 8000; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? '#1a1d21' : '#2a2e35';
        ctx.fillRect(Math.random() * 512, Math.random() * 512, 3, 3);
    }
    
    // Dashed lines removed for plain asphalt road look
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    if (this.game.sceneManager.renderer) {
      texture.anisotropy = this.game.sceneManager.renderer.capabilities.getMaxAnisotropy();
    }
    return texture;
  }

  createRoundaboutTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    
    // Resolve grass color (numbers converted to hex strings)
    const grassColorVal = (this.game.city && this.game.city.colors) ? this.game.city.colors.grass : 0xa8d48a;
    const grassColor = '#' + grassColorVal.toString(16).padStart(6, '0');
    
    // 1. Fill entire background with asphalt
    ctx.fillStyle = '#22252a';
    ctx.fillRect(0, 0, 512, 512);
    
    // 2. Draw noise over the entire asphalt area
    for (let i = 0; i < 7000; i++) {
        const x = Math.random() * 512;
        const y = Math.random() * 512;
        ctx.fillStyle = Math.random() > 0.5 ? '#1a1d21' : '#2a2e35';
        ctx.fillRect(x, y, 3, 3);
    }
    
    // 3. Draw 4 grass quarter-circles at the corners (radius 80 to make entry wide and smooth)
    ctx.fillStyle = grassColor;
    const cornerRadius = 80;
    
    // Top-Left corner
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, cornerRadius, 0, Math.PI / 2);
    ctx.fill();
    
    // Top-Right corner
    ctx.beginPath();
    ctx.moveTo(512, 0);
    ctx.arc(512, 0, cornerRadius, Math.PI / 2, Math.PI);
    ctx.fill();
    
    // Bottom-Left corner
    ctx.beginPath();
    ctx.moveTo(0, 512);
    ctx.arc(0, 512, cornerRadius, 1.5 * Math.PI, 2 * Math.PI);
    ctx.fill();
    
    // Bottom-Right corner
    ctx.beginPath();
    ctx.moveTo(512, 512);
    ctx.arc(512, 512, cornerRadius, Math.PI, 1.5 * Math.PI);
    ctx.fill();

    // 4. Draw outer curb lines along the grass corner curves
    ctx.strokeStyle = '#dcdde1';
    ctx.lineWidth = 10;
    
    ctx.beginPath();
    ctx.arc(0, 0, cornerRadius, 0, Math.PI / 2);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.arc(512, 0, cornerRadius, Math.PI / 2, Math.PI);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.arc(0, 512, cornerRadius, 1.5 * Math.PI, 2 * Math.PI);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.arc(512, 512, cornerRadius, Math.PI, 1.5 * Math.PI);
    ctx.stroke();
    
    // 5. Draw central grass island (radius 130)
    ctx.beginPath();
    ctx.arc(256, 256, 130, 0, Math.PI * 2);
    ctx.fillStyle = grassColor;
    ctx.fill();
    
    // 6. Draw inner curb line
    ctx.beginPath();
    ctx.arc(256, 256, 130, 0, Math.PI * 2);
    ctx.strokeStyle = '#dcdde1';
    ctx.lineWidth = 10;
    ctx.stroke();
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    if (this.game.sceneManager.renderer) {
      texture.anisotropy = this.game.sceneManager.renderer.capabilities.getMaxAnisotropy();
    }
    return texture;
  }

  createNoParkingTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    
    // White background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 128, 128);
    
    // Blue inner circle
    ctx.beginPath();
    ctx.arc(64, 64, 52, 0, Math.PI * 2);
    ctx.fillStyle = '#1e3799';
    ctx.fill();
    
    // Red outer ring border
    ctx.beginPath();
    ctx.arc(64, 64, 52, 0, Math.PI * 2);
    ctx.strokeStyle = '#eb2f06';
    ctx.lineWidth = 12;
    ctx.stroke();
    
    // "P" letter
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 68px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('P', 64, 64);
    
    // Red diagonal strike line
    ctx.beginPath();
    ctx.moveTo(28, 28);
    ctx.lineTo(100, 100);
    ctx.strokeStyle = '#eb2f06';
    ctx.lineWidth = 12;
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
  }
}
