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
  }
  
  setupListeners() {
    this.onMouseMove = this.onMouseMove.bind(this);
    this.onMouseClick = this.onMouseClick.bind(this);
    this.onKeyDown = this.onKeyDown.bind(this);
  }
  
  activate(subMode = 'props') {
    this.active = true;
    this.subMode = subMode;
    this.deselectObject();
    
    // Bind global listeners
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
    } else if (type === 'bench') {
      mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 0.8, 1), wireMat);
      mesh.position.y = 0.4;
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
    } else if (type === 'road') {
      mesh = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), wireMat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = 0.01;
    } else if (type === 'building') {
      const h = parseFloat(this.rangeHeight.value);
      mesh = new THREE.Mesh(new THREE.BoxGeometry(8, h, 8), wireMat);
      mesh.position.y = h / 2;
    }
    
    this.ghostMesh = mesh;
    this.game.sceneManager.scene.add(this.ghostMesh);
  }
  
  onMouseMove(e) {
    if (!this.active || !this.ghostMesh) return;
    
    // Ignore moves on UI panel
    if (e.clientX > window.innerWidth - 340 && e.clientY > 60) return;
    
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
  
  onMouseClick(e) {
    if (!this.active || !this.ghostMesh) return;
    
    // Ignore clicks on UI
    if (e.clientX > window.innerWidth - 340 && e.clientY > 60) return;
    if (e.clientY < 60) return; // Top HUD clicks
    
    // Check if we clicked on an existing placed object (except when painting/dropping)
    if (this.subMode === 'props' && this.selectedProp === '') {
      // Logic for selecting object
      this.raycastSelect(e);
      return;
    }
    
    if (this.subMode === 'city' && this.selectedBrush === 'clear') {
      this.eraseObjectAt(this.ghostMesh.position);
      return;
    }
    
    // Place new object
    this.placeObject();
  }
  
  placeObject() {
    const type = (this.subMode === 'props') ? this.selectedProp : this.selectedBrush;
    if (type === 'clear') return;
    
    // Check if tile/position is already occupied
    const occupied = this.placedObjects.some(obj => 
      obj.position.distanceTo(this.ghostMesh.position) < 0.5 && obj.type === type
    );
    if (occupied) return;
    
    let visualMesh;
    let physicsBody = null;
    
    // Materials
    const woodMat = new THREE.MeshLambertMaterial({ color: 0xc4956a });
    const leavesMat = new THREE.MeshLambertMaterial({ color: 0x7fc97f });
    const darkGrey = new THREE.MeshLambertMaterial({ color: 0x444444 });
    const redMat = new THREE.MeshLambertMaterial({ color: 0xef4444 });
    
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
    else if (type === 'bench') {
      const g = new THREE.Group();
      const seat = new THREE.Mesh(new THREE.BoxGeometry(2, 0.1, 1), woodMat);
      seat.position.y = 0.4;
      const legL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.4, 1), darkGrey);
      legL.position.set(0.9, 0.2, 0);
      const legR = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.4, 1), darkGrey);
      legR.position.set(-0.9, 0.2, 0);
      g.add(seat, legL, legR);
      visualMesh = g;
      
      physicsBody = new CANNON.Body({ mass: 0 });
      physicsBody.addShape(new CANNON.Box(new CANNON.Vec3(1.0, 0.4, 0.5)));
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
    else if (type === 'road') {
      // Paint road tile
      visualMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(10, 10),
        new THREE.MeshLambertMaterial({ color: 0xffffff, map: this.game.city.createRoadTexture() })
      );
      visualMesh.rotation.x = -Math.PI / 2;
      visualMesh.position.y = 0.01;
    } 
    else if (type === 'building') {
      // Drop custom building
      const h = parseFloat(this.rangeHeight.value);
      const bColor = this.game.city.colors.buildings[Math.floor(Math.random() * this.game.city.colors.buildings.length)];
      visualMesh = new THREE.Mesh(
        new THREE.BoxGeometry(8, h, 8),
        new THREE.MeshLambertMaterial({ color: bColor })
      );
      visualMesh.position.y = h / 2;
      
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
      physicsBody.position.set(
        visualMesh.position.x, 
        (type === 'building') ? visualMesh.position.y : (type === 'hydrant' ? 0.5 : (type === 'lamp' ? 1.75 : 0.4)), 
        visualMesh.position.z
      );
      this.game.physicsManager.addBody(physicsBody);
    }
    
    // Add to placed list
    const placedObj = {
      id: THREE.MathUtils.generateUUID(),
      type: type,
      mesh: visualMesh,
      body: physicsBody,
      position: visualMesh.position.clone(),
      rotation: this.rotationAngle,
      height: (type === 'building') ? parseFloat(this.rangeHeight.value) : null
    };
    
    this.placedObjects.push(placedObj);
  }
  
  eraseObjectAt(pos) {
    const threshold = 1.0;
    const index = this.placedObjects.findIndex(obj => 
      obj.position.distanceTo(pos) < threshold
    );
    
    if (index !== -1) {
      const obj = this.placedObjects[index];
      this.game.sceneManager.scene.remove(obj.mesh);
      if (obj.body) {
        this.game.physicsManager.world.removeBody(obj.body);
      }
      this.placedObjects.splice(index, 1);
    }
  }
  
  onKeyDown(e) {
    if (!this.active) return;
    
    if (e.key === 'r' || e.key === 'R') {
      // Rotate active ghost / selection by 90 degrees
      this.rotationAngle = (this.rotationAngle + Math.PI / 2) % (Math.PI * 2);
      if (this.ghostMesh) {
        this.ghostMesh.rotation.y = this.rotationAngle;
      }
      if (this.selectedObject) {
        this.selectedObject.mesh.rotation.y = this.rotationAngle;
        this.selectedObject.rotation = this.rotationAngle;
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
    
    // Search placed meshes for click intersections
    const meshes = this.placedObjects.map(obj => obj.mesh);
    const intersects = this.raycaster.intersectObjects(meshes, true);
    
    if (intersects.length > 0) {
      // Find top group or parent mesh that matches our placed object
      let hitMesh = intersects[0].object;
      while (hitMesh.parent && hitMesh.parent !== this.game.sceneManager.scene) {
        hitMesh = hitMesh.parent;
      }
      
      const found = this.placedObjects.find(obj => obj.mesh === hitMesh);
      if (found) {
        this.selectObject(found);
      }
    } else {
      this.deselectObject();
    }
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

    const mapData = this.placedObjects.map(obj => ({
      type: obj.type,
      position: { x: obj.position.x, y: obj.position.y, z: obj.position.z },
      rotation: obj.rotation,
      height: obj.height
    }));

    savedMaps[name] = mapData;
    localStorage.setItem('terablox_saved_maps', JSON.stringify(savedMaps));
    alert(`Map "${name}" berhasil disimpan ke Studio!`);
  }

  clearPlacements() {
    this.placedObjects.forEach(obj => {
      this.game.sceneManager.scene.remove(obj.mesh);
      if (obj.body) this.game.physicsManager.world.removeBody(obj.body);
    });
    this.placedObjects = [];
  }

  loadMapData(mapData) {
    this.clearPlacements();
    if (!mapData || mapData.length === 0) return;

    // Create a temporary ghost if not active
    let needDestroyGhost = false;
    if (!this.ghostMesh) {
      this.createGhost('hydrant'); // placeholder
      needDestroyGhost = true;
    }

    mapData.forEach(data => {
      this.rotationAngle = data.rotation;
      this.ghostMesh.position.set(data.position.x, data.position.y, data.position.z);
      if (data.type === 'building' && data.height) {
        if (this.rangeHeight) this.rangeHeight.value = data.height;
        if (this.lblHeight) this.lblHeight.textContent = data.height;
      }
      this.placeObject();
    });

    if (needDestroyGhost && this.ghostMesh) {
      this.game.sceneManager.scene.remove(this.ghostMesh);
      this.ghostMesh = null;
    }
  }
}
