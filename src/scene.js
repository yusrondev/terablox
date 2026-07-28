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
    
    // Shadows: DISABLED completely for massive performance boost to achieve 90-120 FPS
    this.renderer.shadowMap.enabled = false;
    
    this.container.appendChild(this.renderer.domElement);
    
    this.setupLights();
    
    window.addEventListener('resize', this.onWindowResize.bind(this));
  }
  
  setupLights() {
    // Ambient light — bright enough so colors pop beautifully without shadows
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.95);
    this.scene.add(ambientLight);
    
    // Directional light (sun)
    this.directionalLight = new THREE.DirectionalLight(0xfff0cc, 0.45);
    this.directionalLight.position.set(30, 60, 30);
    this.directionalLight.castShadow = false;
    this.scene.add(this.directionalLight);
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
