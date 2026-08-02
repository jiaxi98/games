export class SpatialHash {
  constructor(cellSize = 8) {
    this.cellSize = cellSize;
    this.cells = new Map();
  }

  clear() {
    this.cells.clear();
  }

  insert(item, position = item.object3d?.position ?? item.position) {
    const key = this._key(position.x, position.z);
    let cell = this.cells.get(key);
    if (!cell) {
      cell = [];
      this.cells.set(key, cell);
    }
    cell.push(item);
  }

  rebuild(items) {
    this.clear();
    for (const item of items) this.insert(item);
  }

  query(position, radius, result = []) {
    result.length = 0;
    const minX = Math.floor((position.x - radius) / this.cellSize);
    const maxX = Math.floor((position.x + radius) / this.cellSize);
    const minZ = Math.floor((position.z - radius) / this.cellSize);
    const maxZ = Math.floor((position.z + radius) / this.cellSize);
    const radiusSq = radius * radius;
    for (let x = minX; x <= maxX; x += 1) {
      for (let z = minZ; z <= maxZ; z += 1) {
        const cell = this.cells.get(`${x}:${z}`);
        if (!cell) continue;
        for (const item of cell) {
          const itemPosition = item.object3d?.position ?? item.position;
          const dx = itemPosition.x - position.x;
          const dz = itemPosition.z - position.z;
          if (dx * dx + dz * dz <= radiusSq) result.push(item);
        }
      }
    }
    return result;
  }

  _key(x, z) {
    return `${Math.floor(x / this.cellSize)}:${Math.floor(z / this.cellSize)}`;
  }
}

