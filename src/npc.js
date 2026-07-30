import * as THREE from 'three';
import * as CANNON from 'cannon-es';

const SPHERE_R = 0.5; // Must match player.js

export class NPCManager {
  constructor(sceneManager, physicsManager) {
    this.sceneManager = sceneManager;
    this.physicsManager = physicsManager;
    this.npcs = [];
    
    // Spawn only 3 NPCs to reduce physics & draw call overhead
    for (let i = 0; i < 3; i++) {
      const x = (Math.random() - 0.5) * 30;
      const z = (Math.random() - 0.5) * 30;
      this.npcs.push(new NPC(this.sceneManager, this.physicsManager, x, z));
    }
  }
  
  update(deltaTime) {
    for (const npc of this.npcs) npc.update(deltaTime);
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
    
    this.animTime = 0;
    this.changeDirTimer = 0;
    this.state = 'walk';
    this.direction = new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
    
    this._buildMesh();
    this._buildBody(startX, startZ);
  }
  
  _buildMesh() {
    this.mesh = new THREE.Group();
    const shirtMat = new THREE.MeshStandardMaterial({
      color: _shirtColors[Math.floor(Math.random() * _shirtColors.length)],
      roughness: 1.0
    });
    
    this.leftLeg  = new THREE.Group();
    this.leftLeg.position.set( 0.28, 1.5, 0);
    this.leftLeg.add(new THREE.Mesh(_legGeo, _pantsMat));
    
    this.rightLeg = new THREE.Group();
    this.rightLeg.position.set(-0.28, 1.5, 0);
    this.rightLeg.add(new THREE.Mesh(_legGeo, _pantsMat));
    
    this.leftArm  = new THREE.Group();
    this.leftArm.position.set( 0.8, 3.0, 0);
    this.leftArm.add(new THREE.Mesh(_armGeo, _skinMat));
    
    this.rightArm = new THREE.Group();
    this.rightArm.position.set(-0.8, 3.0, 0);
    this.rightArm.add(new THREE.Mesh(_armGeo, _skinMat));
    
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
  }
  
  _buildBody(x, z) {
    this.body = new CANNON.Body({
      mass: 40,
      fixedRotation: true,
      linearDamping: 0.05, // Normal low damping to allow realistic gravity/falling
      material: this.physicsManager.defaultMaterial,
      allowSleep: false,
    });
    this.body.addShape(new CANNON.Sphere(SPHERE_R), new CANNON.Vec3(0, SPHERE_R, 0));
    this.body.position.set(x, 3, z);
    this.physicsManager.addBody(this.body);
  }
  
  update(deltaTime) {
    // Water detection
    const placedObjects = this.sceneManager.placedObjects || [];
    const waterTiles = placedObjects.filter(obj => obj.type === 'water');
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
    
    if (this.state === 'walk') {
      let finalSpeed = this.speed;
      if (inWater) finalSpeed *= 0.45; // Swim slower
      this.body.velocity.x = this.direction.x * finalSpeed;
      this.body.velocity.z = this.direction.z * finalSpeed;
      this.mesh.rotation.y = Math.atan2(this.direction.x, this.direction.z);
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
