import * as THREE from 'three';

export class SceneManager {
  constructor() {
    this.container = document.getElementById('game-container');
    
    this.scene = new THREE.Scene();
    
    // Pastel sky color
    const skyColor = new THREE.Color(0xb8d8ff);
    this.scene.background = skyColor;
    
    // Fog — shorter distance to avoid rendering distant objects (performance boost)
    this.scene.fog = new THREE.Fog(skyColor, 30, 80);
    
        // Renderer — antialias OFF for performance, pixel ratio capped at 1
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(1); // Fixed at 1 for max performance
    
    // Shadows: Re-enabled with optimizations (1024x1024 map, tight frustum)
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    
    this.container.appendChild(this.renderer.domElement);
    
    this.setupLights();
    
    window.addEventListener('resize', this.onWindowResize.bind(this));
  }
  
  setupLights() {
    // Ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);
    
    // Directional light (sun)
    this.directionalLight = new THREE.DirectionalLight(0xfff0cc, 1.2);
    this.directionalLight.castShadow = true;
    
    // Tight shadow camera for high performance & crisp shadows near player
    const d = 25;
    this.directionalLight.shadow.mapSize.width = 1024;
    this.directionalLight.shadow.mapSize.height = 1024;
    this.directionalLight.shadow.camera.near = 0.5;
    this.directionalLight.shadow.camera.far = 100;
    this.directionalLight.shadow.camera.left = -d;
    this.directionalLight.shadow.camera.right = d;
    this.directionalLight.shadow.camera.top = d;
    this.directionalLight.shadow.camera.bottom = -d;
    this.directionalLight.shadow.bias = -0.001; // Reduce acne
    
    this.scene.add(this.directionalLight);
    this.scene.add(this.directionalLight.target);
    
    // Visual Sun Mesh
    const sunGeo = new THREE.SphereGeometry(4, 16, 16);
    const sunMat = new THREE.MeshBasicMaterial({ color: 0xffddaa });
    this.sunMesh = new THREE.Mesh(sunGeo, sunMat);
    this.scene.add(this.sunMesh);
    
    // Sun angle
    this.sunOffset = new THREE.Vector3(30, 60, 30);
  }
  
  updateSun(playerPos) {
    // Keep sun light following player so shadows are always sharp around them
    this.directionalLight.position.copy(playerPos).add(this.sunOffset);
    this.directionalLight.target.position.copy(playerPos);
    
    // Move visual sun mesh to light position
    this.sunMesh.position.copy(this.directionalLight.position);
  }
  
  setCamera(camera) {
    this.camera = camera;
  }
  
  onWindowResize() {
    if (this.camera && this.camera.camera) {
      this.camera.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.camera.updateProjectionMatrix();
    }
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
  
  render() {
    if (this.camera && this.camera.camera) {
      this.renderer.render(this.scene, this.camera.camera);
    }
  }
}
