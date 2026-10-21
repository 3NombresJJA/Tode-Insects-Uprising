import * as THREE from 'three';

/** Creates the perspective camera specified by the scene-setup stage. */
export function createCamera(aspectRatio = window.innerWidth / window.innerHeight) {
  const camera = new THREE.PerspectiveCamera(30, aspectRatio, 0.1, 9000);
  camera.name = 'GameCamera';
  camera.position.set(75, -300, 300);
  camera.up.set(0, 0, 1);
  camera.lookAt(0, 0, 0);
  return camera;
}
