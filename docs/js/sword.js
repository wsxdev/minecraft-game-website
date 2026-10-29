import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/**
 * 3D Diamond Sword Viewmodel Controller
 * Attached to the first-person camera with authentic Minecraft weapon sway,
 * swing animation, slash particles, and recharge cooldown meter.
 */
export class DiamondSword {
  constructor(camera, soundEngine) {
    this.camera = camera;
    this.sounds = soundEngine;

    // Viewmodel container attached directly to camera
    this.container = new THREE.Group();
    this.camera.add(this.container);

    // Pivot for rotational swings
    this.pivot = new THREE.Group();
    this.container.add(this.pivot);

    // Wrapper group for blade orientation
    this.swordWrapper = new THREE.Group();
    this.pivot.add(this.swordWrapper);

    this.model = null;
    this.isLoaded = false;

    // Add dedicated light to camera so sword is always brightly illuminated
    this.swordLight = new THREE.DirectionalLight(0xffffff, 2.5);
    this.swordLight.position.set(0.5, 1.2, 0.4);
    this.camera.add(this.swordLight);

    const swordPoint = new THREE.PointLight(0x55ffff, 1.5, 3.0);
    swordPoint.position.set(0.28, -0.08, -0.40);
    this.camera.add(swordPoint);

    // Default rest transforms in camera space (lower-right corner, fully visible diamond sword)
    this.idlePos = new THREE.Vector3(0.25, -0.21, -0.44);
    this.idleRot = new THREE.Euler(-0.16, -0.22, -0.10, 'YXZ');

    this.container.position.copy(this.idlePos);
    this.pivot.rotation.copy(this.idleRot);

    // Weapon sway
    this.targetSwayX = 0;
    this.targetSwayY = 0;
    this.currentSwayX = 0;
    this.currentSwayY = 0;

    // Attack animation state
    this.isSwinging = false;
    this.swingProgress = 1.0;
    this.swingDuration = 0.28; // seconds

    // Combat recharge cooldown (Minecraft Java 1.9+ style)
    this.attackCooldown = 0.6; // seconds
    this.timeSinceLastAttack = this.attackCooldown;
    this.charge = 1.0;

    // Build procedural sword immediately so a sword is NEVER missing
    this.createProceduralSword();
    // Then load the high-detail GLTF diamond sword model
    this.loadModel();
  }

  createProceduralSword() {
    this.fallbackGroup = new THREE.Group();

    // Diamond blade
    const bladeGeo = new THREE.BoxGeometry(0.045, 0.23, 0.02);
    const bladeMat = new THREE.MeshLambertMaterial({
      color: 0x4df2ff,
      emissive: 0x114455,
      emissiveIntensity: 0.35
    });
    const blade = new THREE.Mesh(bladeGeo, bladeMat);
    blade.position.y = 0.115;
    this.fallbackGroup.add(blade);

    // Crossguard
    const guardGeo = new THREE.BoxGeometry(0.12, 0.025, 0.03);
    const guardMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
    const guard = new THREE.Mesh(guardGeo, guardMat);
    this.fallbackGroup.add(guard);

    // Wooden handle
    const hiltGeo = new THREE.BoxGeometry(0.028, 0.07, 0.022);
    const hiltMat = new THREE.MeshLambertMaterial({ color: 0x8a5b29 });
    const hilt = new THREE.Mesh(hiltGeo, hiltMat);
    hilt.position.y = -0.045;
    this.fallbackGroup.add(hilt);

    this.swordWrapper.add(this.fallbackGroup);
  }

