import * as THREE from 'three';
import { GAME_CONFIG, MUSIC_CONFIG } from './Config.js';
import { fadeOut, getBeatFactor, getMusicState, pauseMusic, resumeMusic, setMusicPlaybackRate, setMusicVolume, startMusic, unlockMusic } from './components/Music.js';
import { createPlayer, PLAYER_MOVEMENT_SPEED as PLAYER_BASE_MOVEMENT_SPEED, PLAYER_WORLD_LIMIT } from './components/Player.js';
import { createCamera } from './components/Camera.js';
import { createRenderer } from './components/Renderer.js';
import {
  createEnemy,
  disposeEnemy,
  updateEnemy,
  updateBossCombat,
  ENEMY_SPAWN_POINTS,
} from './components/Enemy.js';
import { createAttackSystem, ATTACK_COOLDOWN } from './components/Attack.js';
import { createMap, setGardenTheme } from './components/Map.js';
import {
  createPickup,
  updatePickup,
  findPickupPosition,
  PICKUP_SPAWN_INTERVAL,
  PICKUP_SCORE_BONUS,
  PICKUP_TYPES,
} from './components/Pickup.js';
import { COLLISION_DISTANCE, isPositionClear, xyDistance } from './components/Collision.js';

export const SCORE_PER_SECOND = -0.1;
export const SCORE_PER_KILL = 10;
export const SCORE_PER_SEED = PICKUP_SCORE_BONUS;
const BOSS_SCORE_BONUS = 100;

const BEST_SCORE_KEY = 'tode-garden-best-v1';

const scene = new THREE.Scene();
scene.background = new THREE.Color('#bce9e8');
scene.fog = new THREE.Fog('#bce9e8', 850, 1450);

const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xfff1d0, 1.5);
directionalLight.position.set(-100, -100, 200);
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.set(2048, 2048);
directionalLight.shadow.camera.left = -420;
directionalLight.shadow.camera.right = 420;
directionalLight.shadow.camera.top = 420;
directionalLight.shadow.camera.bottom = -420;
directionalLight.shadow.camera.near = 1;
directionalLight.shadow.camera.far = 900;
directionalLight.shadow.bias = -0.00015;
scene.add(directionalLight);
const fillLight = new THREE.HemisphereLight('#d8fbff', '#315f40', 0.42);
scene.add(fillLight);

const renderer = createRenderer();
const clock = new THREE.Clock();
const enemies = [];
const bossProjectiles = [];
const pickups = [];
const particleBursts = [];
const pendingEnemySpawns = [];

let player;
let camera;
let attackSystem;
let gardenMap;
let state = 'loading';
let canRestart = false;
let gameOverCooldownTimeout = null;
let sessionId = 0;
let elapsedSeconds = 0;
let shownPenaltyPoints = 0;
let playerHealth = 6;
let maxPlayerHealth = 6;
let seedMagnetUnlocked = false;
const permanentPowerUps = new Set();
const POWER_UPS = [
  { id: 'lily-heart', icon: '💚', name: 'Lily Pad Heart', description: '+1 maximum heart and restores 2 health points.', apply: () => { maxPlayerHealth += 2; playerHealth = Math.min(maxPlayerHealth, playerHealth + 2); } },
  { id: 'thunder-voice', icon: '⚡', name: 'Thunder Voice', description: '+1 damage to Devastating Croak and great lick.', apply: () => attackSystem.addDamage(1) },
  { id: 'wave-range', icon: '🌊', name: 'Shockwave', description: '+8 range to Devastating Croak.', apply: () => attackSystem.addRadius(8) },
  { id: 'amphibian-reflexes', icon: '⏱', name: 'Amphibian Reflexes', description: 'Reduces Croak and great lick cooldowns by 25%.', apply: () => attackSystem.reduceCooldown(0.75) },
];
let invulnerabilityTime = 0;
let survivalScore = 0;
let kills = 0;
let bonusScore = 0;
let totalScore = 0;
let bestScore = readBestScore();
let currentRoom = 1;
let currentWave = 1;
let waveSpawned = 0;
let waveSpawnTimer = 0;
let waveSpawning = false;
let bossTransitioning = false;
let offeredPowerUps = [];
let selectedPowerUps = new Set();
let pickupTimer = 0;
let pickupSequence = 0;
let shieldTime = 0;
let multiplierTime = 0;
let hasteTime = 0;
let spawnInProgress = false;
let enemySpawnSequence = 0;
let toastTimeout = null;
let comboCount = 0;
let comboWindow = 0;
let flashTimeout = null;
let shakeTimeout = null;
let victoryTransitionTimeout = null;

const ui = {
  boot: document.querySelector('#boot-screen'),
  story: document.querySelector('#story-screen'),
  start: document.querySelector('#start-screen'),
  gameover: document.querySelector('#gameover-screen'),
  winStats: document.querySelector('#win-stats-screen'),
  winFade: document.querySelector('#victory-fade-overlay'),
  winVideoScreen: document.querySelector('#win-video-screen'),
  winVideo: document.querySelector('#win-ending-video'),
  winFinal: document.querySelector('#win-final-screen'),
  pause: document.querySelector('#pause-screen'),
  powerUpScreen: document.querySelector('#powerup-select-screen'),
  powerUpSubtitle: document.querySelector('#powerup-subtitle'),
  powerUpReward: document.querySelector('#powerup-reward'),
  powerUpOptions: document.querySelector('#powerup-options'),
  powerUpConfirm: document.querySelector('#powerup-confirm'),
  powerUpConfirmLabel: document.querySelector('#powerup-confirm-label'),
  startButton: document.querySelector('#start-button'),
  retryButton: document.querySelector('#retry-button'),
  goToCreditsButton: document.querySelector('#go-to-credits-button'),
  playAgainButton: document.querySelector('#play-again-button'),
  winTotalScore: document.querySelector('#win-total-score'),
  winKills: document.querySelector('#win-kills'),
  winTime: document.querySelector('#win-time'),
  resumeButton: document.querySelector('#resume-button'),
  pauseRestartButton: document.querySelector('#pause-restart-button'),
  score: document.querySelector('#score-value'),
  timer: document.querySelector('#timer-value'),
  kills: document.querySelector('#kills-value'),
  best: document.querySelector('#best-value'),
  room: document.querySelector('#room-value'),
  wave: document.querySelector('#wave-value'),
  waveEnemies: document.querySelector('#wave-enemy-count'),
  waveProgress: document.querySelector('#wave-progress-fill'),
  scorePenaltyAnchor: document.querySelector('#score-penalty-anchor'),
  seedCount: document.querySelector('#seed-count'),
  bossWidget: document.querySelector('#boss-widget'),
  bossHealthLabel: document.querySelector('#boss-health-label'),
  bossHealthFill: document.querySelector('#boss-health-fill'),
  attackFill: document.querySelector('#attack-fill'),
  attackState: document.querySelector('#attack-state'),
  tongueState: document.querySelector('#tongue-state'),
  tongueFill: document.querySelector('#tongue-fill'),
  powerupStatus: document.querySelector('#powerup-status'),
  toast: document.querySelector('#game-toast'),
  combo: document.querySelector('#combo-badge'),
  finalScore: document.querySelector('#final-score'),
  finalKills: document.querySelector('#final-kills'),
  finalTime: document.querySelector('#final-time'),
  finalBest: document.querySelector('#final-best'),
  recordMessage: document.querySelector('#record-message'),
  app: document.querySelector('.app-shell'),
  hearts: document.querySelectorAll('.heart'),
};
let lastTongueCooldown = 0;

