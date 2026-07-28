import * as THREE from 'three';
import * as CANNON from 'cannon-es';

// ─── Player character height breakdown ──────────────────────────────────────
// The player body uses a simple CANNON.Sphere as the collider.
// Visual model sits on top: feet at y=0, head at y=3.4 relative to the group.
// The physics body position (body.position) represents the BOTTOM of the collider (feet).
// We offset the mesh by +HALF_H so the mesh feet align with body bottom.
//
//  body.position.y = foot level (ground contact)
//  mesh.position.y = body.position.y  (feet at body origin)
//
// Physics: one sphere at y = SPHERE_R above foot level.
// ─────────────────────────────────────────────────────────────────────────────

const SPHERE_R = 0.5;   // radius of physics sphere
const FOOT_OFFSET = 0;  // mesh.position = body.position (body origin IS the feet)

export class Player {
  constructor(sceneManager, physicsManager, cameraManager, controlsManager) {
    this.sceneManager = sceneManager;
    this.physicsManager = physicsManager;
    this.cameraManager = cameraManager;
    this.controlsManager = controlsManager;
    
    this.speed = 7;
    this.sprintMultiplier = 1.8;
    this.jumpForce = 10;
    
    this.canJump = false;
    this.animTime = 0;
    this.state = 'idle';
    
    // Reusable temp vectors (avoid GC pressure per frame)
    this._moveDir = new THREE.Vector3();
    this._euler = new THREE.Euler(0, 0, 0, 'YXZ');
    
    this.createModel();
    this.createPhysicsBody();
  }
  
  createModel() {
    this.mesh = new THREE.Group();
    
    // Material (Pastel blocky style) - MeshLambertMaterial is extremely cheap and high performance
    const skin  = new THREE.MeshLambertMaterial({ color: 0xffe0bd });
    const shirt = new THREE.MeshLambertMaterial({ color: 0x88ccff });
    const pants = new THREE.MeshLambertMaterial({ color: 0x5577cc });
    
    // ── Build body parts (feet at y=0, head top at ~3.8) ──
    // Legs  : 0.0 → 1.5
    // Torso : 1.5 → 3.0
    // Head  : 3.0 → 3.8
    
    // Left Leg
    this.leftLeg  = new THREE.Group();
    this.leftLeg.position.set( 0.28, 1.5, 0);
    this.leftLeg.add(this._box( 0.45, 1.5, 0.45, pants, 0, -0.75, 0));
    
    // Right Leg
    this.rightLeg = new THREE.Group();
    this.rightLeg.position.set(-0.28, 1.5, 0);
    this.rightLeg.add(this._box( 0.45, 1.5, 0.45, pants, 0, -0.75, 0));
    
    // Torso
    this.torso = this._box(1.1, 1.5, 0.55, shirt, 0, 2.25, 0);
    
    // Left Arm
    this.leftArm  = new THREE.Group();
    this.leftArm.position.set( 0.8, 3.0, 0);
    this.leftArm.add(this._box(0.38, 1.4, 0.38, skin, 0, -0.7, 0));
    
    // Right Arm
    this.rightArm = new THREE.Group();
    this.rightArm.position.set(-0.8, 3.0, 0);
    this.rightArm.add(this._box(0.38, 1.4, 0.38, skin, 0, -0.7, 0));
    
    // Head
    this.head = this._box(0.85, 0.85, 0.85, skin, 0, 3.42, 0);
    
    this.mesh.add(this.leftLeg, this.rightLeg, this.torso, this.leftArm, this.rightArm, this.head);
    
    // All body parts cast shadows
    this.leftLeg.children[0].castShadow = true;
    this.rightLeg.children[0].castShadow = true;
    this.leftArm.children[0].castShadow = true;
    this.rightArm.children[0].castShadow = true;
    this.torso.castShadow = true;
    this.head.castShadow = true;
    
    this.mesh.scale.set(0.5, 0.5, 0.5); // Shrink to human proportions
    
    this.sceneManager.scene.add(this.mesh);
  }
  
