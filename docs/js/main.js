import * as THREE from 'three';
import { sounds } from './audio.js';
import { World } from './world.js';
import { DiamondSword } from './sword.js';
import { MobManager } from './mobs.js';

/**
 * Main Minecraft Mob Defense Controller
 * Features:
 * - Full 360-degree Pointer Lock FPS Controls
 * - Pause / Resume / Main Menu System
 * - Diamond Sword in Hand with Swing & Recharge
 * - Creeper & Skeleton waves (facing player)
 * - Complete Accessibility (A11y ARIA Live announcements, Keyboard navigation)
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
    this.combatFeedbackLayer = document.getElementById('combat-feedback-layer');
    this.hurtVignette = document.getElementById('hurt-vignette');
    this.a11yAnnouncer = document.getElementById('a11y-announcements');

    // Modals
    this.startModal = document.getElementById('start-modal');
    this.pauseModal = document.getElementById('pause-modal');
    this.gameOverModal = document.getElementById('gameover-modal');
    this.victoryModal = document.getElementById('victory-modal');

    // Dificultades (Solo Creeper y Skeleton)
    this.difficulties = {
      easy: {
        name: 'FÁCIL',
        waves: 3,
        mobSpeedMultiplier: 0.75,
        creeperFuse: 2.8,
        damageTakenMultiplier: 0.7,
        spawnInterval: 3.2
      },
      medium: {
        name: 'MEDIO',
        waves: 4,
        mobSpeedMultiplier: 1.0,
        creeperFuse: 1.8,
        damageTakenMultiplier: 1.0,
        spawnInterval: 2.4
      },
      hard: {
        name: 'DIFÍCIL',
        waves: 5,
        mobSpeedMultiplier: 1.35,
        creeperFuse: 1.25,
        damageTakenMultiplier: 1.4,
        spawnInterval: 1.7
      },
      endless: {
        name: 'HORDA INFINITA',
        waves: Infinity,
        mobSpeedMultiplier: 1.1,
        creeperFuse: 1.6,
        damageTakenMultiplier: 1.1,
        spawnInterval: 2.0
      }
    };
    this.activeDifficulty = this.difficulties.medium;

    // Player State
    this.maxHealth = 20; // 10 corazones
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
    this.state = 'menu'; // 'menu', 'playing', 'paused', 'gameover', 'victory'
    this.clock = new THREE.Clock();
    this.raycaster = new THREE.Raycaster();

    // 360-degree Pointer Lock Camera look
    this.isPointerLocked = false;
    this.cameraYaw = 0;
    this.cameraPitch = 0;
    this.mouseSensitivity = 0.0022;

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
    this.camera.rotation.order = 'YXZ';
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
        this.announceA11y('Recursos listos. Presiona Iniciar Defensa para comenzar.');
      };
    }

    // Mob callbacks
    this.mobManager.onPlayerDamage = (amount, source) => {
      this.takePlayerDamage(amount, source);
    };

    this.mobManager.onMobKilled = (mob, isCritical) => {
      this.handleMobKilled(mob, isCritical);
    };

    this.bossBarContainer = document.getElementById('boss-bar-container');
    this.bossBarFill = document.getElementById('boss-bar-fill');

    this.mobManager.onBossHealthChange = (health, maxHealth, isAlive) => {
      if (!this.bossBarContainer) return;
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
    // --- POINTER LOCK SYSTEM (Inmersive 360 FPS look) ---
    this.canvas.addEventListener('click', () => {
      if (this.state === 'playing' && document.pointerLockElement !== this.canvas) {
        this.requestPointerLock();
      }
    });

    document.addEventListener('pointerlockchange', () => {
      this.isPointerLocked = (document.pointerLockElement === this.canvas);
      if (!this.isPointerLocked && this.state === 'playing') {
        // Automatically pause when user exits pointer lock (e.g. pressed ESC)
        this.pauseGame();
      }
    });

    // 360-degree mouse look
    window.addEventListener('mousemove', (e) => {
      if (!this.isPointerLocked || this.state !== 'playing') return;

      this.cameraYaw -= e.movementX * this.mouseSensitivity;
      this.cameraPitch -= e.movementY * this.mouseSensitivity;

      // Clamp vertical pitch to ~75 degrees up/down
      const maxPitch = Math.PI * 0.42;
      this.cameraPitch = Math.max(-maxPitch, Math.min(maxPitch, this.cameraPitch));

      this.camera.rotation.set(this.cameraPitch, this.cameraYaw, 0, 'YXZ');

      if (this.sword) {
        this.sword.onMouseMove(e.movementX, e.movementY);
      }
    });

    // Attack on Click
    window.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return; // Left click
      if (this.state === 'playing') {
        sounds.init();
        this.attack();
      }
    });

    // Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') {
        if (this.state === 'playing') {
          e.preventDefault();
          sounds.init();
          this.attack();
        }
      } else if (e.code === 'Escape') {
        e.preventDefault();
        if (this.state === 'playing') {
          this.pauseGame();
        } else if (this.state === 'paused') {
          this.resumeGame();
        }
      } else if (e.code === 'KeyM') {
        const isMuted = sounds.toggleMute();
        this.updateAudioButtons(isMuted);
      } else if (e.code === 'KeyN') {
        this.toggleMusic();
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
          this.announceA11y(`Dificultad seleccionada: ${this.activeDifficulty.name}`);
        }
      });
    });

    // Start Button
    document.getElementById('start-btn').addEventListener('click', () => {
      sounds.init();
      sounds.playButtonClick();
      this.startGame();
    });

    // Pause Menu Buttons
    document.getElementById('pause-btn').addEventListener('click', () => {
      sounds.playButtonClick();
      this.pauseGame();
    });

    document.getElementById('resume-btn').addEventListener('click', () => {
      sounds.playButtonClick();
      this.resumeGame();
    });

    document.getElementById('pause-restart-btn').addEventListener('click', () => {
      sounds.playButtonClick();
      this.startGame();
    });

    document.getElementById('pause-menu-btn').addEventListener('click', () => {
      sounds.playButtonClick();
      this.returnToMainMenu();
    });

    // Game Over & Victory Buttons
    document.getElementById('restart-btn').addEventListener('click', () => {
      sounds.playButtonClick();
      this.startGame();
    });

    document.getElementById('go-menu-btn').addEventListener('click', () => {
      sounds.playButtonClick();
      this.returnToMainMenu();
    });

    document.getElementById('victory-btn').addEventListener('click', () => {
      sounds.playButtonClick();
      this.startGame();
    });

    document.getElementById('vic-menu-btn').addEventListener('click', () => {
      sounds.playButtonClick();
      this.returnToMainMenu();
    });

    // Audio & Music Toggles
    const muteBtns = [document.getElementById('mute-btn'), document.getElementById('pause-mute-btn')];
    muteBtns.forEach((btn) => {
      if (!btn) return;
      btn.addEventListener('click', () => {
        const isMuted = sounds.toggleMute();
        this.updateAudioButtons(isMuted);
      });
    });

    const musicBtns = [document.getElementById('music-btn'), document.getElementById('pause-music-btn')];
    musicBtns.forEach((btn) => {
      if (!btn) return;
      btn.addEventListener('click', () => {
        this.toggleMusic();
      });
    });
  }

  requestPointerLock() {
    try {
      this.canvas.requestPointerLock();
    } catch (_) {}
  }

  exitPointerLock() {
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
  }

  updateAudioButtons(isMuted) {
    const text = isMuted ? '🔇' : '🔊';
    const m1 = document.getElementById('mute-btn');
    const m2 = document.getElementById('pause-mute-btn');
    if (m1) m1.textContent = text;
    if (m2) m2.textContent = text;
    this.announceA11y(isMuted ? 'Sonido silenciado' : 'Sonido activado');
  }

  toggleMusic() {
    if (sounds.isMusicPlaying) {
      sounds.stopMusic();
      this.setMusicBtnText('🎵 OFF');
      this.announceA11y('Música desactivada');
    } else {
      sounds.startMusic();
      this.setMusicBtnText('🎵 ON');
      this.announceA11y('Música activada');
    }
  }

  setMusicBtnText(text) {
    const b1 = document.getElementById('music-btn');
    const b2 = document.getElementById('pause-music-btn');
    if (b1) b1.textContent = text;
    if (b2) b2.textContent = text;
  }

  onWindowResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  startGame() {
    this.hideAllModals();

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

    // Reset camera look
    this.cameraYaw = 0;
    this.cameraPitch = 0;
    this.camera.rotation.set(0, 0, 0, 'YXZ');

    this.mobManager.clearAll();
    if (this.bossBarContainer) this.bossBarContainer.classList.remove('visible');
    this.updateHUD();
    this.prepareWave(this.currentWave);

    this.state = 'playing';
    this.requestPointerLock();

    this.announceA11y(`Partida iniciada en dificultad ${this.activeDifficulty.name}. Oleada 1.`);
    this.showFloatingText(window.innerWidth / 2, window.innerHeight * 0.35, `¡OLEADA ${this.currentWave}!`, 'defuse');
  }

  pauseGame() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.exitPointerLock();
    this.pauseModal.classList.add('active');
    this.announceA11y('Partida en pausa. Usa Continuar para volver.');
  }

  resumeGame() {
    if (this.state !== 'paused') return;
    this.pauseModal.classList.remove('active');
    this.state = 'playing';
    this.requestPointerLock();
    this.announceA11y('Partida reanudada.');
  }

  returnToMainMenu() {
    this.state = 'menu';
    this.exitPointerLock();
    this.mobManager.clearAll();
    if (this.bossBarContainer) this.bossBarContainer.classList.remove('visible');
    this.hideAllModals();
    this.startModal.classList.add('active');
    this.announceA11y('Menú principal.');
  }

  hideAllModals() {
    this.startModal.classList.remove('active');
    this.pauseModal.classList.remove('active');
    this.gameOverModal.classList.remove('active');
    this.victoryModal.classList.remove('active');
  }

  prepareWave(waveNum) {
    this.isWaveTransitioning = false;
    this.waveMobsToSpawn = [];
    this.spawnTimer = 0.5;

    const countMultiplier = this.activeDifficulty.waves === Infinity ? (1 + waveNum * 0.25) : 1;

    if (waveNum === 1) {
      for (let i = 0; i < Math.floor(4 * countMultiplier); i++) {
        this.waveMobsToSpawn.push('creeper');
      }
    } else if (waveNum === 2) {
      for (let i = 0; i < Math.floor(3 * countMultiplier); i++) {
        this.waveMobsToSpawn.push('creeper');
        this.waveMobsToSpawn.push('skeleton');
      }
    } else if (waveNum === 3) {
      for (let i = 0; i < Math.floor(5 * countMultiplier); i++) {
        this.waveMobsToSpawn.push('creeper');
      }
      for (let i = 0; i < Math.floor(3 * countMultiplier); i++) {
        this.waveMobsToSpawn.push('skeleton');
      }
    } else if (waveNum === 4) {
      for (let i = 0; i < Math.floor(6 * countMultiplier); i++) {
        this.waveMobsToSpawn.push('creeper');
      }
      for (let i = 0; i < Math.floor(5 * countMultiplier); i++) {
        this.waveMobsToSpawn.push('skeleton');
      }
    } else if (waveNum >= 5) {
      // Wave 5: WITHER BOSS BATTLE!
      this.waveMobsToSpawn.push('wither');
      for (let i = 0; i < Math.floor(4 * countMultiplier); i++) {
        this.waveMobsToSpawn.push('creeper');
        this.waveMobsToSpawn.push('skeleton');
      }
    }

    this.updateHUD();
  }

  attack() {
    this.shots++;

    const charge = this.sword.triggerAttack();
    this.world.spawnSlashArc(this.camera.position, this.camera.getWorldDirection(new THREE.Vector3()));

    // Center raycast in first-person FPS view
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    const hit = this.mobManager.raycast(this.raycaster);

    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;

    if (hit) {
      const mob = hit.mob;
      const dist = hit.distance;

      if (dist <= 15.5) {
        this.hits++;
        this.combo++;
        if (this.combo > this.maxCombo) this.maxCombo = this.combo;

        const isCritical = charge >= 0.88;
        let damage = Math.round((isCritical ? 26 : 14) * Math.max(0.3, charge));
        if (this.activeDifficulty === this.difficulties.easy) {
          damage = Math.round(damage * 1.5);
        }

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

        this.shakeScreen();
      } else {
        this.showFloatingText(cx, cy + 30, '¡DEMASIADO LEJOS!', 'hurt');
      }
    } else {
      if (this.combo > 1) {
        this.combo = 0;
      }
    }

    this.updateHUD();
  }

  handleMobKilled(mob, isCritical) {
    this.kills++;

    let points = mob.pointValue;
    if (isCritical) points = Math.round(points * 1.5);
    if (this.combo > 1) points = Math.round(points * (1 + this.combo * 0.15));

    this.score += points;
    this.addXP(Math.round(points * 0.8));

    if (mob.type === 'creeper') {
      this.showFloatingText(window.innerWidth / 2, window.innerHeight * 0.45, '¡CREEPER ELIMINADO! +XP', 'defuse');
      this.announceA11y('Creeper eliminado');
    } else if (mob.type === 'wither') {
      this.showFloatingText(window.innerWidth / 2, window.innerHeight * 0.35, '¡WITHER DERROTADO! +1500 XP', 'crit');
      this.announceA11y('¡El Wither ha sido derrotado! Victoria inminente.');
      sounds.playLevelUp();
    } else {
      this.showFloatingText(window.innerWidth / 2, window.innerHeight * 0.45, '¡ESQUELETO DERROTADO!', 'defuse');
      this.announceA11y('Esqueleto eliminado');
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
      this.announceA11y(`¡Subiste al nivel ${this.xpLevel}! Vida regenerada.`);

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
    this.combo = 0;

    sounds.playPlayerHurt();

    this.hurtVignette.classList.add('active');
    setTimeout(() => this.hurtVignette.classList.remove('active'), 250);

    this.shakeScreen(true);
    this.renderHearts();
    this.updateHUD();

    this.announceA11y(`¡Daño recibido! Te quedan ${Math.ceil(this.health / 2)} corazones.`);

    if (this.health <= 0) {
      this.gameOver();
    }
  }

  shakeScreen(hard = false) {
    this.canvas.classList.remove('shake-screen');
    void this.canvas.offsetWidth;
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

  announceA11y(message) {
    if (this.a11yAnnouncer) {
      this.a11yAnnouncer.textContent = message;
    }
  }

  renderHearts() {
    this.heartsContainer.innerHTML = '';
    const totalHearts = 10;
    const currentHalfHearts = this.health;

    for (let i = 0; i < totalHearts; i++) {
      const heartVal = currentHalfHearts - i * 2;
      const heartSvg = document.createElement('div');
      heartSvg.className = 'mc-heart';
      if (heartVal <= 0) {
        heartSvg.innerHTML = `
          <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true">
            <path fill="#222" d="M2,2 h4 v2 h-4 z M10,2 h4 v2 h-4 z M1,4 h6 v2 h-6 z M9,4 h6 v2 h-6 z M1,6 h14 v4 h-14 z M3,10 h10 v2 h-10 z M5,12 h6 v2 h-6 z M7,14 h2 v2 h-2 z"/>
            <path fill="#555" d="M3,3 h2 v2 h-2 z M11,3 h2 v2 h-2 z M2,5 h12 v4 h-12 z M4,9 h8 v2 h-8 z M6,11 h4 v2 h-4 z"/>
          </svg>`;
      } else if (heartVal === 1) {
        heartSvg.innerHTML = `
          <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true">
            <path fill="#222" d="M2,2 h4 v2 h-4 z M10,2 h4 v2 h-4 z M1,4 h6 v2 h-6 z M9,4 h6 v2 h-6 z M1,6 h14 v4 h-14 z M3,10 h10 v2 h-10 z M5,12 h6 v2 h-6 z M7,14 h2 v2 h-2 z"/>
            <path fill="#555" d="M11,3 h2 v2 h-2 z M8,5 h6 v4 h-6 z M8,9 h4 v2 h-4 z M8,11 h2 v2 h-2 z"/>
            <path fill="#e01010" d="M3,3 h2 v2 h-2 z M2,5 h6 v4 h-6 z M4,9 h4 v2 h-4 z M6,11 h2 v2 h-2 z"/>
            <path fill="#ff6666" d="M3,3 h1 v1 h-1 z M2,5 h2 v1 h-2 z"/>
          </svg>`;
        heartSvg.classList.add('shake');
      } else {
        heartSvg.innerHTML = `
          <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true">
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

    if (this.combo > 1) {
      this.comboEl.textContent = `x${this.combo} COMBO!`;
      this.comboEl.className = 'hud-val hud-combo';
    } else {
      this.comboEl.textContent = 'x1';
      this.comboEl.className = 'hud-val';
    }

    const acc = this.shots > 0 ? Math.round((this.hits / this.shots) * 100) : 100;
    this.accuracyEl.textContent = `${acc}%`;
  }

  gameOver() {
    this.state = 'gameover';
    this.exitPointerLock();
    this.mobManager.clearAll();

    document.getElementById('go-score').textContent = this.score;
    document.getElementById('go-wave').textContent = this.currentWave;
    document.getElementById('go-kills').textContent = this.kills;
    document.getElementById('go-accuracy').textContent = `${this.shots > 0 ? Math.round((this.hits / this.shots) * 100) : 100}%`;

    this.gameOverModal.classList.add('active');
    this.announceA11y(`¡Has muerto! Puntaje final: ${this.score}. Mobs derrotados: ${this.kills}.`);
  }

  victory() {
    this.state = 'victory';
    this.exitPointerLock();
    this.mobManager.clearAll();
    sounds.playLevelUp();

    let rank = 'Guerrero de Madera';
    if (this.score >= 4500) rank = 'Leyenda de Netherite ⚔️';
    else if (this.score >= 2500) rank = 'Campeón de Diamante 💎';
    else if (this.score >= 1200) rank = 'Defensor de Hierro 🛡️';

    document.getElementById('vic-rank').textContent = rank;
    document.getElementById('vic-score').textContent = this.score;
    document.getElementById('vic-kills').textContent = this.kills;
    document.getElementById('vic-combo').textContent = `x${this.maxCombo}`;

    this.victoryModal.classList.add('active');
    this.announceA11y(`¡Victoria épica! Aldea defendida. Rango obtenido: ${rank}. Puntaje: ${this.score}.`);
  }

  update(delta) {
    this.world.update(delta);

    if (this.sword) {
      this.sword.update(delta);
      const pct = Math.min(100, Math.round(this.sword.charge * 100));
      this.attackIndicatorFill.style.width = `${pct}%`;
      this.attackIndicator.classList.toggle('charged', this.sword.charge >= 0.95);
    }

    if (this.state === 'playing') {
      if (this.waveMobsToSpawn.length > 0) {
        this.spawnTimer -= delta;
        if (this.spawnTimer <= 0) {
          this.spawnTimer = this.activeDifficulty.spawnInterval;
          const nextType = this.waveMobsToSpawn.shift();
          const spawnX = (Math.random() - 0.5) * 11;
          const spawnZ = -26 - Math.random() * 8;
          this.mobManager.spawnMob(nextType, spawnX, spawnZ, this.activeDifficulty);
        }
      }

      this.mobManager.update(delta, this.camera.position);

      if (this.waveMobsToSpawn.length === 0 && this.mobManager.activeMobs.length === 0) {
        if (!this.isWaveTransitioning) {
          this.isWaveTransitioning = true;
          this.waveTransitionTimer = 2.2;
          sounds.playLevelUp();
          this.showFloatingText(window.innerWidth / 2, window.innerHeight * 0.35, '¡OLEADA COMPLETADA!', 'defuse');
          this.announceA11y(`¡Oleada ${this.currentWave} completada!`);
        } else {
          this.waveTransitionTimer -= delta;
          if (this.waveTransitionTimer <= 0) {
            if (this.currentWave >= this.activeDifficulty.waves && this.activeDifficulty.waves !== Infinity) {
              this.victory();
            } else {
              this.currentWave++;
              this.prepareWave(this.currentWave);
              this.showFloatingText(window.innerWidth / 2, window.innerHeight * 0.35, `¡OLEADA ${this.currentWave}!`, 'defuse');
              this.announceA11y(`Comienza la Oleada ${this.currentWave}`);
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

// Start
window.addEventListener('DOMContentLoaded', () => {
  const game = new MinecraftGame();
  game.startLoop();
});
