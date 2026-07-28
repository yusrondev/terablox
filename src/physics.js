import * as CANNON from 'cannon-es';

export class PhysicsManager {
  constructor() {
    this.world = new CANNON.World();
    this.world.gravity.set(0, -20, 0); // Stronger gravity = snappier feel, less float
    this.world.allowSleep = true; // Bodies that stop moving go to sleep (huge perf win)
    
    // Default material
    this.defaultMaterial = new CANNON.Material('default');
    
    const defaultContactMaterial = new CANNON.ContactMaterial(
      this.defaultMaterial,
      this.defaultMaterial,
      {
        friction: 0.0,
        restitution: 0.0,
      }
    );
    this.world.addContactMaterial(defaultContactMaterial);
    this.world.defaultContactMaterial = defaultContactMaterial;
    
    // SAP Broadphase is fastest for many mostly-static objects
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.world.broadphase.axisIndex = 1; // Sweep along Y axis
  }
  
  addBody(body) {
    this.world.addBody(body);
  }
  
  step(deltaTime) {
    // Fixed timestep: always step at 60Hz regardless of render rate
    this.world.fixedStep(1 / 60, deltaTime);
  }
}
