import * as THREE from 'three';

/**
 * Procedural Minecraft 3D World:
 * - Night sky with blocky square moon, twinkling stars, and drifting voxel clouds
 * - Voxel grass ground with authentic pixel texture
 * - Village defensive barrier with torches, flickering fire & smoke
 * - Particle engine for critical hits, explosion puffs, and sword sweep arcs
 */
export class World {
  constructor(scene) {
    this.scene = scene;
    this.particles = [];
    this.torches = [];
    this.clouds = [];
    this.arrows = [];
    this.clock = new THREE.Clock();

    this.initLighting();
    this.initSky();
    this.initGround();
    this.initBarrierAndTorches();
    this.initParticleHelpers();
  }

  initLighting() {
    // Night ambient light
    this.ambientLight = new THREE.AmbientLight(0x2d3a52, 1.4);
    this.scene.add(this.ambientLight);

    // Directional moonlight casting soft illumination
    this.moonLight = new THREE.DirectionalLight(0xa5c4ff, 1.6);
    this.moonLight.position.set(15, 30, -40);
    this.scene.add(this.moonLight);

    // Atmospheric deep night fog
    this.scene.background = new THREE.Color(0x0a0f1c);
    this.scene.fog = new THREE.FogExp2(0x0a0f1c, 0.024);
  }

