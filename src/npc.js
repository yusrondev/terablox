import * as THREE from 'three';
import * as CANNON from 'cannon-es';

const SPHERE_R = 0.5; // Must match player.js

export class NPCManager {
  constructor(sceneManager, physicsManager) {
    this.sceneManager = sceneManager;
    this.physicsManager = physicsManager;
    this.npcs = [];
    
    // Spawn default 3 NPCs initially
    this.spawnNPCs(3, []);
  }
  
  spawnNPCs(roamingCount = 3, fixedSpawns = []) {
    const game = this.sceneManager.game;
    const rand = (game && game.city && game.city.random) ? game.city.random : Math.random;

    // Clear any existing NPCs
    this.npcs.forEach(npc => {
      if (npc.mesh) {
        this.sceneManager.scene.remove(npc.mesh);
        // Untrack from scene manager culling list
        const idx = this.sceneManager.trackedNPCs.indexOf(npc.mesh);
        if (idx !== -1) this.sceneManager.trackedNPCs.splice(idx, 1);
      }
      if (npc.body) this.physicsManager.removeBody(npc.body);
    });
    this.npcs = [];
    
    // 1. Spawn fixed NPCs at specific coordinates
    fixedSpawns.forEach(loc => {
      this.npcs.push(new NPC(this.sceneManager, this.physicsManager, loc.x, loc.z));
    });
    
    // 2. Spawn randomly distributed roaming NPCs
    for (let i = 0; i < roamingCount; i++) {
      const x = (rand() - 0.5) * 60;
      const z = (rand() - 0.5) * 60;
      this.npcs.push(new NPC(this.sceneManager, this.physicsManager, x, z));
    }
  }
  
  update(deltaTime, playerPos, multiplayer = null) {
    this._frameCount = (this._frameCount || 0) + 1;
    const isRemote = multiplayer && multiplayer.connected && !multiplayer.isHost;
    
    for (let i = 0; i < this.npcs.length; i++) {
      const npc = this.npcs[i];
      
      if (isRemote) {
        const remoteData = multiplayer.sceneManager._remoteNpcTargets ? multiplayer.sceneManager._remoteNpcTargets[i] : null;
        npc.update(deltaTime, this._frameCount, true, remoteData);
      } else {
        // LOD: update distance to player
        if (playerPos && npc.mesh) {
          npc.distToPlayer = npc.mesh.position.distanceTo(playerPos);
        }
        
        // LOD: NPCs far from player only update every 3rd frame
        if (npc.distToPlayer > 30 && this._frameCount % 3 !== 0) continue;
        
        npc.update(deltaTime, this._frameCount, false, null);
      }
    }
  }
}

// ── Shared geometry/materials for all NPCs (huge perf win) ──────────────────
const _skinMat  = new THREE.MeshLambertMaterial({ color: 0xffe0bd });
const _pantsMat = new THREE.MeshLambertMaterial({ color: 0x444444 });
const _shirtColors = [0xff9999, 0x99ff99, 0xaabbff, 0xffdd88];

const _legGeo   = new THREE.BoxGeometry(0.45, 1.5, 0.45);
const _torsoGeo = new THREE.BoxGeometry(1.1, 1.5, 0.55);
const _armGeo   = new THREE.BoxGeometry(0.38, 1.4, 0.38);
const _headGeo  = new THREE.BoxGeometry(0.85, 0.85, 0.85);

class NPC {
  constructor(sceneManager, physicsManager, startX, startZ) {
    this.sceneManager  = sceneManager;
    this.physicsManager = physicsManager;
    this.speed = 1.8;
    
    const game = sceneManager.game;
    const rand = (game && game.city && game.city.random) ? game.city.random : Math.random;
    
    this.animTime = 0;
    this.changeDirTimer = 0;
    this.state = 'walk';
    this.direction = new THREE.Vector3(rand() - 0.5, 0, rand() - 0.5).normalize();
    
    this._buildMesh(rand);
    this._buildBody(startX, startZ);
  }
  
