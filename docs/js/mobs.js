import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Helper for pixel-perfect Minecraft block UV mapping on standard skins
function createMinecraftBox(w, h, d, u, v, pw, ph, pd, texW, texH, mat) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const uvAttr = geo.attributes.uv;

  // Face 0: +X (Right side of mob)
  setFaceUV(uvAttr, 0, u, v + pd, pd, ph, texW, texH);
  // Face 1: -X (Left side of mob)
  setFaceUV(uvAttr, 1, u + pd + pw, v + pd, pd, ph, texW, texH);
  // Face 2: +Y (Top)
  setFaceUV(uvAttr, 2, u + pd, v, pw, pd, texW, texH);
  // Face 3: -Y (Bottom)
  setFaceUV(uvAttr, 3, u + pd + pw, v, pw, pd, texW, texH);
  // Face 4: +Z (Front face)
  setFaceUV(uvAttr, 4, u + pd, v + pd, pw, ph, texW, texH);
  // Face 5: -Z (Back)
  setFaceUV(uvAttr, 5, u + pd + pw + pd, v + pd, pw, ph, texW, texH);

  geo.uvsNeedUpdate = true;
  return new THREE.Mesh(geo, mat);
}

function setFaceUV(uvAttr, faceIndex, x, y, w, h, texW, texH) {
  const u0 = x / texW;
  const u1 = (x + w) / texW;
  const v0 = 1 - (y + h) / texH;
  const v1 = 1 - y / texH;
  const offset = faceIndex * 4;
  uvAttr.setXY(offset + 0, u0, v1);
  uvAttr.setXY(offset + 1, u1, v1);
  uvAttr.setXY(offset + 2, u0, v0);
  uvAttr.setXY(offset + 3, u1, v0);
}