  loadModel() {
    const loader = new GLTFLoader();
    loader.load(
      'models/espada_de_diamanteminecraft/scene.gltf',
      (gltf) => {
        const loadedModel = gltf.scene;

        // Compute bounds
        const box = new THREE.Box3().setFromObject(loadedModel);
        const size = new THREE.Vector3();
        box.getSize(size);
        const diagonalLength = Math.hypot(size.x, size.y) || 42.4;

        // Scale sword to authentic Minecraft first-person viewmodel length (~0.30 units)
        // so the full sword (handle, crossguard, blade, and tip) is completely visible in screen
        const targetLength = 0.30;
        const scale = targetLength / diagonalLength;
        loadedModel.scale.setScalar(scale);

        // Center bottom pommel at (0, 0, 0)
        loadedModel.position.x = -box.min.x * scale;
        loadedModel.position.y = -box.min.y * scale;
        loadedModel.position.z = -((box.min.z + box.max.z) / 2) * scale;

        // Ensure materials look bright, crisp and vibrant
        loadedModel.traverse((child) => {
          if (child.isMesh && child.material) {
            child.material.roughness = 0.25;
            child.material.metalness = 0.15;
            child.material.emissive = new THREE.Color(0x003344);
            child.material.emissiveIntensity = 0.3;
            child.renderOrder = 999;
            child.frustumCulled = false;
            if (child.material.map) {
              child.material.map.magFilter = THREE.NearestFilter;
            }
          }
        });

        // Rotate wrapper so blade points vertically upward in first-person
        const gltfOrient = new THREE.Group();
        gltfOrient.rotation.z = Math.PI * 0.25;
        gltfOrient.add(loadedModel);

        // Remove fallback and attach high-res GLTF model
        if (this.fallbackGroup) {
          this.swordWrapper.remove(this.fallbackGroup);
        }
        this.swordWrapper.add(gltfOrient);
        this.model = loadedModel;
        this.isLoaded = true;
      },
      undefined,
      (err) => {
        console.warn('Using procedural diamond sword model.', err);
      }
    );
  }

  onMouseMove(deltaX, deltaY) {
    const maxSway = 0.06;
    this.targetSwayX = THREE.MathUtils.clamp(-deltaX * 0.0004, -maxSway, maxSway);
    this.targetSwayY = THREE.MathUtils.clamp(deltaY * 0.0004, -maxSway, maxSway);
  }

  triggerAttack() {
    const currentCharge = this.charge;

    this.isSwinging = true;
    this.swingProgress = 0;
    this.timeSinceLastAttack = 0;
    this.charge = 0;

    this.sounds.playSwordSwing();
    return currentCharge;
  }

  update(delta) {
    // Recharge cooldown
    this.timeSinceLastAttack += delta;
    this.charge = Math.min(1.0, this.timeSinceLastAttack / this.attackCooldown);

    // Idle breathing & weapon sway lerp
    this.currentSwayX = THREE.MathUtils.lerp(this.currentSwayX, this.targetSwayX, 0.15);
    this.currentSwayY = THREE.MathUtils.lerp(this.currentSwayY, this.targetSwayY, 0.15);
    this.targetSwayX *= 0.85;
    this.targetSwayY *= 0.85;

    const time = Date.now() * 0.003;
    const bobX = Math.cos(time * 0.8) * 0.005;
    const bobY = Math.sin(time * 1.6) * 0.006;

    this.container.position.set(
      this.idlePos.x + this.currentSwayX + bobX,
      this.idlePos.y + this.currentSwayY + bobY,
      this.idlePos.z
    );

    // Swing animation curve
    if (this.isSwinging) {
      this.swingProgress += delta / this.swingDuration;

      if (this.swingProgress >= 1.0) {
        this.swingProgress = 1.0;
        this.isSwinging = false;
        this.pivot.rotation.copy(this.idleRot);
      } else {
        const p = this.swingProgress;
        if (p < 0.22) {
          const t = p / 0.22;
          this.pivot.rotation.x = this.idleRot.x - 0.3 * t;
          this.pivot.rotation.y = this.idleRot.y + 0.35 * t;
          this.pivot.rotation.z = this.idleRot.z + 0.25 * t;
        } else if (p < 0.62) {
          const t = (p - 0.22) / 0.40;
          const ease = Math.sin(t * Math.PI * 0.5);
          this.pivot.rotation.x = (this.idleRot.x - 0.3) + 1.35 * ease;
          this.pivot.rotation.y = (this.idleRot.y + 0.35) - 1.15 * ease;
          this.pivot.rotation.z = (this.idleRot.z + 0.25) - 0.85 * ease;
        } else {
          const t = (p - 0.62) / 0.38;
          const ease = Math.cos(t * Math.PI * 0.5);
          this.pivot.rotation.x = this.idleRot.x + 1.05 * ease;
          this.pivot.rotation.y = this.idleRot.y - 0.80 * ease;
          this.pivot.rotation.z = this.idleRot.z - 0.60 * ease;
        }
      }
    } else {
      this.pivot.rotation.copy(this.idleRot);
    }
  }
}