  _buildMesh(rand) {
    this.mesh = new THREE.Group();
    const shirtMat = new THREE.MeshStandardMaterial({
      color: _shirtColors[Math.floor(rand() * _shirtColors.length)],
      roughness: 1.0
    });
    
    this.leftLeg  = new THREE.Group();
    this.leftLeg.position.set( 0.28, 1.5, 0);
    const leftLegMesh = new THREE.Mesh(_legGeo, _pantsMat);
    leftLegMesh.position.y = -0.75;
    this.leftLeg.add(leftLegMesh);
    
    this.rightLeg = new THREE.Group();
    this.rightLeg.position.set(-0.28, 1.5, 0);
    const rightLegMesh = new THREE.Mesh(_legGeo, _pantsMat);
    rightLegMesh.position.y = -0.75;
    this.rightLeg.add(rightLegMesh);
    
    this.leftArm  = new THREE.Group();
    this.leftArm.position.set( 0.8, 3.0, 0);
    const leftArmMesh = new THREE.Mesh(_armGeo, _skinMat);
    leftArmMesh.position.y = -0.7;
    this.leftArm.add(leftArmMesh);
    
    this.rightArm = new THREE.Group();
    this.rightArm.position.set(-0.8, 3.0, 0);
    const rightArmMesh = new THREE.Mesh(_armGeo, _skinMat);
    rightArmMesh.position.y = -0.7;
    this.rightArm.add(rightArmMesh);
    
    const torso = new THREE.Mesh(_torsoGeo, shirtMat);
    torso.position.set(0, 2.25, 0);
    
    const head = new THREE.Mesh(_headGeo, _skinMat);
    head.position.set(0, 3.42, 0);
    
    this.mesh.add(this.leftLeg, this.rightLeg, this.leftArm, this.rightArm, torso, head);
    
    // Enable shadows for NPCs
    this.mesh.traverse(child => {
      if (child.isMesh) child.castShadow = true;
    });
    
    this.mesh.scale.set(0.5, 0.5, 0.5);
    this.mesh.name = 'npc';
    
    this.sceneManager.scene.add(this.mesh);
    // Register in scene manager tracked list for O(1) culling
    this.sceneManager.trackedNPCs.push(this.mesh);
  }
  
  _buildBody(x, z) {
    this.body = new CANNON.Body({
      mass: 40,
      fixedRotation: true,
      linearDamping: 0.05,
      material: this.physicsManager.defaultMaterial,
      allowSleep: true,  // Perf: let Cannon-ES suspend idle NPCs
      sleepSpeedLimit: 0.3,
      sleepTimeLimit: 1.0,
    });
    this.body.addShape(new CANNON.Sphere(SPHERE_R), new CANNON.Vec3(0, SPHERE_R, 0));
    this.body.position.set(x, 3, z);
    this.physicsManager.addBody(this.body);
    
    // Per-NPC caches
    this.distToPlayer = 999;
    this._cachedWaterTiles = null;
    this._waterCacheFrame  = -999;
  }
  
