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
    
    // SAPBroadphase is much faster than NaiveBroadphase for city environments
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
  }
  
  addBody(body) {
    this.world.addBody(body);
  }
  
  step(deltaTime) {
    // Smooth timestep for high refresh rate monitors (120Hz, 144Hz, 60Hz)
    this.world.step(1 / 60, deltaTime, 5);
  }
}
