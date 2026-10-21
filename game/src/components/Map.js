import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { getAssetUrl } from '../utils/assetUrl.js';

export const MAP_SIZE = 1600; // Tamaño gigante del terreno
export const PLAYABLE_LIMIT = 280; // Límite alcanzable por el jugador
export const MAP_HALF_SIZE = MAP_SIZE / 2;

const ASSET_SCALES = { TREES: 0.15, BUSHES: 0.1, FLOWERS: 0.5, ROCKS: 0.15, FENCE: 1.0 };
const OUTER_DECORATION_MIN_RADIUS = PLAYABLE_LIMIT + 16;
const OUTER_DECORATION_MAX_RADIUS = PLAYABLE_LIMIT + 200;

const textureLoader = new THREE.TextureLoader();
const gltfLoader = new GLTFLoader();
const cachedTextures = {};

// Configuración de las 3 habitaciones con escalas de repetición corregidas
export const ROOM_CONFIGS = {
  1: {
    name: 'Jardín de Flores',
    texturePath: '/textures/grass_and_flowers_patters.png',
    repeat: [14, 14], // Textura de césped
    sky: '#bce9e8',
    fog: '#bce9e8',
    ambient: '#d8fbff',
    keyLight: '#fff1d0',
    border: '#f3c46b',
  },
  2: {
    name: 'Playa',
    texturePath: '/textures/playa2.jpeg',
    repeat: [6, 6], // Ladrillos más grandes y menos repetitivos
    sky: '#3a2e4c',
    fog: '#2b213a',
    ambient: '#e0c3fc',
    keyLight: '#ffb3ba',
    border: '#a478e8',
  },
  3: {
    name: 'Bosque otonal',
    texturePath: '/textures/Otonomagico.jpg',
    repeat: [6, 6], // Ampliado para evitar el patrón pequeño repetido
    sky: '#1e293b',
    fog: '#0f172a',
    ambient: '#bcf3f4',
    keyLight: '#75f5e4',
    border: '#36bdd1',
  },
};

let naturePackLibrary = null;

async function loadNaturePack() {
  if (naturePackLibrary) return naturePackLibrary;
  try {
    const gltf = await gltfLoader.loadAsync(getAssetUrl('/models/nature_pack.glb'));
    const library = {
      autumnTrees: [],
      regularTrees: [],
      bushes: [],
      rocks: [],
      flowers: [],
    };

    gltf.scene.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        const name = child.name.toLowerCase();

        const isTree = name.includes('tree') || name.includes('oak') || name.includes('pine');
        const isSnowTree = name.includes('snow') || name.includes('pine_snow');
        const isAutumnTree = (name.includes('autumn') || name.includes('orange') || name.includes('red')) && !isSnowTree;
        if (isTree && isAutumnTree) library.autumnTrees.push(child);
        else if (isTree && !isSnowTree) library.regularTrees.push(child);
        else if (name.includes('bush') || name.includes('hedge')) library.bushes.push(child);
        else if (name.includes('rock') || name.includes('stone')) library.rocks.push(child);
        const isFlower = name.includes('flover') || name.includes('flower') || name.includes('plant') || name.includes('tulip') || name.includes('daisy');
        if (isFlower) library.flowers.push(child);
      }
    });

    naturePackLibrary = library;
    return library;
  } catch (error) {
    console.warn('No se pudo cargar /models/nature_pack.glb', error);
    return null;
  }
}

function loadRoomTexture(path, repeatX = 10, repeatY = 10) {
  if (cachedTextures[path]) return cachedTextures[path];

  const texture = textureLoader.load(getAssetUrl(path), (tex) => {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
    tex.colorSpace = THREE.SRGBColorSpace;
  });

  cachedTextures[path] = texture;
  return texture;
}

