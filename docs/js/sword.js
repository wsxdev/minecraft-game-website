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

    // Viewmodel container
    this.container = new THREE.Group();
    this.camera.add(this.container);

    // Pivot for rotational swings
    this.pivot = new THREE.Group();
    this.container.add(this.pivot);

    this.model = null;
    this.isLoaded = false;

    // Default rest transforms
    this.idlePos = new THREE.Vector3(0.38, -0.32, -0.62);
    this.idleRot = new THREE.Euler(-0.35, -0.45, -0.35, 'YXZ');

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
    this.attackCooldown = 0.6; // seconds to reach 100%
    this.timeSinceLastAttack = this.attackCooldown;
    this.charge = 1.0; // 0.0 to 1.0

    this.loadModel();
  }

  loadModel() {
    const loader = new GLTFLoader();
    loader.load(
      'models/espada_de_diamanteminecraft/scene.gltf',
      (gltf) => {
        this.model = gltf.scene;

        // Compute bounds to normalize size
        const box = new THREE.Box3().setFromObject(this.model);
        const size = new THREE.Vector3();
        box.getSize(size);
        const center = new THREE.Vector3();
        box.getCenter(center);

        // Normalization: the sword in GLTF is tilted 45 deg with pommel at (-13.5, -11.5)
        // and tip at (+15, +17), total diagonal length ~ 40 units.
        const length = 40;
        const targetViewmodelLength = 0.72; // units in viewmodel space
        const scale = targetViewmodelLength / length;

        // Create an orienting wrapper group
        const swordOrient = new THREE.Group();
        this.model.scale.setScalar(scale);

        // Center pommel/handle at origin
        this.model.position.set(13.5 * scale, 11.5 * scale, 0);

        // Rotate -45 deg around Z so sword points straight UP along +Y
        swordOrient.rotation.z = -Math.PI / 4;
        swordOrient.add(this.model);

        // Ensure materials look bright, crisp and vibrant under scene lighting
        this.model.traverse((child) => {
          if (child.isMesh && child.material) {
            child.material.roughness = 0.35;
            child.material.metalness = 0.2;
            if (child.material.map) {
              child.material.map.magFilter = THREE.NearestFilter;
            }
          }
        });

        this.pivot.add(swordOrient);
        this.isLoaded = true;
      },
      undefined,
      (err) => {
        console.warn('Fallback: generating procedural diamond sword geometry...', err);
        this.createProceduralSword();
      }
    );
  }

  createProceduralSword() {
    // Elegant procedural fallback voxel sword if GLTF fails
    const bladeGeo = new THREE.BoxGeometry(0.08, 0.55, 0.02);
    const bladeMat = new THREE.MeshLambertMaterial({ color: 0x4df2ff });
    const blade = new THREE.Mesh(bladeGeo, bladeMat);
    blade.position.y = 0.28;

    const guardGeo = new THREE.BoxGeometry(0.24, 0.06, 0.04);
    const guardMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
    const guard = new THREE.Mesh(guardGeo, guardMat);

    const hiltGeo = new THREE.BoxGeometry(0.06, 0.18, 0.03);
    const hiltMat = new THREE.MeshLambertMaterial({ color: 0x8a5b29 });
    const hilt = new THREE.Mesh(hiltGeo, hiltMat);
    hilt.position.y = -0.12;

    const fallbackGroup = new THREE.Group();
    fallbackGroup.add(blade);
    fallbackGroup.add(guard);
    fallbackGroup.add(hilt);

    this.pivot.add(fallbackGroup);
    this.isLoaded = true;
  }

  onMouseMove(deltaX, deltaY) {
    // Responsive viewmodel sway lag
    const maxSway = 0.08;
    this.targetSwayX = THREE.MathUtils.clamp(-deltaX * 0.0003, -maxSway, maxSway);
    this.targetSwayY = THREE.MathUtils.clamp(deltaY * 0.0003, -maxSway, maxSway);
  }

  triggerAttack() {
    // Current charge level when attack begins
    const currentCharge = this.charge;

    // Restart swing animation
    this.isSwinging = true;
    this.swingProgress = 0;
    this.timeSinceLastAttack = 0;
    this.charge = 0;

    // Play swoosh sound
    this.sounds.playSwordSwing();

    return currentCharge;
  }

  update(delta) {
    // Recharge meter
    this.timeSinceLastAttack += delta;
    this.charge = Math.min(1.0, this.timeSinceLastAttack / this.attackCooldown);

    // Idle breathing & sway lerp
    this.currentSwayX = THREE.MathUtils.lerp(this.currentSwayX, this.targetSwayX, 0.12);
    this.currentSwayY = THREE.MathUtils.lerp(this.currentSwayY, this.targetSwayY, 0.12);
    this.targetSwayX *= 0.88;
    this.targetSwayY *= 0.88;

    const time = Date.now() * 0.003;
    const bobX = Math.cos(time * 0.8) * 0.006;
    const bobY = Math.sin(time * 1.6) * 0.008;

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
        // Slash choreography:
        // 0 -> 0.28: windup back
        // 0.28 -> 0.65: fierce downward slash & forward sweep
        // 0.65 -> 1.0: return to ready position
        if (p < 0.25) {
          const t = p / 0.25;
          this.pivot.rotation.x = this.idleRot.x - 0.3 * t;
          this.pivot.rotation.y = this.idleRot.y + 0.3 * t;
          this.pivot.rotation.z = this.idleRot.z + 0.2 * t;
        } else if (p < 0.65) {
          const t = (p - 0.25) / 0.4;
          const ease = Math.sin(t * Math.PI * 0.5);
          this.pivot.rotation.x = (this.idleRot.x - 0.3) + 1.4 * ease;
          this.pivot.rotation.y = (this.idleRot.y + 0.3) - 1.2 * ease;
          this.pivot.rotation.z = (this.idleRot.z + 0.2) - 0.8 * ease;
        } else {
          const t = (p - 0.65) / 0.35;
          const ease = Math.cos(t * Math.PI * 0.5);
          this.pivot.rotation.x = this.idleRot.x + 1.1 * ease;
          this.pivot.rotation.y = this.idleRot.y - 0.9 * ease;
          this.pivot.rotation.z = this.idleRot.z - 0.6 * ease;
        }
      }
    } else {
      this.pivot.rotation.copy(this.idleRot);
    }
  }
}
