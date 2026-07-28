import * as THREE from 'three';
import { WeatherManager } from './weather.js';

export class SceneManager {
  constructor() {
    this.container = document.getElementById('game-container');
    
    this.scene = new THREE.Scene();
    
    // Default sky color (Mendung baseline)
    const skyColor = new THREE.Color(0x98b2c6);
    this.scene.background = skyColor;
    
    // Fog
    this.scene.fog = new THREE.Fog(skyColor, 30, 85);
    
    // Renderer — Enable antialias and respect device pixel ratio for sharp graphics
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // High-res without breaking GPUs
    
    // Shadows: Re-enabled with optimizations (1024x1024 map, tight frustum)
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    
    this.container.appendChild(this.renderer.domElement);
    
    this.setupLights();
    
    // Weather Manager & Building bounds
    this.buildingBoxes = []; // Populated by CityGenerator for camera collision
    this.interactables = []; // Populated by CityGenerator for interaction (e.g. sitting benches)
    
    // Environment & Weather System
    this.weatherManager = new WeatherManager(this);
    
    window.addEventListener('resize', this.onWindowResize.bind(this));
  }
  
  setupLights() {
    // Ambient light
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(this.ambientLight);
    
    // Directional light (sun / moon)
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
    const sunGeo = new THREE.SphereGeometry(24, 16, 16);
    this.sunMaterial = new THREE.MeshBasicMaterial({ color: 0xffddaa, fog: false });
    this.sunMesh = new THREE.Mesh(sunGeo, this.sunMaterial);
    this.scene.add(this.sunMesh);
    
    // Visual Moon Mesh (Round shape, voxel-style extrusion)
    const moonShape = new THREE.Shape();
    moonShape.absarc(0, 0, 16, 0, Math.PI * 2, false);
    
    const extrudeSettings = { depth: 6, bevelEnabled: false };
    const moonGeo = new THREE.ExtrudeGeometry(moonShape, extrudeSettings);
    moonGeo.center(); // Center geometry pivot
    
    this.moonMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
    this.moonMesh = new THREE.Mesh(moonGeo, this.moonMaterial);
    this.scene.add(this.moonMesh);
    
    // Sun offset
    this.sunOffset = new THREE.Vector3(30, 60, 30);

    // Street lights material & light pool
    this.streetLightBulbMaterial = new THREE.MeshBasicMaterial({ color: 0x333333 });
    this.streetLightConeMaterial = new THREE.MeshBasicMaterial({
      color: 0xfff0aa,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });
    
    this.streetLightConeMaterial.onBeforeCompile = (shader) => {
      // Pass local position from vertex shader to fragment shader
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `#include <common>
         varying vec3 vLocalPosition;`
      );
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         vLocalPosition = position;`
      );
      
      // Add varying and calculate vertical fade in fragment shader
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
         varying vec3 vLocalPosition;`
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        `float fade = 1.0 + (vLocalPosition.y / 4.3);
         fade = clamp(fade, 0.0, 1.0);
         float smoothFade = pow(fade, 2.0);
         vec4 diffuseColor = vec4( diffuse, opacity * smoothFade );`
      );
    };
    this.streetLightPositions = [];
    this.streetLightPool = [];
    for (let i = 0; i < 20; i++) {
      const pLight = new THREE.PointLight(0xfff0b3, 0, 32, 1.4);
      this.scene.add(pLight);
      this.streetLightPool.push(pLight);
    }

    // Building Window Glass Material
    this.windowMaterial = new THREE.MeshBasicMaterial({ color: 0x25303b });
  }
  
  setStreetLightsIntensity(intensity, playerPos) {
    // 1. Bulb glow material update (Super bright yellow glow) and cone opacity update
    if (intensity < 0.05) {
      this.streetLightBulbMaterial.color.setHex(0x333333);
      this.windowMaterial.color.setHex(0x25303b); // Dark window glass during day
      if (this.streetLightConeMaterial) {
        this.streetLightConeMaterial.opacity = 0.0;
      }
    } else {
      const rBulb = Math.min(1.0, 0.3 + intensity * 0.7);
      const gBulb = Math.min(1.0, 0.3 + intensity * 0.65);
      const bBulb = Math.min(1.0, 0.3 + intensity * 0.35);
      this.streetLightBulbMaterial.color.setRGB(rBulb, gBulb, bBulb);

      if (this.streetLightConeMaterial) {
        this.streetLightConeMaterial.opacity = intensity * 0.28; // boosted brightness near top
      }

      // Building windows glow brightly at night and during rain
      const rWin = Math.min(1.0, 0.15 + intensity * 0.83);
      const gWin = Math.min(1.0, 0.19 + intensity * 0.76);
      const bWin = Math.min(1.0, 0.23 + intensity * 0.32);
      this.windowMaterial.color.setRGB(rWin, gWin, bWin);
    }

    // 2. Point lights pool positioning (High intensity street lights)
    if (intensity <= 0.02 || !playerPos || this.streetLightPositions.length === 0) {
      for (const pLight of this.streetLightPool) {
        pLight.intensity = 0;
      }
      return;
    }

    // Find closest street light positions to player
    const sorted = [...this.streetLightPositions].sort((a, b) => {
      return a.distanceToSquared(playerPos) - b.distanceToSquared(playerPos);
    });

    for (let i = 0; i < this.streetLightPool.length; i++) {
      const pLight = this.streetLightPool[i];
      if (i < sorted.length) {
        pLight.position.copy(sorted[i]);
        pLight.intensity = 6.5 * intensity;
      } else {
        pLight.intensity = 0;
      }
    }
  }
  
  updateSun(playerPos) {
    // Keep sun light following player so shadows are always sharp around them
    this.directionalLight.position.copy(playerPos).add(this.sunOffset);
    this.directionalLight.target.position.copy(playerPos);
    
    // Move visual sun / moon meshes to light direction but MUCH farther away (e.g. 350 meters)
    // so they are always rendered behind all buildings and objects
    const sunDir = this.sunOffset.clone().normalize();
    const targetPos = playerPos.clone().addScaledVector(sunDir, 350);
    
    this.sunMesh.position.copy(targetPos);
    if (this.moonMesh) {
      this.moonMesh.position.copy(targetPos);
      this.moonMesh.lookAt(playerPos);
      this.moonMesh.rotateZ(Math.PI / 6); // tilt crescent moon elegantly
    }
  }

  updateWeather(dt, playerPos) {
    if (this.weatherManager) {
      this.weatherManager.update(dt, playerPos);
    }
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