  // Helper to create a positioned box mesh
  _box(w, h, d, mat, px, py, pz) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(px, py, pz);
    return m;
  }
  
  createPhysicsBody() {
    // Single sphere collider — much cheaper than Cylinder for Cannon-es.
    // The sphere center sits at body.position.y + SPHERE_R.
    // We set body position so the sphere bottom (= ground contact) is at foot level.
    // body.position = desired foot position → sphere center = body.position + SPHERE_R
    this.body = new CANNON.Body({
      mass: 60,
      fixedRotation: true,
      linearDamping: 0.99, // Very high damping — stops instantly when no input
      material: this.physicsManager.defaultMaterial,
      allowSleep: false, // Player must never sleep
    });
    
    const sphereShape = new CANNON.Sphere(SPHERE_R);
    // Offset sphere up so its bottom aligns with body.position (foot level)
    this.body.addShape(sphereShape, new CANNON.Vec3(0, SPHERE_R, 0));
    
    // Spawn above ground
    this.body.position.set(0, 3, 0);
    
    this.physicsManager.addBody(this.body);
    
    // Ground detection via collision normal
    this.body.addEventListener('collide', (evt) => {
      const contact = evt.contact;
      if (!contact) return;
      // If the Y normal is significant, we hit a horizontal surface (ground)
      if (Math.abs(contact.ni.y) > 0.5) {
        this.canJump = true;
      }
    });
  }
  
  update(deltaTime) {
    const input = this.controlsManager.getMovementVector();
    const moving = (input.x !== 0 || input.z !== 0);
    const sprinting = this.controlsManager.keys.sprint;
    const speed = sprinting ? this.speed * this.sprintMultiplier : this.speed;
    
    this.state = moving ? (sprinting ? 'run' : 'walk') : 'idle';
    
    if (moving) {
      // Compute world-space move direction relative to camera yaw
      this._euler.set(0, this.cameraManager.theta + Math.PI, 0);
      this._moveDir.set(input.x, 0, input.z).applyEuler(this._euler).normalize();
      
      this.body.velocity.x = this._moveDir.x * speed;
      this.body.velocity.z = this._moveDir.z * speed;
      
      // Smooth rotate mesh toward movement direction
      const targetAngle = Math.atan2(this._moveDir.x, this._moveDir.z);
      let diff = targetAngle - this.mesh.rotation.y;
      // Shortest path
      while (diff >  Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.mesh.rotation.y += diff * 0.2;
    } else {
      // Dampen horizontal velocity when no input
      this.body.velocity.x *= 0.8;
      this.body.velocity.z *= 0.8;
    }
    
    // Jump
    if (this.controlsManager.keys.jump && this.canJump) {
      this.body.velocity.y = this.jumpForce;
      this.canJump = false;
      this.controlsManager.keys.jump = false;
    }
    
    // ── SYNC MESH ──
    // body.position is the foot (ground contact) level.
    // Mesh was built with feet at y=0 local, so just copy body.position directly.
    this.mesh.position.x = this.body.position.x;
    this.mesh.position.y = this.body.position.y; // feet align with body
    this.mesh.position.z = this.body.position.z;
    
    this.updateAnimation(deltaTime, moving);
  }
  
  updateAnimation(dt, moving) {
    const inAir = Math.abs(this.body.velocity.y) > 1.0;
    
    if (inAir) {
      this.leftArm.rotation.x  = -0.8;
      this.rightArm.rotation.x = -0.8;
      this.leftLeg.rotation.x  = 0.3;
      this.rightLeg.rotation.x = -0.3;
      return;
    }
    
    if (moving) {
      const spd = this.state === 'run' ? 12 : 8;
      this.animTime += dt * spd;
      const s = Math.sin(this.animTime) * 0.55;
      this.leftArm.rotation.x  =  s;
      this.rightArm.rotation.x = -s;
      this.leftLeg.rotation.x  = -s;
      this.rightLeg.rotation.x =  s;
    } else {
      // Idle: very subtle breathing sway
      this.animTime += dt;
      const b = Math.sin(this.animTime * 1.5) * 0.03;
      this.leftArm.rotation.x  =  b;
      this.rightArm.rotation.x = -b;
      this.leftLeg.rotation.x  = 0;
      this.rightLeg.rotation.x = 0;
    }
  }
}
