import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { COLLISION_DISTANCE, isPositionClear, xyDistance } from './Collision.js';
import {ROOM_CONFIGS} from "./Map.js";
import {GAME_CONFIG} from "../Config.js";

export const ENEMY_MOVEMENT_SPEED = 2;
export const ENEMY_SPAWN_POINTS = [
  new THREE.Vector3(-245, -245, 0),
  new THREE.Vector3(-245, 245, 0),
  new THREE.Vector3(245, -245, 0),
  new THREE.Vector3(245, 245, 0),
];

const loader = new GLTFLoader();
const rhythmicMaterialBases = new WeakMap();
const PULSE_WHITE = new THREE.Color(0x383332);
let cachedEnemyGLTF = null;
const BOSS_MODELS = {
  1: { name: 'spider', path: '/models/spider.glb', label: 'Spider', scale: 0.9, speed: 100 },
  2: { name: 'ladybug', path: '/models/ladybug.glb', label: 'Ladybug', scale: 2.4, speed: 90 },
  3: { name: 'mantis', path: '/models/mantis.glb', label: 'Mantis', scale: 9, speed: 60 },
};
const cachedBossGLTF = new Map();
const BOSS_WORLD_LIMIT = 250;
const MANTIS_SLASH_RANGE = 110;
const MANTIS_SLASH_FACING_DOT = 0.8;
const MANTIS_SLASH_DURATION = 0.32;
const MANTIS_COLLISION_RADIUS = 34;

const VARIANTS = {
  normal: { label: 'Garden insect', visualScale: 1.15, tint: '#FF8D33', speedMultiplier: 1, health: 2, boss: false, scoreBonus: 0 },
  swift: { label: 'Swift scout', visualScale: 0.92, tint: '#FFF494', speedMultiplier: 1.42, health: 1, boss: false, scoreBonus: 5 },
  armored: { label: 'Armored beetle', visualScale: 1.4, tint: '#F02E2E', speedMultiplier: 0.82, health: 3, boss: false, scoreBonus: 10 },
};

async function loadEnemyBaseTemplate() {
  if (!cachedEnemyGLTF) {
    cachedEnemyGLTF = await loader.loadAsync( `${import.meta.env.BASE_URL}models/enemy.glb`);
  }
  return cachedEnemyGLTF;
}


function loadBossTemplate(room) {
  const bossModel = BOSS_MODELS[room];
  const modelPath = `${import.meta.env.BASE_URL}${bossModel.path.replace(/^\/+/, '')}`;

  if (!bossModel) throw new Error(`No boss model found for room ${room}`);
  if (!cachedBossGLTF.has(bossModel.name)) {
    const request = loader.loadAsync(modelPath).catch((error) => {
      cachedBossGLTF.delete(bossModel.name);
      throw error;
    });
    cachedBossGLTF.set(bossModel.name, request);
  }
  return cachedBossGLTF.get(bossModel.name);
}

