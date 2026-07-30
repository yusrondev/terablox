import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export class CityGenerator {
  constructor(sceneManager, physicsManager, options = {}) {
    this.sceneManager  = sceneManager;
    this.physicsManager = physicsManager;
    this.options = options;
    
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
    if (!this.options.onlyGround) {
      this.createCity();
    }
    this.createBoundaryWalls();
  }
  
  // ── Single large ground plane + one physics body ─────────────────────────
  createGround() {
    const totalSize = (this.citySize * 2 + 2) * this.gridSize;
    
    this.groundMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(totalSize, totalSize),
      new THREE.MeshLambertMaterial({ color: this.colors.grass })
    );
    this.groundMesh.name = 'ground_default';
    this.groundMesh.rotation.x = -Math.PI / 2;
    this.groundMesh.receiveShadow = true;
    this.sceneManager.scene.add(this.groundMesh);
    
    // One big physics plane
    this.groundBody = new CANNON.Body({ mass: 0, material: this.physicsManager.defaultMaterial });
    this.groundBody.addShape(new CANNON.Plane());
    this.groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.physicsManager.addBody(this.groundBody);
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
    const tlHouseGeo  = new THREE.BoxGeometry(0.5, 1.5, 0.35);
    
    // Street Light Geometries
    const slPoleGeo  = new THREE.BoxGeometry(0.18, 4.5, 0.18);
    const slArmGeo   = new THREE.BoxGeometry(0.12, 0.12, 1.2);
    const slHeadGeo  = new THREE.BoxGeometry(0.4, 0.18, 0.6);
    const slBulbGeo  = new THREE.BoxGeometry(0.3, 0.08, 0.45);
    
    // Window Geometries
    const windowGeo      = new THREE.BoxGeometry(0.85, 1.25, 0.06);
    const windowFrameGeo = new THREE.BoxGeometry(0.95, 1.35, 0.04);
    const maxWindows = 6000;
    
    // Bench Geometries
    const benchSeatGeo = new THREE.BoxGeometry(2.0, 0.1, 0.6);
    const benchBackGeo = new THREE.BoxGeometry(2.0, 0.4, 0.1);
    const benchLegGeo  = new THREE.BoxGeometry(0.1, 0.5, 0.5);
    const maxBenches = totalBlocks * 4;
    
    // ── InstancedMeshes ──
    const roadMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.createRoadTexture(),
      roughness: 0.85,
      metalness: 0.05
    });
    this.sceneManager.roadMaterial = roadMat;

    const sidewalkMat = new THREE.MeshStandardMaterial({
      color: this.colors.sidewalk,
      roughness: 0.8,
      metalness: 0.05
    });
    this.sceneManager.sidewalkMaterial = sidewalkMat;

    const roadIM     = new THREE.InstancedMesh(roadGeo, roadMat, totalBlocks);
    roadIM.name = 'road_default';
    const sidewalkIM = new THREE.InstancedMesh(sidewalkGeo, sidewalkMat, totalBlocks);
    const trunkIM    = new THREE.InstancedMesh(trunkGeo,  new THREE.MeshLambertMaterial({ color: this.colors.wood }), maxTrees);
    const leavesIM   = new THREE.InstancedMesh(leavesGeo, new THREE.MeshLambertMaterial({ color: this.colors.leaves }), maxTrees);
    
    const tlPoleIM   = new THREE.InstancedMesh(tlPoleGeo, new THREE.MeshLambertMaterial({ color: 0x444444 }), totalBlocks * 4);
    const tlMainMat  = new THREE.MeshBasicMaterial({ color: 0xffffff, map: this.createTrafficLightTexture() });
    const tlBlackMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
    const tlMaterials = [
      tlBlackMat, // +X
      tlBlackMat, // -X
      tlBlackMat, // +Y (removes light from the top)
      tlBlackMat, // -Y (removes light from the bottom)
      tlMainMat,  // +Z (front face)
      tlMainMat   // -Z (back face)
    ];
    const tlHouseIM  = new THREE.InstancedMesh(tlHouseGeo, tlMaterials, totalBlocks * 4);
    
    const slPoleIM   = new THREE.InstancedMesh(slPoleGeo, new THREE.MeshLambertMaterial({ color: 0x2b3036 }), totalBlocks * 4);
    const slArmIM    = new THREE.InstancedMesh(slArmGeo,  new THREE.MeshLambertMaterial({ color: 0x2b3036 }), totalBlocks * 4);
    const slHeadIM   = new THREE.InstancedMesh(slHeadGeo, new THREE.MeshLambertMaterial({ color: 0x1f2327 }), totalBlocks * 4);
    const slBulbIM   = new THREE.InstancedMesh(slBulbGeo, this.sceneManager.streetLightBulbMaterial, totalBlocks * 4);
    
    const slConeGeo  = new THREE.CylinderGeometry(0.22, 2.5, 4.3, 8, 1, true);
    slConeGeo.translate(0, -2.15, 0);
    const slConeIM   = new THREE.InstancedMesh(slConeGeo, this.sceneManager.streetLightConeMaterial, totalBlocks * 4);
    
    const windowFrameIM = new THREE.InstancedMesh(windowFrameGeo, new THREE.MeshLambertMaterial({ color: 0x1a1d20 }), maxWindows);
    const windowIM      = new THREE.InstancedMesh(windowGeo, this.sceneManager.windowMaterial, maxWindows);
    
    const benchSeatIM = new THREE.InstancedMesh(benchSeatGeo, new THREE.MeshLambertMaterial({ color: 0x8b5a2b }), maxBenches);
    const benchBackIM = new THREE.InstancedMesh(benchBackGeo, new THREE.MeshLambertMaterial({ color: 0x8b5a2b }), maxBenches);
    const benchLegIM  = new THREE.InstancedMesh(benchLegGeo,  new THREE.MeshLambertMaterial({ color: 0x111111 }), maxBenches * 2);

    // Trash Bins & Bottles InstancedMeshes
    const trashBinGeo = new THREE.CylinderGeometry(0.25, 0.22, 0.8, 8);
    const trashBinMat = new THREE.MeshLambertMaterial({ color: 0x2d3436 });
    const maxTrashBins = totalBlocks * 4;
    const trashBinIM = new THREE.InstancedMesh(trashBinGeo, trashBinMat, maxTrashBins);

    const bottleGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.25, 6);
    const bottleGreenMat = new THREE.MeshLambertMaterial({ color: 0x2e8b57, transparent: true, opacity: 0.8 });
    const bottleBrownMat = new THREE.MeshLambertMaterial({ color: 0x8b5a2b, transparent: true, opacity: 0.8 });
    const maxBottles = totalBlocks * 12;
    const bottleGreenIM = new THREE.InstancedMesh(bottleGeo, bottleGreenMat, maxBottles);
    const bottleBrownIM = new THREE.InstancedMesh(bottleGeo, bottleBrownMat, maxBottles);

    // Puddle InstancedMesh
    const puddleGeo = new THREE.CircleGeometry(1.5, 8);
    const puddleMat = new THREE.MeshStandardMaterial({
      color: 0x111317,
      roughness: 0.1,
      metalness: 0.8,
      transparent: true,
      opacity: 0.0
    });
    this.sceneManager.puddleMaterial = puddleMat;
    const maxPuddles = totalBlocks * 6;
    const puddleIM = new THREE.InstancedMesh(puddleGeo, puddleMat, maxPuddles);

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
    slPoleIM.castShadow = true; slPoleIM.receiveShadow = true;
    slArmIM.castShadow = true;  slArmIM.receiveShadow = true;
    slHeadIM.castShadow = true; slHeadIM.receiveShadow = true;
    windowFrameIM.castShadow = true; windowFrameIM.receiveShadow = true;
    windowIM.castShadow = true;      windowIM.receiveShadow = true;
    
    benchSeatIM.castShadow = true; benchSeatIM.receiveShadow = true;
    benchBackIM.castShadow = true; benchBackIM.receiveShadow = true;
    benchLegIM.castShadow = true;  benchLegIM.receiveShadow = true;

    trashBinIM.castShadow = true;    trashBinIM.receiveShadow = true;
    bottleGreenIM.castShadow = true; bottleGreenIM.receiveShadow = true;
    bottleBrownIM.castShadow = true; bottleBrownIM.receiveShadow = true;

    puddleIM.receiveShadow = true;

    buildIMs.forEach(m => { m.castShadow = true; m.receiveShadow = true; });
    
    this.sceneManager.scene.add(roadIM, sidewalkIM, trunkIM, leavesIM);
    this.sceneManager.scene.add(tlPoleIM, tlHouseIM);
    this.sceneManager.scene.add(slPoleIM, slArmIM, slHeadIM, slBulbIM, slConeIM);
    this.sceneManager.scene.add(windowFrameIM, windowIM);
    this.sceneManager.scene.add(benchSeatIM, benchBackIM, benchLegIM, ...buildIMs);
    this.sceneManager.scene.add(trashBinIM, bottleGreenIM, bottleBrownIM, puddleIM);
    
    // Reset positions array in scene manager
    this.sceneManager.streetLightPositions = [];

    // ── Counters ──
    let winIdx = 0;
    let benchIdx = 0;
    let benchLegIdx = 0;
    let trashBinIdx = 0;
    let bottleGreenIdx = 0;
    let bottleBrownIdx = 0;
    let puddleIdx = 0;
    let rIdx = 0, swIdx = 0, trIdx = 0, lvIdx = 0, tlIdx = 0, slIdx = 0;
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

            // Store exact THREE.Box3 bounding box for camera collision avoidance
            const bldBox = new THREE.Box3(
              new THREE.Vector3(bldX - w / 2, 0.4, bldZ - d / 2),
              new THREE.Vector3(bldX + w / 2, 0.4 + h, bldZ + d / 2)
            );
            this.sceneManager.buildingBoxes.push(bldBox);

            // ── Building Windows ──
            const floorSpacing = 2.8;
            const startY = 0.4 + 2.0;
            const endY = 0.4 + h - 1.2;

            const qSide = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
            const qFront = new THREE.Quaternion().set(0, 0, 0, 1);

            for (let wy = startY; wy <= endY; wy += floorSpacing) {
              // Front (+Z) & Back (-Z)
              const colsX = Math.floor((w - 1.2) / 2.0);
              for (let col = 0; col < colsX; col++) {
                if (winIdx >= maxWindows - 4) break;
                const wx = bldX - ((colsX - 1) * 2.0) / 2 + col * 2.0;

                // Front (+Z)
                mat.compose(pos.set(wx, wy, bldZ + d / 2 + 0.04), qFront, scale.set(1, 1, 1));
                windowFrameIM.setMatrixAt(winIdx, mat);
                mat.compose(pos.set(wx, wy, bldZ + d / 2 + 0.06), qFront, scale.set(1, 1, 1));
                windowIM.setMatrixAt(winIdx++, mat);

                // Back (-Z)
                mat.compose(pos.set(wx, wy, bldZ - d / 2 - 0.04), qFront, scale.set(1, 1, 1));
                windowFrameIM.setMatrixAt(winIdx, mat);
                mat.compose(pos.set(wx, wy, bldZ - d / 2 - 0.06), qFront, scale.set(1, 1, 1));
                windowIM.setMatrixAt(winIdx++, mat);
              }

              // Right (+X) & Left (-X)
              const colsZ = Math.floor((d - 1.2) / 2.0);
              for (let col = 0; col < colsZ; col++) {
                if (winIdx >= maxWindows - 4) break;
                const wz = bldZ - ((colsZ - 1) * 2.0) / 2 + col * 2.0;

                // Right (+X)
                mat.compose(pos.set(bldX + w / 2 + 0.04, wy, wz), qSide, scale.set(1, 1, 1));
                windowFrameIM.setMatrixAt(winIdx, mat);
                mat.compose(pos.set(bldX + w / 2 + 0.06, wy, wz), qSide, scale.set(1, 1, 1));
                windowIM.setMatrixAt(winIdx++, mat);

                // Left (-X)
                mat.compose(pos.set(bldX - w / 2 - 0.04, wy, wz), qSide, scale.set(1, 1, 1));
                windowFrameIM.setMatrixAt(winIdx, mat);
                mat.compose(pos.set(bldX - w / 2 - 0.06, wy, wz), qSide, scale.set(1, 1, 1));
                windowIM.setMatrixAt(winIdx++, mat);
              }
            }
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
        
        const hasTrafficLights = (bx % 2 === 0 && bz % 2 === 0);
        
        for (const corner of tlPositions) {
          if (hasTrafficLights) {
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
          } else {
            // Hide the unused traffic lights underground and scaled to 0
            mat.compose(
              pos.set(0, -999, 0),
              qRot.set(0, 0, 0, 1),
              scale.set(0, 0, 0)
            );
            tlPoleIM.setMatrixAt(tlIdx, mat);
            tlHouseIM.setMatrixAt(tlIdx, mat);
          }
          tlIdx++;
        }

        // ── Street Lights ──
        const slPositions = [
          { x: 0,        z: -swHalf, rot: 0,           armDx: 0,     armDz: -0.5 },
          { x: 0,        z:  swHalf, rot: Math.PI,     armDx: 0,     armDz: 0.5 },
          { x: -swHalf,  z: 0,       rot: Math.PI / 2, armDx: -0.5,  armDz: 0 },
          { x:  swHalf,  z: 0,       rot: -Math.PI / 2,armDx: 0.5,   armDz: 0 }
        ];

        for (const lightCfg of slPositions) {
          const lx = ox + lightCfg.x;
          const lz = oz + lightCfg.z;

          // Pole (height 4.5 -> center at 2.25 + 0.4 = 2.65)
          mat.makeTranslation(lx, 2.65, lz);
          slPoleIM.setMatrixAt(slIdx, mat);

          // Arm (top of pole at y=4.8, extending towards road)
          mat.compose(
            pos.set(lx + lightCfg.armDx * 0.5, 4.8, lz + lightCfg.armDz * 0.5),
            qRot.setFromAxisAngle(new THREE.Vector3(0, 1, 0), lightCfg.rot),
            scale.set(1, 1, 1)
          );
          slArmIM.setMatrixAt(slIdx, mat);

          // Head fixture
          const headX = lx + lightCfg.armDx;
          const headZ = lz + lightCfg.armDz;
          mat.compose(
            pos.set(headX, 4.8, headZ),
            qRot.setFromAxisAngle(new THREE.Vector3(0, 1, 0), lightCfg.rot),
            scale.set(1, 1, 1)
          );
          slHeadIM.setMatrixAt(slIdx, mat);

          // Bulb mesh
          mat.compose(
            pos.set(headX, 4.68, headZ),
            qRot.setFromAxisAngle(new THREE.Vector3(0, 1, 0), lightCfg.rot),
            scale.set(1, 1, 1)
          );
          slBulbIM.setMatrixAt(slIdx, mat);
          slConeIM.setMatrixAt(slIdx, mat);

          // Store light position for night point lighting
          this.sceneManager.streetLightPositions.push(new THREE.Vector3(headX, 4.5, headZ));

          // Physics collider for pole
          const slBody = new CANNON.Body({ mass: 0 });
          slBody.addShape(new CANNON.Box(new CANNON.Vec3(0.09, 2.25, 0.09)));
          slBody.position.set(lx, 2.65, lz);
          this.physicsManager.addBody(slBody);

          slIdx++;
          
          // ── Benches (placed near street lights) ──
          // Put bench 3 meters offset from the street light
          const bx = lx + lightCfg.armDz * 3;
          const bz = lz + lightCfg.armDx * 3;
          
          // Face the road (opposite of light arm direction)
          const bRot = lightCfg.rot + Math.PI; 
          
          // Seat (y=0.95: sidewalk 0.4 + legs 0.5 + seat thickness/2 0.05)
          mat.compose(pos.set(bx, 0.95, bz), qRot.setFromAxisAngle(new THREE.Vector3(0, 1, 0), bRot), scale.set(1, 1, 1));
          benchSeatIM.setMatrixAt(benchIdx, mat);
          
          // Back (y=1.3)
          const backDx = Math.sin(bRot) * 0.25;
          const backDz = Math.cos(bRot) * 0.25;
          mat.compose(pos.set(bx + backDx, 1.3, bz + backDz), qRot, scale.set(1, 1, 1));
          benchBackIM.setMatrixAt(benchIdx, mat);
          
          // Legs (left and right) (y=0.65)
          const legDx = Math.cos(bRot) * 0.8;
          const legDz = -Math.sin(bRot) * 0.8;
          mat.compose(pos.set(bx + legDx, 0.65, bz + legDz), qRot, scale.set(1, 1, 1));
          benchLegIM.setMatrixAt(benchLegIdx++, mat);
          mat.compose(pos.set(bx - legDx, 0.65, bz - legDz), qRot, scale.set(1, 1, 1));
          benchLegIM.setMatrixAt(benchLegIdx++, mat);
          
          // Register interaction point for sitting
          this.sceneManager.interactables.push({
            type: 'bench',
            position: new THREE.Vector3(bx, 0.95, bz), // sit target height
            rotation: bRot
          });
          
          // Physics collider
          const benchBody = new CANNON.Body({ mass: 0 });
          benchBody.addShape(new CANNON.Box(new CANNON.Vec3(1.0, 0.5, 0.4)));
          benchBody.position.set(bx, 0.9, bz);
          benchBody.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), bRot);
          this.physicsManager.addBody(benchBody);
          
          benchIdx++;

          // ── Trash Bins (placed next to benches) ──
          // Bench direction axis
          const cosB = Math.cos(bRot);
          const sinB = Math.sin(bRot);
          // Place trash bin 1.4m to the side of the bench
          const binX = bx + cosB * 1.4;
          const binZ = bz - sinB * 1.4;
          
          if (trashBinIdx < maxTrashBins) {
            mat.compose(pos.set(binX, 0.8, binZ), qRot.setFromAxisAngle(new THREE.Vector3(0, 1, 0), bRot), scale.set(1, 1, 1));
            trashBinIM.setMatrixAt(trashBinIdx++, mat);
            
            // Trash bin physics collider
            const binBody = new CANNON.Body({ mass: 0 });
            binBody.addShape(new CANNON.Box(new CANNON.Vec3(0.25, 0.4, 0.25)));
            binBody.position.set(binX, 0.8, binZ);
            this.physicsManager.addBody(binBody);
          }

          // ── Scattered Bottles (near benches/trash bins) ──
          for (let b = 0; b < 3; b++) {
            let offsetSide, offsetFront;
            if (b === 0) {
              // Bottle 1: Standing near the bench
              offsetSide = -1.3 + (Math.random() - 0.5) * 0.2;
              offsetFront = 0.3 + Math.random() * 0.3;
            } else if (b === 1) {
              // Bottle 2: Lying down in front of the bench
              offsetSide = (Math.random() - 0.5) * 1.0;
              offsetFront = 0.8 + Math.random() * 0.4;
            } else {
              // Bottle 3: Lying down near the trash bin
              offsetSide = 1.7 + (Math.random() - 0.5) * 0.2;
              offsetFront = 0.1 + Math.random() * 0.3;
            }

            const botX = bx + offsetSide * cosB - offsetFront * sinB;
            const botZ = bz - offsetSide * sinB - offsetFront * cosB;

            const isLying = b > 0;
            let botY, qBot;

            if (isLying) {
              botY = 0.4 + 0.04; // sidewalk 0.4 + bottle radius 0.04
              const randRot = Math.random() * Math.PI * 2;
              const qBase = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, randRot, 0));
              qBot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), bRot).multiply(qBase);
            } else {
              botY = 0.4 + 0.125; // sidewalk 0.4 + half bottle height 0.125
              qBot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI * 2);
            }

            const useGreen = Math.random() > 0.5;
            mat.compose(pos.set(botX, botY, botZ), qBot, scale.set(1, 1, 1));

            if (useGreen) {
              if (bottleGreenIdx < maxBottles) {
                bottleGreenIM.setMatrixAt(bottleGreenIdx++, mat);
              }
            } else {
              if (bottleBrownIdx < maxBottles) {
                bottleBrownIM.setMatrixAt(bottleBrownIdx++, mat);
              }
            }
          }
        }

        // ── Puddles (placed in some road lanes, 60% chance per block) ──
        if (Math.random() < 0.6 && puddleIdx < maxPuddles) {
          let pX, pZ;
          if (Math.random() > 0.5) {
            // Horizontal road lane (Z offset is near block boundary, e.g. 20m)
            pX = ox + (Math.random() - 0.5) * 36;
            pZ = oz + (Math.random() > 0.5 ? 20.0 : -20.0);
          } else {
            // Vertical road lane (X offset is near block boundary, e.g. 20m)
            pX = ox + (Math.random() > 0.5 ? 20.0 : -20.0);
            pZ = oz + (Math.random() - 0.5) * 36;
          }

          // Random puddle size (scale X and Y in local space)
          const scaleX = 0.6 + Math.random() * 1.4;
          const scaleY = 0.4 + Math.random() * 0.8;
          const pRotZ = Math.random() * Math.PI * 2;

          // Local Z rotation for puddle orientation
          const qZ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), pRotZ);
          // Combine flat-plane rotation (_90) with local Z-rotation
          const qFinal = _90.clone().multiply(qZ);

          // Place slightly above road (y=0.012)
          mat.compose(pos.set(pX, 0.012, pZ), qFinal, scale.set(scaleX, scaleY, 1));
          puddleIM.setMatrixAt(puddleIdx++, mat);
        }
      }
    }
    
    // ── Set exact instance counts to prevent drawing uninitialized default instances at origin (0,0,0) ──
    trunkIM.count       = trIdx;
    leavesIM.count      = lvIdx;
    tlPoleIM.count = tlIdx;
    tlHouseIM.count = tlIdx;
    slPoleIM.count = slIdx;
    slArmIM.count = slIdx;
    slHeadIM.count = slIdx;
    slBulbIM.count = slIdx;
    windowFrameIM.count = winIdx;
    windowIM.count = winIdx;
    benchSeatIM.count = benchIdx;
    benchBackIM.count = benchIdx;
    benchLegIM.count = benchLegIdx;
    trashBinIM.count = trashBinIdx;
    bottleGreenIM.count = bottleGreenIdx;
    bottleBrownIM.count = bottleBrownIdx;
    puddleIM.count = puddleIdx;
    bIdx.forEach((count, idx) => { buildIMs[idx].count = count; });

    // ── Commit all instance matrices ──
    roadIM.instanceMatrix.needsUpdate        = true;
    sidewalkIM.instanceMatrix.needsUpdate    = true;
    trunkIM.instanceMatrix.needsUpdate       = true;
    leavesIM.instanceMatrix.needsUpdate      = true;
    tlPoleIM.instanceMatrix.needsUpdate      = true;
    tlHouseIM.instanceMatrix.needsUpdate     = true;
    slPoleIM.instanceMatrix.needsUpdate      = true;
    slArmIM.instanceMatrix.needsUpdate       = true;
    slHeadIM.instanceMatrix.needsUpdate      = true;
    slBulbIM.instanceMatrix.needsUpdate      = true;
    windowFrameIM.instanceMatrix.needsUpdate = true;
    windowIM.instanceMatrix.needsUpdate      = true;
    trashBinIM.instanceMatrix.needsUpdate    = true;
    bottleGreenIM.instanceMatrix.needsUpdate = true;
    bottleBrownIM.instanceMatrix.needsUpdate = true;
    puddleIM.instanceMatrix.needsUpdate      = true;
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
    this.boundaryBodies = [];
    for (const [x, z, wx, wz] of configs) {
      const body = new CANNON.Body({ mass: 0 });
      body.addShape(new CANNON.Box(new CANNON.Vec3(Math.max(wx, 1), 15, Math.max(wz, 1))));
      body.position.set(x, 15, z);
      this.physicsManager.addBody(body);
      this.boundaryBodies.push(body);
    }
  }

  rebuildGroundAndBoundaries(newSize) {
    this.citySize = newSize;

    // Remove old ground mesh
    if (this.groundMesh) {
      this.sceneManager.scene.remove(this.groundMesh);
    }

    // Remove old boundaries
    if (this.boundaryBodies) {
      this.boundaryBodies.forEach(b => this.physicsManager.world.removeBody(b));
    }
    this.boundaryBodies = [];

    // Re-create ground (physics plane groundBody is static infinite plane, so no need to replace it!)
    const totalSize = (this.citySize * 2 + 2) * this.gridSize;
    this.groundMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(totalSize, totalSize),
      new THREE.MeshLambertMaterial({ color: this.colors.grass })
    );
    this.groundMesh.rotation.x = -Math.PI / 2;
    this.groundMesh.receiveShadow = true;
    this.sceneManager.scene.add(this.groundMesh);

    // Re-create boundaries
    this.createBoundaryWalls();
  }

  createRoadTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    
    // Asphalt base
    ctx.fillStyle = '#22252a';
    ctx.fillRect(0, 0, 256, 256);
    
    // Slight noise for asphalt (compressed: fewer rects, smaller size)
    for (let i = 0; i < 1500; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? '#1a1d21' : '#2a2e35';
        ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
    }
    
    // Dashed lines removed for plain asphalt road look
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    if (this.sceneManager.renderer) {
      texture.anisotropy = Math.min(4, this.sceneManager.renderer.capabilities.getMaxAnisotropy());
    }
    return texture;
  }

  createTrafficLightTexture() {
    this.tlCanvas = document.createElement('canvas');
    this.tlCanvas.width = 32;
    this.tlCanvas.height = 96; // 1:3 ratio
    this.tlCtx = this.tlCanvas.getContext('2d');
    
    this.tlTexture = new THREE.CanvasTexture(this.tlCanvas);
    this.trafficLightTimer = 0;
    this.currentActiveColorIndex = -1;
    
    this.drawTrafficLightTexture(2); // Start with Green
    
    return this.tlTexture;
  }

  drawTrafficLightTexture(activeColorIndex) {
    if (!this.tlCtx) return;
    
    const ctx = this.tlCtx;
    
    // Black housing
    ctx.fillStyle = '#111111';
    ctx.fillRect(0, 0, 32, 96);
    
    // Circles: Top = Red (0), Middle = Orange/Yellow (1), Bottom = Green (2)
    const activeColors = ['#ff0000', '#ffaa00', '#00ff00'];
    const inactiveColors = ['#220000', '#221100', '#002200'];
    
    const centersY = [16, 48, 80];
    
    for (let i = 0; i < 3; i++) {
      // Draw outer light frame ring
      ctx.beginPath();
      ctx.arc(16, centersY[i], 8, 0, Math.PI * 2);
      ctx.strokeStyle = '#222222';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      
      // Draw light circle
      ctx.beginPath();
      ctx.arc(16, centersY[i], 6.5, 0, Math.PI * 2);
      ctx.fillStyle = (i === activeColorIndex) ? activeColors[i] : inactiveColors[i];
      ctx.fill();
      
      // Subtle shine highlight for the active light
      if (i === activeColorIndex) {
        ctx.beginPath();
        ctx.arc(14, centersY[i] - 2, 2, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.fill();
      }
    }
    
    if (this.tlTexture) {
      this.tlTexture.needsUpdate = true;
    }
  }

  update(dt) {
    if (!this.tlTexture) return;
    
    this.trafficLightTimer += dt;
    const cycleTime = this.trafficLightTimer % 9.5;
    
    let activeColorIndex;
    if (cycleTime < 4.0) {
      activeColorIndex = 2; // Green
    } else if (cycleTime < 5.5) {
      activeColorIndex = 1; // Orange
    } else {
      activeColorIndex = 0; // Red
    }
    
    if (activeColorIndex !== this.currentActiveColorIndex) {
      this.currentActiveColorIndex = activeColorIndex;
      this.drawTrafficLightTexture(activeColorIndex);
    }
  }
}
