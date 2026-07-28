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
        streetLightIntensity: 0.0,
        cloudColor: new THREE.Color(0xdce5ed),
        cloudOpacity: 0.85,
        sunOffset: new THREE.Vector3(30, 60, 30)
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
        streetLightIntensity: 0.85,
        cloudColor: new THREE.Color(0x4b5563),
        cloudOpacity: 0.95,
        sunOffset: new THREE.Vector3(30, 60, 30)
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
        streetLightIntensity: 0.0,
        cloudColor: new THREE.Color(0xffffff),
        cloudOpacity: 0.85,
        sunOffset: new THREE.Vector3(30, 60, 30)
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
        streetLightIntensity: 0.2,
        cloudColor: new THREE.Color(0xffaa88),
        cloudOpacity: 0.9,
        sunOffset: new THREE.Vector3(55, 12, 10)
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
        sunVisible: false,
        moonVisible: true,
        starOpacity: 1.0,
        rainActive: false,
        streetLightIntensity: 1.0,
        cloudColor: new THREE.Color(0x0b1424),
        cloudOpacity: 0.45,
        sunOffset: new THREE.Vector3(55, 24, 10)
      }
    };
    
    // Alias panas to sore for backward compatibility
    this.presets.panas = this.presets.sore;
    this.currentStreetLightIntensity = 0.0;
    
    // Lightning System
    this.lightningActive = false;
    this.lightningTime = 0.0;
    this.lightningFlash = 0.0;
    this.lightningTimer = 4.0 + Math.random() * 4.0;
    
    this.createRainSystem();
    this.createStarSystem();
    this.createCloudSystem();
    this.createLightningBolt();
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

  createCloudSystem() {
    this.clouds = [];
    this.cloudMaterial = new THREE.MeshLambertMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.85,
      flatShading: true
    });
    
    const boundLimit = 150;
    const numClouds = 16;
    
    for (let c = 0; c < numClouds; c++) {
      const cloudGroup = new THREE.Group();
      
      // Random cloud boxy shape (made of 3-5 overlapping blocks)
      const numBlocks = 3 + Math.floor(Math.random() * 3);
      for (let i = 0; i < numBlocks; i++) {
        const w = 8 + Math.random() * 12;
        const h = 3 + Math.random() * 3;
        const d = 8 + Math.random() * 12;
        
        const geo = new THREE.BoxGeometry(w, h, d);
        const mesh = new THREE.Mesh(geo, this.cloudMaterial);
        
        // Offset blocks within the group to look natural & fluffy/boxy
        mesh.position.set(
          (Math.random() - 0.5) * 10,
          (Math.random() - 0.5) * 1.5,
          (Math.random() - 0.5) * 10
        );
        
        mesh.castShadow = true;
        mesh.receiveShadow = false;
        cloudGroup.add(mesh);
      }
      
      // Spread them across the sky
      const px = (Math.random() - 0.5) * boundLimit * 2;
      const py = 35 + Math.random() * 15; // altitude 35 to 50
      const pz = (Math.random() - 0.5) * boundLimit * 2;
      
      cloudGroup.position.set(px, py, pz);
      
      // Keep track of speed for movement
      cloudGroup.userData = {
        speedX: 1.0 + Math.random() * 1.5,
        speedZ: (Math.random() - 0.5) * 0.4
      };
      
      this.sceneManager.scene.add(cloudGroup);
      this.clouds.push(cloudGroup);
    }
  }

  createLightningBolt() {
    this.lightningBolt = new THREE.Group();
    const boltMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
    
    // Define a 3D zig-zag shape using connected boxes
    const configs = [
      { w: 0.8, h: 14, d: 0.8, x: 2,  y: 44, z: 0,   rotZ: -0.2 },
      { w: 0.8, h: 14, d: 0.8, x: -1, y: 32, z: 1,   rotZ: 0.3,  rotX: 0.1 },
      { w: 0.8, h: 14, d: 0.8, x: 2,  y: 20, z: -1,  rotZ: -0.2, rotX: -0.1 },
      { w: 0.8, h: 18, d: 0.8, x: 0,  y: 7,  z: 0,   rotZ: 0.1 }
    ];
    
    for (const cfg of configs) {
      const box = new THREE.Mesh(new THREE.BoxGeometry(cfg.w, cfg.h, cfg.d), boltMat);
      box.position.set(cfg.x, cfg.y, cfg.z);
      if (cfg.rotZ) box.rotation.z = cfg.rotZ;
      if (cfg.rotX) box.rotation.x = cfg.rotX;
      this.lightningBolt.add(box);
    }
    
    this.lightningBolt.visible = false;
    this.sceneManager.scene.add(this.lightningBolt);
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
    if (this.lightningFlash > 0.0) {
      const flashColor = new THREE.Color(0xdceaff);
      this.sceneManager.scene.background.lerp(flashColor, this.lightningFlash * 0.9);
      this.sceneManager.scene.fog.color.lerp(flashColor, this.lightningFlash * 0.9);
    }
    
    this.sceneManager.scene.fog.near += (targetPreset.fogNear - this.sceneManager.scene.fog.near) * lerpSpeed;
    this.sceneManager.scene.fog.far += (targetPreset.fogFar - this.sceneManager.scene.fog.far) * lerpSpeed;
    
    // 2. Lerp Ambient & Directional Lights
    this.sceneManager.ambientLight.color.lerp(targetPreset.ambientColor, lerpSpeed);
    let curAmbientInt = this.sceneManager.ambientLight.intensity;
    let nextAmbientInt = curAmbientInt + (targetPreset.ambientIntensity - curAmbientInt) * lerpSpeed;
    if (this.lightningFlash > 0.0) {
      nextAmbientInt = THREE.MathUtils.lerp(nextAmbientInt, 1.8, this.lightningFlash);
    }
    this.sceneManager.ambientLight.intensity = nextAmbientInt;
    
    this.sceneManager.directionalLight.color.lerp(targetPreset.sunColor, lerpSpeed);
    let curSunInt = this.sceneManager.directionalLight.intensity;
    let nextSunInt = curSunInt + (targetPreset.sunIntensity - curSunInt) * lerpSpeed;
    if (this.lightningFlash > 0.0) {
      nextSunInt = THREE.MathUtils.lerp(nextSunInt, 2.2, this.lightningFlash);
      this.sceneManager.directionalLight.color.lerp(new THREE.Color(0xffffff), this.lightningFlash);
    }
    this.sceneManager.directionalLight.intensity = nextSunInt;
    
    // Lerp Sun Offset (low sunset angle / moon position)
    if (this.sceneManager.sunOffset && targetPreset.sunOffset) {
      this.sceneManager.sunOffset.lerp(targetPreset.sunOffset, lerpSpeed);
    }
    
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
    
    this.sceneManager.sunMesh.visible = !!targetPreset.sunVisible;
    if (this.sceneManager.moonMesh) {
      this.sceneManager.moonMesh.visible = !!targetPreset.moonVisible;
    }
    
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

    // 8. Lerp Clouds color and opacity
    if (this.cloudMaterial && targetPreset.cloudColor) {
      this.cloudMaterial.color.lerp(targetPreset.cloudColor, lerpSpeed);
      this.cloudMaterial.opacity += (targetPreset.cloudOpacity - this.cloudMaterial.opacity) * lerpSpeed;
    }

    // 9. Move Clouds and wrap around bounds
    const boundLimit = 150;
    if (this.clouds) {
      for (const cloud of this.clouds) {
        cloud.position.x += cloud.userData.speedX * dt;
        cloud.position.z += cloud.userData.speedZ * dt;
        
        // Wrap X
        if (cloud.position.x > boundLimit) {
          cloud.position.x = -boundLimit;
          cloud.position.z = (Math.random() - 0.5) * boundLimit * 2;
        }
        // Wrap Z
        if (cloud.position.z > boundLimit) {
          cloud.position.z = -boundLimit;
        } else if (cloud.position.z < -boundLimit) {
          cloud.position.z = boundLimit;
        }
      }
    }

    // 10. Update Lightning Flash & Bolt animation
    if (this.lightningActive) {
      this.lightningTime += dt;
      
      let flashIntensity = 0;
      if (this.lightningTime < 0.15) {
        // Flash 1: steep rise and fall
        flashIntensity = Math.sin((this.lightningTime / 0.15) * Math.PI) * 1.0;
      } else if (this.lightningTime < 0.55) {
        // Flash 2: secondary slower decay
        const t = (this.lightningTime - 0.15) / 0.4;
        flashIntensity = (1.0 - t) * 0.85;
      } else {
        this.lightningActive = false;
        flashIntensity = 0.0;
        if (this.lightningBolt) this.lightningBolt.visible = false;
      }
      this.lightningFlash = flashIntensity;
      
      // Keep lightning bolt visible for the first part of the double flash
      if (this.lightningBolt) {
        this.lightningBolt.visible = (this.lightningTime < 0.3);
      }
    } else {
      this.lightningFlash = 0.0;
      if (this.lightningBolt && this.lightningBolt.visible) {
        this.lightningBolt.visible = false;
      }
      
      // Trigger next random strike during rain
      if (this.currentWeather === 'hujan') {
        this.lightningTimer -= dt;
        if (this.lightningTimer <= 0) {
          this.lightningActive = true;
          this.lightningTime = 0.0;
          this.lightningTimer = 5.0 + Math.random() * 7.0; // strike every 5-12 seconds
          
          // Position the lightning bolt group in front of the camera view
          if (this.lightningBolt && playerPos && this.sceneManager.camera && this.sceneManager.camera.camera) {
            const camDir = new THREE.Vector3();
            this.sceneManager.camera.camera.getWorldDirection(camDir);
            
            // Strike 35 to 70 meters ahead in the sky
            const dist = 35 + Math.random() * 35;
            const bx = playerPos.x + camDir.x * dist + (Math.random() - 0.5) * 40;
            const bz = playerPos.z + camDir.z * dist + (Math.random() - 0.5) * 40;
            
            this.lightningBolt.position.set(bx, 0, bz);
            this.lightningBolt.scale.set(1.0 + Math.random() * 0.5, 0.8 + Math.random() * 0.4, 1.0 + Math.random() * 0.5);
            this.lightningBolt.rotation.y = Math.random() * Math.PI * 2;
            this.lightningBolt.visible = true;
          }
        }
      }
    }

    // Force disable lightning bolt if weather changes away from rain
    if (this.currentWeather !== 'hujan' && this.lightningBolt && this.lightningBolt.visible) {
      this.lightningBolt.visible = false;
      this.lightningActive = false;
      this.lightningFlash = 0.0;
    }
  }
}