export async function createEnemy(spawnPosition, options = {}) {
  const isBoss = options.isBoss === true;
  const variant = VARIANTS[options.variant] ? options.variant : 'normal';
  const baseConfig = VARIANTS[variant];
  const bossModel = isBoss ? BOSS_MODELS[options.room] : null;
  const config = isBoss
      ? { label: bossModel?.label || 'Boss', visualScale: 1, bossScale: bossModel?.scale || 1, bossSpeed: bossModel?.speed || ENEMY_MOVEMENT_SPEED, tint: '#ffffff', speedMultiplier: 1, health: 15 , boss: true, scoreBonus: 100 }
      : baseConfig;

  const gltf = isBoss ? await loadBossTemplate(options.room) : await loadEnemyBaseTemplate();
  const model = SkeletonUtils.clone(gltf.scene);

  const group = new THREE.Group();
  group.name = config.boss ? 'GardenBoss' : 'GardenPest';
  group.position.copy(spawnPosition);
  group.userData.variant = isBoss ? 'boss' : variant;
  if (isBoss) group.userData.bossModel = bossModel.name;

  const visual = new THREE.Group();
  visual.name = 'EnemyVisualScaleCorrection';
  visual.scale.setScalar(config.visualScale);
  group.add(visual);

  // Contenedor aislado para poner el modelo de pie sin alterar las animaciones
  const wrapper = new THREE.Group();
  wrapper.name = 'EnemyStandingWrapper';
  wrapper.rotation.x = Math.PI / 2;

  model.scale.setScalar(isBoss ? 20 * config.bossScale : 5);

  const tint = new THREE.Color(config.tint);
  model.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
    if (Array.isArray(object.material)) {
      object.material = object.material.map((sourceMaterial) => prepareMaterial(sourceMaterial, tint, config.boss));
    } else if (object.material) {
      object.material = prepareMaterial(object.material, tint, config.boss);
    }
  });

  const templateBox = new THREE.Box3().setFromObject(gltf.scene);
  model.position.z = -templateBox.min.z;

  wrapper.add(model);
  visual.add(wrapper);

  let mixer = null;
  if (gltf.animations && gltf.animations.length > 0) {
    const clip = gltf.animations[0].clone();

    clip.tracks = clip.tracks.filter((track) => {
      const isRotationTrack = track.name.endsWith('.quaternion') || track.name.endsWith('.rotation');
      const isRootOrArmature = track.name.startsWith('Armature') || track.name.startsWith('Root') || track.name.startsWith('.');

      return !(isRotationTrack && isRootOrArmature);
    });

    mixer = new THREE.AnimationMixer(model);
    const action = mixer.clipAction(clip);
    action.play();
  }

  group.updateMatrixWorld(true);

  const collisionRadius = isBoss && options.room === 3
      ? MANTIS_COLLISION_RADIUS
      : 18 * (isBoss ? config.bossScale : config.visualScale);

  const enemy = {
    group,
    model,
    wrapper,
    visual,
    baseScale: config.visualScale,
    mixer,
    collisionRadius,
    contactDamage: isBoss ? 1 : null,
    movementSpeed: isBoss ? config.bossSpeed : ENEMY_MOVEMENT_SPEED * config.speedMultiplier,
    baseMovementSpeed: isBoss ? config.bossSpeed : null,
    speedMultiplier: config.speedMultiplier,
    health: config.health,
    maxHealth: config.health,
    isBoss: config.boss,
    variant: isBoss ? 'boss' : variant,
    label: config.label,
    scoreBonus: config.scoreBonus,
    patternSeed: Math.random() * 100,
    bossRoom: isBoss ? options.room : null,
    basicAttackCount: 0,
    basicAttackTimer: BOSS_SHOT_INTERVAL_SECONDS,
    bossSpecialPhase: 'idle',
    bossSpecialTimer: 0,
    updateBehavior(player, enemies, obstacles, deltaSeconds, speed,beatFactor) {
      return updateEnemy(this, player, enemies, obstacles, deltaSeconds, speed,beatFactor);
    },
  };

  if (config.boss) {
    const bossRing = new THREE.Mesh(
        new THREE.RingGeometry(Math.max(7, collisionRadius * 0.78), collisionRadius * 1.08, 64),
        new THREE.MeshBasicMaterial({ color: '#ff719b', transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }),
    );
    bossRing.name = 'BossWarningRing';
    bossRing.position.z = 0.45;
    group.add(bossRing);
    enemy.bossRing = bossRing;
  }

  return enemy;
}

function prepareMaterial(sourceMaterial, tint, isBoss) {
  const material = sourceMaterial.clone();
  if (isBoss) {
    material.transparent = false;
    material.opacity = 1;
    if ('transmission' in material) material.transmission = 0;
  } else if (material.color) {
    material.color.multiply(tint);
  }
  return material;
}

export function disposeEnemy(enemy) {
  if (!enemy?.group) return;
  enemy.group.traverse((object) => {
    if (!object.isMesh) return;
    object.geometry?.dispose();
    if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
    else object.material?.dispose();
  });
}