export function createMap() {
  const map = new THREE.Group();
  map.name = 'GardenMap';
  const groundGeometry = new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE);
  const groundMaterial = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.05 });
  const groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
  groundMesh.name = 'GroundTexturedPlane';
  groundMesh.position.z = -0.1;
  groundMesh.receiveShadow = true;
  map.add(groundMesh);
  const decorationsGroup = new THREE.Group();
  decorationsGroup.name = 'NatureDecorations';
  map.add(decorationsGroup);
  const boundaryGroup = new THREE.Group();
  boundaryGroup.name = 'ThemedBoundary';
  map.add(boundaryGroup);
  map.userData = {
    groundMesh, decorationsGroup, boundaryGroup, boundaryColliders: [], currentRoom: 1,
    fenceMaterial: new THREE.MeshStandardMaterial({ color: '#A67C52', roughness: 0.82 }),
    fencePostGeometry: new THREE.BoxGeometry(4, 4, 20),
    fenceRailGeometry: new THREE.BoxGeometry(20, 4, 4),
  };
  setGardenTheme(map, 1);
  loadNaturePack().then((library) => { if (library) populateDecorations(map, map.userData.currentRoom); });
  return map;
}
export function setGardenTheme(map, level = 1) {
  const roomIndex = ((Math.max(1, Math.floor(level)) - 1) % 3) + 1;
  map.userData.currentRoom = roomIndex;
  const config = ROOM_CONFIGS[roomIndex];
  const groundMesh = map?.userData?.groundMesh;
  if (groundMesh) {
    groundMesh.material.map = loadRoomTexture(config.texturePath, config.repeat[0], config.repeat[1]);
    groundMesh.material.needsUpdate = true;
  }
  if (naturePackLibrary) populateDecorations(map, roomIndex);
  return config;
}
function populateDecorations(map, roomIndex) {
  const container = map.userData.decorationsGroup;
  const boundary = map.userData.boundaryGroup;
  const lib = naturePackLibrary;
  if (!container || !boundary || !lib) return;
  container.clear();
  boundary.clear();
  map.userData.boundaryColliders = [];
  const sides = ['north', 'south', 'east', 'west'];
  const pick = (pool) => pool?.length ? pool[Math.floor(Math.random() * pool.length)] : null;
  const addAsset = (pool, x, y, scale, target = container) => {
    const template = pick(pool);
    if (!template) return;
    const mesh = template.clone(true);
    mesh.position.set(x, y, 0);
    mesh.rotation.x = Math.PI / 2;
    mesh.rotation.y = Math.random() * Math.PI * 2;
    mesh.scale.setScalar(scale * THREE.MathUtils.randFloat(0.9, 1.1));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (pool === lib.flowers) {
      mesh.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(mesh);
      if (!bounds.isEmpty()) mesh.position.z -= bounds.min.z;
    }
    target.add(mesh);
    return mesh;
  };
  if (roomIndex === 2) {
    const material = map.userData.fenceMaterial;
    const count = 28;
    for (const side of sides) for (let i = 0; i < count; i++) {
      const t = -PLAYABLE_LIMIT + (2 * PLAYABLE_LIMIT * i) / (count - 1);
      const x = side === 'east' ? PLAYABLE_LIMIT : side === 'west' ? -PLAYABLE_LIMIT : t;
      const y = side === 'north' ? PLAYABLE_LIMIT : side === 'south' ? -PLAYABLE_LIMIT : t;
      const post = new THREE.Mesh(map.userData.fencePostGeometry, material);
      post.position.set(x, y, 10); post.rotation.z = Math.random() * 0.03;
      boundary.add(post);
      map.userData.boundaryColliders.push({ x, y, radius: 5 });
      if (i < count - 1) {
        const rail = new THREE.Mesh(map.userData.fenceRailGeometry, material);
        rail.position.set(x + (side === 'north' || side === 'south' ? 10 : 0), y + (side === 'east' || side === 'west' ? 10 : 0), 6);
        rail.rotation.z = side === 'east' || side === 'west' ? Math.PI / 2 : 0;
        boundary.add(rail);
      }
    }
  } else {
    const bushes = lib.bushes.length ? lib.bushes : lib.flowers;
    for (const side of sides) for (let i = 0; i < 42; i++) {
      const t = -PLAYABLE_LIMIT + (2 * PLAYABLE_LIMIT * i) / 41;
      const x = (side === 'east' ? PLAYABLE_LIMIT : side === 'west' ? -PLAYABLE_LIMIT : t) + THREE.MathUtils.randFloat(-3, 3);
      const y = (side === 'north' ? PLAYABLE_LIMIT : side === 'south' ? -PLAYABLE_LIMIT : t) + THREE.MathUtils.randFloat(-3, 3);
      const mesh = addAsset(bushes, x, y, ASSET_SCALES.BUSHES, boundary);
      if (mesh) map.userData.boundaryColliders.push({ x, y, radius: 12 });
    }
  }
  const autumnTreePool = lib.autumnTrees.length > 0 ? lib.autumnTrees : lib.regularTrees;
  const exteriorPools = roomIndex === 1 ? [lib.flowers, lib.regularTrees, lib.bushes] : roomIndex === 2 ? [lib.rocks] : [autumnTreePool];
  for (const side of sides) for (let i = 0; i < 70; i++) {
    const t = THREE.MathUtils.randFloat(-OUTER_DECORATION_MAX_RADIUS, OUTER_DECORATION_MAX_RADIUS);
    const distance = THREE.MathUtils.randFloat(OUTER_DECORATION_MIN_RADIUS, OUTER_DECORATION_MAX_RADIUS);
    const x = side === 'east' ? distance : side === 'west' ? -distance : t;
    const y = side === 'north' ? distance : side === 'south' ? -distance : t;
    const pool = pick(exteriorPools);
    const scale = pool === lib.regularTrees || pool === lib.autumnTrees || pool === autumnTreePool ? ASSET_SCALES.TREES : pool === lib.rocks ? ASSET_SCALES.ROCKS : pool === lib.bushes ? ASSET_SCALES.BUSHES : ASSET_SCALES.FLOWERS;
    addAsset(pool, x, y, scale);
  }
  if (roomIndex === 1 || roomIndex === 3) {
    const extraFlowersPerSide = roomIndex === 1 ? 35 : 18;
    for (const side of sides) for (let i = 0; i < extraFlowersPerSide; i++) {
      const t = THREE.MathUtils.randFloat(-OUTER_DECORATION_MAX_RADIUS, OUTER_DECORATION_MAX_RADIUS);
      const distance = THREE.MathUtils.randFloat(OUTER_DECORATION_MIN_RADIUS, OUTER_DECORATION_MAX_RADIUS);
      const x = side === 'east' ? distance : side === 'west' ? -distance : t;
      const y = side === 'north' ? distance : side === 'south' ? -distance : t;
      addAsset(lib.flowers, x, y, ASSET_SCALES.FLOWERS);
    }
  }
  populateGroundDetails(container, lib, roomIndex);
}
function populateGroundDetails(container, lib, roomIndex) {
  if (roomIndex === 2) {
    for (let i = 0; i < 4; i++) {
      const edge = i % 4;
      const x = edge === 0 ? -PLAYABLE_LIMIT + 30 : edge === 1 ? PLAYABLE_LIMIT - 30 : THREE.MathUtils.randFloat(-PLAYABLE_LIMIT + 30, PLAYABLE_LIMIT - 30);
      const y = edge === 2 ? -PLAYABLE_LIMIT + 30 : edge === 3 ? PLAYABLE_LIMIT - 30 : THREE.MathUtils.randFloat(-PLAYABLE_LIMIT + 30, PLAYABLE_LIMIT - 30);
      const rock = lib.rocks[Math.floor(Math.random() * lib.rocks.length)];
      if (rock) {
        const mesh = rock.clone(true);
        mesh.position.set(x, y, 0);
        mesh.rotation.x = Math.PI / 2;
        mesh.rotation.y = Math.random() * Math.PI * 2;
        mesh.scale.setScalar(ASSET_SCALES.ROCKS * 0.55);
        container.add(mesh);
      }
    }
    return;
  }
  const detailPools = [lib.flowers, lib.bushes, lib.rocks].filter((p) => p && p.length > 0);
  if (detailPools.length === 0) return;

  const totalDetails = 20; // Cantidad de salpimentado interior
  for (let i = 0; i < totalDetails; i++) {
    // Generar coordenadas dentro del área jugable (sin acercarse demasiado al centro 0,0)
    let rx = THREE.MathUtils.randFloat(-PLAYABLE_LIMIT + 30, PLAYABLE_LIMIT - 30);
    let ry = THREE.MathUtils.randFloat(-PLAYABLE_LIMIT + 30, PLAYABLE_LIMIT - 30);

    if (Math.hypot(rx, ry) < 45) continue; // Mantener centro despejado para el spawn del jugador

    const pool = detailPools[i % detailPools.length];
    const template = pool[Math.floor(Math.random() * pool.length)];
    const mesh = template.clone(true);

    mesh.position.set(rx, ry, 0);
    mesh.rotation.x = Math.PI / 2;
    mesh.rotation.z = (Math.random() * 1.5 - 0.75) * (Math.PI / 12);

    const detailScale = pool === lib.flowers
        ? ASSET_SCALES.FLOWERS * THREE.MathUtils.randFloat(0.4, 0.6)
        : THREE.MathUtils.randFloat(0.06, 0.1);

    mesh.scale.setScalar(detailScale);

    if (pool === lib.flowers) {
      mesh.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(mesh);
      if (!bounds.isEmpty()) mesh.position.z -= bounds.min.z;
    }
    container.add(mesh);
  }
}
