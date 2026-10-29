import * as THREE from 'three';
import { sounds } from './audio.js';
import { World } from './world.js';
import { DiamondSword } from './sword.js';
import { MobManager } from './mobs.js';

/**
 * Main Minecraft Mob Defense Controller
 */
class MinecraftGame {
  constructor() {
    this.container = document.getElementById('game-container');
    this.canvas = document.getElementById('game-canvas');

    // UI Elements
    this.scoreEl = document.getElementById('score-val');
    this.waveEl = document.getElementById('wave-val');
    this.killsEl = document.getElementById('kills-val');
    this.comboEl = document.getElementById('combo-val');
    this.accuracyEl = document.getElementById('accuracy-val');
    this.heartsContainer = document.getElementById('hearts-container');
    this.xpLevelEl = document.getElementById('xp-level');
    this.xpBarFill = document.getElementById('xp-bar-fill');
    this.attackIndicator = document.getElementById('attack-indicator');
    this.attackIndicatorFill = document.getElementById('attack-indicator-fill');
    this.bossBarContainer = document.getElementById('boss-bar-container');
    this.bossBarFill = document.getElementById('boss-bar-fill');
    this.combatFeedbackLayer = document.getElementById('combat-feedback-layer');
    this.hurtVignette = document.getElementById('hurt-vignette');

    // Modals
    this.startModal = document.getElementById('start-modal');
    this.gameOverModal = document.getElementById('gameover-modal');
    this.victoryModal = document.getElementById('victory-modal');

    // Dificultades
    this.difficulties = {
      easy: {
        name: 'FÁCIL',
        waves: 3,
        mobSpeedMultiplier: 0.75,
        creeperFuse: 2.8,
        bossHealthMultiplier: 0.65,
        damageTakenMultiplier: 0.7,
        spawnInterval: 3.2
      },
      medium: {
        name: 'MEDIO',
        waves: 4,
        mobSpeedMultiplier: 1.0,
        creeperFuse: 1.8,
        bossHealthMultiplier: 1.0,
        damageTakenMultiplier: 1.0,
        spawnInterval: 2.4
      },
      hard: {
        name: 'DIFÍCIL',
        waves: 5,
        mobSpeedMultiplier: 1.35,
        creeperFuse: 1.25,
        bossHealthMultiplier: 1.35,
        damageTakenMultiplier: 1.4,
        spawnInterval: 1.7
      },
      endless: {
        name: 'HORDA INFINITA',
        waves: Infinity,
        mobSpeedMultiplier: 1.1,
        creeperFuse: 1.6,
        bossHealthMultiplier: 1.1,
        damageTakenMultiplier: 1.1,
        spawnInterval: 2.0
      }
    };
    this.activeDifficulty = this.difficulties.medium;

    // Player State
    this.maxHealth = 20; // 10 hearts
    this.health = 20;
    this.score = 0;
    this.kills = 0;
    this.shots = 0;
    this.hits = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.currentWave = 1;
    this.xp = 0;
    this.xpLevel = 1;
    this.xpForNextLevel = 400;

    // Game Loop State
    this.state = 'menu'; // 'menu', 'playing', 'gameover', 'victory', 'paused'
    this.clock = new THREE.Clock();
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2(0, 0);

    // Camera rotation look bounds
    this.targetCameraRot = new THREE.Euler(0, 0, 0, 'YXZ');
    this.currentCameraRot = new THREE.Euler(0, 0, 0, 'YXZ');

    // Wave spawning state
    this.waveMobsToSpawn = [];
    this.spawnTimer = 0;
    this.waveTransitionTimer = 0;
    this.isWaveTransitioning = false;

    this.initThree();
    this.initSubsystems();
    this.initEventListeners();
    this.renderHearts();
  }

  initThree() {
    this.scene = new THREE.Scene();

    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(65, aspect, 0.1, 1000);
    this.camera.position.set(0, 0.8, 0); // Player eye level
    this.scene.add(this.camera);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    window.addEventListener('resize', () => this.onWindowResize());
  }