const BOSS_PROJECTILE_COLORS = { 1: '#F0E9E9', 2: '#B32525', 3: '#0A4017' };
const BOSS_PROJECTILE_RADIUS = 3.64; // Radio actual (2.8) aumentado un 30%.
const BOSS_PROJECTILE_SPEED = 200; // Velocidad anterior: 115 unidades/s.
const BOSS_SHOT_INTERVAL_SECONDS = 0.5; // 2 disparos básicos por segundo.
const LADYBUG_RING_BULLET_COUNT = 8;
const MANTIS_CROSS_DIRECTION_COUNT = 4;
const MANTIS_CROSS_START_ANGLE = 0;

function startMantisSlash(enemy) {
  if (enemy.mantisSlash?.mesh) {
    enemy.mantisSlash.mesh.parent?.remove(enemy.mantisSlash.mesh);
    enemy.mantisSlash.mesh.geometry.dispose();
    enemy.mantisSlash.mesh.material.dispose();
  }
  const mesh = new THREE.Mesh(
      new THREE.RingGeometry(8, MANTIS_SLASH_RANGE, 64, 1, 0, 0.01),
      new THREE.MeshBasicMaterial({
        color: '#0CF5A0',
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
  );
  mesh.name = 'MantisKatanaSlash';
  mesh.position.z = 0.75;
  enemy.group.add(mesh);
  enemy.mantisSlash = { mesh, elapsed: 0 };
}

function advanceMantisSlash(enemy, deltaSeconds) {
  const slash = enemy.mantisSlash;
  if (!slash) return;
  slash.elapsed += deltaSeconds;
  const progress = Math.min(1, slash.elapsed / MANTIS_SLASH_DURATION);
  slash.mesh.geometry.dispose();
  slash.mesh.geometry = new THREE.RingGeometry(8, MANTIS_SLASH_RANGE, 64, 1, 0, Math.PI * progress);
  slash.mesh.material.opacity = 0.95 * (1 - progress);
  if (progress >= 1) {
    slash.mesh.parent?.remove(slash.mesh);
    slash.mesh.geometry.dispose();
    slash.mesh.material.dispose();
    enemy.mantisSlash = null;
  }
}

function makeBossProjectile(enemy, player, angleOffset = 0, fixedDirection = null) {
  const direction = fixedDirection
      ? fixedDirection.clone().normalize()
      : new THREE.Vector2(
          player.group.position.x - enemy.group.position.x,
          player.group.position.y - enemy.group.position.y,
      ).normalize().rotateAround(new THREE.Vector2(), angleOffset);
  const color = BOSS_PROJECTILE_COLORS[enemy.bossRoom];
  const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(BOSS_PROJECTILE_RADIUS, 20, 16),
      new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 1.35,
        roughness: 0.24,
        metalness: 0.08,
      }),
  );
  mesh.position.set(enemy.group.position.x, enemy.group.position.y, 5);
  mesh.name = 'BossEnergyProjectile';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return { mesh, velocity: direction.multiplyScalar(BOSS_PROJECTILE_SPEED), damage: 1, radius: BOSS_PROJECTILE_RADIUS, life: 5 };
}

