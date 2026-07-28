import * as THREE from 'three';

export class WeatherManager {
  constructor(sceneManager) {
    this.sceneManager = sceneManager;
    this.currentWeather = 'mendung';
    
    // Weather Presets
    this.presets = {
      mendung: {
        skyColor: new THREE.Color(0x98b2c6),
        fogColor: new THREE.Color(0x98b2c6),
        fogNear: 30,
        fogFar: 85,
        ambientColor: new THREE.Color(0x8899aa),
        ambientIntensity: 0.6,
        sunColor: new THREE.Color(0xdce6f0),
        sunIntensity: 0.9,
        sunScale: 1.0,
        sunVisible: true,
        starOpacity: 0.0,
        rainActive: false,
        streetLightIntensity: 0.0
      },
      hujan: {
        skyColor: new THREE.Color(0x323e4a),
        fogColor: new THREE.Color(0x323e4a),
        fogNear: 15,
        fogFar: 60,
        ambientColor: new THREE.Color(0x3a4858),
        ambientIntensity: 0.45,
        sunColor: new THREE.Color(0x607080),
        sunIntensity: 0.4,
        sunScale: 0.8,
        sunVisible: false,
        starOpacity: 0.0,
        rainActive: true,
        streetLightIntensity: 0.85
      },
      cerah: {
        skyColor: new THREE.Color(0x5cb3ff),
        fogColor: new THREE.Color(0x8fd0ff),
        fogNear: 70,
        fogFar: 220,
        ambientColor: new THREE.Color(0xffffff),
        ambientIntensity: 0.75,
        sunColor: new THREE.Color(0xfffaed),
        sunIntensity: 1.3,
        sunScale: 1.2,
        sunVisible: true,
        starOpacity: 0.0,
        rainActive: false,
        streetLightIntensity: 0.0
      },
      sore: {
        skyColor: new THREE.Color(0xfa7268),
        fogColor: new THREE.Color(0xff9e79),
        fogNear: 45,
        fogFar: 170,
        ambientColor: new THREE.Color(0xffaa77),
        ambientIntensity: 0.7,
        sunColor: new THREE.Color(0xff5522),
        sunIntensity: 1.6,
        sunScale: 3.0,
        sunVisible: true,
        starOpacity: 0.0,
        rainActive: false,
        streetLightIntensity: 0.2
      },
      malam: {
        skyColor: new THREE.Color(0x050a14),
        fogColor: new THREE.Color(0x0b1526),
        fogNear: 40,
        fogFar: 130,
        ambientColor: new THREE.Color(0x1a283c),
        ambientIntensity: 0.3,
        sunColor: new THREE.Color(0x95b4df),
        sunIntensity: 0.35,
        sunScale: 1.4,
        sunVisible: true, // Moon
        starOpacity: 1.0,
        rainActive: false,
        streetLightIntensity: 1.0
      }
    };
    
    // Alias panas to sore for backward compatibility
    this.presets.panas = this.presets.sore;
    this.currentStreetLightIntensity = 0.0;
    
    this.createRainSystem();
    this.createStarSystem();
  }
  
  createRainSystem() {
    this.rainCount = 1800;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(this.rainCount * 3);
    this.rainVelocities = new Float32Array(this.rainCount);
    
    for (let i = 0; i < this.rainCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 90;
      positions[i * 3 + 1] = Math.random() * 45;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 90;
      this.rainVelocities[i] = 30 + Math.random() * 20;
    }
    
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    
    const material = new THREE.PointsMaterial({
      color: 0x9bcdfd,
      size: 0.25,
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending
    });
    
    this.rainMesh = new THREE.Points(geometry, material);
    this.sceneManager.scene.add(this.rainMesh);
  }
  
