import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { getModelFootprintRadius, isPositionClear } from './Collision.js';

export const PLAYER_MOVEMENT_SPEED = 8;
export const PLAYER_JUMP_HEIGHT = 6;
export const PLAYER_JUMP_DISTANCE = 25;
export const PLAYER_WORLD_LIMIT = 260;

const ARROW_DIRECTIONS = {
  ArrowUp: new THREE.Vector2(0, 1),
  ArrowDown: new THREE.Vector2(0, -1),
  ArrowLeft: new THREE.Vector2(-1, 0),
  ArrowRight: new THREE.Vector2(1, 0),
  KeyW: new THREE.Vector2(0, 1),
  KeyS: new THREE.Vector2(0, -1),
  KeyA: new THREE.Vector2(-1, 0),
  KeyD: new THREE.Vector2(1, 0),
};

/** Loads Tode and creates the queued, hop-based movement controller. */
export async function createPlayer() {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(`${import.meta.env.BASE_URL}models/tode.glb`);
  const loadedModel = gltf.scene;

  const group = new THREE.Group();
  group.name = 'Player';
  group.position.set(0, 0, 0);

  // Pivote interno para aislar la inclinación inicial Y-up a Z-up
  const modelPivot = new THREE.Group();
  modelPivot.name = 'PlayerPivot';

  loadedModel.rotation.x = Math.PI / 2;
  loadedModel.scale.setScalar(20);
  loadedModel.traverse((object) => {
    if (object.isMesh) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });

  modelPivot.add(loadedModel);
  group.add(modelPivot);

  group.updateMatrixWorld(true);
  const modelBounds = new THREE.Box3().setFromObject(modelPivot);
  modelPivot.position.z -= modelBounds.min.z;
  group.updateMatrixWorld(true);

  const model = modelPivot;

  const collisionRadius = getModelFootprintRadius(group, model) * 0.1;
  const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(Math.max(collisionRadius * 0.9, 8), 32),
      new THREE.MeshBasicMaterial({ color: '#103d38', transparent: true, opacity: 0.25, depthWrite: false }),
  );
  shadow.name = 'TodeGroundShadow';
  shadow.position.z = 0.18;
  group.add(shadow);

  // Estructuras para gestión de teclas y movimiento fluido
  const activeKeys = new Set();
  let lastPressedKey = null;
  let currentMove = null;
  let controlsEnabled = false;
  let movementSpeed = PLAYER_MOVEMENT_SPEED;
  const baseModelZ = model.position.z;

  function onKeyDown(event) {
    if (!Object.hasOwn(ARROW_DIRECTIONS, event.code) || !controlsEnabled) return;
    event.preventDefault();

    // Registrar tecla activa
    activeKeys.add(event.code);
    lastPressedKey = event.code;
  }

  function onKeyUp(event) {
    if (!Object.hasOwn(ARROW_DIRECTIONS, event.code)) return;

    // Remover de las teclas activas
    activeKeys.delete(event.code);

    // Si soltó todas las teclas, limpiar el registro de última tecla presionada
    if (activeKeys.size === 0) {
      lastPressedKey = null;
    } else {
      // Si aún mantiene otras teclas presionadas, usar la más reciente disponible
      lastPressedKey = Array.from(activeKeys).pop();
    }
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  function getNextDirection() {
    if (!lastPressedKey || !activeKeys.has(lastPressedKey)) {
      if (activeKeys.size > 0) {
        lastPressedKey = Array.from(activeKeys).pop();
      } else {
        return null;
      }
    }
    return ARROW_DIRECTIONS[lastPressedKey] || null;
  }

  function updateMovement(deltaSeconds, enemies, obstacles = []) {
    if (!controlsEnabled) return;

    // Si no se está realizando un salto, verificar si hay alguna tecla activa para iniciar uno nuevo
    if (!currentMove) {
      const direction = getNextDirection();

      if (direction) {
        const destination = new THREE.Vector3(
            group.position.x + direction.x * PLAYER_JUMP_DISTANCE,
            group.position.y + direction.y * PLAYER_JUMP_DISTANCE,
            0
        );

        const insideWorld = Math.abs(destination.x) <= PLAYER_WORLD_LIMIT &&
            Math.abs(destination.y) <= PLAYER_WORLD_LIMIT;
        const solids = [...enemies, ...obstacles];

        if (insideWorld && isDestinationClear(destination, collisionRadius, solids)) {
          currentMove = {
            direction: direction.clone(),
            progress: 0,
            complete: false,
            start: group.position.clone(),
            destination,
          };

          const angle = Math.atan2(direction.y, direction.x);
          const MODEL_OFFSET_Z = Math.PI / 2; // Ajustado según tu prueba exitosa

          model.rotation.z = angle + MODEL_OFFSET_Z;
        }
      }
    }

    if (!currentMove) return;

    currentMove.progress = Math.min(1, currentMove.progress + deltaSeconds * movementSpeed);
    const progress = currentMove.progress;

    const candidatePosition = new THREE.Vector3(
        THREE.MathUtils.lerp(currentMove.start.x, currentMove.destination.x, progress),
        THREE.MathUtils.lerp(currentMove.start.y, currentMove.destination.y, progress),
        0
    );

    if (!isDestinationClear(candidatePosition, collisionRadius, [...enemies, ...obstacles])) {
      model.position.z = baseModelZ;
      currentMove = null;
      return;
    }

    group.position.x = candidatePosition.x;
    group.position.y = candidatePosition.y;

    model.position.z = baseModelZ + Math.sin(progress * Math.PI) * PLAYER_JUMP_HEIGHT;

    if (progress >= 1) {
      group.position.copy(currentMove.destination);
      model.position.z = baseModelZ;
      currentMove.complete = true;
      currentMove = null;
    }
  }

  function isDestinationClear(destination, radius, actors) {
    const others = actors.map((actor) => ({
      group: actor.group,
      collisionRadius: actor.collisionRadius,
    }));
    return isPositionClear(destination, radius, others);
  }

  function reset() {
    activeKeys.clear();
    lastPressedKey = null;
    currentMove = null;
    group.position.set(0, 0, 0);
    model.position.z = baseModelZ;
    model.rotation.z = 0;
    group.visible = true;
  }

  function dispose() {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    shadow.geometry.dispose();
    shadow.material.dispose();
  }

  return {
    group,
    model,
    collisionRadius,
    updateMovement,
    reset,
    dispose,
    setEnabled(value) {
      controlsEnabled = Boolean(value);
      if (!value) {
        activeKeys.clear();
        lastPressedKey = null;
      }
    },
    setMovementSpeed(value) { movementSpeed = value; },
    get isMoving() { return currentMove !== null; },
    get queuedMoves() { return activeKeys.size; },
  };
}