/** Advances the room boss attack cycle and returns projectiles and player hits. */
export function updateBossCombat(enemy, player, deltaSeconds) {
  if (!enemy?.isBoss || !enemy.group || !player?.group) return {};
  const result = { projectiles: [] };
  advanceMantisSlash(enemy, deltaSeconds);

  if (enemy.bossRoom === 2 && enemy.bossSpecialPhase !== 'idle') {
    enemy.bossSpecialTimer -= deltaSeconds;
    if (enemy.bossSpecialPhase === 'warning' && enemy.bossSpecialTimer <= 0) {
      enemy.bossSpecialPhase = 'charge';
      enemy.bossSpecialTimer = 1;
      enemy.bossAttackLine?.parent?.remove(enemy.bossAttackLine);
      enemy.bossAttackLine?.geometry.dispose();
      enemy.bossAttackLine?.material.dispose();
      enemy.bossAttackLine = null;
    } else if (enemy.bossSpecialPhase === 'charge') {
      const step = Math.min(390 * deltaSeconds, enemy.chargeRemaining);
      const nextX = enemy.group.position.x + enemy.chargeDirection.x * step;
      const nextY = enemy.group.position.y + enemy.chargeDirection.y * step;
      const limit = BOSS_WORLD_LIMIT - enemy.collisionRadius;
      if (Math.abs(nextX) > limit || Math.abs(nextY) > limit) {
        enemy.bossSpecialPhase = 'recovery';
        enemy.bossSpecialTimer = 2.5;
        return result;
      }
      enemy.group.position.set(nextX, nextY, enemy.group.position.z);
      enemy.chargeRemaining -= step;
      if (Math.hypot(player.group.position.x - enemy.group.position.x, player.group.position.y - enemy.group.position.y) <= enemy.collisionRadius + player.collisionRadius) {
        result.hitPlayer = true;
        result.damage = 2;
        enemy.bossSpecialPhase = 'recovery';
        enemy.bossSpecialTimer = 2;
      } else if (enemy.chargeRemaining <= 0 || enemy.bossSpecialTimer <= 0) {
        enemy.bossSpecialPhase = 'recovery';
        enemy.bossSpecialTimer = 2;
      }
    } else if (enemy.bossSpecialPhase === 'recovery' && enemy.bossSpecialTimer <= 0) {
      enemy.bossSpecialPhase = 'idle';
      enemy.bossAttackLine?.parent?.remove(enemy.bossAttackLine);
      enemy.bossAttackLine?.geometry.dispose();
      enemy.bossAttackLine?.material.dispose();
      enemy.bossAttackLine = null;
    }
    return result;
  }

  enemy.basicAttackTimer -= deltaSeconds;
  if (enemy.basicAttackTimer > 0 || enemy.bossSpecialPhase !== 'idle') return result;

  enemy.basicAttackTimer = BOSS_SHOT_INTERVAL_SECONDS;
  enemy.basicAttackCount += 1;
  if (enemy.bossRoom === 2) {
    for (let index = 0; index < LADYBUG_RING_BULLET_COUNT; index += 1) {
      const angle = (Math.PI * 2 * index) / LADYBUG_RING_BULLET_COUNT;
      const direction = new THREE.Vector2(Math.cos(angle), Math.sin(angle));
      result.projectiles.push(makeBossProjectile(enemy, player, 0, direction));
    }
  } else if (enemy.bossRoom === 3) {
    for (let index = 0; index < MANTIS_CROSS_DIRECTION_COUNT; index += 1) {
      const angle = MANTIS_CROSS_START_ANGLE + (Math.PI * 2 * index) / MANTIS_CROSS_DIRECTION_COUNT;
      const direction = new THREE.Vector2(Math.cos(angle), Math.sin(angle));
      result.projectiles.push(makeBossProjectile(enemy, player, 0, direction));
    }
  } else {
    result.projectiles.push(makeBossProjectile(enemy, player));
  }

  if (enemy.bossRoom === 1 && enemy.basicAttackCount % 3 === 0) {
    result.projectiles.push(makeBossProjectile(enemy, player, -0.28), makeBossProjectile(enemy, player, 0.28));
  } else if (enemy.bossRoom === 2 && enemy.basicAttackCount % 5 === 0) {
    enemy.bossSpecialPhase = 'warning';
    enemy.bossSpecialTimer = 0.8;
    enemy.chargeDirection = new THREE.Vector3(
        player.group.position.x - enemy.group.position.x,
        player.group.position.y - enemy.group.position.y,
        0,
    ).normalize();
    enemy.chargeRemaining = 330;
    enemy.group.rotation.z = Math.atan2(enemy.chargeDirection.x, -enemy.chargeDirection.y);
    const line = new THREE.Mesh(
        new THREE.PlaneGeometry(34, enemy.chargeRemaining),
        new THREE.MeshBasicMaterial({ color: '#ff2638', transparent: true, opacity: 0.34, depthWrite: false, side: THREE.DoubleSide }),
    );
    line.position.set(0, -enemy.chargeRemaining / 2, 0.4);
    line.name = 'LadybugChargeWarning';
    enemy.group.add(line);
    enemy.bossAttackLine = line;
    result.toast = 'LADYBUG CHARGE ALERT!';
  } else if (enemy.bossRoom === 3 && enemy.basicAttackCount % 3 === 0) {
    const dx = player.group.position.x - enemy.group.position.x;
    const dy = player.group.position.y - enemy.group.position.y;
    const distance = Math.hypot(dx, dy);
    // The mantis GLB faces the opposite local direction, so its corrected front is local +Y.
    const forwardX = -Math.sin(enemy.group.rotation.z);
    const forwardY = Math.cos(enemy.group.rotation.z);
    const facing = distance > 0 ? (dx * forwardX + dy * forwardY) / distance : 1;
    result.toast = 'MANTIS SWEEP!';
    if (distance <= MANTIS_SLASH_RANGE && facing >= MANTIS_SLASH_FACING_DOT) {
      result.hitPlayer = true;
      result.damage = 2;
    }
    startMantisSlash(enemy);
  }
  return result;
}

