import * as THREE from 'three';
import { isPositionClear } from './Collision.js';

export const PICKUP_SPAWN_INTERVAL = 8;
export const PICKUP_SCORE_BONUS = 25;

export const PICKUP_TYPES = [
  { id: 'seed', label: 'Light seed', color: '#63ffd0', icon: '✧' },
  { id: 'shield', label: 'Temporary shield', color: '#7ca8ff', icon: '⬡' },
  { id: 'multiplier', label: 'Score ×2', color: '#ffcf63', icon: '×2' },
  { id: 'haste', label: 'Speed boost', color: '#ff91cf', icon: '↯' },
];

/** Creates a readable, animated power-up in the shared garden style. */
export function createPickup(position, type = 'seed') {
  const config = PICKUP_TYPES.find((item) => item.id === type) || PICKUP_TYPES[0];
  const color = new THREE.Color(config.color);
  const group = new THREE.Group();
  group.name = `Pickup_${config.id}`;
  group.position.copy(position);
  group.userData.type = config.id;

  const coreMaterial = new THREE.MeshStandardMaterial({
    color: '#effffb', emissive: color, emissiveIntensity: 2.3,
    metalness: 0.08, roughness: 0.2,
  });
  const coreGeometry = config.id === 'shield'
      ? new THREE.OctahedronGeometry(6.1, 0)
      : config.id === 'multiplier'
          ? new THREE.DodecahedronGeometry(5.8, 0)
          : config.id === 'haste'
              ? new THREE.TetrahedronGeometry(6.6, 0)
              : new THREE.IcosahedronGeometry(5.5, 1);
  const core = new THREE.Mesh(coreGeometry, coreMaterial);
  core.name = 'PowerupCore';
  core.position.z = 7;
  group.add(core);

  const ringMaterial = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
  const ringA = new THREE.Mesh(new THREE.TorusGeometry(9, 0.75, 8, 32), ringMaterial);
  const ringB = new THREE.Mesh(new THREE.TorusGeometry(12, 0.45, 8, 32), ringMaterial.clone());
  ringA.position.z = 7;
  ringB.position.z = 7;
  ringB.rotation.x = Math.PI / 2;
  group.add(ringA, ringB);

  const haloMaterial = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.15, depthWrite: false, side: THREE.DoubleSide });
  const halo = new THREE.Mesh(new THREE.CircleGeometry(15, 32), haloMaterial);
  halo.position.z = 0.6;
  group.add(halo);

  const light = new THREE.PointLight(color, 24, 78, 2);
  light.position.z = 12;
  group.add(light);
  group.userData.animationOffset = Math.random() * Math.PI * 2;
  return { group, core, ringA, ringB, halo, age: 0, type: config.id, config };
}

export function updatePickup(pickup, deltaSeconds, totalTime) {
  pickup.age += deltaSeconds;
  const wave = totalTime * 3 + pickup.group.userData.animationOffset;
  const bob = 7 + Math.sin(wave) * 2.4;
  pickup.core.position.z = bob;
  pickup.ringA.position.z = bob;
  pickup.ringB.position.z = bob;
  pickup.core.rotation.x += deltaSeconds * 1.2;
  pickup.core.rotation.z += deltaSeconds * 1.6;
  pickup.ringA.rotation.z += deltaSeconds * 1.3;
  pickup.ringB.rotation.y += deltaSeconds * 1.1;
  pickup.halo.material.opacity = 0.1 + (Math.sin(wave * 1.4) + 1) * 0.045;
}

export function findPickupPosition(player, enemies, worldLimit = 230) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const candidate = new THREE.Vector3(
        THREE.MathUtils.randFloat(-worldLimit, worldLimit),
        THREE.MathUtils.randFloat(-worldLimit, worldLimit),
        0,
    );
    const playerDistance = Math.hypot(candidate.x - player.group.position.x, candidate.y - player.group.position.y);
    if (playerDistance < 75) continue;
    if (!isPositionClear(candidate, 13, enemies, 42)) continue;
    return candidate;
  }
  return new THREE.Vector3(-210, 0, 0);
}