/**
 * Mob Manager for Creeper, Skeleton, and Wither
 * Builds clean, authentic Minecraft models with zero vertex-stretching artifacts or walls.
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
    this.onLoadedCallback = null;
    this.onBossHealthChange = null;

    this.preloadTemplates();
  }

  async preloadTemplates() {
    try {
      // 1. Creeper GLTF model
      const creeperGltf = await this.loader.loadAsync('models/creeper/scene.gltf');
      const creeperModel = creeperGltf.scene;

      const box = new THREE.Box3().setFromObject(creeperModel);
      const size = new THREE.Vector3();
      box.getSize(size);
      const center = new THREE.Vector3();
      box.getCenter(center);

      const targetHeight = 1.95;
      const scale = targetHeight / (size.y || 1);
      creeperModel.scale.setScalar(scale);

      creeperModel.position.x = -center.x * scale;
      creeperModel.position.y = -box.min.y * scale;
      creeperModel.position.z = -center.z * scale;
      creeperModel.rotation.y = Math.PI; // Face the player directly

      creeperModel.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          child.frustumCulled = false;
          if (child.material) {
            child.material = child.material.clone();
            if (child.material.map) {
              child.material.map.magFilter = THREE.NearestFilter;
            }
          }
        }
      });

      const creeperRoot = new THREE.Group();
      creeperRoot.add(creeperModel);
      this.templates['creeper'] = {
        root: creeperRoot,
        targetHeight,
        radius: (size.x * scale) * 0.5
      };
    } catch (err) {
      console.error('Error loading creeper GLTF:', err);
      this.templates['creeper'] = this.createFallbackTemplate('creeper', 1.95);
    }

    try {
      // 2. Authentic Minecraft Skeleton with authentic texture (Zero wall/skinnedmesh bugs!)
      this.templates['skeleton'] = await this.createSkeletonTemplate();
    } catch (err) {
      console.error('Error creating skeleton template:', err);
      this.templates['skeleton'] = this.createFallbackTemplate('skeleton', 2.1);
    }

    try {
      // 3. Authentic Minecraft Wither Boss
      this.templates['wither'] = await this.createWitherTemplate();
    } catch (err) {
      console.error('Error creating wither template:', err);
      this.templates['wither'] = this.createFallbackTemplate('wither', 2.7);
    }

    this.isLoaded = true;
    if (this.onLoadedCallback) {
      this.onLoadedCallback();
    }
  }

  async createSkeletonTemplate() {
    const texLoader = new THREE.TextureLoader();
    let mat;
    try {
      const tex = await texLoader.loadAsync('models/skeleton/textures/Material_baseColor.png');
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.colorSpace = THREE.SRGBColorSpace;
      mat = new THREE.MeshLambertMaterial({ map: tex });
    } catch (_) {
      mat = new THREE.MeshLambertMaterial({ color: 0xd0d0d0 });
    }

    const root = new THREE.Group();

    // Standard Minecraft Skeleton proportions (total height = 2.1)
    // Head: 8x8x8 px -> 0.5x0.5x0.5
    const head = createMinecraftBox(0.5, 0.5, 0.5, 0, 0, 8, 8, 8, 64, 32, mat);
    head.position.set(0, 1.77, 0);
    root.add(head);

    // Body: 8x12x4 px -> 0.5x0.76x0.25
    const body = createMinecraftBox(0.5, 0.76, 0.25, 16, 16, 8, 12, 4, 64, 32, mat);
    body.position.set(0, 1.14, 0);
    root.add(body);

    // Right Arm: 2x12x2 px -> 0.14x0.76x0.14
    const rArm = createMinecraftBox(0.14, 0.76, 0.14, 40, 16, 2, 12, 2, 64, 32, mat);
    rArm.position.set(-0.32, 1.25, 0.22);
    rArm.rotation.x = -Math.PI * 0.45; // aiming bow forward towards player
    rArm.rotation.z = -0.1;
    root.add(rArm);

    // Left Arm: 2x12x2 px -> 0.14x0.76x0.14
    const lArm = createMinecraftBox(0.14, 0.76, 0.14, 40, 16, 2, 12, 2, 64, 32, mat);
    lArm.position.set(0.32, 1.25, 0.22);
    lArm.rotation.x = -Math.PI * 0.45; // aiming bow forward towards player
    lArm.rotation.z = 0.1;
    root.add(lArm);

    // Right Leg: 2x12x2 px -> 0.14x0.76x0.14
    const rLeg = createMinecraftBox(0.14, 0.76, 0.14, 0, 16, 2, 12, 2, 64, 32, mat);
    rLeg.position.set(-0.13, 0.38, 0);
    root.add(rLeg);

    // Left Leg: 2x12x2 px -> 0.14x0.76x0.14
    const lLeg = createMinecraftBox(0.14, 0.76, 0.14, 0, 16, 2, 12, 2, 64, 32, mat);
    lLeg.position.set(0.13, 0.38, 0);
    root.add(lLeg);

    // Minecraft Bow held in hands
    const bowMat = new THREE.MeshLambertMaterial({ color: 0x5a3d20 });
    const bowMesh = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.62, 0.06), bowMat);
    bowMesh.position.set(0, 1.25, 0.52);
    bowMesh.rotation.z = -0.15;
    root.add(bowMesh);

    return {
      root,
      targetHeight: 2.1,
      radius: 0.45
    };
  }

  async createWitherTemplate() {
    const texLoader = new THREE.TextureLoader();
    let mat;
    try {
      const tex = await texLoader.loadAsync('models/wither/textures/M_Wither_baseColor.png');
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.colorSpace = THREE.SRGBColorSpace;
      mat = new THREE.MeshLambertMaterial({ map: tex });
    } catch (_) {
      mat = new THREE.MeshLambertMaterial({ color: 0x222222 });
    }

    const root = new THREE.Group();

    // Central Main Head (8x8x8)
    const mainHead = createMinecraftBox(0.65, 0.65, 0.65, 0, 0, 8, 8, 8, 64, 64, mat);
    mainHead.position.set(0, 2.45, 0.05);
    root.add(mainHead);

    // Left Head (6x6x6)
    const leftHead = createMinecraftBox(0.50, 0.50, 0.50, 32, 0, 6, 6, 6, 64, 64, mat);
    leftHead.position.set(-0.85, 2.25, 0);
    root.add(leftHead);

    // Right Head (6x6x6)
    const rightHead = createMinecraftBox(0.50, 0.50, 0.50, 32, 0, 6, 6, 6, 64, 64, mat);
    rightHead.position.set(0.85, 2.25, 0);
    root.add(rightHead);

    // Shoulder Horizontal Bar (20x3x3)
    const bar = createMinecraftBox(2.0, 0.28, 0.28, 0, 16, 20, 3, 3, 64, 64, mat);
    bar.position.set(0, 1.9, 0);
    root.add(bar);

    // Vertical Spine (3x10x3)
    const spine = createMinecraftBox(0.28, 1.0, 0.28, 0, 22, 3, 10, 3, 64, 64, mat);
    spine.position.set(0, 1.35, 0);
    root.add(spine);

    // 3 Ribs across spine (8x2x2)
    const ribMat = mat;
    const r1 = createMinecraftBox(0.9, 0.18, 0.22, 12, 22, 8, 2, 2, 64, 64, ribMat);
    r1.position.set(0, 1.6, 0.02);
    root.add(r1);

    const r2 = createMinecraftBox(0.75, 0.18, 0.22, 12, 22, 8, 2, 2, 64, 64, ribMat);
    r2.position.set(0, 1.35, 0.02);
    root.add(r2);

    const r3 = createMinecraftBox(0.6, 0.18, 0.22, 12, 22, 8, 2, 2, 64, 64, ribMat);
    r3.position.set(0, 1.1, 0.02);
    root.add(r3);

    // Tail (3x6x3)
    const tail = createMinecraftBox(0.25, 0.6, 0.25, 0, 35, 3, 6, 3, 64, 64, mat);
    tail.position.set(0, 0.55, 0);
    root.add(tail);

    return {
      root,
      targetHeight: 2.7,
      radius: 0.95
    };
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
    if (!this.templates[type]) {
      type = 'creeper';
    }

    const tmpl = this.templates[type];
    // Native three.js clone: completely bug-free and instant
    const group = tmpl.root.clone(true);

    // Deep clone materials so damage flash affects only this individual mob
    const meshes = [];
    const originalColors = [];
    group.traverse((c) => {
      if (c.isMesh) {
        c.castShadow = true;
        c.receiveShadow = true;
        c.frustumCulled = false;
        if (c.material) {
          c.material = c.material.clone();
          meshes.push(c);
          originalColors.push(c.material.color.clone());
        }
      }
    });

    group.position.set(x, 0, z);
    this.scene.add(group);

    const id = this.nextMobId++;

    let maxHealth = 20;
    let speed = 2.4;
    let pointValue = 100;
    let fuseTime = 1.8;
    const isBoss = type === 'wither';

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
      state: 'walking',
      fuseTimer: 0,
      shootTimer: 2.2 + Math.random() * 2.0,
      flashTimer: 0,
      deathTimer: 0,
      wobblePhase: Math.random() * Math.PI * 2,
      isBoss
    };

    this.activeMobs.push(mob);

    if (isBoss && this.onBossHealthChange) {
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

    // Puff of smoke & death explosion
    const centerPos = mob.group.position.clone();
    centerPos.y += 1.0;
    this.world.spawnExplosion(centerPos, mob.isBoss ? 45 : 18);

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

      // Damage Flash Timer
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

      // Dead State Animation
      if (mob.state === 'dead') {
        mob.deathTimer += delta;
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

      // Always orient mob horizontally towards the player so it faces the camera directly!
      const targetAngle = Math.atan2(playerPos.x - mob.group.position.x, playerPos.z - mob.group.position.z);
      mob.group.rotation.y = targetAngle;

      // --- CREEPER BEHAVIOR ---
      if (mob.type === 'creeper') {
        const distZ = mob.group.position.z;

        if (distZ < -3.8) {
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
              this.onPlayerDamage(6, 'creeper');
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
          mob.group.position.z += mob.speed * delta;
          mob.group.rotation.z = wobble * 0.5;
          if (mob.group.children[4] && mob.group.children[5]) {
            mob.group.children[4].rotation.x = Math.sin(mob.wobblePhase) * 0.4;
            mob.group.children[5].rotation.x = -Math.sin(mob.wobblePhase) * 0.4;
          }
        } else {
          // In shooting range!
          mob.group.rotation.z = 0;
          if (mob.group.children[4] && mob.group.children[5]) {
            mob.group.children[4].rotation.x = 0;
            mob.group.children[5].rotation.x = 0;
          }
          mob.shootTimer -= delta;

          if (mob.shootTimer <= 0) {
            mob.shootTimer = 2.4 + Math.random() * 1.2;
            this.sounds.playSkeletonShot();

            const arrowOrigin = mob.group.position.clone();
            arrowOrigin.y += 1.4;
            const targetPos = new THREE.Vector3(playerPos.x, 0.4, 0);

            this.world.spawnArrow(arrowOrigin, targetPos, () => {
              if (this.onPlayerDamage) {
                this.onPlayerDamage(3, 'skeleton');
              }
            });
          }
        }
      }

      // --- WITHER BOSS BEHAVIOR ---
      else if (mob.type === 'wither') {
        mob.group.position.z = Math.min(-12, mob.group.position.z + mob.speed * delta);
        mob.group.position.x = Math.sin(Date.now() * 0.0015) * 4.5;
        mob.group.position.y = 3.6 + Math.cos(Date.now() * 0.0025) * 0.8;

        mob.shootTimer -= delta;
        if (mob.shootTimer <= 0) {
          mob.shootTimer = 2.2 + Math.random() * 1.4;
          this.sounds.playWitherRoar();

          const skullOrigin = mob.group.position.clone();
          skullOrigin.y -= 0.5;
          const targetPos = new THREE.Vector3(playerPos.x, 0.2, 0);

          this.world.spawnArrow(skullOrigin, targetPos, () => {
            if (this.onPlayerDamage) {
              this.onPlayerDamage(5, 'wither');
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