function readBestScore() {
  try { return Number(window.localStorage.getItem(BEST_SCORE_KEY) || 0); }
  catch { return 0; }
}

function saveBestScore(value) {
  try { window.localStorage.setItem(BEST_SCORE_KEY, String(value)); }
  catch { }
}

function formatTime(seconds) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60).toString().padStart(2, '0');
  const remainder = (safeSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remainder}`;
}

function calculateScore() {
  return Math.floor(survivalScore) + (kills * SCORE_PER_KILL) + bonusScore;
}

function updateHUD() {
  totalScore = calculateScore();
  ui.score.textContent = String(totalScore).padStart(4, '0');
  ui.timer.textContent = formatTime(elapsedSeconds);
  ui.kills.textContent = String(kills).padStart(2, '0');
  ui.best.textContent = String(Math.max(bestScore, totalScore)).padStart(4, '0');
  ui.room.textContent = `Room: ${currentRoom} / ${GAME_CONFIG.ROOMS.TOTAL}`;
  const bossActive = enemies.some((enemy) => enemy.isBoss) || (!waveSpawning && currentWave === GAME_CONFIG.ROOMS.WAVES_PER_ROOM);
  ui.wave.textContent = bossActive ? 'BOSS!' : `Wave: ${currentWave} / ${GAME_CONFIG.ROOMS.WAVES_PER_ROOM}`;
  const waveConfig = GAME_CONFIG.WAVES[currentWave];
  const waveEnemyCount = enemies.filter((enemy) => enemy.waveRoom === currentRoom && enemy.waveNumber === currentWave).length;
  const spawnedInWave = Math.min(waveSpawned, waveConfig.count);
  const defeatedInWave = Math.max(0, spawnedInWave - waveEnemyCount);
  ui.waveEnemies.textContent = bossActive ? 'ENEMY BOSS!' : `Enemies: ${defeatedInWave} / ${waveConfig.count}`;
  ui.waveProgress.style.width = `${bossActive ? 100 : THREE.MathUtils.clamp((defeatedInWave / waveConfig.count) * 100, 0, 100)}%`;
  ui.waveProgress.parentElement.classList.toggle('is-boss', bossActive);
  updateHealthHUD();

  if (comboWindow > 0 && comboCount >= 2) {
    ui.combo.textContent = `COMBO ×${comboCount}`;
    ui.combo.classList.add('is-visible');
  } else {
    ui.combo.classList.remove('is-visible');
  }

  if (attackSystem) {
    const ready = attackSystem.cooldownRemaining <= 0.01;
    const fill = ready ? 100 : (1 - attackSystem.cooldownRemaining / attackSystem.cooldownDuration) * 100;
    ui.attackFill.style.width = `${THREE.MathUtils.clamp(fill, 0, 100)}%`;
    ui.attackState.textContent = ready ? 'READY' : 'RELOADING';
    ui.attackState.classList.toggle('is-ready', ready);
    ui.attackState.classList.toggle('is-cooling', !ready);
    ui.seedCount.textContent = String(attackSystem.empoweredAttacks);
    const tongueCooldown = attackSystem.tongueCooldownRemaining;
    const tongueReady = tongueCooldown <= 0;
    const tongueProgress = tongueReady ? 100 : (1 - tongueCooldown / attackSystem.tongueCooldownDuration) * 100;
    ui.tongueFill.style.width = `${THREE.MathUtils.clamp(tongueProgress, 0, 100)}%`;
    ui.tongueState.textContent = tongueReady ? 'READY' : 'RELOADING';
    ui.tongueState.classList.toggle('is-ready', tongueReady);
    ui.tongueState.classList.toggle('is-cooling', !tongueReady);
    if (state === 'playing' && lastTongueCooldown > 0 && tongueReady) {
      showToast('¡GREAT LICK IS READY! Press [ALT]', 'is-gold');
    }
    lastTongueCooldown = tongueCooldown;
  }
  updatePowerupHUD();
  updateBossHUD();
}

function updateHealthHUD() {
  ui.hearts.forEach((heart, index) => {
    heart.classList.toggle('is-hidden', index >= maxPlayerHealth / 2);
    heart.classList.remove('heart-full', 'heart-half', 'heart-empty');
    if (playerHealth >= (index + 1) * 2) heart.classList.add('heart-full');
    else if (playerHealth === (index * 2) + 1) heart.classList.add('heart-half');
    else if (playerHealth <= index * 2) heart.classList.add('heart-empty');
  });
}

function updatePowerupHUD() {
  const effects = [];
  if (state === 'playing') {
    if (shieldTime > 0) effects.push({ label: `SHIELD ${Math.ceil(shieldTime)}s`, className: 'is-shield' });
    if (multiplierTime > 0) effects.push({ label: `SCORE ×2 ${Math.ceil(multiplierTime)}s`, className: 'is-multiplier' });
    if (hasteTime > 0) effects.push({ label: `SPEED BOOST ${Math.ceil(hasteTime)}s`, className: 'is-haste' });
  }
  ui.powerupStatus.classList.toggle('is-hidden', effects.length === 0);
  ui.powerupStatus.classList.remove('is-shield', 'is-multiplier', 'is-haste');
  if (effects.length > 0) {
    ui.powerupStatus.textContent = effects.map((effect) => effect.label).join('  ·  ');
    ui.powerupStatus.classList.add(effects[0].className);
  } else {
    ui.powerupStatus.textContent = '';
  }
}

function updateBossHUD() {
  const boss = enemies.find((enemy) => enemy.isBoss);
  const visible = Boolean(boss) && state === 'playing';
  ui.bossWidget.classList.toggle('is-hidden', !visible);
  if (!visible) return;
  ui.bossHealthLabel.textContent = `${boss.health} / ${boss.maxHealth}`;
  ui.bossHealthFill.style.width = `${THREE.MathUtils.clamp((boss.health / boss.maxHealth) * 100, 0, 100)}%`;
}

function updateCombatScaling() {
  // La velocidad del jugador permanece en su valor base; los cambios futuros deben venir de Power-Ups.
  if (player) player.setMovementSpeed(PLAYER_BASE_MOVEMENT_SPEED * (hasteTime > 0 ? 1.55 : 1));
  if (attackSystem) attackSystem.setCooldown(ATTACK_COOLDOWN);
  for (const enemy of enemies) {
    enemy.movementSpeed = enemy.isBoss
        ? enemy.baseMovementSpeed * GAME_CONFIG.SCALING.ROOM_SPEED_MULTIPLIERS[currentRoom - 1]
        : GAME_CONFIG.SCALING.BASE_ENEMY_SPEED * GAME_CONFIG.SCALING.ROOM_SPEED_MULTIPLIERS[currentRoom - 1] * GAME_CONFIG.SCALING.WAVE_SPEED_MULTIPLIERS[(enemy.waveNumber || currentWave) - 1] * (enemy.speedMultiplier || 1);
  }

}

function applyGardenTheme(roomNumber) {
  if (!gardenMap) return;
  const theme = setGardenTheme(gardenMap, roomNumber);
  scene.background.set(theme.sky);
  if (scene.fog) scene.fog.color.set(theme.fog);
  directionalLight.color.set(theme.keyLight);
  fillLight.color.set(theme.ambient);
  fillLight.groundColor.set(theme.ground);
  ui.app.dataset.theme = String((Math.max(1, roomNumber) - 1) % 4 + 1);
}

function getSafeSpawnPosition() {
  const safeRadius = GAME_CONFIG.SPAWN_SAFE_RADIUS;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const angle = Math.random() * Math.PI * 2;
    const radius = THREE.MathUtils.randFloat(safeRadius + 20, 270);
    const point = new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
    if (xyDistance(point, player.group.position) >= safeRadius) return point;
  }
  return ENEMY_SPAWN_POINTS.reduce((best, point) => xyDistance(point, player.group.position) > xyDistance(best, player.group.position) ? point : best, ENEMY_SPAWN_POINTS[0]).clone();
}

function startWave() {
  waveSpawned = 0;
  waveSpawnTimer = 0;
  waveSpawning = true;
  showToast(`ROOM ${currentRoom} · WAVE ${currentWave}`, 'is-gold');
}

function handleBossDefeated() {
  if (bossTransitioning || state !== 'playing') return;
  bossTransitioning = true;
  setMusicPlaybackRate(1);
  if (currentRoom >= GAME_CONFIG.ROOMS.TOTAL) {
    fadeOut(undefined, 2);
    state = 'win'; player.setEnabled(false); attackSystem.setEnabled(false); showWinOverlay(); return;
  }
  fadeOut(undefined, 2);
  openPowerUpSelection();
}

function openPowerUpSelection() {
  state = 'powerup'; player.setEnabled(false); attackSystem.setEnabled(false);
  selectedPowerUps.clear();
  const availablePowerUps = POWER_UPS.filter((powerUp) => !permanentPowerUps.has(powerUp.id));
  offeredPowerUps = availablePowerUps.sort(() => Math.random() - 0.5).slice(0, 2);
  ui.powerUpReward.classList.toggle('is-hidden', currentRoom !== 2 || offeredPowerUps.length === 0);
  ui.powerUpConfirmLabel.textContent = currentRoom === 2 ? 'CHOOSE YOUR POWER-UPS' : 'CONFIRM AND CONTINUE';
  ui.powerUpSubtitle.textContent = currentRoom === 1 ? 'Room 1: choose an upgrade.' : 'Room 2: choose one or both upgrades.';
  ui.powerUpOptions.replaceChildren();
  if (offeredPowerUps.length === 0) ui.powerUpSubtitle.textContent = 'You have unlocked all upgrades. Continue your adventure.';
  offeredPowerUps.forEach((powerUp, index) => {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'powerup-option'; button.dataset.powerupIndex = String(index);
    button.innerHTML = `<span class="powerup-icon" aria-hidden="true">${powerUp.icon}</span><span class="powerup-copy"><strong>${powerUp.name}</strong><small>${powerUp.description}</small></span><kbd>${index + 1}</kbd>`;
    button.addEventListener('click', () => selectPowerUp(index)); ui.powerUpOptions.append(button);
  });
  ui.powerUpConfirm.classList.toggle('is-hidden', currentRoom === 1 && offeredPowerUps.length > 0);
  ui.powerUpConfirm.disabled = offeredPowerUps.length > 0;
  ui.powerUpScreen.classList.remove('is-hidden');
}

function selectPowerUp(index) {
  if (state !== 'powerup' || !offeredPowerUps[index]) return;
  if (currentRoom === 1) { applyPowerUp(offeredPowerUps[index]); finishPowerUpSelection(); return; }
  const id = offeredPowerUps[index].id;
  if (selectedPowerUps.has(id)) selectedPowerUps.delete(id); else selectedPowerUps.add(id);
  ui.powerUpOptions.querySelectorAll('.powerup-option').forEach((button) => {
    const option = offeredPowerUps[Number(button.dataset.powerupIndex)]; button.classList.toggle('is-selected', selectedPowerUps.has(option.id));
  });
  ui.powerUpConfirm.disabled = selectedPowerUps.size === 0;
  if (selectedPowerUps.size === 1) ui.powerUpConfirmLabel.textContent = 'CONFIRM · SEED MAGNET';
  else if (selectedPowerUps.size === 2) ui.powerUpConfirmLabel.textContent = 'CONFIRM 2 UPGRADES';
  else ui.powerUpConfirmLabel.textContent = 'ELIGE TUS POWER-UPS';
}

function applyPowerUp(powerUp) {
  if (!powerUp || permanentPowerUps.has(powerUp.id)) return;
  permanentPowerUps.add(powerUp.id); powerUp.apply();
}

function finishPowerUpSelection() {
  if (offeredPowerUps.length > 0 && currentRoom === 2 && selectedPowerUps.size === 0) return;
  const earnsSeedMagnet = currentRoom === 2 && selectedPowerUps.size === 1;
  if (currentRoom === 2) seedMagnetUnlocked = earnsSeedMagnet;
  selectedPowerUps.forEach((id) => applyPowerUp(offeredPowerUps.find((powerUp) => powerUp.id === id)));
  ui.powerUpScreen.classList.add('is-hidden');
  state = 'playing'; player.setEnabled(true); attackSystem.setEnabled(true);
  advanceRoom();
  startMusic(MUSIC_CONFIG.MAIN, 0.8);
  if (earnsSeedMagnet) showToast('LIGHT SEED MAGNET ACTIVATED!', 'is-mint');
}

function advanceRoom() {
  clearEnemies(); clearPickups(); clearParticleBursts();
  if (attackSystem) attackSystem.reset();
  currentRoom += 1; currentWave = 1;
  playerHealth = Math.min(maxPlayerHealth, playerHealth + 2);
  player.reset(); applyGardenTheme(currentRoom); bossTransitioning = false;
  startWave(); updateHUD();
}
function showWinOverlay() {
  totalScore = calculateScore();
  ui.winTotalScore.textContent = String(totalScore).padStart(4, '0');
  ui.winKills.textContent = String(kills).padStart(2, '0');
  ui.winTime.textContent = formatTime(elapsedSeconds);
  ui.winStats.classList.add('is-hidden');
  ui.winFinal.classList.add('is-hidden');
  ui.winVideoScreen.classList.add('is-hidden');
  ui.winFade.classList.remove('is-hidden');
  ui.winFade.classList.remove('fade-to-black-4');
  ui.winFade.classList.add('fade-out-2');
  victoryTransitionTimeout = setTimeout(() => {
    ui.winFade.classList.add('is-hidden');
    ui.winFade.classList.remove('fade-out-2');
    ui.winStats.classList.remove('is-hidden');
    victoryTransitionTimeout = null;
  }, 2000);
}

function beginCreditsTransition() {
  if (state !== 'win' || victoryTransitionTimeout !== null) return;
  ui.winStats.classList.add('is-hidden');
  ui.winFade.classList.remove('is-hidden');
  ui.winFade.classList.add('fade-to-black-4');
  victoryTransitionTimeout = setTimeout(() => {
    ui.winFade.classList.add('is-hidden');
    ui.winFade.classList.remove('fade-to-black-4');
    ui.winVideoScreen.classList.remove('is-hidden');
    requestAnimationFrame(() => ui.winVideoScreen.classList.add('is-visible'));
    ui.winVideo.currentTime = 0;
    const playPromise = ui.winVideo.play();
    if (playPromise?.catch) playPromise.catch((error) => console.error('No se pudo reproducir el video final:', error));
    victoryTransitionTimeout = null;
  }, 4000);
}

function finishVictoryVideo() {
  ui.winVideoScreen.classList.remove('is-visible');
  ui.winVideoScreen.classList.add('is-hidden');
  ui.winFinal.classList.remove('is-hidden');
}

function chooseEnemyVariant() {
  const sequence = enemySpawnSequence++;
  if (sequence % 4 === 3) return 'armored';
  if (sequence % 4 === 1) return 'swift';
  return 'normal';
}

function showToast(message, tone = '') {
  if (!ui.toast) return;
  ui.toast.textContent = message;
  ui.toast.className = `game-toast is-visible ${tone}`.trim();
  if (toastTimeout) window.clearTimeout(toastTimeout);
  toastTimeout = window.setTimeout(() => ui.toast.classList.remove('is-visible'), 1900);
}

function screenFlash(intensity = 'light') {
  ui.app.classList.remove('impact-flash');
  void ui.app.offsetWidth;
  ui.app.classList.add('impact-flash');
  screenShake(intensity);
  if (flashTimeout) window.clearTimeout(flashTimeout);
  flashTimeout = window.setTimeout(() => ui.app.classList.remove('impact-flash'), 220);
}

function screenShake(intensity = 'light') {
  ui.app.dataset.shake = intensity;
  ui.app.classList.remove('screen-shake');
  void ui.app.offsetWidth;
  ui.app.classList.add('screen-shake');
  if (shakeTimeout) window.clearTimeout(shakeTimeout);
  shakeTimeout = window.setTimeout(() => {
    ui.app.classList.remove('screen-shake');
    delete ui.app.dataset.shake;
  }, intensity === 'heavy' ? 210 : 150);
}

function spawnParticleBurst(position, color, amount = 12, power = 1) {
  const geometry = new THREE.IcosahedronGeometry(1, 0);
  const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 });
  const pieces = [];
  for (let i = 0; i < amount; i += 1) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(position.x, position.y, Math.max(2, position.z + 7));
    const size = THREE.MathUtils.randFloat(0.65, 1.65);
    mesh.scale.setScalar(size);
    scene.add(mesh);
    const angle = Math.random() * Math.PI * 2;
    const speed = THREE.MathUtils.randFloat(18, 54) * power;
    pieces.push({
      mesh,
      velocity: new THREE.Vector3(Math.cos(angle) * speed, Math.sin(angle) * speed, THREE.MathUtils.randFloat(18, 48) * power),
      scale: size,
    });
  }
  particleBursts.push({ pieces, geometry, material, age: 0, duration: 0.72 });
}

function updateParticleBursts(deltaSeconds) {
  for (let i = particleBursts.length - 1; i >= 0; i -= 1) {
    const burst = particleBursts[i];
    burst.age += deltaSeconds;
    const progress = Math.min(1, burst.age / burst.duration);
    for (const piece of burst.pieces) {
      piece.mesh.position.addScaledVector(piece.velocity, deltaSeconds);
      piece.velocity.z -= 64 * deltaSeconds;
      piece.mesh.scale.setScalar(piece.scale * (1 - progress * 0.8));
    }
    burst.material.opacity = 1 - progress;
    if (progress >= 1) {
      for (const piece of burst.pieces) scene.remove(piece.mesh);
      burst.geometry.dispose();
      burst.material.dispose();
      particleBursts.splice(i, 1);
    }
  }
}

function clearParticleBursts() {
  for (const burst of particleBursts) {
    for (const piece of burst.pieces) scene.remove(piece.mesh);
    burst.geometry.dispose();
    burst.material.dispose();
  }
  particleBursts.length = 0;
}

function clearPickups() {
  for (const pickup of pickups) {
    scene.remove(pickup.group);
    pickup.core.geometry.dispose();
    pickup.core.material.dispose();
    pickup.ringA.geometry.dispose();
    pickup.ringA.material.dispose();
    pickup.ringB.geometry.dispose();
    pickup.ringB.material.dispose();
    pickup.halo.geometry.dispose();
    pickup.halo.material.dispose();
  }
  pickups.length = 0;
}

function clearEnemies() {
  clearBossProjectiles();
  for (const enemy of enemies) {
    scene.remove(enemy.group);
    disposeEnemy(enemy);
  }
  enemies.length = 0;
}

function clearBossProjectiles() {
  for (const projectile of bossProjectiles) {
    scene.remove(projectile.mesh);
    projectile.mesh.geometry.dispose();
    projectile.mesh.material.dispose();
  }
  bossProjectiles.length = 0;
}

function findSafeSpawnPosition(origin, ownRadius = 10) {
  const offsets = [
    [0, 0], [26, 0], [-26, 0], [0, 26], [0, -26],
    [26, 26], [-26, 26], [26, -26], [-26, -26],
    [48, 0], [-48, 0], [0, 48], [0, -48],
  ];
  const blockers = [
    { group: player.group, collisionRadius: player.collisionRadius },
    ...enemies.map((enemy) => ({ group: enemy.group, collisionRadius: enemy.collisionRadius })),
    ...pendingEnemySpawns,
  ];
  for (const [offsetX, offsetY] of offsets) {
    const candidate = new THREE.Vector3(origin.x + offsetX, origin.y + offsetY, 0);
    if (isPositionClear(candidate, ownRadius, blockers, COLLISION_DISTANCE)) return candidate;
  }
  return null;
}

async function spawnEnemyAt(position, currentSession, options = {}) {
  let enemy = null;
  try {
    const targetPos = position || new THREE.Vector3(-200, -200, 0);
    enemy = await createEnemy(targetPos.clone(), options);

    if (!enemy || !enemy.group) {
      return null;
    }

    enemy.group.position.copy(targetPos);
    if (!options.isBoss) {
      enemy.waveRoom = currentRoom;
      enemy.waveNumber = currentWave;
      enemy.pattern = GAME_CONFIG.WAVES[currentWave].pattern;
      enemy.patternSeed = Math.random() * Math.PI * 2;
    }
    enemy.movementSpeed = options.isBoss
        ? enemy.baseMovementSpeed * GAME_CONFIG.SCALING.ROOM_SPEED_MULTIPLIERS[currentRoom - 1]
        : GAME_CONFIG.SCALING.BASE_ENEMY_SPEED * GAME_CONFIG.SCALING.ROOM_SPEED_MULTIPLIERS[currentRoom - 1] * GAME_CONFIG.SCALING.WAVE_SPEED_MULTIPLIERS[currentWave - 1] * (enemy.speedMultiplier || 1);
    enemy.group.visible = true;

    scene.add(enemy.group);
    enemies.push(enemy);
    if (options.isBoss) startMusic(MUSIC_CONFIG[`BOSS_${options.room}`]);
    return enemy;
  } catch (error) {
    console.error('Error al instanciar enemigo:', error);
    return null;
  }
}

function recordEnemyDefeat(enemy, { empowered = false } = {}) {
  kills += 1;
  const variantBonus = enemy.scoreBonus || 0;
  const bonus = variantBonus + (multiplierTime > 0 ? SCORE_PER_KILL + variantBonus : 0);
  bonusScore += bonus;
  if (comboWindow > 0) comboCount += 1;
  else comboCount = 1;
  comboWindow = 3.8;
  const color = enemy.isBoss ? '#ff7399' : empowered ? '#fff0a1' : enemy.variant === 'swift' ? '#78e8ff' : '#ffbd75';
  spawnParticleBurst(enemy.group.position, color, enemy.isBoss ? 28 : 13, empowered ? 1.25 : enemy.isBoss ? 1.5 : 1);
  updateHUD();
  if (enemy.isBoss) handleBossDefeated();
  return bonus;
}

function recordEnemyDamage(enemy, { damage, empowered = false } = {}) {
  spawnParticleBurst(enemy.group.position, enemy.isBoss ? '#ff7399' : '#c7a1ff', enemy.isBoss ? 10 : 5, empowered ? 1.1 : 0.7);
  if (enemy.isBoss) showToast(`TITAN HIT · ${enemy.health}/${enemy.maxHealth} HEALTH`, 'is-gold');
  else if (enemy.variant === 'armored') showToast(`ARMOR DAMAGED · ${enemy.health}/${enemy.maxHealth}`, 'is-mint');
}

function handleAttack({ defeated, damaged, empowered, bonusPoints }) {
  if (defeated > 0) {
    screenFlash(defeated >= 3 ? 'heavy' : 'light');
    const points = defeated * SCORE_PER_KILL + bonusPoints;
    showToast(`${empowered ? 'EMPOWERED CROAK · ' : ''}${defeated === 1 ? 'INSECT ELIMINATED' : `${defeated} INSECTS ELIMINATED`}  +${points} PTS`, empowered ? 'is-gold' : '');
    if (comboCount >= 3) ui.combo.classList.add('is-visible');
  } else if (damaged > 0) {
    screenFlash();
  } else if (empowered) {
    showToast('EMPOWERED CROAK ACTIVATED!', 'is-mint');
  }
}

function collectPickup(pickup) {
  let message;
  let tone = 'is-mint';
  if (pickup.type === 'seed') {
    bonusScore += SCORE_PER_SEED;
    attackSystem.empowerNextAttack();
    message = `LIGHT SEED  +${SCORE_PER_SEED} · NEXT CROAK EMPOWERED`;
  } else if (pickup.type === 'shield') {
    shieldTime = Math.max(shieldTime, 8);
    message = 'SHIELD ACTIVATED · BLOCKS ONE HIT FOR 8 SEC';
    tone = 'is-mint';
  } else if (pickup.type === 'multiplier') {
    multiplierTime = Math.max(multiplierTime, 12);
    message = 'SCORE ×2 FOR 12 SECONDS!';
    tone = 'is-gold';
  } else {
    hasteTime = Math.max(hasteTime, 9);
    setMusicPlaybackRate(1.5);
    message = 'SPEED BOOST · MOVEMENT +55% FOR 9 SEC';
    tone = 'is-mint';
  }
  spawnParticleBurst(pickup.group.position, pickup.config.color, 18, 1.15);
  scene.remove(pickup.group);
  const index = pickups.indexOf(pickup);
  if (index >= 0) pickups.splice(index, 1);
  pickup.core.geometry.dispose();
  pickup.core.material.dispose();
  pickup.ringA.geometry.dispose();
  pickup.ringA.material.dispose();
  pickup.ringB.geometry.dispose();
  pickup.ringB.material.dispose();
  pickup.halo.geometry.dispose();
  pickup.halo.material.dispose();
  screenShake();
  showToast(message, tone);
  updateHUD();
}

function repelEnemyFromPlayer(enemy) {
  const dx = enemy.group.position.x - player.group.position.x;
  const dy = enemy.group.position.y - player.group.position.y;
  const baseAngle = Math.atan2(dy, dx);
  const distance = enemy.collisionRadius + player.collisionRadius + COLLISION_DISTANCE + 8;
  const blockers = [
    { group: player.group, collisionRadius: player.collisionRadius },
    ...enemies.filter((other) => other !== enemy).map((other) => ({ group: other.group, collisionRadius: other.collisionRadius })),
  ];
  for (const offset of [0, 0.55, -0.55, 1.1, -1.1, 1.65, -1.65]) {
    const angle = baseAngle + offset;
    const candidate = new THREE.Vector3(
        player.group.position.x + Math.cos(angle) * distance,
        player.group.position.y + Math.sin(angle) * distance,
        enemy.group.position.z,
    );
    if (Math.abs(candidate.x) > 292 || Math.abs(candidate.y) > 292) continue;
    if (isPositionClear(candidate, enemy.collisionRadius, blockers, COLLISION_DISTANCE)) {
      enemy.group.position.copy(candidate);
      enemy.group.rotation.z = Math.atan2(-Math.sin(angle), -Math.cos(angle));
      return;
    }
  }
}

function handleEnemyContact(enemy, repelledEnemies) {
  if (invulnerabilityTime > 0) return true;

  if (state !== 'playing' || elapsedSeconds < 0.5) {
    return true;
  }

  if (shieldTime > 0) {
    shieldTime = 0;
    repelEnemyFromPlayer(enemy);
    repelledEnemies.add(enemy);
    spawnParticleBurst(player.group.position, '#86b2ff', 20, 1.15);
    screenFlash();
    showToast('SHIELD ABSORBED THE HIT!', 'is-mint');
    updateHUD();
    return true;
  }

  const contactDamage = enemy.contactDamage ?? Math.round(GAME_CONFIG.SCALING.ROOM_DAMAGE[currentRoom - 1] * 2);
  playerHealth = Math.max(0, playerHealth - contactDamage);
  invulnerabilityTime = 1.5;
  repelEnemyFromPlayer(enemy);
  repelledEnemies.add(enemy);
  screenFlash('heavy');
  screenShake('heavy');
  updateHUD();
  if (playerHealth <= 0) {
    endGame();
    return false;
  }
  return true;
}

function applyBossAttackDamage(damage, { bypassInvulnerability = false } = {}) {
  if (state !== 'playing' || elapsedSeconds < 0.5 || (invulnerabilityTime > 0 && !bypassInvulnerability)) return true;
  if (shieldTime > 0) {
    shieldTime = 0;
    spawnParticleBurst(player.group.position, '#86b2ff', 20, 1.15);
    screenFlash();
    showToast('SHIELD ABSORBED THE ATTACK!', 'is-mint');
    updateHUD();
    return true;
  }
  playerHealth = Math.max(0, playerHealth - damage);
  invulnerabilityTime = 1.5;
  screenFlash('heavy');
  updateHUD();
  if (playerHealth <= 0) {
    endGame();
    return false;
  }
  return true;
}

function updateBossProjectiles(deltaSeconds) {
  for (let index = bossProjectiles.length - 1; index >= 0; index -= 1) {
    const projectile = bossProjectiles[index];
    projectile.life -= deltaSeconds;
    projectile.mesh.position.x += projectile.velocity.x * deltaSeconds;
    projectile.mesh.position.y += projectile.velocity.y * deltaSeconds;
    const hitRadius = player.collisionRadius + projectile.radius;
    const hitPlayer = xyDistance(projectile.mesh.position, player.group.position) <= hitRadius;
    const expired = projectile.life <= 0 || Math.abs(projectile.mesh.position.x) > PLAYER_WORLD_LIMIT + 30 || Math.abs(projectile.mesh.position.y) > PLAYER_WORLD_LIMIT + 30;
    if (!hitPlayer && !expired) continue;

    scene.remove(projectile.mesh);
    projectile.mesh.geometry.dispose();
    projectile.mesh.material.dispose();
    bossProjectiles.splice(index, 1);
    if (hitPlayer && !applyBossAttackDamage(projectile.damage)) return false;
  }
  return true;
}

function cleanGameState() {
  clearEnemies();
  clearPickups();
  clearParticleBursts();
  if (attackSystem) { attackSystem.resetPermanentUpgrades(); attackSystem.reset(); }
  elapsedSeconds = 0;
  playerHealth = 6;
  maxPlayerHealth = 6;
  seedMagnetUnlocked = false;
  permanentPowerUps.clear();
  selectedPowerUps.clear();
  offeredPowerUps = [];
  invulnerabilityTime = 0;
  survivalScore = 0;
  shownPenaltyPoints = 0;
  kills = 0;
  bonusScore = 0;
  totalScore = 0;
  pickupTimer = 0;
  pickupSequence = 0;
  shieldTime = 0;
  multiplierTime = 0;
  hasteTime = 0;
  setMusicPlaybackRate(1);
  spawnInProgress = false;
  currentRoom = 1; currentWave = 1; waveSpawned = 0; waveSpawnTimer = 0; waveSpawning = false; bossTransitioning = false;
  enemySpawnSequence = 0;
  comboCount = 0;
  comboWindow = 0;
  applyGardenTheme(1);
  player.reset();
  player.model.visible = true;
  player.setEnabled(false);
  attackSystem.setEnabled(false);
  updateHUD();
}

async function beginGame() {
  if (!player || !attackSystem || state === 'starting') return;
  if (gameOverCooldownTimeout !== null) {
    clearTimeout(gameOverCooldownTimeout);
    gameOverCooldownTimeout = null;
  }
  canRestart = false;
  if (victoryTransitionTimeout !== null) clearTimeout(victoryTransitionTimeout);
  victoryTransitionTimeout = null;
  ui.winVideo.pause();
  ui.winVideo.currentTime = 0;
  ui.winVideoScreen.classList.remove('is-visible');
  ui.winVideoScreen.classList.add('is-hidden');
  ui.winStats.classList.add('is-hidden');
  ui.winFinal.classList.add('is-hidden');
  ui.winFade.classList.add('is-hidden');
  ui.winFade.classList.remove('fade-out-2', 'fade-to-black-4');
  state = 'starting';
  unlockMusic();
  setMusicPlaybackRate(1);
  startMusic(MUSIC_CONFIG.MAIN);
  sessionId += 1;
  const thisSession = sessionId;
  cleanGameState();
  player.group.visible = true;

  ui.start.classList.add('is-hidden');
  ui.story.classList.add('is-hidden');
  ui.gameover.classList.add('is-hidden');
  ui.pause.classList.add('is-hidden');
  ui.powerUpScreen.classList.add('is-hidden');
  ui.boot.classList.add('is-hidden');

  try {
    if (thisSession !== sessionId) return;

    state = 'playing';
    startWave();
    player.setEnabled(true);
    attackSystem.setEnabled(true);
    clock.getDelta();
    showToast('PROTECT THE GARDEN! Collect seeds and survive', 'is-mint');
    updateHUD();
  } catch (error) {
    state = 'ready';
    showToast('Could not load enemies. Reload the page.', 'is-gold');
    console.error('Error al iniciar una ronda:', error);
  }
}

function endGame() {
  if (state !== 'playing') return;
  state = 'gameover';
  canRestart = false;
  if (gameOverCooldownTimeout !== null) clearTimeout(gameOverCooldownTimeout);
  gameOverCooldownTimeout = setTimeout(() => {
    canRestart = true;
    gameOverCooldownTimeout = null;
  }, 2000);
  pauseMusic();
  player.setEnabled(false);
  attackSystem.setEnabled(false);
  player.group.visible = false;
  totalScore = calculateScore();
  const newRecord = totalScore > bestScore;
  if (newRecord) {
    bestScore = totalScore;
    saveBestScore(bestScore);
  }
  ui.finalScore.textContent = String(totalScore).padStart(4, '0');
  ui.finalKills.textContent = String(kills).padStart(2, '0');
  ui.finalTime.textContent = formatTime(elapsedSeconds);
  ui.finalBest.textContent = String(bestScore).padStart(4, '0');
  ui.recordMessage.textContent = newRecord ? '✦ NEW PERSONAL BEST! ✦' : 'The garden awaits you for another round';
  ui.gameover.classList.remove('is-hidden');
  ui.pause.classList.add('is-hidden');
  updateHUD();
}

function pauseGame() {
  if (state !== 'playing') return;
  state = 'paused';
  pauseMusic();
  player.setEnabled(false);
  attackSystem.setEnabled(false);
  ui.pause.classList.remove('is-hidden');
}

function resumeGame() {
  if (state !== 'paused') return;
  state = 'playing';
  resumeMusic();
  player.setEnabled(true);
  attackSystem.setEnabled(true);
  ui.pause.classList.add('is-hidden');
  clock.getDelta();
}

function onGlobalKeyDown(event) {
  unlockMusic();
  if (state === 'powerup' && ['Digit1', 'Numpad1', 'Digit2', 'Numpad2'].includes(event.code)) {
    event.preventDefault();
    selectPowerUp(event.code.endsWith('1') ? 0 : 1);
    return;
  }
  if (event.code === 'Space' && (state === 'gameover' || (state === 'ready' && ui.start && !ui.start.classList.contains('is-hidden')))) {
    event.preventDefault();
    if ((state === 'ready' && !ui.start.classList.contains('is-hidden')) || (state === 'gameover' && canRestart)) beginGame();
    return;
  }
  if (event.code === 'Enter' && state === 'ready' && !ui.start.classList.contains('is-hidden')) {
    event.preventDefault();
    beginGame();
    return;
  }
  if (event.code === 'Escape' || event.code === 'KeyP') {
    if (state === 'playing') pauseGame();
    else if (state === 'paused') resumeGame();
  }
}
window.addEventListener('keydown', onGlobalKeyDown);

function onWindowResize() {
  if (!camera) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
}

function spawnPickupIfNeeded(deltaSeconds) {
  if (pickups.length > 0) return;
  pickupTimer += deltaSeconds;
  const interval = PICKUP_SPAWN_INTERVAL;
  if (pickupTimer < interval) return;
  pickupTimer = 0;
  const position = findPickupPosition(player, enemies, PLAYER_WORLD_LIMIT - 10);
  const type = PICKUP_TYPES[pickupSequence % PICKUP_TYPES.length].id;
  pickupSequence += 1;
  const pickup = createPickup(position, type);
  scene.add(pickup.group);
  pickups.push(pickup);
  const tone = type === 'multiplier' ? 'is-gold' : 'is-mint';
  showToast(`${pickup.config.icon} ${pickup.config.label.toUpperCase()} DETECTADA`, tone);
}

function updatePickups(deltaSeconds) {
  for (let i = pickups.length - 1; i >= 0; i -= 1) {
    const pickup = pickups[i];
    updatePickup(pickup, deltaSeconds, elapsedSeconds);
    let distance = xyDistance(pickup.group.position, player.group.position);
    if (seedMagnetUnlocked && distance < 180) {
      const pullDistance = Math.min(distance, 220 * deltaSeconds);
      const direction = new THREE.Vector3(
          player.group.position.x - pickup.group.position.x,
          player.group.position.y - pickup.group.position.y,
          0,
      );
      if (distance > 0) pickup.group.position.addScaledVector(direction.normalize(), pullDistance);
      distance = xyDistance(pickup.group.position, player.group.position);
    }
    if (distance <= Math.max(25, player.collisionRadius + 13)) collectPickup(pickup);
  }
}

function animate() {
  const deltaSeconds = Math.min(clock.getDelta(), 0.05);

  if (state === 'playing') {
    elapsedSeconds += deltaSeconds;
    const completedPenaltyPoints = Math.floor(elapsedSeconds / 10);
    while (shownPenaltyPoints < completedPenaltyPoints) {
      shownPenaltyPoints += 1;
      const penalty = document.createElement('span');
      penalty.className = 'score-penalty-float';
      penalty.textContent = '-1';
      ui.scorePenaltyAnchor.append(penalty);
      penalty.addEventListener('animationend', () => penalty.remove(), { once: true });
    }
    invulnerabilityTime = Math.max(0, invulnerabilityTime - deltaSeconds);
    if (invulnerabilityTime > 0) {
      player.model.visible = Math.floor(elapsedSeconds * 12) % 2 === 0;
    } else {
      player.model.visible = true;
    }
    survivalScore += deltaSeconds * SCORE_PER_SECOND * (multiplierTime > 0 ? 2 : 1);
    shieldTime = Math.max(0, shieldTime - deltaSeconds);
    multiplierTime = Math.max(0, multiplierTime - deltaSeconds);
    hasteTime = Math.max(0, hasteTime - deltaSeconds);
    if (hasteTime === 0) setMusicPlaybackRate(1);

    if (comboWindow > 0) {
      comboWindow = Math.max(0, comboWindow - deltaSeconds);
      if (comboWindow === 0) comboCount = 0;
    }

    updateCombatScaling();
    updateHUD();

    const repelledEnemies = new Set();

    for (const enemy of [...enemies]) {
      if (!enemy || !enemy.group) continue;
      const touchingDistance = Math.max(COLLISION_DISTANCE, enemy.collisionRadius + player.collisionRadius + 12);

      if (xyDistance(enemy.group.position, player.group.position) <= touchingDistance) {
        if (!handleEnemyContact(enemy, repelledEnemies)) {
          return;
        }
      }
    }

    if (state === 'playing') {
      player.updateMovement(deltaSeconds, enemies, [ ...pendingEnemySpawns]);

      for (const enemy of enemies) {
        if (!enemy || !enemy.group) continue;
        if (repelledEnemies.has(enemy)) continue;

        if (enemy.isBoss) {
          const attack = updateBossCombat(enemy, player, deltaSeconds);
          for (const projectile of attack.projectiles || []) {
            scene.add(projectile.mesh);
            bossProjectiles.push(projectile);
          }
          if (attack.toast) showToast(attack.toast, 'is-alert');
          if (attack.hitPlayer && !applyBossAttackDamage(attack.damage || 1, { bypassInvulnerability: enemy.bossRoom === 3 })) return;
        }

        const enemyObstacles = [ ...pendingEnemySpawns];
        const music = getMusicState();
        const beatFactor = getBeatFactor(music.audio, music.bpm);
        const outcome = enemy.updateBehavior
            ? enemy.updateBehavior(player, enemies, enemyObstacles, deltaSeconds, enemy.movementSpeed, beatFactor)
            : updateEnemy(enemy, player, enemies, enemyObstacles, deltaSeconds, enemy.movementSpeed, beatFactor);

        if (outcome && outcome.hitPlayer) {
          if (!handleEnemyContact(enemy, repelledEnemies)) {
            return;
          }
        }
      }

      if (!updateBossProjectiles(deltaSeconds)) return;
    }

    if (state === 'playing') {
      attackSystem.update(deltaSeconds);
      updatePickups(deltaSeconds);

      if (waveSpawning && !spawnInProgress) {
        const config = GAME_CONFIG.WAVES[currentWave];
        waveSpawnTimer += deltaSeconds * 1000;
        if (waveSpawned < config.count && waveSpawnTimer >= (waveSpawned === 0 ? 0 : config.intervalMs)) {
          waveSpawnTimer = 0;
          const count = Math.min(config.batchSize, config.count - waveSpawned);
          const thisSession = sessionId;
          spawnInProgress = true;
          Promise.all(Array.from({ length: count }, () => spawnEnemyAt(getSafeSpawnPosition(), thisSession, { variant: chooseEnemyVariant() })))
              .then((created) => { if (thisSession === sessionId) waveSpawned += created.filter(Boolean).length; })
              .finally(() => { if (thisSession === sessionId) spawnInProgress = false; });
        } else if (waveSpawned >= config.count && !enemies.some((enemy) => enemy.waveRoom === currentRoom && enemy.waveNumber === currentWave)) {
          waveSpawning = false;
          if (currentWave < GAME_CONFIG.ROOMS.WAVES_PER_ROOM) { currentWave += 1; startWave(); }
          else {
            const farthest = ENEMY_SPAWN_POINTS.reduce((best, point) => xyDistance(point, player.group.position) > xyDistance(best, player.group.position) ? point : best, ENEMY_SPAWN_POINTS[0]);
            spawnInProgress = true;
            spawnEnemyAt(getSafeSpawnPosition() || farthest, sessionId, { isBoss: true, room: currentRoom })
                .finally(() => { spawnInProgress = false; });
          }
        }
      }

      spawnPickupIfNeeded(deltaSeconds);
      updateHUD();
    }
  } else if (state === 'paused') {
    // paused
  } else {
    attackSystem?.update(deltaSeconds);
  }

  updateParticleBursts(deltaSeconds);
  renderer.render(scene, camera);
}

async function initialize() {
  try {
    gardenMap = createMap();
    scene.add(gardenMap);
    applyGardenTheme(1);
    player = await createPlayer();
    scene.add(player.group);
    camera = createCamera(window.innerWidth / window.innerHeight);
    player.group.add(camera);
    attackSystem = createAttackSystem(scene, player, enemies, {
      onEnemyDefeated: recordEnemyDefeat,
      onEnemyDamaged: recordEnemyDamage,
      onAttack: handleAttack,
    });
    attackSystem.setEnabled(false);
    player.setEnabled(false);

    ui.boot.classList.add('is-hidden');
    ui.story.classList.remove('is-hidden');
    state = 'ready';
    ui.best.textContent = String(bestScore).padStart(4, '0');
    ui.startButton.addEventListener('click', beginGame);
    document.querySelector('#story-next-button').addEventListener('click', () => {
      ui.story.classList.add('is-hidden');
      ui.start.classList.remove('is-hidden');
    });
    const musicVolumeSlider = document.querySelector('#music-volume-slider');
    setMusicVolume(musicVolumeSlider.value);
    musicVolumeSlider.addEventListener('input', (event) => setMusicVolume(event.currentTarget.value));
    ui.retryButton.addEventListener('click', beginGame);
    ui.goToCreditsButton.addEventListener('click', beginCreditsTransition);
    ui.playAgainButton.addEventListener('click', beginGame);
    ui.winVideo.addEventListener('ended', finishVictoryVideo);
    ui.resumeButton.addEventListener('click', resumeGame);
    ui.powerUpConfirm.addEventListener('click', finishPowerUpSelection);
    ui.pauseRestartButton.addEventListener('click', beginGame);
    document.querySelector('#pause-button').addEventListener('click', pauseGame);
    window.addEventListener('resize', onWindowResize);
    document.querySelectorAll('[data-direction]').forEach((button) => {
      const enqueue = (event) => {
        event.preventDefault();
        if (player && state === 'playing') player.enqueueDirection(button.dataset.direction);
      };
      button.addEventListener('pointerdown', enqueue);
      button.addEventListener('click', (event) => event.preventDefault());
    });
    document.querySelector('#mobile-attack')?.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      if (state === 'playing') attackSystem.triggerAttack();
    });

    updateHUD();
    renderer.setAnimationLoop(animate);
  } catch (error) {
    console.error('Could not start Tode:', error);
    ui.boot.classList.remove('is-hidden');
    ui.boot.querySelector('.boot-copy').textContent = 'Could not load 3D models. Make sure the public/models folder is complete, then run npm run dev again.';
  }
}

initialize();