  initSubsystems() {
    this.world = new World(this.scene);
    this.sword = new DiamondSword(this.camera, sounds);
    this.mobManager = new MobManager(this.scene, this.world, sounds);

    const startBtn = document.getElementById('start-btn');
    if (!this.mobManager.isLoaded) {
      startBtn.disabled = true;
      startBtn.textContent = '⏳ CARGANDO RECURSOS...';
      this.mobManager.onLoadedCallback = () => {
        startBtn.disabled = false;
        startBtn.textContent = '⚔️ INICIAR DEFENSA';
      };
    }

    // Mob callbacks
    this.mobManager.onPlayerDamage = (amount, source) => {
      this.takePlayerDamage(amount, source);
    };

    this.mobManager.onMobKilled = (mob, isCritical) => {
      this.handleMobKilled(mob, isCritical);
    };

    this.mobManager.onBossHealthChange = (health, maxHealth, isAlive) => {
      if (!isAlive || health <= 0) {
        this.bossBarContainer.classList.remove('visible');
      } else {
        this.bossBarContainer.classList.add('visible');
        const pct = Math.max(0, Math.min(100, (health / maxHealth) * 100));
        this.bossBarFill.style.width = `${pct}%`;
      }
    };
  }

  initEventListeners() {
    // Mouse movement: camera look & weapon sway
    window.addEventListener('mousemove', (e) => {
      // Convert to normalized coordinates (-1 to 1)
      this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

      // Subtly pan camera towards mouse
      const maxYaw = 0.35; // horizontal angle limit
      const maxPitch = 0.22; // vertical angle limit
      this.targetCameraRot.y = -this.mouse.x * maxYaw;
      this.targetCameraRot.x = this.mouse.y * maxPitch;

      if (this.sword) {
        this.sword.onMouseMove(e.movementX, e.movementY);
      }
    });

    // Attack on Click
    window.addEventListener('mousedown', (e) => {
      if (this.state !== 'playing') return;
      if (e.button !== 0) return; // Left click only
      sounds.init();
      this.attack();
    });

    // Spacebar to attack as well
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && this.state === 'playing') {
        e.preventDefault();
        sounds.init();
        this.attack();
      }
    });

    // Difficulty selection cards
    document.querySelectorAll('.diff-card').forEach((card) => {
      card.addEventListener('click', () => {
        sounds.playButtonClick();
        document.querySelectorAll('.diff-card').forEach((c) => c.classList.remove('selected'));
        card.classList.add('selected');
        const diffKey = card.dataset.diff;
        if (this.difficulties[diffKey]) {
          this.activeDifficulty = this.difficulties[diffKey];
        }
      });
    });

    // UI Buttons
    document.getElementById('start-btn').addEventListener('click', () => {
      sounds.init();
      sounds.playButtonClick();
      this.startGame();
    });

    document.getElementById('restart-btn').addEventListener('click', () => {
      sounds.playButtonClick();
      this.startGame();
    });

    document.getElementById('victory-btn').addEventListener('click', () => {
      sounds.playButtonClick();
      this.startGame();
    });

    document.getElementById('mute-btn').addEventListener('click', () => {
      const isMuted = sounds.toggleMute();
      document.getElementById('mute-btn').textContent = isMuted ? '🔇' : '🔊';
    });

    document.getElementById('music-btn').addEventListener('click', () => {
      if (sounds.isMusicPlaying) {
        sounds.stopMusic();
        document.getElementById('music-btn').textContent = '🎵 OFF';
      } else {
        sounds.startMusic();
        document.getElementById('music-btn').textContent = '🎵 ON';
      }
    });
  }

  onWindowResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  startGame() {
    // Hide modals
    this.startModal.classList.remove('active');
    this.gameOverModal.classList.remove('active');
    this.victoryModal.classList.remove('active');

    // Reset stats
    this.health = this.maxHealth;
    this.score = 0;
    this.kills = 0;
    this.shots = 0;
    this.hits = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.currentWave = 1;
    this.xp = 0;
    this.xpLevel = 1;
    this.xpForNextLevel = 400;

    this.mobManager.clearAll();
    this.updateHUD();
    this.prepareWave(this.currentWave);

    this.state = 'playing';
    this.showFloatingText(window.innerWidth / 2, window.innerHeight * 0.35, `¡OLEADA ${this.currentWave}!`, 'defuse');
  }

  prepareWave(waveNum) {
    this.isWaveTransitioning = false;
    this.waveMobsToSpawn = [];
    this.spawnTimer = 0.5;

    // Mob composition by wave & difficulty
    const countMultiplier = this.activeDifficulty.waves === Infinity ? (1 + waveNum * 0.25) : 1;

    if (waveNum === 1) {
      // Wave 1: Mostly Creepers to learn timing
      for (let i = 0; i < Math.floor(4 * countMultiplier); i++) {
        this.waveMobsToSpawn.push('creeper');
      }
    } else if (waveNum === 2) {
      // Wave 2: Creepers + Skeletons
      for (let i = 0; i < Math.floor(3 * countMultiplier); i++) {
        this.waveMobsToSpawn.push('creeper');
        this.waveMobsToSpawn.push('skeleton');
      }
    } else if (waveNum === 3) {
      // Wave 3: Faster horde
      for (let i = 0; i < Math.floor(5 * countMultiplier); i++) {
        this.waveMobsToSpawn.push('creeper');
      }
      for (let i = 0; i < Math.floor(3 * countMultiplier); i++) {
        this.waveMobsToSpawn.push('skeleton');
      }
    } else if (waveNum === 4) {
      // Wave 4: Intense rush
      for (let i = 0; i < Math.floor(6 * countMultiplier); i++) {
        this.waveMobsToSpawn.push('creeper');
      }
      for (let i = 0; i < Math.floor(4 * countMultiplier); i++) {
        this.waveMobsToSpawn.push('skeleton');
      }
    } else if (waveNum >= 5) {
      // Final Wave: WITHER BOSS + Minions!
      this.waveMobsToSpawn.push('wither');
      for (let i = 0; i < 4; i++) {
        this.waveMobsToSpawn.push('skeleton');
        this.waveMobsToSpawn.push('creeper');
      }
    }

    this.updateHUD();
  }

  attack() {
    this.shots++;

    // Trigger sword animation & fetch charge
    const charge = this.sword.triggerAttack();

    // Slash particle arc in front of camera
    this.world.spawnSlashArc(this.camera.position, this.camera.getWorldDirection(new THREE.Vector3()));

    // Raycast from center crosshair
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    const hit = this.mobManager.raycast(this.raycaster);

    // Screen coordinates of center
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;

    if (hit) {
      const mob = hit.mob;
      const dist = hit.distance;

      // Sword reach limit (~15 units)
      if (dist <= 15.5) {
        this.hits++;
        this.combo++;
        if (this.combo > this.maxCombo) this.maxCombo = this.combo;

        // Critical hit check: fully charged strike (>= 0.88 charge)
        const isCritical = charge >= 0.88;

        // Base damage: 14 HP. Critical: 28 HP
        let damage = Math.round((isCritical ? 26 : 14) * Math.max(0.3, charge));
        if (this.activeDifficulty === this.difficulties.easy) {
          damage = Math.round(damage * 1.5); // Boosted on easy
        }

        // Apply mob damage
        this.mobManager.takeDamage(mob, damage, isCritical);

        if (isCritical) {
          sounds.playCrit();
          this.world.spawnCritParticles(hit.point, 16);
          this.showFloatingText(cx + (Math.random() - 0.5) * 40, cy - 30, `¡CRÍTICO! -${damage}`, 'crit');
        } else {
          sounds.playHit();
          this.world.spawnCritParticles(hit.point, 6);
          this.showFloatingText(cx + (Math.random() - 0.5) * 30, cy - 20, `-${damage}`, 'hit');
        }

        // Screen micro shake on impact
        this.shakeScreen();
      } else {
        // Out of reach
        this.showFloatingText(cx, cy + 30, '¡DEMASIADO LEJOS!', 'hurt');
      }
    } else {
      // Missed
      if (this.combo > 1) {
        this.combo = 0;
      }
    }

    this.updateHUD();
  }

  handleMobKilled(mob, isCritical) {
    this.kills++;

    // Calculate score & XP
    let points = mob.pointValue;
    if (isCritical) points = Math.round(points * 1.5);
    if (this.combo > 1) points = Math.round(points * (1 + this.combo * 0.15));

    this.score += points;
    this.addXP(Math.round(points * 0.8));

    // Special banner for defusing Creeper
    if (mob.type === 'creeper') {
      this.showFloatingText(window.innerWidth / 2, window.innerHeight * 0.45, '¡CREEPER ELIMINADO! +XP', 'defuse');
    } else if (mob.type === 'wither') {
      this.showFloatingText(window.innerWidth / 2, window.innerHeight * 0.35, '¡WITHER DERROTADO! +1500', 'crit');
      sounds.playLevelUp();
    }

    this.updateHUD();
  }

  addXP(amount) {
    this.xp += amount;
    if (this.xp >= this.xpForNextLevel) {
      this.xp -= this.xpForNextLevel;
      this.xpLevel++;
      this.xpForNextLevel = Math.round(this.xpForNextLevel * 1.35);
      sounds.playLevelUp();
      this.showFloatingText(window.innerWidth / 2, window.innerHeight * 0.25, `¡NIVEL ${this.xpLevel}!`, 'defuse');

      // Heal 2 hearts on level up!
      this.health = Math.min(this.maxHealth, this.health + 4);
      this.renderHearts();
    }

    const pct = Math.min(100, (this.xp / this.xpForNextLevel) * 100);
    this.xpBarFill.style.width = `${pct}%`;
    this.xpLevelEl.textContent = `Lv. ${this.xpLevel}`;
  }

  takePlayerDamage(amount, source) {
    if (this.state !== 'playing') return;

    const scaledDamage = Math.round(amount * (this.activeDifficulty.damageTakenMultiplier || 1.0));
    this.health = Math.max(0, this.health - scaledDamage);
    this.combo = 0; // Break combo

    sounds.playPlayerHurt();

    // Trigger red hurt vignette
    this.hurtVignette.classList.add('active');
    setTimeout(() => this.hurtVignette.classList.remove('active'), 250);

    // Screen shake
    this.shakeScreen(true);
    this.renderHearts();
    this.updateHUD();

    if (this.health <= 0) {
      this.gameOver();
    }
  }

  shakeScreen(hard = false) {
    this.canvas.classList.remove('shake-screen');
    void this.canvas.offsetWidth; // Trigger reflow
    this.canvas.classList.add('shake-screen');
  }

  showFloatingText(x, y, text, type = 'hit') {
    const el = document.createElement('div');
    el.className = `floating-text ${type}`;
    el.textContent = text;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    this.combatFeedbackLayer.appendChild(el);

    setTimeout(() => {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 850);
  }

  renderHearts() {
    this.heartsContainer.innerHTML = '';
    const totalHearts = 10;
    const currentHalfHearts = this.health; // 20 max

    for (let i = 0; i < totalHearts; i++) {
      const heartVal = currentHalfHearts - i * 2;
      const heartSvg = document.createElement('div');
      heartSvg.className = 'mc-heart';
      if (heartVal <= 0) {
        // Empty Heart
        heartSvg.innerHTML = `
          <svg viewBox="0 0 16 16" width="18" height="18">
            <path fill="#222" d="M2,2 h4 v2 h-4 z M10,2 h4 v2 h-4 z M1,4 h6 v2 h-6 z M9,4 h6 v2 h-6 z M1,6 h14 v4 h-14 z M3,10 h10 v2 h-10 z M5,12 h6 v2 h-6 z M7,14 h2 v2 h-2 z"/>
            <path fill="#555" d="M3,3 h2 v2 h-2 z M11,3 h2 v2 h-2 z M2,5 h12 v4 h-12 z M4,9 h8 v2 h-8 z M6,11 h4 v2 h-4 z"/>
          </svg>`;
      } else if (heartVal === 1) {
        // Half Heart
        heartSvg.innerHTML = `
          <svg viewBox="0 0 16 16" width="18" height="18">
            <path fill="#222" d="M2,2 h4 v2 h-4 z M10,2 h4 v2 h-4 z M1,4 h6 v2 h-6 z M9,4 h6 v2 h-6 z M1,6 h14 v4 h-14 z M3,10 h10 v2 h-10 z M5,12 h6 v2 h-6 z M7,14 h2 v2 h-2 z"/>
            <path fill="#555" d="M11,3 h2 v2 h-2 z M8,5 h6 v4 h-6 z M8,9 h4 v2 h-4 z M8,11 h2 v2 h-2 z"/>
            <path fill="#e01010" d="M3,3 h2 v2 h-2 z M2,5 h6 v4 h-6 z M4,9 h4 v2 h-4 z M6,11 h2 v2 h-2 z"/>
            <path fill="#ff6666" d="M3,3 h1 v1 h-1 z M2,5 h2 v1 h-2 z"/>
          </svg>`;
        heartSvg.classList.add('shake');
      } else {
        // Full Heart
        heartSvg.innerHTML = `
          <svg viewBox="0 0 16 16" width="18" height="18">
            <path fill="#222" d="M2,2 h4 v2 h-4 z M10,2 h4 v2 h-4 z M1,4 h6 v2 h-6 z M9,4 h6 v2 h-6 z M1,6 h14 v4 h-14 z M3,10 h10 v2 h-10 z M5,12 h6 v2 h-6 z M7,14 h2 v2 h-2 z"/>
            <path fill="#e01010" d="M3,3 h2 v2 h-2 z M11,3 h2 v2 h-2 z M2,5 h12 v4 h-12 z M4,9 h8 v2 h-8 z M6,11 h4 v2 h-4 z M7,13 h2 v1 h-2 z"/>
            <path fill="#ff6666" d="M3,3 h1 v1 h-1 z M11,3 h1 v1 h-1 z M2,5 h2 v1 h-2 z M10,5 h2 v1 h-2 z"/>
          </svg>`;
      }
      this.heartsContainer.appendChild(heartSvg);
    }
  }

  updateHUD() {
    this.scoreEl.textContent = this.score;
    this.waveEl.textContent = this.activeDifficulty.waves === Infinity
      ? `${this.currentWave}`
      : `${this.currentWave} / ${this.activeDifficulty.waves}`;
    this.killsEl.textContent = this.kills;

    // Combo
    if (this.combo > 1) {
      this.comboEl.textContent = `x${this.combo} COMBO!`;
      this.comboEl.className = 'hud-val hud-combo';
    } else {
      this.comboEl.textContent = 'x1';
      this.comboEl.className = 'hud-val';
    }

    // Accuracy
    const acc = this.shots > 0 ? Math.round((this.hits / this.shots) * 100) : 100;
    this.accuracyEl.textContent = `${acc}%`;
  }

  gameOver() {
    this.state = 'gameover';
    this.mobManager.clearAll();

    // Populate game over stats
    document.getElementById('go-score').textContent = this.score;
    document.getElementById('go-wave').textContent = this.currentWave;
    document.getElementById('go-kills').textContent = this.kills;
    document.getElementById('go-accuracy').textContent = `${this.shots > 0 ? Math.round((this.hits / this.shots) * 100) : 100}%`;

    this.gameOverModal.classList.add('active');
  }

  victory() {
    this.state = 'victory';
    this.mobManager.clearAll();
    sounds.playLevelUp();

    // Rank evaluation
    let rank = 'Guerrero de Madera';
    if (this.score >= 5000) rank = 'Leyenda de Netherite ⚔️';
    else if (this.score >= 3000) rank = 'Campeón de Diamante 💎';
    else if (this.score >= 1500) rank = 'Defensor de Hierro 🛡️';

    document.getElementById('vic-rank').textContent = rank;
    document.getElementById('vic-score').textContent = this.score;
    document.getElementById('vic-kills').textContent = this.kills;
    document.getElementById('vic-combo').textContent = `x${this.maxCombo}`;

    this.victoryModal.classList.add('active');
  }

  update(delta) {
    // Camera smooth look rotation interpolation
    this.currentCameraRot.y = THREE.MathUtils.lerp(this.currentCameraRot.y, this.targetCameraRot.y, 0.12);
    this.currentCameraRot.x = THREE.MathUtils.lerp(this.currentCameraRot.x, this.targetCameraRot.x, 0.12);
    this.camera.rotation.copy(this.currentCameraRot);

    // Update World (clouds, particles, torches, arrows)
    this.world.update(delta);

    // Update Diamond Sword
    if (this.sword) {
      this.sword.update(delta);
      // Update attack charge indicator
      const pct = Math.min(100, Math.round(this.sword.charge * 100));
      this.attackIndicatorFill.style.width = `${pct}%`;
      this.attackIndicator.classList.toggle('charged', this.sword.charge >= 0.95);
    }

    if (this.state === 'playing') {
      // Spawn wave mobs
      if (this.waveMobsToSpawn.length > 0) {
        this.spawnTimer -= delta;
        if (this.spawnTimer <= 0) {
          this.spawnTimer = this.activeDifficulty.spawnInterval;
          const nextType = this.waveMobsToSpawn.shift();
          // Varied X positions (-6 to 6) and far depth Z (-32 to -22)
          const spawnX = (Math.random() - 0.5) * 11;
          const spawnZ = -26 - Math.random() * 8;
          this.mobManager.spawnMob(nextType, spawnX, spawnZ, this.activeDifficulty);
        }
      }

      // Update active mobs
      this.mobManager.update(delta, this.camera.position);

      // Check wave completion
      if (this.waveMobsToSpawn.length === 0 && this.mobManager.activeMobs.length === 0) {
        if (!this.isWaveTransitioning) {
          this.isWaveTransitioning = true;
          this.waveTransitionTimer = 2.2;
          sounds.playLevelUp();
          this.showFloatingText(window.innerWidth / 2, window.innerHeight * 0.35, '¡OLEADA COMPLETADA!', 'defuse');
        } else {
          this.waveTransitionTimer -= delta;
          if (this.waveTransitionTimer <= 0) {
            if (this.currentWave >= this.activeDifficulty.waves && this.activeDifficulty.waves !== Infinity) {
              this.victory();
            } else {
              this.currentWave++;
              this.prepareWave(this.currentWave);
              this.showFloatingText(window.innerWidth / 2, window.innerHeight * 0.35, `¡OLEADA ${this.currentWave}!`, 'defuse');
            }
          }
        }
      }
    }

    this.renderer.render(this.scene, this.camera);
  }

  startLoop() {
    const loop = () => {
      requestAnimationFrame(loop);
      const delta = Math.min(0.1, this.clock.getDelta());
      this.update(delta);
    };
    loop();
  }
}

// Instantiate and start
window.addEventListener('DOMContentLoaded', () => {
  const game = new MinecraftGame();
  game.startLoop();
});
