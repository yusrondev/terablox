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
    
    // Flat unlit materials for GTA V style minimap (immune to night & weather)
    this.flatMinimapGroundMat = new THREE.MeshBasicMaterial({ color: 0x181c22 });
    this.flatMinimapRoadMat   = new THREE.MeshBasicMaterial({ color: 0x6e7a89 });
    // IMPORTANT: InstancedMesh requires its own material compilation instance!
    this.flatMinimapRoadMatInstanced = new THREE.MeshBasicMaterial({ color: 0x6e7a89 });
    
    window.addEventListener('resize', this.onWindowResize.bind(this));

    // Graphics Settings Auto Detection / Load
    let savedLevel = localStorage.getItem('graphicsLevel');
    if (!savedLevel) {
      savedLevel = this.detectHardwareGraphicsLevel();
      localStorage.setItem('graphicsLevel', savedLevel);
      console.log(`Auto-detected hardware graphics level: ${savedLevel}`);
    } else {
      console.log(`Loaded saved graphics level: ${savedLevel}`);
    }
    this.setGraphicsLevel(savedLevel);
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
  
  detectHardwareGraphicsLevel() {
    // Detect CPU logical cores
    const cores = navigator.hardwareConcurrency || 4;
    
    // Get WebGL GPU information
    const gl = this.renderer.getContext();
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    let gpu = '';
    if (debugInfo) {
      gpu = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || '';
    }
    gpu = gpu.toLowerCase();
    
    // Mobile device detection (using userAgent and touch support)
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 0);

    console.log(`[Hardware Detection] CPU Cores: ${cores}, GPU: "${gpu}", Mobile: ${isMobile}`);

    // Known list of lower-performance mobile / integrated GPUs
    const lowEndGPUs = [
      'intel hd', 'intel uhd', 'intel iris', 'amd radeon r2', 'amd radeon r3', 'amd radeon r4', 
      'amd radeon r5', 'mali-t', 'mali-g31', 'mali-g51', 'mali-g52', 'adreno (tm) 3', 'adreno (tm) 5',
      'powervr', 'videocore'
    ];
    const isLowEndGPU = lowEndGPUs.some(name => gpu.includes(name));

    // High performance desktop GPUs
    const highEndGPUs = [
      'rtx', 'gtx 10', 'gtx 16', 'gtx 9', 'radeon rx', 'apple m1', 'apple m2', 'apple m3', 'apple m4'
    ];
    const isHighEndGPU = highEndGPUs.some(name => gpu.includes(name));

    if (isMobile) {
      // For mobile devices, default to low to preserve battery/prevent heat,
      // unless it's a newer chip with 8+ cores and a decent GPU
      if (cores >= 8 && (gpu.includes('adreno (tm) 6') || gpu.includes('adreno (tm) 7') || gpu.includes('mali-g7') || gpu.includes('apple gpu'))) {
        return 'med';
      }
      return 'low';
    }

    if (isLowEndGPU || cores < 4) {
      return 'low';
    }

    if (isHighEndGPU || cores >= 8) {
      return 'high';
    }

    return 'med'; // default fallback
  }

  applyCameraGraphicsSettings() {
    if (this.camera && this.camera.camera) {
      const farPlane = (this.graphicsLevel === 'low') ? 150 : (this.graphicsLevel === 'med' ? 250 : 500);
      this.camera.camera.far = farPlane;
      this.camera.camera.updateProjectionMatrix();
    }
  }

  setGraphicsLevel(level) {
    this.graphicsLevel = level;
    localStorage.setItem('graphicsLevel', level);
    
    const hasShadows = (level === 'high');
    
    // 1. Toggle shadows on renderer
    this.renderer.shadowMap.enabled = hasShadows;
    
    // 2. Set shadow map type
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    // 3. Configure directional light shadows
    if (this.directionalLight) {
      this.directionalLight.castShadow = hasShadows;
      
      if (hasShadows) {
        const shadowSize = 1024; // Optimized from 2048 to prevent GPU lag
        if (this.directionalLight.shadow.mapSize.width !== shadowSize) {
          this.directionalLight.shadow.mapSize.width = shadowSize;
          this.directionalLight.shadow.mapSize.height = shadowSize;
          
          // Re-create shadow map buffer in Three.js
          if (this.directionalLight.shadow.map) {
            this.directionalLight.shadow.map.dispose();
            this.directionalLight.shadow.map = null;
          }
        }
      }
    }

    // 4. Set resolution scale (DPR)
    let pixelRatioLimit = 1.0;
    if (level === 'low') {
      pixelRatioLimit = 0.7;
    } else if (level === 'med') {
      pixelRatioLimit = 1.0;
    } else {
      pixelRatioLimit = 1.35; // Optimized from 2.0 to avoid mobile GPU overhead
    }
    const targetPixelRatio = Math.min(window.devicePixelRatio, pixelRatioLimit);
    this.renderer.setPixelRatio(targetPixelRatio);

    // 5. Apply camera specific changes
    this.applyCameraGraphicsSettings();

    // 6. Traverse and apply shadow states to all meshes
    this.scene.traverse(node => {
      if (node.isMesh || node.isInstancedMesh) {
        if (node.name === 'light_cone') {
          node.castShadow = false;
          node.receiveShadow = false;
        } else {
          node.castShadow = hasShadows;
          node.receiveShadow = hasShadows;
        }
        if (node.material) {
          node.material.needsUpdate = true;
        }
      }
    });

    this.renderer.shadowMap.needsUpdate = true;
  }

  setCamera(camera) {
    this.camera = camera;
    this.applyCameraGraphicsSettings();
  }
  
  onWindowResize() {
    if (this.camera && this.camera.camera) {
      this.camera.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.camera.updateProjectionMatrix();
    }
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
  
  performOcclusionCulling(camera, playerPos, activeTab) {
    if (!camera || !camera.camera) return;
    
    const cam = camera.camera;
    const cameraPos = cam.position;
    
    // 1. Setup Frustum
    const frustum = new THREE.Frustum();
    const projScreenMatrix = new THREE.Matrix4();
    projScreenMatrix.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projScreenMatrix);
    
    // 2. Set max render distance based on graphics level
    let maxDist = 250;
    if (this.graphicsLevel === 'low') maxDist = 120;
    else if (this.graphicsLevel === 'med') maxDist = 220;
    else maxDist = 400;
    
    // In studio editor tabs, we want a wider visibility
    const isEditorActive = activeTab && activeTab !== 'play';
    if (isEditorActive) {
      maxDist = Math.max(maxDist, 300);
    }
    
    const tempBox = new THREE.Box3();
    const ray = new THREE.Ray();
    const hitPoint = new THREE.Vector3();
    const objDir = new THREE.Vector3();
    
    // 3. Cull Placed Objects
    if (this.placedObjects) {
      this.placedObjects.forEach(obj => {
        if (!obj.mesh) return;
        
        let visible = true;
        
        // A. Distance Culling
        const dist = cameraPos.distanceTo(obj.position);
        if (dist > maxDist) {
          visible = false;
        }
        
        // B. Frustum Culling
        if (visible) {
          tempBox.setFromObject(obj.mesh);
          if (!frustum.intersectsBox(tempBox)) {
            visible = false;
          }
        }
        
        // C. Occlusion Culling (only for props/smaller elements, not roads/ground/large buildings/water to avoid popping)
        const isCullableProp = visible && ![
          'road', 'road_roundabout', 'road_ramp', 'terrain_block', 'water', 'building'
        ].includes(obj.type) && !obj.type.startsWith('custom_');
        
        if (isCullableProp && this.buildingBoxes && this.buildingBoxes.length > 0) {
          objDir.subVectors(obj.position, cameraPos).normalize();
          ray.set(cameraPos, objDir);
          const objDist = cameraPos.distanceTo(obj.position);
          
          for (let i = 0; i < this.buildingBoxes.length; i++) {
            const box = this.buildingBoxes[i];
            if (box.containsPoint(cameraPos) || box.containsPoint(obj.position)) {
              continue;
            }
            
            if (ray.intersectBox(box, hitPoint)) {
              const hitDist = cameraPos.distanceTo(hitPoint);
              if (hitDist + 1.0 < objDist) {
                visible = false;
                break;
              }
            }
          }
        }
        
        obj.mesh.visible = visible;
      });
    }
    
    // 4. Cull NPCs
    const npcs = this.scene.children.filter(child => child.name === 'npc');
    npcs.forEach(npc => {
      let visible = true;
      const dist = cameraPos.distanceTo(npc.position);
      if (dist > maxDist) {
        visible = false;
      }
      
      if (visible) {
        tempBox.setFromObject(npc);
        if (!frustum.intersectsBox(tempBox)) {
          visible = false;
        }
      }
      
      if (visible && this.buildingBoxes && this.buildingBoxes.length > 0) {
        objDir.subVectors(npc.position, cameraPos).normalize();
        ray.set(cameraPos, objDir);
        const objDist = cameraPos.distanceTo(npc.position);
        
        for (let i = 0; i < this.buildingBoxes.length; i++) {
          const box = this.buildingBoxes[i];
          if (box.containsPoint(cameraPos) || box.containsPoint(npc.position)) {
            continue;
          }
          
          if (ray.intersectBox(box, hitPoint)) {
            const hitDist = cameraPos.distanceTo(hitPoint);
            if (hitDist + 1.0 < objDist) {
              visible = false;
              break;
            }
          }
        }
      }
      npc.visible = visible;
    });
  }
  
  render(activeTab) {
    if (this.camera && this.camera.camera) {
      const playerPos = (this.camera._target) ? this.camera._target : new THREE.Vector3();
      this.performOcclusionCulling(this.camera, playerPos, activeTab);
      
      // 1. Reset viewport for main scene render
      this.renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
      this.renderer.setScissor(0, 0, window.innerWidth, window.innerHeight);
      this.renderer.setScissorTest(false);
      
      this.renderer.render(this.scene, this.camera.camera);
      
      // 2. Draw 100% accurate minimap during gameplay
      const isGameplay = activeTab === 'play' || !activeTab;
      if (isGameplay) {
        this.renderMinimap(playerPos);
      }
    }
  }

  renderMinimap(playerPos) {
    if (!this.minimapCamera) {
      const aspect = 120 / 80; // Smaller minimap aspect ratio
      const size = 35; // Zoomed out to 35m to show more routes
      this.minimapCamera = new THREE.OrthographicCamera(-size * aspect, size * aspect, size, -size, 1, 300);
    }
    
    // Position minimap camera directly 100m above player
    this.minimapCamera.position.set(playerPos.x, 100, playerPos.z);
    this.minimapCamera.lookAt(playerPos.x, playerPos.y, playerPos.z);
    
    // Smoothly lerp camera heading to avoid jerky rotations
    const playerNode = this.scene.getObjectByName('player');
    if (playerNode) {
      const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(playerNode.quaternion);
      if (!this.smoothMinimapUp) {
        this.smoothMinimapUp = forward.clone();
      } else {
        this.smoothMinimapUp.lerp(forward, 0.08); // Damped smooth rotation
      }
      this.minimapCamera.up.set(this.smoothMinimapUp.x, 0, this.smoothMinimapUp.z).normalize();
    } else {
      this.minimapCamera.up.set(0, 0, -1);
    }
    
    // Exact WebGL Viewport Box matching #minimap-hud .minimap-border
    const width = 120;
    const height = 80;
    const x = 24; // 20px left margin + 4px border
    const y = window.innerHeight - height - 24; // 20px top margin + 4px border
    
    this.renderer.setViewport(x, y, width, height);
    this.renderer.setScissor(x, y, width, height);
    this.renderer.setScissorTest(true);
    
    // Collect road meshes from custom placedObjects if any
    const customRoadMeshes = new Set();
    if (this.placedObjects) {
      this.placedObjects.forEach(obj => {
        if (obj.type === 'road' || obj.type === 'road_roundabout') {
          if (obj.mesh) {
            obj.mesh.traverse(m => { if (m.isMesh) customRoadMeshes.add(m); });
          }
        }
      });
    }
    
    // Prepare scene: hide buildings/benches/trees/NPCs and swap road/ground materials to flat unlit colors
    const hiddenObjects = [];
    const restoredMaterials = new Map();
    
    this.scene.traverse(child => {
      // Include child.isPoints to catch stars and rain systems
      if (child.isMesh || child.isInstancedMesh || child.isPoints) {
        const isRoad = (child.name === 'road_default' || child.name === 'road_custom');
        const isGround = (child.name === 'ground_default');
        
        if (isRoad) {
          restoredMaterials.set(child, child.material);
          child.material = child.isInstancedMesh ? this.flatMinimapRoadMatInstanced : this.flatMinimapRoadMat;
        } else if (isGround) {
          restoredMaterials.set(child, child.material);
          child.material = this.flatMinimapGroundMat;
        } else {
          // Hide buildings, trees, benches, street lights, NPCs, player mesh, sun, moon, stars, rain, etc.
          if (child.visible) {
            child.visible = false;
            hiddenObjects.push(child);
          }
        }
      }
    });
    
    const oldFog = this.scene.fog;
    this.scene.fog = null;
    
    // Force background to flat dark charcoal color, bypassing weather colors
    const oldBackground = this.scene.background;
    this.scene.background = new THREE.Color(0x181c22);
    
    const origShadows = this.renderer.shadowMap.enabled;
    this.renderer.shadowMap.enabled = false;
    
    this.renderer.clearDepth();
    this.renderer.render(this.scene, this.minimapCamera);
    
    // Restore states, visibilities, and materials for main loop
    hiddenObjects.forEach(obj => { obj.visible = true; });
    restoredMaterials.forEach((mat, obj) => { obj.material = mat; });
    
    this.renderer.shadowMap.enabled = origShadows;
    this.scene.fog = oldFog;
    this.scene.background = oldBackground;
    this.renderer.setScissorTest(false);
  }
}
