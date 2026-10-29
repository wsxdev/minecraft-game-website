import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/**
 * Mob Manager for Creeper, Skeleton, and Wither
 * Handles mob spawning, procedural animations, AI attack patterns,
 * hit detection, red damage flash, knockback, and death animations.
 */
export class MobManager {
  constructor(scene, world, sounds) {
    this.scene = scene;
    this.world = world;
    this.sounds = sounds;

    this.loader = new GLTFLoader();
    this.templates = {};
    this.isLoaded = false;
    this.activeMobs = [];
    this.nextMobId = 1;

    // Callbacks for game loop
    this.onPlayerDamage = null;
    this.onMobKilled = null;
    this.onBossHealthChange = null;

    this.preloadTemplates();
  }

  async preloadTemplates() {
    const list = [
      { name: 'creeper', path: 'models/creeper/scene.gltf', targetHeight: 1.95 },
      { name: 'skeleton', path: 'models/skeleton/scene.gltf', targetHeight: 2.1 },
      { name: 'wither', path: 'models/wither/scene.gltf', targetHeight: 2.7 }
    ];

    let loadedCount = 0;
    for (const item of list) {
      try {
        const gltf = await this.loader.loadAsync(item.path);
        const model = gltf.scene;

        // Calculate bounding box and normalize
        const box = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        box.getSize(size);
        const center = new THREE.Vector3();
        box.getCenter(center);

        const scale = item.targetHeight / (size.y || 1);
        model.scale.setScalar(scale);

        // Center bottom at Y = 0
        model.position.x = -center.x * scale;
        model.position.y = -box.min.y * scale;
        model.position.z = -center.z * scale;

        // Ensure materials allow custom colors & shadows
        model.traverse((child) => {
          if (child.isMesh && child.material) {
            child.material = child.material.clone();
            child.castShadow = true;
            child.receiveShadow = true;
            if (child.material.map) {
              child.material.map.magFilter = THREE.NearestFilter;
            }
          }
        });

        const root = new THREE.Group();
        root.add(model);

        this.templates[item.name] = {
          root,
          targetHeight: item.targetHeight,
          radius: (size.x * scale) * 0.5
        };
        loadedCount++;
      } catch (err) {
        console.error(`Error loading model ${item.name}:`, err);
        // Create procedural fallback
        this.templates[item.name] = this.createFallbackTemplate(item.name, item.targetHeight);
        loadedCount++;
      }
    }

    if (loadedCount === list.length) {
      this.isLoaded = true;
      if (this.onLoadedCallback) {
        this.onLoadedCallback();
      }
    }
  }

  createFallbackTemplate(type, height) {
    const root = new THREE.Group();
    let color = 0x55aa33;
    if (type === 'skeleton') color = 0xdddddd;
    if (type === 'wither') color = 0x222222;

    const bodyGeo = new THREE.BoxGeometry(height * 0.35, height * 0.7, height * 0.25);
    const bodyMat = new THREE.MeshLambertMaterial({ color });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = height * 0.5;
    root.add(body);

    const headGeo = new THREE.BoxGeometry(height * 0.35, height * 0.35, height * 0.35);
    const headMat = new THREE.MeshLambertMaterial({ color });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = height * 0.95;
    root.add(head);

    return { root, targetHeight: height, radius: height * 0.25 };
  }

