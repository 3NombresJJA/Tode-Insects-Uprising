import * as THREE from 'three';

/** Extra clearance added to footprint radii to keep rounded actors from clipping. */
export const COLLISION_DISTANCE = 22;

/**
 * Estimate an actor's horizontal footprint from the actual mesh vertices.
 * It intentionally avoids axis-aligned bounding boxes for rounded characters.
 */
export function getModelFootprintRadius(actorRoot, visualRoot) {
  actorRoot.updateMatrixWorld(true);
  visualRoot.updateMatrixWorld(true);

  const rootInverse = new THREE.Matrix4().copy(actorRoot.matrixWorld).invert();
  const vertex = new THREE.Vector3();
  const localToActor = new THREE.Matrix4();
  let maxRadius = 0;
  let visitedVertices = 0;

  visualRoot.traverse((object) => {
    if (!object.isMesh || !object.geometry?.attributes?.position) return;
    const positions = object.geometry.attributes.position;
    localToActor.multiplyMatrices(rootInverse, object.matrixWorld);

    for (let i = 0; i < positions.count; i += 1) {
      vertex.fromBufferAttribute(positions, i).applyMatrix4(localToActor);
      maxRadius = Math.max(maxRadius, Math.hypot(vertex.x, vertex.y));
      visitedVertices += 1;
    }
  });

  return visitedVertices > 0 ? Math.max(maxRadius, 1) : 10;
}

/** Circle-footprint collision test for an intended XY position. */
export function isPositionClear(position, ownRadius, otherActors, clearance = COLLISION_DISTANCE) {
  for (const other of otherActors) {
    if (!other?.group || !Number.isFinite(other.collisionRadius)) continue;
    const dx = position.x - other.group.position.x;
    const dy = position.y - other.group.position.y;
    const requiredDistance = Math.max(clearance, ownRadius + other.collisionRadius);
    if (Math.hypot(dx, dy) < requiredDistance) return false;
  }
  return true;
}

export function xyDistance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