export function updateEnemy(enemy, player, enemies, obstacles, deltaSeconds, movementSpeed = enemy.movementSpeed, beatFactor = 0) {
  if (enemy.mixer) {
    enemy.mixer.update(deltaSeconds);
  }

  if (!enemy?.group || !player?.group) return { hitPlayer: false };
  if (enemy.isBoss && enemy.bossSpecialPhase !== 'idle') return { hitPlayer: false };

  const pulse = THREE.MathUtils.clamp(beatFactor || 0, 0, 1);
  enemy.visual.scale.setScalar(enemy.baseScale * (1 + pulse * 0.2));
  enemy.model.traverse((object) => {
    if (!object.isMesh) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!material) continue;
      let base = rhythmicMaterialBases.get(material);
      if (!base) {
        base = {
          color: material.color?.clone() ?? null,
          emissive: material.emissive?.clone() ?? null,
          emissiveIntensity: material.emissiveIntensity,
        };
        rhythmicMaterialBases.set(material, base);
      }
      if (material.emissive) {
        if (base.emissive) material.emissive.copy(base.emissive).lerp(PULSE_WHITE, pulse);
        material.emissiveIntensity = base.emissiveIntensity + pulse * 0.2;
      } else if (material.color && base.color) {
        material.color.copy(base.color).lerp(PULSE_WHITE, pulse * 0.1);
      }
    }
  });
  if (enemy.bossRing) {
    enemy.bossRing.scale.setScalar(1 + pulse * 0.08);
    enemy.bossRing.material.opacity = 0.4 + pulse * 0.5;
  }

  enemy.behaviorTime = (enemy.behaviorTime || 0) + deltaSeconds;

  let targetX = player.group.position.x;
  let targetY = player.group.position.y;

  // --- PATRONES DE MOVIMIENTO NOTORIOS ---
  if (enemy.pattern === 'linear') {
    // 1. ZIGZAG DIAGONAL PRONUNCIADO:
    // Amplitud ampliada a 42 unidades y frecuencia acelerada a 4.0 rad/s
    const phase = Math.sin(enemy.behaviorTime * 4.0 + (enemy.patternSeed || 0)) * 42;
    targetX += phase;
    targetY -= phase;
  } else if (enemy.pattern === 'random') {
    // 2. CURVAS Y ESPIRALES AMPLIAS:
    // Amplitud ampliada a 130 unidades trazando arcos marcados alrededor de la ruta hacia el jugador
    const phase = Math.sin(enemy.behaviorTime * 2.2 + (enemy.patternSeed || 0)) * 130;
    targetX += Math.cos(enemy.behaviorTime * 1.2) * phase;
    targetY += Math.sin(enemy.behaviorTime * 1.2) * phase;
  }

  const dx = targetX - enemy.group.position.x;
  const dy = targetY - enemy.group.position.y;
  const distance = Math.hypot(dx, dy);

  if (distance <= 0.001) return { hitPlayer: true };

  // Orientación en el plano XY apuntando hacia la dirección proyectada
  enemy.group.rotation.x = 0;
  enemy.group.rotation.y = 0;
  enemy.group.rotation.z = Math.atan2(dx, -dy) + (enemy.bossRoom === 3 ? Math.PI : 0);

  const step = Math.min(movementSpeed * deltaSeconds, distance);
  let directionX = dx / distance;
  let directionY = dy / distance;

  // Separación suave entre enemigos para evitar superposiciones bloqueantes
  const MIN_ENEMY_DISTANCE = Math.max(10, enemy.collisionRadius * 1.15)+100;
  let separationX = 0;
  let separationY = 0;

  for (const other of enemies) {
    if (other === enemy || !other?.group) continue;
    const odx = enemy.group.position.x - other.group.position.x;
    const ody = enemy.group.position.y - other.group.position.y;
    const oDist = Math.hypot(odx, ody);

    if (oDist > 0 && oDist < MIN_ENEMY_DISTANCE) {
      const force = (MIN_ENEMY_DISTANCE - oDist) / MIN_ENEMY_DISTANCE;
      separationX += (odx / oDist) * force;
      separationY += (ody / oDist) * force;
    }
  }

  directionX += separationX * 0.18;
  directionY += separationY * 0.18;

  const dirLen = Math.hypot(directionX, directionY);
  if (dirLen > 0) {
    directionX /= dirLen;
    directionY /= dirLen;
  }

  const nextPosition = new THREE.Vector3(
      enemy.group.position.x + directionX * step,
      enemy.group.position.y + directionY * step,
      enemy.group.position.z
  );

  // Keep the first-room spider moving directly toward Tode instead of getting
  // trapped by the generic enemy obstacle-steering checks.
  if (enemy.isBoss && enemy.bossRoom === 1) {
    const limit = BOSS_WORLD_LIMIT - enemy.collisionRadius;
    nextPosition.x = THREE.MathUtils.clamp(nextPosition.x, -limit, limit);
    nextPosition.y = THREE.MathUtils.clamp(nextPosition.y, -limit, limit);
    enemy.group.position.copy(nextPosition);
    return { hitPlayer: false };
  }

  const requiredPlayerDistance = Math.max(
      COLLISION_DISTANCE,
      enemy.collisionRadius + player.collisionRadius + 12
  );

  if (xyDistance(nextPosition, player.group.position) <= requiredPlayerDistance) {
    return { hitPlayer: true };
  }

  const solidHouses = obstacles.map((house) => ({ group: house.group, collisionRadius: house.collisionRadius }));
  const ownRadius = enemy.collisionRadius;

  const clear = (candidate) => isPositionClear(candidate, ownRadius, solidHouses);

  if (clear(nextPosition)) {
    enemy.group.position.copy(nextPosition);
    return { hitPlayer: false };
  }

  // Desvío angular suave en caso de colisión con obstáculos estáticos
  for (const angle of [0.72, -0.72, 1.25, -1.25]) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const steerX = directionX * cos - directionY * sin;
    const steerY = directionX * sin + directionY * cos;

    const candidate = new THREE.Vector3(
        enemy.group.position.x + steerX * step,
        enemy.group.position.y + steerY * step,
        enemy.group.position.z
    );

    if (xyDistance(candidate, player.group.position) <= requiredPlayerDistance) {
      return { hitPlayer: true };
    }

    if (clear(candidate)) {
      enemy.group.rotation.z = Math.atan2(steerX, -steerY);
      enemy.group.position.copy(candidate);
      break;
    }
  }

  return { hitPlayer: false };
}