  spawnMob(type, x, z, difficulty) {
    if (!this.templates[type]) return null;

    const tmpl = this.templates[type];
    const group = tmpl.root.clone(true);

    // Deep clone materials so red damage flash affects only this mob
    const meshes = [];
    const originalColors = [];
    group.traverse((c) => {
      if (c.isMesh && c.material) {
        c.material = c.material.clone();
        meshes.push(c);
        originalColors.push(c.material.color.clone());
      }
    });

    group.position.set(x, 0, z);
    this.scene.add(group);

    const id = this.nextMobId++;

    // Mob stats based on type & difficulty
    let maxHealth = 20;
    let speed = 2.4;
    let pointValue = 100;
    let fuseTime = 1.8;

    if (type === 'creeper') {
      maxHealth = 20;
      speed = 2.2 * (difficulty.mobSpeedMultiplier || 1);
      fuseTime = (difficulty.creeperFuse || 1.8);
      pointValue = 150;
    } else if (type === 'skeleton') {
      maxHealth = 25;
      speed = 1.9 * (difficulty.mobSpeedMultiplier || 1);
      pointValue = 200;
    } else if (type === 'wither') {
      maxHealth = 180 * (difficulty.bossHealthMultiplier || 1);
      speed = 1.4;
      pointValue = 1500;
      group.position.y = 3.2; // Wither floats
      this.sounds.playWitherRoar();
    }

    const mob = {
      id,
      type,
      group,
      meshes,
      originalColors,
      health: maxHealth,
      maxHealth,
      speed,
      fuseTime,
      pointValue,
      state: 'walking', // 'walking', 'igniting', 'shooting', 'dead'
      fuseTimer: 0,
      shootTimer: 2.0 + Math.random() * 2.5,
      flashTimer: 0,
      deathTimer: 0,
      wobblePhase: Math.random() * Math.PI * 2,
      isBoss: type === 'wither'
    };

    this.activeMobs.push(mob);

    if (mob.isBoss && this.onBossHealthChange) {
      this.onBossHealthChange(mob.health, mob.maxHealth, true);
    }

    return mob;
  }

  takeDamage(mob, amount, isCritical) {
    if (mob.state === 'dead') return;

    mob.health -= amount;

    // Flash red
    mob.flashTimer = 0.2;
    for (const mesh of mob.meshes) {
      mesh.material.color.setHex(0xff2222);
      if (mesh.material.emissive) {
        mesh.material.emissive.setHex(0xaa1111);
      }
    }

    // Knockback
    mob.group.position.z -= 1.4;

    if (mob.isBoss && this.onBossHealthChange) {
      this.onBossHealthChange(Math.max(0, mob.health), mob.maxHealth, true);
    }

    if (mob.health <= 0) {
      this.killMob(mob, isCritical);
    }
  }

  killMob(mob, isCritical) {
    if (mob.state === 'dead') return;
    mob.state = 'dead';

    // Stop Creeper hiss if any
    if (mob.type === 'creeper') {
      this.sounds.stopCreeperHiss(mob.id);
    }

    if (mob.isBoss && this.onBossHealthChange) {
      this.onBossHealthChange(0, mob.maxHealth, false);
    }

    // Puff of smoke & death sounds
    const centerPos = mob.group.position.clone();
    centerPos.y += 1.0;
    this.world.spawnExplosion(centerPos, mob.isBoss ? 45 : 15);

    if (this.onMobKilled) {
      this.onMobKilled(mob, isCritical);
    }
  }

  clearAll() {
    for (const mob of this.activeMobs) {
      if (mob.type === 'creeper') {
        this.sounds.stopCreeperHiss(mob.id);
      }
      this.scene.remove(mob.group);
    }
    this.activeMobs = [];
  }

