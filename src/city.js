import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export class CityGenerator {
  constructor(sceneManager, physicsManager) {
    this.sceneManager  = sceneManager;
    this.physicsManager = physicsManager;
    
    // Pastel color palette
    this.colors = {
      road:         0xb0b5b9,
      sidewalk:     0xdde6ed,
      grass:        0xa8d48a,
      buildings:    [0xffb7b2, 0xffdac1, 0xd4f0cb, 0xb5ead7, 0xc7ceea, 0xfce1e4],
      leaves:       0x7fc97f,
      wood:         0xc4956a,
    };
    
    this.gridSize = 40;  // Metres per block
    this.citySize = 2;   // 2 = 5×5 grid of blocks (was 3 = 7×7, too many physics bodies)
    
    this.generate();
  }
  
  generate() {
    this.createGround();
    this.createCity();
    this.createBoundaryWalls();
  }
  
  // ── Single large ground plane + one physics body ─────────────────────────
  createGround() {
    const totalSize = (this.citySize * 2 + 2) * this.gridSize;
    
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(totalSize, totalSize),
      new THREE.MeshLambertMaterial({ color: this.colors.grass })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.receiveShadow = true;
    this.sceneManager.scene.add(mesh);
    
    // One big physics plane
    const groundBody = new CANNON.Body({ mass: 0, material: this.physicsManager.defaultMaterial });
    groundBody.addShape(new CANNON.Plane());
    groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.physicsManager.addBody(groundBody);
  }
  
  // ── Batch all instanced meshes, then place physics bodies ────────────────
  createCity() {
    const range = this.citySize;
    
    // Count items up-front for InstancedMesh allocation
    const totalBlocks = (range * 2 + 1) * (range * 2 + 1);
    const maxBuildings = totalBlocks * 4;
    const maxTrees     = totalBlocks * 3;
    
    // ── Shared geometry ──
    const roadGeo     = new THREE.PlaneGeometry(this.gridSize, this.gridSize);
    const sidewalkGeo = new THREE.BoxGeometry(this.gridSize - 10, 0.4, this.gridSize - 10);
    const unitBoxGeo  = new THREE.BoxGeometry(1, 1, 1); // scaled per building
    const trunkGeo    = new THREE.BoxGeometry(0.6, 3, 0.6);
    const leavesGeo   = new THREE.BoxGeometry(4, 4, 4);
    
    const tlPoleGeo   = new THREE.BoxGeometry(0.15, 3.5, 0.15);
    const tlHouseGeo  = new THREE.BoxGeometry(0.6, 1.5, 0.6);
    
    // ── InstancedMeshes ──
    const roadMat = new THREE.MeshLambertMaterial({ color: 0xffffff, map: this.createRoadTexture() });
    const roadIM     = new THREE.InstancedMesh(roadGeo, roadMat, totalBlocks);
    const sidewalkIM = new THREE.InstancedMesh(sidewalkGeo, new THREE.MeshLambertMaterial({ color: this.colors.sidewalk }), totalBlocks);
    const trunkIM    = new THREE.InstancedMesh(trunkGeo,  new THREE.MeshLambertMaterial({ color: this.colors.wood }), maxTrees);
    const leavesIM   = new THREE.InstancedMesh(leavesGeo, new THREE.MeshLambertMaterial({ color: this.colors.leaves }), maxTrees);
    
    const tlPoleIM   = new THREE.InstancedMesh(tlPoleGeo, new THREE.MeshLambertMaterial({ color: 0x444444 }), totalBlocks * 4);
    const tlHouseIM  = new THREE.InstancedMesh(tlHouseGeo, new THREE.MeshLambertMaterial({ color: 0xffffff, map: this.createTrafficLightTexture() }), totalBlocks * 4);
    
    // One InstancedMesh per building color
    const buildIMs = this.colors.buildings.map(c =>
      new THREE.InstancedMesh(unitBoxGeo, new THREE.MeshLambertMaterial({ color: c }), Math.ceil(maxBuildings / this.colors.buildings.length) + 5)
    );
    
    roadIM.receiveShadow = true;
    sidewalkIM.receiveShadow = true;
    trunkIM.castShadow = true; trunkIM.receiveShadow = true;
    leavesIM.castShadow = true; leavesIM.receiveShadow = true;
    tlPoleIM.castShadow = true; tlPoleIM.receiveShadow = true;
    tlHouseIM.castShadow = true; tlHouseIM.receiveShadow = true;
    buildIMs.forEach(m => { m.castShadow = true; m.receiveShadow = true; });
    
    this.sceneManager.scene.add(roadIM, sidewalkIM, trunkIM, leavesIM, tlPoleIM, tlHouseIM, ...buildIMs);
    
    // ── Counters ──
    let rIdx = 0, swIdx = 0, trIdx = 0, lvIdx = 0, tlIdx = 0;
    const bIdx = new Array(buildIMs.length).fill(0);
    
    // ── Reusable matrix helpers ──
    const mat   = new THREE.Matrix4();
    const pos   = new THREE.Vector3();
    const qRot  = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const _90   = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
    
    const sw = this.gridSize - 10; // sidewalk size
    
    for (let bx = -range; bx <= range; bx++) {
      for (let bz = -range; bz <= range; bz++) {
        const ox = bx * this.gridSize;
        const oz = bz * this.gridSize;
        
        // Road
        mat.compose(pos.set(ox, 0.005, oz), _90, scale.set(1, 1, 1));
        roadIM.setMatrixAt(rIdx++, mat);
        
        // Sidewalk
        mat.makeTranslation(ox, 0.2, oz);
        sidewalkIM.setMatrixAt(swIdx++, mat);
        
        // Sidewalk physics (one box per block, size matches sidewalkGeo)
        const swBody = new CANNON.Body({ mass: 0, material: this.physicsManager.defaultMaterial });
        swBody.addShape(new CANNON.Box(new CANNON.Vec3(sw / 2, 0.2, sw / 2)));
        swBody.position.set(ox, 0.2, oz);
        this.physicsManager.addBody(swBody);
        
        const isPark = Math.random() > 0.7;
        
        if (isPark) {
          // Trees
          const treePositions = [
            [ox,      oz     ],
            [ox - 8,  oz - 8 ],
            [ox + 8,  oz + 8 ],
          ];
          for (const [tx, tz] of treePositions) {
            mat.makeTranslation(tx, 1.5 + 0.4, tz); // trunk center = 1.5 above sidewalk top (0.4)
            trunkIM.setMatrixAt(trIdx++, mat);
            mat.makeTranslation(tx, 5.5, tz);
            leavesIM.setMatrixAt(lvIdx++, mat);
            
            // Small trunk collider
            const tb = new CANNON.Body({ mass: 0 });
            tb.addShape(new CANNON.Box(new CANNON.Vec3(0.4, 1.5, 0.4)));
            tb.position.set(tx, 1.9, tz);
            this.physicsManager.addBody(tb);
          }
        } else {
          // Buildings at 4 corners of block
          const corners = [
            [ox - 9, oz - 9],
            [ox + 9, oz - 9],
            [ox - 9, oz + 9],
            [ox + 9, oz + 9],
          ];
          for (const [bldX, bldZ] of corners) {
            const w = 7 + Math.random() * 4;
            const d = 7 + Math.random() * 4;
            const h = 8 + Math.random() * 28;
            const cIdx = Math.floor(Math.random() * buildIMs.length);
            
            const halfH = h / 2;
            const posY  = 0.4 + halfH; // sits on top of sidewalk (0.4 = sidewalk height)
            
            mat.compose(
              pos.set(bldX, posY, bldZ),
              qRot.set(0, 0, 0, 1),
              scale.set(w, h, d)
            );
            buildIMs[cIdx].setMatrixAt(bIdx[cIdx]++, mat);
            
            // Physics box
            const bb = new CANNON.Body({ mass: 0, material: this.physicsManager.defaultMaterial });
            bb.addShape(new CANNON.Box(new CANNON.Vec3(w / 2, halfH, d / 2)));
            bb.position.set(bldX, posY, bldZ);
            this.physicsManager.addBody(bb);
          }
        }
        
        // ── Traffic Lights at Intersections ──
        const swHalf = sw / 2 - 0.3; // Offset slightly inside sidewalk edge
        const tlPositions = [
          { x: -swHalf, z: -swHalf, rot: Math.PI },       // Top Left
          { x:  swHalf, z: -swHalf, rot: -Math.PI / 2 },  // Top Right
          { x: -swHalf, z:  swHalf, rot: Math.PI / 2 },   // Bottom Left
          { x:  swHalf, z:  swHalf, rot: 0 }              // Bottom Right
        ];
        
        for (const corner of tlPositions) {
          const cx = ox + corner.x;
          const cz = oz + corner.z;
          
          // Pole (height 3.5 -> center at 1.75)
          mat.makeTranslation(cx, 1.75, cz);
          tlPoleIM.setMatrixAt(tlIdx, mat);
          
          // Housing (height 1.5 -> center at 3.5 + 0.75 - 0.2 overlap = 4.05)
          mat.compose(
            pos.set(cx, 4.05, cz), 
            qRot.setFromAxisAngle(new THREE.Vector3(0, 1, 0), corner.rot),
            scale.set(1, 1, 1)
          );
          tlHouseIM.setMatrixAt(tlIdx, mat);
          
          // Physics collider
          const pBody = new CANNON.Body({ mass: 0 });
          pBody.addShape(new CANNON.Box(new CANNON.Vec3(0.075, 1.75, 0.075)));
          pBody.position.set(cx, 1.75, cz);
          this.physicsManager.addBody(pBody);
          
          tlIdx++;
        }
      }
    }
    
    // ── Commit all instance matrices ──
    roadIM.instanceMatrix.needsUpdate     = true;
    sidewalkIM.instanceMatrix.needsUpdate = true;
    trunkIM.instanceMatrix.needsUpdate    = true;
    leavesIM.instanceMatrix.needsUpdate   = true;
    tlPoleIM.instanceMatrix.needsUpdate   = true;
    tlHouseIM.instanceMatrix.needsUpdate  = true;
    buildIMs.forEach(m => m.instanceMatrix.needsUpdate = true);
  }
  
  createBoundaryWalls() {
    const half = (this.citySize + 1) * this.gridSize;
    const configs = [
      [0,     half,  half, 0],    // +Z wall
      [0,    -half,  half, 0],    // -Z wall
      [ half, 0,     0,   half],  // +X wall
      [-half, 0,     0,   half],  // -X wall
    ];
    for (const [x, z, wx, wz] of configs) {
      const body = new CANNON.Body({ mass: 0 });
      body.addShape(new CANNON.Box(new CANNON.Vec3(Math.max(wx, 1), 15, Math.max(wz, 1))));
      body.position.set(x, 15, z);
      this.physicsManager.addBody(body);
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
    
    // Slight noise for asphalt
    for (let i = 0; i < 8000; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? '#1a1d21' : '#2a2e35';
        ctx.fillRect(Math.random() * 512, Math.random() * 512, 3, 3);
    }
    
    // Dashed lines on the borders (forms the center of the road between blocks)
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 16; 
    ctx.setLineDash([40, 40]);
    
    // Left edge
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, 512);
    ctx.stroke();
    
    // Top edge
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(512, 0);
    ctx.stroke();
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    if (this.sceneManager.renderer) {
      texture.anisotropy = this.sceneManager.renderer.capabilities.getMaxAnisotropy();
    }
    return texture;
  }

  createTrafficLightTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    
    // Black housing
    ctx.fillStyle = '#111111';
    ctx.fillRect(0, 0, 64, 128);
    
    // Red, Yellow, Green circles
    const colors = ['#ff3333', '#ffcc00', '#33cc33'];
    for(let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(32, 24 + i * 40, 14, 0, Math.PI * 2);
        ctx.fillStyle = colors[i];
        ctx.fill();
    }
    
    return new THREE.CanvasTexture(canvas);
  }
}