  initSky() {
    // Blocky Square Minecraft Moon
    const moonGeo = new THREE.PlaneGeometry(12, 12);
    // Pixelated moon texture on canvas
    const moonCanvas = document.createElement('canvas');
    moonCanvas.width = 16;
    moonCanvas.height = 16;
    const mctx = moonCanvas.getContext('2d');
    mctx.fillStyle = '#f0f5ff';
    mctx.fillRect(0, 0, 16, 16);
    // Inner crater details
    mctx.fillStyle = '#c5d3ea';
    mctx.fillRect(2, 3, 4, 3);
    mctx.fillRect(9, 2, 5, 4);
    mctx.fillRect(4, 9, 5, 4);
    mctx.fillRect(11, 10, 3, 3);
    const moonTex = new THREE.CanvasTexture(moonCanvas);
    moonTex.magFilter = THREE.NearestFilter;
    moonTex.minFilter = THREE.NearestFilter;

    const moonMat = new THREE.MeshBasicMaterial({
      map: moonTex,
      transparent: true,
      side: THREE.DoubleSide
    });
    this.moonMesh = new THREE.Mesh(moonGeo, moonMat);
    this.moonMesh.position.set(18, 32, -65);
    this.moonMesh.lookAt(0, 0, 0);
    this.scene.add(this.moonMesh);

    // Twinkling Starfield
    const starCount = 350;
    const starGeo = new THREE.BufferGeometry();
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const r = 85 + Math.random() * 15;
      const sinPhi = Math.sin(phi);
      // Keep stars mostly in upper hemisphere
      starPositions[i * 3] = r * sinPhi * Math.cos(theta);
      starPositions[i * 3 + 1] = Math.abs(r * Math.cos(phi)) + 6;
      starPositions[i * 3 + 2] = -Math.abs(r * sinPhi * Math.sin(theta)) - 5;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const starMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 1.2,
      transparent: true,
      opacity: 0.85
    });
    this.stars = new THREE.Points(starGeo, starMat);
    this.scene.add(this.stars);

    // Voxel Clouds
    const cloudMat = new THREE.MeshBasicMaterial({
      color: 0x8fa2c4,
      transparent: true,
      opacity: 0.35,
      depthWrite: false
    });
    for (let i = 0; i < 12; i++) {
      const w = 15 + Math.random() * 25;
      const d = 15 + Math.random() * 25;
      const cloudGeo = new THREE.BoxGeometry(w, 2.5, d);
      const cloud = new THREE.Mesh(cloudGeo, cloudMat);
      cloud.position.set(
        (Math.random() - 0.5) * 120,
        22 + Math.random() * 6,
        -15 - Math.random() * 70
      );
      this.scene.add(cloud);
      this.clouds.push({ mesh: cloud, speed: 0.8 + Math.random() * 0.6 });
    }
  }

  initGround() {
    // Generate authentic pixelated Minecraft grass block canvas
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    // Base green tones
    const greens = ['#477a1e', '#558a28', '#3e6c1a', '#5c962c', '#376016'];
    for (let x = 0; x < 64; x += 4) {
      for (let y = 0; y < 64; y += 4) {
        ctx.fillStyle = greens[Math.floor(Math.random() * greens.length)];
        ctx.fillRect(x, y, 4, 4);
      }
    }
    // Subtle grid seam
    ctx.strokeStyle = 'rgba(25, 45, 10, 0.45)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, 64, 64);

    const grassTex = new THREE.CanvasTexture(canvas);
    grassTex.wrapS = THREE.RepeatWrapping;
    grassTex.wrapT = THREE.RepeatWrapping;
    grassTex.repeat.set(30, 45);
    grassTex.magFilter = THREE.NearestFilter;
    grassTex.minFilter = THREE.NearestFilter;

    const groundGeo = new THREE.PlaneGeometry(90, 120);
    const groundMat = new THREE.MeshLambertMaterial({
      map: grassTex,
      roughness: 0.9
    });
    this.ground = new THREE.Mesh(groundGeo, groundMat);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.set(0, -1.2, -45);
    this.scene.add(this.ground);
  }

  initBarrierAndTorches() {
    // Cobblestone textured barrier / wall
    const cobbleCanvas = document.createElement('canvas');
    cobbleCanvas.width = 32;
    cobbleCanvas.height = 32;
    const cctx = cobbleCanvas.getContext('2d');
    const grays = ['#5a5a5a', '#6d6d6d', '#484848', '#7b7b7b', '#3b3b3b'];
    for (let x = 0; x < 32; x += 4) {
      for (let y = 0; y < 32; y += 4) {
        cctx.fillStyle = grays[Math.floor(Math.random() * grays.length)];
        cctx.fillRect(x, y, 4, 4);
      }
    }
    cctx.strokeStyle = '#292929';
    cctx.strokeRect(0, 0, 32, 32);

    const cobbleTex = new THREE.CanvasTexture(cobbleCanvas);
    cobbleTex.wrapS = THREE.RepeatWrapping;
    cobbleTex.wrapT = THREE.RepeatWrapping;
    cobbleTex.repeat.set(8, 1);
    cobbleTex.magFilter = THREE.NearestFilter;

    const wallMat = new THREE.MeshLambertMaterial({ map: cobbleTex });
    const wallGeo = new THREE.BoxGeometry(16, 1.2, 0.8);
    const wall = new THREE.Mesh(wallGeo, wallMat);
    wall.position.set(0, -0.6, -2.5);
    this.scene.add(wall);

    // Torches on Left and Right posts
    [-4.5, 4.5].forEach((xPos) => {
      // Wood post
      const postGeo = new THREE.BoxGeometry(0.5, 2.4, 0.5);
      const postMat = new THREE.MeshLambertMaterial({ color: 0x5a3d20 });
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(xPos, 0, -2.5);
      this.scene.add(post);

      // Torch handle
      const torchGeo = new THREE.BoxGeometry(0.18, 0.7, 0.18);
      const torchMat = new THREE.MeshLambertMaterial({ color: 0x8a5b29 });
      const torch = new THREE.Mesh(torchGeo, torchMat);
      torch.position.set(xPos, 1.3, -2.5);
      this.scene.add(torch);

      // Flame block
      const flameGeo = new THREE.BoxGeometry(0.22, 0.22, 0.22);
      const flameMat = new THREE.MeshBasicMaterial({ color: 0xffaa11 });
      const flame = new THREE.Mesh(flameGeo, flameMat);
      flame.position.set(xPos, 1.7, -2.5);
      this.scene.add(flame);

      // Flickering Warm Light
      const torchLight = new THREE.PointLight(0xffa733, 2.2, 18, 1.5);
      torchLight.position.set(xPos, 1.8, -2.3);
      this.scene.add(torchLight);

      this.torches.push({ light: torchLight, flame, baseIntensity: 2.2 });
    });
  }

  initParticleHelpers() {
    // Critical hit star geometry (tiny pixel star/cross)
    this.critGeo = new THREE.BoxGeometry(0.14, 0.14, 0.14);
    this.critMat = new THREE.MeshBasicMaterial({ color: 0xffee44 });

    // Smoke / Explosion cube geometry
    this.smokeGeo = new THREE.BoxGeometry(0.35, 0.35, 0.35);
    this.smokeMat = new THREE.MeshBasicMaterial({
      color: 0xcccccc,
      transparent: true,
      opacity: 0.8
    });
  }

  // --- SPAWN PARTICLES ---
  spawnCritParticles(position, count = 12) {
    for (let i = 0; i < count; i++) {
      const p = new THREE.Mesh(this.critGeo, this.critMat.clone());
      p.position.copy(position);
      p.position.x += (Math.random() - 0.5) * 0.8;
      p.position.y += (Math.random() - 0.5) * 0.8;
      p.position.z += (Math.random() - 0.5) * 0.8;

      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 4,
        2.5 + Math.random() * 4,
        (Math.random() - 0.5) * 4
      );

      this.scene.add(p);
      this.particles.push({
        mesh: p,
        vel,
        life: 0.6,
        maxLife: 0.6,
        gravity: -9.8
      });
    }
  }

  spawnExplosion(position, count = 25) {
    for (let i = 0; i < count; i++) {
      const mat = this.smokeMat.clone();
      // Tint varied smoke shades (dark gray to white to fiery orange)
      if (Math.random() < 0.25) {
        mat.color.setHex(0xff7722);
      } else if (Math.random() < 0.5) {
        mat.color.setHex(0x555555);
      }
      const p = new THREE.Mesh(this.smokeGeo, mat);
      p.position.copy(position);
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 9,
        2 + Math.random() * 7,
        (Math.random() - 0.5) * 9
      );
      this.scene.add(p);
      this.particles.push({
        mesh: p,
        vel,
        life: 0.9,
        maxLife: 0.9,
        gravity: -4.5,
        fade: true
      });
    }
  }

  spawnSlashArc(position, direction) {
    // Elegant diamond sweep arc
    const curve = new THREE.EllipseCurve(0, 0, 0.9, 0.7, 0, Math.PI * 0.8, false, 0);
    const points = curve.getPoints(12);
    const arcGeo = new THREE.BufferGeometry().setFromPoints(points);
    const arcMat = new THREE.LineBasicMaterial({
      color: 0x4df2ff,
      linewidth: 3,
      transparent: true,
      opacity: 0.9
    });
    const arc = new THREE.Line(arcGeo, arcMat);
    arc.position.copy(position);
    arc.position.z -= 1.2;
    arc.rotation.z = -0.4;
    this.scene.add(arc);

    this.particles.push({
      mesh: arc,
      vel: new THREE.Vector3(0, 0, -1),
      life: 0.18,
      maxLife: 0.18,
      gravity: 0,
      fade: true
    });
  }

  // --- SKELETON ARROW PROJECTILES ---
  spawnArrow(startPos, targetPos, onHitPlayer) {
    const arrowGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.9, 4);
    const arrowMat = new THREE.MeshLambertMaterial({ color: 0xddddcc });
    const arrow = new THREE.Mesh(arrowGeo, arrowMat);
    arrow.position.copy(startPos);
    arrow.lookAt(targetPos);
    arrow.rotateX(Math.PI / 2);
    this.scene.add(arrow);

    const dir = new THREE.Vector3().subVectors(targetPos, startPos).normalize();
    const speed = 14;

    this.arrows.push({
      mesh: arrow,
      dir,
      speed,
      onHitPlayer,
      active: true
    });
  }

  update(delta) {
    // Drifting clouds
    for (const c of this.clouds) {
      c.mesh.position.x += c.speed * delta;
      if (c.mesh.position.x > 65) {
        c.mesh.position.x = -65;
      }
    }

    // Torch flicker
    const now = Date.now() * 0.008;
    for (let i = 0; i < this.torches.length; i++) {
      const t = this.torches[i];
      const noise = Math.sin(now + i * 2.3) * 0.3 + Math.cos(now * 1.7) * 0.2;
      t.light.intensity = t.baseIntensity + noise;
      t.flame.scale.setScalar(1 + noise * 0.15);
    }

    // Particles update
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= delta;
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        this.particles.splice(i, 1);
        continue;
      }

      p.vel.y += p.gravity * delta;
      p.mesh.position.addScaledVector(p.vel, delta);
      p.mesh.rotation.x += delta * 4;
      p.mesh.rotation.y += delta * 5;

      if (p.fade && p.mesh.material) {
        p.mesh.material.opacity = Math.max(0, p.life / p.maxLife);
      }
    }

    // Skeleton arrows update
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const a = this.arrows[i];
      a.mesh.position.addScaledVector(a.dir, a.speed * delta);

      // Check if arrow reached player threshold (Z > -1.5)
      if (a.mesh.position.z >= -1.5) {
        this.scene.remove(a.mesh);
        if (a.active && a.onHitPlayer) {
          a.onHitPlayer();
        }
        this.arrows.splice(i, 1);
      }
    }
  }
}
