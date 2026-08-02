import { Box3, Vector3 } from 'three';

const EPSILON = 1e-5;
export class CollisionWorld {
  #colliders = new Map();
  #groundHeightProvider = () => 0;
  #nextId = 1;

  setGroundHeightProvider(provider) {
    if (typeof provider !== 'function') {
      throw new TypeError('Ground height provider must be a function.');
    }
    this.#groundHeightProvider = provider;
    return () => {
      if (this.#groundHeightProvider === provider) this.#groundHeightProvider = () => 0;
    };
  }

  groundHeightAt(x, z) {
    const height = this.#groundHeightProvider(x, z);
    return Number.isFinite(height) ? height : -Infinity;
  }

  addAABB(min, max, metadata = {}) {
    const id = metadata.id ?? `collider-${this.#nextId++}`;
    const box = new Box3(
      min.isVector3 ? min.clone() : new Vector3(min.x, min.y, min.z),
      max.isVector3 ? max.clone() : new Vector3(max.x, max.y, max.z),
    );
    this.#colliders.set(id, { id, box, metadata });
    return () => this.#colliders.delete(id);
  }

  addBox(center, size, metadata = {}) {
    const half = new Vector3(size.x, size.y, size.z).multiplyScalar(0.5);
    const position = new Vector3(center.x, center.y, center.z);
    return this.addAABB(
      position.clone().sub(half),
      position.clone().add(half),
      metadata,
    );
  }

  clear() {
    this.#colliders.clear();
  }

  canOccupy(position, radius, height) {
    const top = position.y + height;
    for (const { box } of this.#colliders.values()) {
      if (top <= box.min.y + EPSILON || position.y >= box.max.y - EPSILON) continue;
      if (circleIntersectsBox(position.x, position.z, radius, box)) return false;
    }
    return true;
  }

  moveCapsule(position, displacement, radius, height) {
    const next = position.clone();
    const contacts = [];

    this.#moveHorizontalAxis(next, displacement.x, radius, height, 'x', contacts);
    this.#moveHorizontalAxis(next, displacement.z, radius, height, 'z', contacts);

    const vertical = this.#moveVertical(next, displacement.y, radius, height, contacts);
    const groundHeight = this.#supportHeightAt(next.x, next.z, radius, next.y, height);
    let grounded = false;

    if (next.y <= groundHeight + EPSILON && displacement.y <= 0) {
      next.y = groundHeight;
      grounded = true;
      vertical.blocked = true;
      vertical.normalY = 1;
    }

    return {
      position: next,
      grounded,
      hitCeiling: vertical.normalY < 0,
      blockedX: contacts.some((contact) => contact.axis === 'x'),
      blockedZ: contacts.some((contact) => contact.axis === 'z'),
      contacts,
    };
  }

  #moveHorizontalAxis(position, amount, radius, height, axis, contacts) {
    if (amount === 0) return;

    const previous = position[axis];
    const target = previous + amount;
    const otherAxis = axis === 'x' ? 'z' : 'x';
    const side = Math.sign(amount);
    let resolved = target;
    let hitMetadata = null;
    let collided = false;

    for (const { box, metadata } of this.#colliders.values()) {
      if (!verticalOverlap(position.y, height, box)) continue;
      if (
        position[otherAxis] < box.min[otherAxis] - radius
        || position[otherAxis] > box.max[otherAxis] + radius
      ) continue;

      const boundary = side > 0
        ? box.min[axis] - radius - EPSILON
        : box.max[axis] + radius + EPSILON;
      const crossesBoundary = side > 0
        ? previous <= boundary && resolved > boundary
        : previous >= boundary && resolved < boundary;

      if (crossesBoundary) {
        resolved = boundary;
        hitMetadata = metadata;
        collided = true;
      }
    }

    position[axis] = resolved;
    if (!collided && [...this.#colliders.values()].some(({ box }) => (
        verticalOverlap(position.y, height, box)
        && circleIntersectsBox(position.x, position.z, radius, box)
      ))) {
      position[axis] = previous;
      collided = true;
    }

    if (collided) {
      contacts.push({
        axis,
        normal: axis === 'x'
          ? new Vector3(-side, 0, 0)
          : new Vector3(0, 0, -side),
        collider: hitMetadata ?? {},
      });
    }

    if (!Number.isFinite(position[axis])) position[axis] = previous;
  }

  #moveVertical(position, amount, radius, height, contacts) {
    const result = { blocked: false, normalY: 0 };
    if (amount === 0) return result;

    const startY = position.y;
    position.y += amount;

    for (const { box, metadata } of this.#colliders.values()) {
      if (!circleIntersectsBox(position.x, position.z, radius, box)) continue;

      if (amount < 0 && startY >= box.max.y - EPSILON && position.y < box.max.y) {
        position.y = box.max.y;
        result.blocked = true;
        result.normalY = 1;
        contacts.push({ axis: 'y', normal: new Vector3(0, 1, 0), collider: metadata });
      } else if (
        amount > 0
        && startY + height <= box.min.y + EPSILON
        && position.y + height > box.min.y
      ) {
        position.y = box.min.y - height - EPSILON;
        result.blocked = true;
        result.normalY = -1;
        contacts.push({ axis: 'y', normal: new Vector3(0, -1, 0), collider: metadata });
      }
    }

    return result;
  }

  #supportHeightAt(x, z, radius, currentY, height) {
    let support = this.groundHeightAt(x, z);

    for (const { box } of this.#colliders.values()) {
      if (!circleIntersectsBox(x, z, radius, box)) continue;
      const top = box.max.y;
      const maximumStepDown = Math.max(0.18, Math.abs(height) * 0.08);
      if (top <= currentY + maximumStepDown && top > support) support = top;
    }
    return support;
  }
}

function verticalOverlap(feetY, height, box) {
  return feetY + height > box.min.y + EPSILON && feetY < box.max.y - EPSILON;
}

function circleIntersectsBox(x, z, radius, box) {
  const closestX = Math.max(box.min.x, Math.min(x, box.max.x));
  const closestZ = Math.max(box.min.z, Math.min(z, box.max.z));
  const dx = x - closestX;
  const dz = z - closestZ;
  return dx * dx + dz * dz < radius * radius - EPSILON;
}