  createStarSystem() {
    this.starCount = 1000;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(this.starCount * 3);
    
    for (let i = 0; i < this.starCount; i++) {
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0) * 0.5; // hemisphere sky dome
      const r = 110 + Math.random() * 70;
      
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = Math.abs(r * Math.cos(phi)) + 5;
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    
    this.starMaterial = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 1.3,
      transparent: true,
      opacity: 0.0
    });
    
    this.starMesh = new THREE.Points(geometry, this.starMaterial);
    this.sceneManager.scene.add(this.starMesh);
  }
  
  setWeather(weatherKey) {
    if (this.presets[weatherKey]) {
      this.currentWeather = weatherKey;
    }
  }
  
  update(dt, playerPos) {
    const targetPreset = this.presets[this.currentWeather];
    const lerpSpeed = Math.min(dt * 3.0, 1.0); // Smooth interpolation
    
    // 1. Lerp Sky Background & Fog
    this.sceneManager.scene.background.lerp(targetPreset.skyColor, lerpSpeed);
    this.sceneManager.scene.fog.color.lerp(targetPreset.fogColor, lerpSpeed);
    this.sceneManager.scene.fog.near += (targetPreset.fogNear - this.sceneManager.scene.fog.near) * lerpSpeed;
    this.sceneManager.scene.fog.far += (targetPreset.fogFar - this.sceneManager.scene.fog.far) * lerpSpeed;
    
    // 2. Lerp Ambient & Directional Lights
    this.sceneManager.ambientLight.color.lerp(targetPreset.ambientColor, lerpSpeed);
    this.sceneManager.ambientLight.intensity += (targetPreset.ambientIntensity - this.sceneManager.ambientLight.intensity) * lerpSpeed;
    
    this.sceneManager.directionalLight.color.lerp(targetPreset.sunColor, lerpSpeed);
    this.sceneManager.directionalLight.intensity += (targetPreset.sunIntensity - this.sceneManager.directionalLight.intensity) * lerpSpeed;
    
    // 3. Update Sun / Moon Mesh Scale & Color
    const currentScale = this.sceneManager.sunMesh.scale.x;
    const targetScale = targetPreset.sunScale;
    const newScale = currentScale + (targetScale - currentScale) * lerpSpeed;
    this.sceneManager.sunMesh.scale.set(newScale, newScale, newScale);
    
    if (this.currentWeather === 'malam') {
      this.sceneManager.sunMaterial.color.lerp(new THREE.Color(0xddf0ff), lerpSpeed);
    } else if (this.currentWeather === 'sore' || this.currentWeather === 'panas') {
      this.sceneManager.sunMaterial.color.lerp(new THREE.Color(0xff4411), lerpSpeed);
    } else {
      this.sceneManager.sunMaterial.color.lerp(new THREE.Color(0xffddaa), lerpSpeed);
    }
    
    this.sceneManager.sunMesh.visible = targetPreset.sunVisible;
    
    // 4. Update Street Light Intensity
    const targetLightIntensity = targetPreset.streetLightIntensity;
    this.currentStreetLightIntensity += (targetLightIntensity - this.currentStreetLightIntensity) * lerpSpeed;
    if (this.sceneManager.setStreetLightsIntensity) {
      this.sceneManager.setStreetLightsIntensity(this.currentStreetLightIntensity, playerPos);
    }
    
    // 4. Update Stars
    const targetStarOpacity = targetPreset.starOpacity;
    this.starMaterial.opacity += (targetStarOpacity - this.starMaterial.opacity) * lerpSpeed;
    if (playerPos) {
      this.starMesh.position.copy(playerPos);
    }
    
    // 5. Update Rain drops animation
    const targetRainOpacity = targetPreset.rainActive ? 0.8 : 0.0;
    this.rainMesh.material.opacity += (targetRainOpacity - this.rainMesh.material.opacity) * lerpSpeed;
    
    if (this.rainMesh.material.opacity > 0.01 && playerPos) {
      this.rainMesh.position.x = playerPos.x;
      this.rainMesh.position.z = playerPos.z;
      
      const positions = this.rainMesh.geometry.attributes.position.array;
      for (let i = 0; i < this.rainCount; i++) {
        positions[i * 3 + 1] -= this.rainVelocities[i] * dt;
        if (positions[i * 3 + 1] < 0) {
          positions[i * 3 + 1] = 45;
          positions[i * 3] = (Math.random() - 0.5) * 90;
          positions[i * 3 + 2] = (Math.random() - 0.5) * 90;
        }
      }
      this.rainMesh.geometry.attributes.position.needsUpdate = true;
    }

    // 6. Update Wet Road & Sidewalk effects (Dampen/Darken color instead of shiny reflections)
    if (this.sceneManager.roadMaterial) {
      const targetColor = (this.currentWeather === 'hujan') ? new THREE.Color(0x777777) : new THREE.Color(0xffffff);
      const targetRoughness = (this.currentWeather === 'hujan') ? 0.8 : 0.85;
      this.sceneManager.roadMaterial.color.lerp(targetColor, lerpSpeed);
      this.sceneManager.roadMaterial.roughness += (targetRoughness - this.sceneManager.roadMaterial.roughness) * lerpSpeed;
      this.sceneManager.roadMaterial.metalness += (0.05 - this.sceneManager.roadMaterial.metalness) * lerpSpeed;
    }
    if (this.sceneManager.sidewalkMaterial) {
      const targetColor = (this.currentWeather === 'hujan') ? new THREE.Color(0x999999) : new THREE.Color(0xffffff);
      const targetRoughness = (this.currentWeather === 'hujan') ? 0.75 : 0.8;
      this.sceneManager.sidewalkMaterial.color.lerp(targetColor, lerpSpeed);
      this.sceneManager.sidewalkMaterial.roughness += (targetRoughness - this.sceneManager.sidewalkMaterial.roughness) * lerpSpeed;
      this.sceneManager.sidewalkMaterial.metalness += (0.05 - this.sceneManager.sidewalkMaterial.metalness) * lerpSpeed;
    }

    // 7. Lerp Puddles Opacity (actual shiny water puddles)
    if (this.sceneManager.puddleMaterial) {
      const targetOpacity = (this.currentWeather === 'hujan') ? 0.75 : 0.0;
      this.sceneManager.puddleMaterial.opacity += (targetOpacity - this.sceneManager.puddleMaterial.opacity) * lerpSpeed;
    }
  }
}
