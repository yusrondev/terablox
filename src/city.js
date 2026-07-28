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
    const sidewalkGeo = new THREE.BoxGeometry(this.gridSize - 6, 0.4, this.gridSize - 6);
    const unitBoxGeo  = new THREE.BoxGeometry(1, 1, 1); // scaled per building
    const trunkGeo    = new THREE.BoxGeometry(0.8, 3, 0.8);
    const leavesGeo   = new THREE.BoxGeometry(4, 4, 4);
    
    // ── InstancedMeshes ──
    const roadIM     = new THREE.InstancedMesh(roadGeo, new THREE.MeshLambertMaterial({ color: this.colors.road }), totalBlocks);
    const sidewalkIM = new THREE.InstancedMesh(sidewalkGeo, new THREE.MeshLambertMaterial({ color: this.colors.sidewalk }), totalBlocks);
    const trunkIM    = new THREE.InstancedMesh(trunkGeo,  new THREE.MeshLambertMaterial({ color: this.colors.wood }), maxTrees);
    const leavesIM   = new THREE.InstancedMesh(leavesGeo, new THREE.MeshLambertMaterial({ color: this.colors.leaves }), maxTrees);
    
    // One InstancedMesh per building color
    const buildIMs = this.colors.buildings.map(c =>
      new THREE.InstancedMesh(unitBoxGeo, new THREE.MeshLambertMaterial({ color: c }), Math.ceil(maxBuildings / this.colors.buildings.length) + 5)
    );
    
    this.sceneManager.scene.add(roadIM, sidewalkIM, trunkIM, leavesIM, ...buildIMs);
    
    // ── Counters ──
    let rIdx = 0, swIdx = 0, trIdx = 0, lvIdx = 0;
    const bIdx = new Array(buildIMs.length).fill(0);
    
    // ── Reusable matrix helpers ──
    const mat   = new THREE.Matrix4();
    const pos   = new THREE.Vector3();
    const qRot  = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const _90   = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
    
    const sw = this.gridSize - 6; // sidewalk size
    
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
      }
    }
    
    // ── Commit all instance matrices ──
    roadIM.instanceMatrix.needsUpdate     = true;
    sidewalkIM.instanceMatrix.needsUpdate = true;
    trunkIM.instanceMatrix.needsUpdate    = true;
    leavesIM.instanceMatrix.needsUpdate   = true;
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
}
