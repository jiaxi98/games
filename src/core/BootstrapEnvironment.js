import {
  BoxGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  FogExp2,
  Group,
  HemisphereLight,
  LinearFilter,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  Vector3,
} from 'three';

export function createBootstrapEnvironment({ scene, physics }) {
  const root = new Group();
  const colliderDisposers = [];
  root.name = 'BootstrapEnvironment';

  scene.background = new Color(0x8f968d);
  scene.fog = new FogExp2(0x777b71, 0.012);

  const skyLight = new HemisphereLight(0xc7d2d2, 0x493b28, 1.7);
  root.add(skyLight);

  const sun = new DirectionalLight(0xffe5bb, 3.1);
  sun.position.set(-28, 42, 18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -45;
  sun.shadow.camera.right = 45;
  sun.shadow.camera.top = 45;
  sun.shadow.camera.bottom = -45;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 110;
  root.add(sun);

  const ground = new Mesh(
    new PlaneGeometry(320, 320),
    new MeshStandardMaterial({
      color: 0x566044,
      roughness: 1,
      metalness: 0,
    }),
  );
  ground.name = 'TrainingFieldGround';
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  root.add(ground);

  const stoneMaterial = new MeshStandardMaterial({
    color: 0x6f6b5e,
    roughness: 0.96,
  });
  const timberMaterial = new MeshStandardMaterial({
    color: 0x4a2f1c,
    roughness: 0.9,
  });

  addWall(root, physics, colliderDisposers, new Vector3(0, 1.5, -19), new Vector3(38, 3, 1.4), stoneMaterial);
  addWall(root, physics, colliderDisposers, new Vector3(-19, 1.5, 0), new Vector3(1.4, 3, 38), stoneMaterial);
  addWall(root, physics, colliderDisposers, new Vector3(19, 1.5, 0), new Vector3(1.4, 3, 38), stoneMaterial);

  for (const x of [-12, -4, 4, 12]) {
    addPost(root, physics, colliderDisposers, new Vector3(x, 1.2, -8), timberMaterial);
  }

  const bannerTexture = createBannerTexture();
  for (const x of [-13.5, 13.5]) {
    const banner = new Mesh(
      new PlaneGeometry(2.3, 4.2),
      new MeshStandardMaterial({
        map: bannerTexture,
        roughness: 0.82,
        side: DoubleSide,
      }),
    );
    banner.position.set(x, 4.25, -18.25);
    root.add(banner);
  }

  scene.add(root);

  return {
    root,
    dispose() {
      for (const disposeCollider of colliderDisposers.splice(0)) disposeCollider();
      scene.remove(root);
      root.traverse((object) => {
        object.geometry?.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) material?.dispose();
      });
      bannerTexture.dispose();
    },
  };
}

function addWall(root, physics, colliderDisposers, center, size, material) {
  const wall = new Mesh(new BoxGeometry(size.x, size.y, size.z), material);
  wall.position.copy(center);
  wall.castShadow = true;
  wall.receiveShadow = true;
  root.add(wall);
  colliderDisposers.push(physics.addBox(center, size, { kind: 'stone-wall' }));
}

function addPost(root, physics, colliderDisposers, position, material) {
  const post = new Mesh(new CylinderGeometry(0.42, 0.52, 2.4, 10), material);
  post.position.copy(position);
  post.castShadow = true;
  post.receiveShadow = true;
  root.add(post);
  colliderDisposers.push(
    physics.addBox(position, new Vector3(0.92, 2.4, 0.92), { kind: 'training-post' }),
  );
}

function createBannerTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  context.fillStyle = '#5b1717';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#d0b268';
  context.fillRect(20, 0, 10, canvas.height);
  context.fillRect(canvas.width - 30, 0, 10, canvas.height);
  context.strokeStyle = '#d0b268';
  context.lineWidth = 18;
  context.beginPath();
  context.moveTo(70, 136);
  context.lineTo(186, 370);
  context.moveTo(186, 136);
  context.lineTo(70, 370);
  context.stroke();

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  return texture;
}
