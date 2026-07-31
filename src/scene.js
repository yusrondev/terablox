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
    this.trackedNPCs = [];   // Maintained list of NPC meshes — avoids scene.children.filter every frame
    
    // Environment & Weather System
    this.weatherManager = new WeatherManager(this);
    
    // ── Perf: Reusable objects to eliminate GC pressure per frame ─────────
    this._frustum          = new THREE.Frustum();
    this._projScreenMatrix = new THREE.Matrix4();
    this._tempBox          = new THREE.Box3();
    this._ray              = new THREE.Ray();
    this._hitPoint         = new THREE.Vector3();
    this._objDir           = new THREE.Vector3();
    
    // ── Perf: Frame throttle counters ─────────────────────────────────────
    this._frameCount           = 0;                  // incremented in render()
    this._lastSortPlayerPos    = new THREE.Vector3(); // for street light sort throttle
    this._streetLightSortDirty = true;               // force first sort
    
    // Flat unlit materials for GTA V style minimap (immune to night & weather)
    this.flatMinimapGroundMat = new THREE.MeshBasicMaterial({ color: 0x181c22, side: THREE.DoubleSide });
    this.flatMinimapRoadMat   = new THREE.MeshBasicMaterial({ color: 0x6e7a89, side: THREE.DoubleSide });
    // IMPORTANT: InstancedMesh requires its own material compilation instance!
    this.flatMinimapRoadMatInstanced = new THREE.MeshBasicMaterial({ color: 0x6e7a89, side: THREE.DoubleSide });
    
    // Fullscreen Map view state
    this.isFullscreenMapOpen = false;
    this.fullscreenMapZoom = 1.0;
    this.fullscreenMapOffset = new THREE.Vector2(0, 0); // world coordinates offset from player
    this.fullscreenMapCamera = null;
    
    // Defer initialization slightly to ensure DOM is fully ready
    setTimeout(() => {
      this.initFullscreenMapEvents();
    }, 100);
    
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
        this.streetLightConeMaterial.opacity = intensity * 0.28;
      }

      // Building windows glow brightly at night and during rain
      const rWin = Math.min(1.0, 0.15 + intensity * 0.83);
      const gWin = Math.min(1.0, 0.19 + intensity * 0.76);
      const bWin = Math.min(1.0, 0.23 + intensity * 0.32);
      this.windowMaterial.color.setRGB(rWin, gWin, bWin);
    }

    // 2. Point lights pool positioning — only re-sort when player moves >5m (perf throttle)
    if (intensity <= 0.02 || !playerPos || this.streetLightPositions.length === 0) {
      for (const pLight of this.streetLightPool) {
        pLight.intensity = 0;
      }
      this._streetLightSortDirty = false;
      return;
    }

    const movedDist = this._lastSortPlayerPos.distanceTo(playerPos);
    if (movedDist > 5.0 || this._streetLightSortDirty) {
      this._lastSortPlayerPos.copy(playerPos);
      this._streetLightSortDirty = false;
      // Sort only when player has moved significantly
      this._sortedStreetLights = [...this.streetLightPositions].sort((a, b) =>
        a.distanceToSquared(playerPos) - b.distanceToSquared(playerPos)
      );
    }

    const sorted = this._sortedStreetLights || this.streetLightPositions;
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
    
    // 1. Reuse cached Frustum & Matrix (no GC allocation per frame)
    this._projScreenMatrix.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this._frustum.setFromProjectionMatrix(this._projScreenMatrix);
    
    // 2. Set max render distance based on graphics level
    let maxDist = 250;
    if (this.graphicsLevel === 'low') maxDist = 120;
    else if (this.graphicsLevel === 'med') maxDist = 220;
    else maxDist = 400;
    
    const isEditorActive = activeTab && activeTab !== 'play';
    if (isEditorActive) {
      maxDist = Math.max(maxDist, 300);
    }
    
    // Use cached reusable objects instead of allocating new ones each frame
    const tempBox  = this._tempBox;
    const ray      = this._ray;
    const hitPoint = this._hitPoint;
    const objDir   = this._objDir;
    const frustum  = this._frustum;
    
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
        
        // C. Occlusion Culling (only for props/smaller elements)
        const isCullableProp = visible && ![
          'road', 'road_roundabout', 'road_ramp', 'terrain_block', 'water', 'building', 'rumah', 'ruko'
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
    
    // 4. Cull NPCs — use tracked list instead of scene.children.filter() every frame
    const npcs = this.trackedNPCs;
    for (let n = 0; n < npcs.length; n++) {
      const npc = npcs[n];
      if (!npc.parent) continue; // removed from scene
      
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
    }
  }
  
  render(activeTab) {
    if (this.camera && this.camera.camera) {
      // Increment frame counter (used for throttling expensive operations)
      this._frameCount = (this._frameCount + 1) | 0;
      
      const playerPos = (this.camera._target) ? this.camera._target : new THREE.Vector3();
      
      // Perf: Run occlusion culling only every 3 frames (invisible to player at 60fps)
      if (this._frameCount % 3 === 0) {
        this.performOcclusionCulling(this.camera, playerPos, activeTab);
      }
      
      // 1. Reset viewport for main scene render
      this.renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
      this.renderer.setScissor(0, 0, window.innerWidth, window.innerHeight);
      this.renderer.setScissorTest(false);
      
      this.renderer.render(this.scene, this.camera.camera);
      
      // 2. Draw minimap during gameplay
      const isGameplay = activeTab === 'play' || !activeTab;
      if (isGameplay) {
        this.renderMinimap(playerPos);
      }
      
      // 3. Draw Fullscreen Map if active
      if (this.isFullscreenMapOpen) {
        const container = document.getElementById('fullscreen-map-canvas-container');
        if (container) {
          const rect = container.getBoundingClientRect();
          const width = rect.width;
          const height = rect.height;
          const x = rect.left;
          const y = window.innerHeight - rect.bottom;
          this.renderFullscreenMap(x, y, width, height);
        }
      }
    }
  }

  compileShaders() {
    if (this.renderer && this.scene && this.camera && this.camera.camera) {
      console.log("Pre-compiling WebGL shaders to eliminate runtime stutter...");
      
      // Warm up main camera shaders
      this.renderer.compile(this.scene, this.camera.camera);
      
      // Warm up minimap camera shaders
      if (!this.minimapCamera) {
        const aspect = 120 / 80;
        const size = 35;
        this.minimapCamera = new THREE.OrthographicCamera(-size * aspect, size * aspect, size, -size, 1, 300);
      }
      this.renderer.compile(this.scene, this.minimapCamera);
      
      console.log("Shader pre-compilation completed successfully.");
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
        // Detect default instanced roads or custom placed roads by name, type, material reference, or UUID
        const isRoad = (child.name === 'road_default' || 
                        child.name === 'road_custom' ||
                        child.name === 'roadIM' ||
                        (child.isInstancedMesh && child.geometry && (child.geometry.type === 'PlaneGeometry' || child.geometry.constructor.name === 'PlaneGeometry')) ||
                        (this.roadMaterial && child.material === this.roadMaterial) ||
                        (this.roadMaterial && child.material && child.material.uuid === this.roadMaterial.uuid));
        const isGround = (child.name === 'ground_default' || 
                          (child.geometry && child.geometry.type === 'PlaneGeometry' && !isRoad && child.name !== 'player'));
        
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

  initFullscreenMapEvents() {
    const minimapHud = document.getElementById('minimap-hud');
    const overlay = document.getElementById('fullscreen-map-overlay');
    const closeBtn = document.querySelector('.fullscreen-map-close-btn');
    const mapBody = document.getElementById('fullscreen-map-canvas-container');
    
    if (minimapHud) {
      minimapHud.addEventListener('click', (e) => {
        // Prevent click if we are clicking child stats bars
        if (e.target.closest('.minimap-stats')) return;
        
        this.isFullscreenMapOpen = true;
        this.fullscreenMapZoom = 1.0;
        this.fullscreenMapOffset.set(0, 0);
        if (overlay) {
          overlay.classList.add('active');
          overlay.style.display = 'flex';
        }
      });
    }
    
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        this.isFullscreenMapOpen = false;
        if (overlay) {
          overlay.classList.remove('active');
          setTimeout(() => {
            if (!this.isFullscreenMapOpen) {
              overlay.style.display = 'none';
            }
          }, 300);
        }
      });
    }
    
    // Zoom interaction anywhere on the overlay screen
    if (overlay) {
      overlay.addEventListener('wheel', (e) => {
        if (!this.isFullscreenMapOpen) return;
        e.preventDefault();
        
        const zoomSpeed = 0.15;
        if (e.deltaY > 0) { // Reversed: scroll down zooms in
          this.fullscreenMapZoom = Math.min(this.fullscreenMapZoom + zoomSpeed * this.fullscreenMapZoom, 6.0);
        } else { // Scroll up zooms out
          this.fullscreenMapZoom = Math.max(this.fullscreenMapZoom - zoomSpeed * this.fullscreenMapZoom, 0.35);
        }
      }, { passive: false });
      
      // Pan interaction (Mouse)
      let isDragging = false;
      let prevMousePos = new THREE.Vector2();
      
      mapBody.addEventListener('mousedown', (e) => {
        if (!this.isFullscreenMapOpen) return;
        isDragging = true;
        prevMousePos.set(e.clientX, e.clientY);
      });
      
      window.addEventListener('mousemove', (e) => {
        if (!this.isFullscreenMapOpen || !isDragging) return;
        
        const dx = e.clientX - prevMousePos.x;
        const dy = e.clientY - prevMousePos.y;
        prevMousePos.set(e.clientX, e.clientY);
        
        const size = 120;
        const rect = mapBody.getBoundingClientRect();
        const aspect = rect.width / rect.height;
        
        const worldWidth = size * aspect * 2 / this.fullscreenMapZoom;
        const worldHeight = size * 2 / this.fullscreenMapZoom;
        
        const worldDx = dx * (worldWidth / rect.width);
        const worldDy = dy * (worldHeight / rect.height);
        
        // Reversed pan direction (X reversed back, Y remains reversed)
        this.fullscreenMapOffset.x -= worldDx;
        this.fullscreenMapOffset.y -= worldDy;
      });
      
      // Pan & Pinch Zoom interaction (Touch)
      let isPinching = false;
      let initialPinchDist = 0;
      let initialPinchZoom = 1.0;
      
      mapBody.addEventListener('touchstart', (e) => {
        if (!this.isFullscreenMapOpen) return;
        
        if (e.touches.length === 2) {
          isPinching = true;
          isDragging = false;
          initialPinchDist = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY
          );
          initialPinchZoom = this.fullscreenMapZoom;
        } else if (e.touches.length === 1) {
          isPinching = false;
          isDragging = true;
          prevMousePos.set(e.touches[0].clientX, e.touches[0].clientY);
        }
      });
      
      mapBody.addEventListener('touchmove', (e) => {
        if (!this.isFullscreenMapOpen) return;
        
        if (e.touches.length === 2 && isPinching) {
          e.preventDefault();
          const dist = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY
          );
          if (initialPinchDist > 0) {
            const ratio = dist / initialPinchDist;
            this.fullscreenMapZoom = Math.min(Math.max(initialPinchZoom * ratio, 0.35), 6.0);
          }
        } else if (e.touches.length === 1 && isDragging && !isPinching) {
          const dx = e.touches[0].clientX - prevMousePos.x;
          const dy = e.touches[0].clientY - prevMousePos.y;
          prevMousePos.set(e.touches[0].clientX, e.touches[0].clientY);
          
          const size = 120;
          const rect = mapBody.getBoundingClientRect();
          const aspect = rect.width / rect.height;
          
          const worldWidth = size * aspect * 2 / this.fullscreenMapZoom;
          const worldHeight = size * 2 / this.fullscreenMapZoom;
          
          const worldDx = dx * (worldWidth / rect.width);
          const worldDy = dy * (worldHeight / rect.height);
          
          // Reversed pan direction (X reversed back, Y remains reversed)
          this.fullscreenMapOffset.x -= worldDx;
          this.fullscreenMapOffset.y -= worldDy;
        }
      });
      
      window.addEventListener('mouseup', () => {
        isDragging = false;
      });
      
      mapBody.addEventListener('touchend', (e) => {
        isDragging = false;
        isPinching = false;
        initialPinchDist = 0;
      });
    }
  }

  renderFullscreenMap(x, y, width, height) {
    if (!this.camera || !this.camera.camera) return;
    const playerPos = (this.camera._target) ? this.camera._target : new THREE.Vector3();
    
    if (!this.fullscreenMapCamera) {
      const aspect = width / height;
      const size = 120;
      this.fullscreenMapCamera = new THREE.OrthographicCamera(-size * aspect, size * aspect, size, -size, 1, 300);
    }
    
    const aspect = width / height;
    const baseSize = 120;
    const size = baseSize / this.fullscreenMapZoom;
    
    this.fullscreenMapCamera.left = -size * aspect;
    this.fullscreenMapCamera.right = size * aspect;
    this.fullscreenMapCamera.top = size;
    this.fullscreenMapCamera.bottom = -size;
    this.fullscreenMapCamera.updateProjectionMatrix();
    
    this.fullscreenMapCamera.position.set(
      playerPos.x + this.fullscreenMapOffset.x, 
      100, 
      playerPos.z + this.fullscreenMapOffset.y
    );
    this.fullscreenMapCamera.lookAt(
      playerPos.x + this.fullscreenMapOffset.x, 
      playerPos.y, 
      playerPos.z + this.fullscreenMapOffset.y
    );
    
    this.fullscreenMapCamera.up.set(0, 0, -1);
    
    // Update player marker relative position & rotation in DOM
    const marker = document.getElementById('fullscreen-map-player-marker');
    if (marker) {
      const sizeX = size * aspect;
      const sizeY = size;
      const nx = -this.fullscreenMapOffset.x / sizeX;
      const ny = -this.fullscreenMapOffset.y / sizeY;
      
      const leftPct = 50 + nx * 50;
      const topPct = 50 + ny * 50;
      
      marker.style.left = `${leftPct}%`;
      marker.style.top = `${topPct}%`;
      
      if (leftPct >= 0 && leftPct <= 100 && topPct >= 0 && topPct <= 100) {
        marker.style.display = 'block';
      } else {
        marker.style.display = 'none';
      }
      
      const playerNode = this.scene.getObjectByName('player');
      if (playerNode) {
        const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(playerNode.quaternion);
        const rotationDeg = Math.atan2(forward.x, -forward.z) * (180 / Math.PI);
        marker.style.transform = `translate(-50%, -50%) rotate(${rotationDeg}deg)`;
      }
    }
    
    this.renderer.setViewport(x, y, width, height);
    this.renderer.setScissor(x, y, width, height);
    this.renderer.setScissorTest(true);
    
    const hiddenObjects = [];
    const restoredMaterials = new Map();
    
    this.scene.traverse(child => {
      if (child.isMesh || child.isInstancedMesh || child.isPoints) {
        const isRoad = (child.name === 'road_default' || 
                        child.name === 'road_custom' ||
                        child.name === 'roadIM' ||
                        (child.isInstancedMesh && child.geometry && (child.geometry.type === 'PlaneGeometry' || child.geometry.constructor.name === 'PlaneGeometry')) ||
                        (this.roadMaterial && child.material === this.roadMaterial) ||
                        (this.roadMaterial && child.material && child.material.uuid === this.roadMaterial.uuid));
        const isGround = (child.name === 'ground_default' || 
                          (child.geometry && child.geometry.type === 'PlaneGeometry' && !isRoad && child.name !== 'player'));
        
        if (isRoad) {
          restoredMaterials.set(child, child.material);
          child.material = child.isInstancedMesh ? this.flatMinimapRoadMatInstanced : this.flatMinimapRoadMat;
        } else if (isGround) {
          restoredMaterials.set(child, child.material);
          child.material = this.flatMinimapGroundMat;
        } else {
          if (child.visible) {
            child.visible = false;
            hiddenObjects.push(child);
          }
        }
      }
    });
    
    const oldFog = this.scene.fog;
    this.scene.fog = null;
    const oldBackground = this.scene.background;
    this.scene.background = new THREE.Color(0x181c22);
    const origShadows = this.renderer.shadowMap.enabled;
    this.renderer.shadowMap.enabled = false;
    
    this.renderer.clearDepth();
    this.renderer.render(this.scene, this.fullscreenMapCamera);
    
    hiddenObjects.forEach(obj => { obj.visible = true; });
    restoredMaterials.forEach((mat, obj) => { obj.material = mat; });
    
    this.renderer.shadowMap.enabled = origShadows;
    this.scene.fog = oldFog;
    this.scene.background = oldBackground;
    this.renderer.setScissorTest(false);
  }
}