  update(delta, playerPos) {
    for (let i = this.activeMobs.length - 1; i >= 0; i--) {
      const mob = this.activeMobs[i];

      // Handle Damage Flash
      if (mob.flashTimer > 0) {
        mob.flashTimer -= delta;
        if (mob.flashTimer <= 0) {
          for (let m = 0; m < mob.meshes.length; m++) {
            mob.meshes[m].material.color.copy(mob.originalColors[m]);
            if (mob.meshes[m].material.emissive) {
              mob.meshes[m].material.emissive.setHex(0x000000);
            }
          }
        }
      }

      // Handle Dead State
      if (mob.state === 'dead') {
        mob.deathTimer += delta;
        // Classic Minecraft tilt sideways
        mob.group.rotation.z = Math.min(Math.PI / 2, mob.deathTimer * 6);
        mob.group.position.y = Math.max(0, mob.group.position.y - delta * 2.0);

        if (mob.deathTimer >= 0.35) {
          this.scene.remove(mob.group);
          this.activeMobs.splice(i, 1);
        }
        continue;
      }

      // Procedural walking wobble
      mob.wobblePhase += delta * 6;
      const wobble = Math.sin(mob.wobblePhase) * 0.08;

      // --- CREEPER BEHAVIOR ---
      if (mob.type === 'creeper') {
        const distZ = mob.group.position.z;

        if (distZ < -3.8) {
          // Walk forward
          mob.group.position.z += mob.speed * delta;
          mob.group.rotation.z = wobble;
        } else {
          // In fuse range!
          if (mob.state !== 'igniting') {
            mob.state = 'igniting';
            this.sounds.startCreeperHiss(mob.id);
          }

          mob.fuseTimer += delta;
          const progress = mob.fuseTimer / mob.fuseTime;

          // Flash white & swell up
          const pulse = (Math.sin(mob.fuseTimer * 22) + 1) * 0.5;
          const scale = 1.0 + progress * 0.35 + pulse * 0.15;
          mob.group.scale.set(scale, scale * 1.1, scale);

          if (pulse > 0.4) {
            for (const mesh of mob.meshes) {
              mesh.material.color.setHex(0xffffff);
            }
          } else {
            for (let m = 0; m < mob.meshes.length; m++) {
              mob.meshes[m].material.color.copy(mob.originalColors[m]);
            }
          }

          if (mob.fuseTimer >= mob.fuseTime) {
            // EXPLODE!
            this.sounds.stopCreeperHiss(mob.id);
            this.sounds.playExplosion();
            this.world.spawnExplosion(mob.group.position, 35);

            if (this.onPlayerDamage) {
              this.onPlayerDamage(6, 'creeper'); // 3 hearts
            }

            this.scene.remove(mob.group);
            this.activeMobs.splice(i, 1);
            continue;
          }
        }
      }

      // --- SKELETON BEHAVIOR ---
      else if (mob.type === 'skeleton') {
        const distZ = mob.group.position.z;

        if (distZ < -11.0) {
          // Walk forward
          mob.group.position.z += mob.speed * delta;
          mob.group.rotation.z = wobble;
        } else {
          // In shooting range!
          mob.group.rotation.z = 0;
          mob.shootTimer -= delta;

          if (mob.shootTimer <= 0) {
            mob.shootTimer = 2.4 + Math.random() * 1.2;
            this.sounds.playSkeletonShot();

            // Spawn arrow towards player
            const arrowOrigin = mob.group.position.clone();
            arrowOrigin.y += 1.4;
            const targetPos = new THREE.Vector3(playerPos.x, 0.4, 0);

            this.world.spawnArrow(arrowOrigin, targetPos, () => {
              if (this.onPlayerDamage) {
                this.onPlayerDamage(3, 'skeleton'); // 1.5 hearts
              }
            });
          }
        }
      }

      // --- WITHER BOSS BEHAVIOR ---
      else if (mob.type === 'wither') {
        // Menacing hover & sinusoidal sway
        mob.group.position.z = Math.min(-12, mob.group.position.z + mob.speed * delta);
        mob.group.position.x = Math.sin(Date.now() * 0.0015) * 4.5;
        mob.group.position.y = 3.6 + Math.cos(Date.now() * 0.0025) * 0.8;

        mob.shootTimer -= delta;
        if (mob.shootTimer <= 0) {
          mob.shootTimer = 2.0 + Math.random() * 1.5;
          this.sounds.playWitherRoar();

          const skullOrigin = mob.group.position.clone();
          skullOrigin.y -= 0.5;
          const targetPos = new THREE.Vector3(playerPos.x, 0.2, 0);

          this.world.spawnArrow(skullOrigin, targetPos, () => {
            if (this.onPlayerDamage) {
              this.onPlayerDamage(5, 'wither'); // 2.5 hearts
            }
          });
        }
      }
    }
  }

  raycast(raycaster) {
    const candidateMeshes = [];
    const meshToMobMap = new Map();

    for (const mob of this.activeMobs) {
      if (mob.state === 'dead') continue;
      for (const mesh of mob.meshes) {
        candidateMeshes.push(mesh);
        meshToMobMap.set(mesh, mob);
      }
    }

    const intersects = raycaster.intersectObjects(candidateMeshes, false);
    if (intersects.length > 0) {
      const hitMesh = intersects[0].object;
      const mob = meshToMobMap.get(hitMesh);
      return {
        mob,
        point: intersects[0].point,
        distance: intersects[0].distance
      };
    }

    return null;
  }
}
