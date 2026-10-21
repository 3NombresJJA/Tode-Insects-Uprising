import * as THREE from 'three';
import { disposeEnemy } from './Enemy.js';
import { getAssetUrl } from '../utils/assetUrl.js';

export const ATTACK_COOLDOWN = 1;
export const ATTACK_RADIUS = 68;
export const ATTACK_VISUAL_DURATION = 0.5;
export const TONGUE_COOLDOWN = 8; // Tiempo de recarga en segundos.
export const TONGUE_RANGE = 120; // Distancia máxima de la lengua.
export const TONGUE_WIDTH = 12; // Grosor del área de daño.
export const TONGUE_TIP_RADIUS = 12;
export const TONGUE_KEY = 'Alt'; // Tecla de activación.
// Place the croak sound file at public/audios/croak.mp3 in the project.
const CROAK_SOUND_PATH = '/audios/croak.mp3';
const TONGUE_SOUND_PATH = '/audios/Lenguetazo.mp3';

/** Space emits a sonic croak that damages enemies in its radius. */
export function createAttackSystem(scene, player, enemies, callbacks = {}) {
  const croakAudio = new Audio(getAssetUrl(CROAK_SOUND_PATH));
  croakAudio.volume = 0.6;
  const tongueAudio = new Audio(getAssetUrl(TONGUE_SOUND_PATH));
  tongueAudio.volume = 0.75;

  const auraMesh = new THREE.Mesh(
      new THREE.RingGeometry(18, 22, 32),
      new THREE.MeshBasicMaterial({ color: '#ffea00', transparent: true, opacity: 0.6, side: THREE.DoubleSide }),
  );
  auraMesh.position.z = 0.3;
  player.group.add(auraMesh);

  // Delimita el radio base del croar sin tapar el terreno ni a los enemigos.
  const rangeIndicator = new THREE.Mesh(
      new THREE.RingGeometry(ATTACK_RADIUS - 4, ATTACK_RADIUS-3, 96),
      new THREE.MeshBasicMaterial({
        color: '#2B00DA',
        transparent: true,
        opacity: 0.01,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
  );
  rangeIndicator.name = 'CroakRangeIndicator';
  rangeIndicator.position.z = 0.3;
  player.group.add(rangeIndicator);

  const starCanvas = document.createElement('canvas');
  starCanvas.width = 128;
  starCanvas.height = 128;
  const starContext = starCanvas.getContext('2d');
  starContext.fillStyle = '#ffea00';
  starContext.beginPath();
  for (let point = 0; point < 10; point += 1) {
    const radius = point % 2 === 0 ? 58 : 27;
    const angle = -Math.PI / 2 + point * Math.PI / 5;
    const x = 64 + Math.cos(angle) * radius;
    const y = 64 + Math.sin(angle) * radius;
    if (point === 0) starContext.moveTo(x, y);
    else starContext.lineTo(x, y);
  }
  starContext.closePath();
  starContext.fill();
  starContext.fillStyle = '#111111';
  starContext.font = 'bold 30px sans-serif';
  starContext.textAlign = 'center';
  starContext.textBaseline = 'middle';
  starContext.fillText('ALT', 64, 67);
  const starTexture = new THREE.CanvasTexture(starCanvas);
  const starMesh = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTexture, transparent: true, depthWrite: false }));
  starMesh.position.z = 25;
  starMesh.scale.set(18, 18, 1);
  player.group.add(starMesh);

  const tongueGeometry = new THREE.PlaneGeometry(1, TONGUE_WIDTH);
  tongueGeometry.translate(0.5, 0, 0);
  const tongueLineMesh = new THREE.Mesh(tongueGeometry, new THREE.MeshBasicMaterial({ color: '#ff4d6d', side: THREE.DoubleSide }));
  tongueLineMesh.visible = false;
  scene.add(tongueLineMesh);
  const tongueTipGeometry = new THREE.CircleGeometry(TONGUE_TIP_RADIUS, 32);
  const tongueTipMaterial = new THREE.MeshBasicMaterial({ color: '#ff4d6d' });
  const tongueTipMesh = new THREE.Mesh(tongueTipGeometry, tongueTipMaterial);
  tongueTipMesh.visible = false;
  scene.add(tongueTipMesh);
  let tongueCooldownRemaining = TONGUE_COOLDOWN;
  let tongueVisualRemaining = 0;

  const waveGroup = new THREE.Group();
  waveGroup.position.z = 0.5;
  waveGroup.visible = false;
  player.group.add(waveGroup);

  const waves = [
    { inner: 0.22, outer: 0.32, color: '#88efff', delay: 0, speed: 0.9, opacity: 0.8 },
    { inner: 0.18, outer: 0.28, color: '#44ccff', delay: 0.18, speed: 1, opacity: 0.75 },
    { inner: 0.14, outer: 0.24, color: '#00aaff', delay: 0.36, speed: 1.05, opacity: 0.7 },
  ].map((config) => {
    const geometry = new THREE.RingGeometry(config.inner, config.outer, 64);
    const material = new THREE.MeshBasicMaterial({
      color: config.color,
      transparent: true,
      opacity: config.opacity,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    waveGroup.add(mesh);
    return { ...config, geometry, material, mesh };
  });

  let enabled = false;
  let cooldownDuration = ATTACK_COOLDOWN;
  let cooldownRemaining = 0;
  let visualRemaining = 0;
  let baseRadius = ATTACK_RADIUS;
  let bonusDamage = 0;
  let bonusRadius = 0;
  let cooldownMultiplier = 1;
  let empoweredAttacks = 0;
  let visualRadius = ATTACK_RADIUS;

  function setVisualRadius(radius) {
    visualRadius = radius;
  }

  function triggerAttack() {
    if (!enabled || cooldownRemaining > 0) return false;

    cooldownRemaining = cooldownDuration;
    visualRemaining = ATTACK_VISUAL_DURATION;
    const empowered = empoweredAttacks > 0;
    if (empowered) empoweredAttacks -= 1;
    const radius = (baseRadius + bonusRadius) * (empowered ? 1.65 : 1);
    const damage = (empowered ? 2 : 1) + bonusDamage;
    setVisualRadius(radius);
    croakAudio.currentTime = 0;
    croakAudio.play().catch(() => {});
    waveGroup.visible = true;

    let defeated = 0;
    let damaged = 0;
    let bonusPoints = 0;
    for (let i = enemies.length - 1; i >= 0; i -= 1) {
      const enemy = enemies[i];
      const dx = enemy.group.position.x - player.group.position.x;
      const dy = enemy.group.position.y - player.group.position.y;
      if (Math.hypot(dx, dy) > radius) continue;

      if (enemy.health > damage) {
        enemy.health -= damage;
        damaged += 1;
        callbacks.onEnemyDamaged?.(enemy, { damage, empowered });
      } else {
        bonusPoints += callbacks.onEnemyDefeated?.(enemy, { empowered }) || 0;
        scene.remove(enemy.group);
        disposeEnemy(enemy);
        enemies.splice(i, 1);
        defeated += 1;
      }
    }
    callbacks.onAttack?.({ defeated, damaged, empowered, radius, bonusPoints });
    return true;
  }

  function triggerTongue() {
    if (tongueCooldownRemaining > 0) return false;
    tongueCooldownRemaining = TONGUE_COOLDOWN * cooldownMultiplier;
    const sound = tongueAudio.cloneNode();
    sound.volume = tongueAudio.volume;
    sound.play().catch(() => {});
    tongueVisualRemaining = 0.2;
    auraMesh.visible = false;
    starMesh.visible = false;
    const angle = player.model.rotation.z - Math.PI / 2;
    tongueLineMesh.position.set(player.group.position.x, player.group.position.y, 3.5);
    tongueLineMesh.rotation.z = angle;
    tongueLineMesh.scale.x = TONGUE_RANGE;
    tongueLineMesh.visible = true;
    const tipX = player.group.position.x + Math.cos(angle) * TONGUE_RANGE;
    const tipY = player.group.position.y + Math.sin(angle) * TONGUE_RANGE;
    tongueTipMesh.position.set(tipX, tipY, 3.5);
    tongueTipMesh.visible = true;

    for (let i = enemies.length - 1; i >= 0; i -= 1) {
      const enemy = enemies[i];
      const dx = enemy.group.position.x - player.group.position.x;
      const dy = enemy.group.position.y - player.group.position.y;
      const forward = dx * Math.cos(angle) + dy * Math.sin(angle);
      const lateral = -dx * Math.sin(angle) + dy * Math.cos(angle);
      const distToTip = Math.hypot(enemy.group.position.x - tipX, enemy.group.position.y - tipY);
      const intersectsLine = forward >= 0 && forward <= TONGUE_RANGE && Math.abs(lateral) <= TONGUE_WIDTH / 2;
      const intersectsTip = distToTip <= TONGUE_TIP_RADIUS + enemy.collisionRadius;
      if (!intersectsLine && !intersectsTip) continue;
      const damage = 4 + bonusDamage;
      if (enemy.health > damage) {
        enemy.health -= damage;
        callbacks.onEnemyDamaged?.(enemy, { damage, tongue: true });
      } else {
        callbacks.onEnemyDefeated?.(enemy, { tongue: true });
        scene.remove(enemy.group);
        disposeEnemy(enemy);
        enemies.splice(i, 1);
      }
    }
    return true;
  }

  function onKeyDown(event) {
    if (event.key === TONGUE_KEY || event.code === 'AltLeft' || event.code === 'AltRight') {
      event.preventDefault();
      if (!enabled) return;
      if (!event.repeat) triggerTongue();
      return;
    }
    if (event.code !== 'Space' || !enabled) return;
    event.preventDefault();
    if (!event.repeat) triggerAttack();
  }
  window.addEventListener('keydown', onKeyDown);

  function update(deltaSeconds) {
    cooldownRemaining = Math.max(0, cooldownRemaining - deltaSeconds);
    tongueCooldownRemaining = Math.max(0, tongueCooldownRemaining - deltaSeconds);
    auraMesh.visible = tongueCooldownRemaining <= 0;
    starMesh.visible = tongueCooldownRemaining <= 0;
    tongueVisualRemaining = Math.max(0, tongueVisualRemaining - deltaSeconds);
    tongueLineMesh.visible = tongueVisualRemaining > 0;
    tongueTipMesh.visible = tongueVisualRemaining > 0;
    rangeIndicator.scale.setScalar(((baseRadius + bonusRadius) * 0.9) / ATTACK_RADIUS);
    rangeIndicator.material.opacity = cooldownRemaining <= 0.01 ? 0.42 : 0.35;
    if (visualRemaining > 0) {
      visualRemaining = Math.max(0, visualRemaining - deltaSeconds);
      const progress = visualRemaining / ATTACK_VISUAL_DURATION;
      const expansion = 1 - progress;
      waves.forEach(({ mesh, material, delay, outer, opacity }) => {
        const waveProgress = THREE.MathUtils.clamp((expansion - delay) / (1 - delay), 0, 1);
        // La escala base del anillo usa su radio exterior normalizado; al final
        // de la expansión, su borde exterior coincide con el radio del ataque.
        mesh.scale.setScalar((visualRadius * waveProgress) / outer);
        material.opacity = opacity * (1 - waveProgress);
      });
    }
    waveGroup.visible = visualRemaining > 0;
  }

  function dispose() {
    window.removeEventListener('keydown', onKeyDown);
    player.group.remove(waveGroup);
    player.group.remove(auraMesh);
    player.group.remove(rangeIndicator);
    player.group.remove(starMesh);
    scene.remove(tongueLineMesh);
    scene.remove(tongueTipMesh);
    auraMesh.geometry.dispose();
    auraMesh.material.dispose();
    rangeIndicator.geometry.dispose();
    rangeIndicator.material.dispose();
    starTexture.dispose();
    starMesh.material.dispose();
    tongueGeometry.dispose();
    tongueLineMesh.material.dispose();
    tongueTipGeometry.dispose();
    tongueTipMaterial.dispose();
    waves.forEach(({ geometry, material }) => {
      geometry.dispose();
      material.dispose();
    });
  }

  return {
    update,
    triggerAttack,
    dispose,
    setEnabled(value) { enabled = Boolean(value); },
    reset() {
      cooldownRemaining = 0;
      tongueCooldownRemaining = TONGUE_COOLDOWN * cooldownMultiplier;
      tongueVisualRemaining = 0;
      visualRemaining = 0;
      empoweredAttacks = 0;
      baseRadius = ATTACK_RADIUS;
      setVisualRadius(ATTACK_RADIUS);
      waveGroup.visible = false;
      auraMesh.visible = true;
      starMesh.visible = true;
      tongueLineMesh.visible = false;
      tongueTipMesh.visible = false;
      waves.forEach(({ mesh, material }) => {
        mesh.scale.setScalar(0);
        material.opacity = 0;
      });
    },
    setCooldown(value) { cooldownDuration = Math.max(0.25, value); },
    addDamage(value) { bonusDamage += value; },
    addRadius(value) { bonusRadius += value; },
    reduceCooldown(factor = 0.75) {
      cooldownMultiplier *= factor;
      cooldownDuration = Math.max(0.25, ATTACK_COOLDOWN * cooldownMultiplier);
    },
    resetPermanentUpgrades() {
      bonusDamage = 0; bonusRadius = 0; cooldownMultiplier = 1;
      cooldownDuration = ATTACK_COOLDOWN;
    },
    empowerNextAttack() { empoweredAttacks = Math.min(3, empoweredAttacks + 1); },
    get cooldownRemaining() { return cooldownRemaining; },
    get tongueCooldownRemaining() { return tongueCooldownRemaining; },
    get tongueCooldownDuration() { return TONGUE_COOLDOWN * cooldownMultiplier; },
    TONGUE_COOLDOWN,
    get cooldownDuration() { return cooldownDuration; },
    get empoweredAttacks() { return empoweredAttacks; },
  };
}