  update(deltaTime, frameCount, isRemote = false, remoteData = null) {
    if (isRemote && remoteData) {
      // Bypassed path for Joiners (Interpolate positions from Host)
      this.mesh.position.lerp(new THREE.Vector3(remoteData.x, remoteData.y, remoteData.z), 0.22);
      
      const dy = remoteData.rotY - this.mesh.rotation.y;
      const dyClamped = ((dy + Math.PI) % (Math.PI * 2)) - Math.PI;
      this.mesh.rotation.y += dyClamped * 0.22;
      
      this.state = remoteData.state;
      this.animTime = remoteData.animTime || 0;
      
      // Sync Cannon physics body to match mesh to prevent players passing through
      this.body.type = CANNON.Body.KINEMATIC;
      this.body.position.copy(this.mesh.position);
      this.body.velocity.set(0, 0, 0);
      this.body.angularVelocity.set(0, 0, 0);
      
      this.animate(deltaTime, false);
      return;
    }

    // Host or Local: Run physics & AI
    this.body.type = CANNON.Body.DYNAMIC;

    // Perf: Refresh water tile cache every 120 frames instead of filtering every frame
    if (!this._cachedWaterTiles || (frameCount - this._waterCacheFrame) > 120) {
      const placedObjects = this.sceneManager.placedObjects || [];
      this._cachedWaterTiles = placedObjects.filter(obj => obj.type === 'water');
      this._waterCacheFrame = frameCount || 0;
    }
    const waterTiles = this._cachedWaterTiles;
    let inWater = false;
    let waterY = 0;
    
    const px = this.body.position.x;
    const pz = this.body.position.z;
    const py = this.body.position.y;
    
    for (let i = 0; i < waterTiles.length; i++) {
      const w = waterTiles[i];
      const hw = w.tileScale ? w.tileScale.w / 2 : 5;
      const hd = w.tileScale ? w.tileScale.d / 2 : 5;
      const wh = w.tileScale ? w.tileScale.h : 1.95;
      if (Math.abs(px - w.position.x) < hw && Math.abs(pz - w.position.z) < hd) {
        waterY = w.position.y + wh; // Top of the water block
        if (py < waterY) {
          inWater = true;
          break;
        }
      }
    }

    this.changeDirTimer -= deltaTime;
    if (this.changeDirTimer <= 0) {
      if (Math.random() > 0.3) {
        this.state = 'walk';
        this.direction.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
        this.changeDirTimer = 3 + Math.random() * 4;
      } else {
        this.state = 'idle';
        this.changeDirTimer = 1.5 + Math.random() * 2;
      }
    }
    
    // Lookahead building obstacle avoidance
    if (this.state === 'walk') {
      const lookAheadDist = 2.5;
      const lookAheadPos = new THREE.Vector3(
        px + this.direction.x * lookAheadDist,
        py + 0.5,
        pz + this.direction.z * lookAheadDist
      );
      
      let willCollide = false;
      const boxes = this.sceneManager.buildingBoxes || [];
      for (let i = 0; i < boxes.length; i++) {
        if (boxes[i].containsPoint(lookAheadPos)) {
          willCollide = true;
          break;
        }
      }
      
      if (willCollide) {
        // Bounce / choose new direction
        this.direction.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
        this.changeDirTimer = 3 + Math.random() * 4;
      }
    }
    
    if (this.state === 'walk') {
      let finalSpeed = this.speed;
      if (inWater) finalSpeed *= 0.45; // Swim slower
      this.body.velocity.x = this.direction.x * finalSpeed;
      this.body.velocity.z = this.direction.z * finalSpeed;
      this.mesh.rotation.y = Math.atan2(this.direction.x, this.direction.z);
      
      // Stuck detection (if moving very slowly but state is walk, steer away)
      const horizontalVel = new THREE.Vector2(this.body.velocity.x, this.body.velocity.z).length();
      if (horizontalVel < 0.25 && this.changeDirTimer < 5.0) {
        this.direction.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
        this.changeDirTimer = 3 + Math.random() * 4;
      }
    } else {
      // Dampen horizontal velocity when idle. Very low damp (0.1) stops the NPC instantly.
      let damp = inWater ? 0.82 : 0.1;
      this.body.velocity.x *= damp;
      this.body.velocity.z *= damp;
    }
    
    if (inWater) {
      // Water drag/friction
      this.body.velocity.x *= 0.82;
      this.body.velocity.z *= 0.82;
      if (this.body.velocity.y < -1.5) {
        this.body.velocity.y *= 0.82;
      }
      
      // Floating force
      const depth = waterY - py;
      // Float at chest height (approx 0.8m submerged). NPC mass is 40, gravity force is 800.
      const buoyancyForceY = Math.min(Math.max(0, depth) * 1000, 1100);
      this.body.force.y += buoyancyForceY;
      
      // Swim up randomly
      if (depth > 0.8 && Math.random() < 0.05) {
        this.body.velocity.y = 2.5;
      }
    }
    
    // Sync mesh — same as player: body.position IS the foot level
    this.mesh.position.set(
      this.body.position.x,
      this.body.position.y,
      this.body.position.z
    );
    
    // Out of bounds check (fall-off protection)
    if (this.body.position.y < -15) {
      const rx = (Math.random() - 0.5) * 20;
      const rz = (Math.random() - 0.5) * 20;
      this.body.position.set(rx, 5, rz);
      this.body.velocity.set(0, 0, 0);
    }
    
    // Animation
    this.animate(deltaTime, inWater);
  }

  animate(deltaTime, inWater) {
    if (inWater) {
      if (this.state === 'walk') {
        this.animTime += deltaTime * 10;
        const s = Math.sin(this.animTime);
        this.leftArm.rotation.x = -Math.PI / 2.5 + s * 0.8;
        this.rightArm.rotation.x = -Math.PI / 2.5 - s * 0.8;
        this.leftLeg.rotation.x = s * 0.4;
        this.rightLeg.rotation.x = -s * 0.4;
      } else {
        this.animTime += deltaTime * 2.0;
        const s = Math.sin(this.animTime) * 0.15;
        this.leftArm.rotation.x = -0.4 + s;
        this.rightArm.rotation.x = -0.4 - s;
        this.leftLeg.rotation.x = 0.2 + s * 0.5;
        this.rightLeg.rotation.x = 0.2 - s * 0.5;
      }
    } else if (this.state === 'walk') {
      this.animTime += deltaTime * 8;
      const s = Math.sin(this.animTime) * 0.5;
      this.leftArm.rotation.x  =  s;
      this.rightArm.rotation.x = -s;
      this.leftLeg.rotation.x  = -s;
      this.rightLeg.rotation.x =  s;
    } else {
      this.leftArm.rotation.x = 0;
      this.rightArm.rotation.x = 0;
      this.leftLeg.rotation.x = 0;
      this.rightLeg.rotation.x = 0;
    }
  }
}
