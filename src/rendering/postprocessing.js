/**
 * Optional Three.js examples post stack. It is deliberately loaded lazily so
 * the battlefield works with the core renderer alone and bundlers can split it.
 */
export async function createBattlefieldPostProcessing({
  renderer,
  scene,
  camera,
  width,
  height,
  pixelRatio = 1,
  enabled = true,
} = {}) {
  if (!enabled) return null;

  const [
    { EffectComposer },
    { RenderPass },
    { ShaderPass },
    { OutputPass },
  ] = await Promise.all([
    import('three/addons/postprocessing/EffectComposer.js'),
    import('three/addons/postprocessing/RenderPass.js'),
    import('three/addons/postprocessing/ShaderPass.js'),
    import('three/addons/postprocessing/OutputPass.js'),
  ]);

  const gradeShader = {
    name: 'AshenStandardColorGrade',
    uniforms: {
      tDiffuse: { value: null },
      saturation: { value: 0.94 },
      contrast: { value: 1.035 },
      vignette: { value: 0.105 },
      rainWash: { value: 0.025 },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      uniform sampler2D tDiffuse;
      uniform float saturation;
      uniform float contrast;
      uniform float vignette;
      uniform float rainWash;
      varying vec2 vUv;

      void main() {
        vec3 color = texture2D(tDiffuse, vUv).rgb;
        float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
        color = mix(vec3(luminance), color, saturation);

        // Preserve midtone visibility while keeping wet highlights and fire readable.
        color = max(color, vec3(0.0));
        color = pow(color, vec3(0.975));
        color = (color - 0.5) * contrast + 0.5;
        color = mix(color, color * vec3(0.94, 0.985, 1.02), rainWash);

        float radial = length((vUv - 0.5) * vec2(0.86, 1.0));
        float edge = 1.0 - smoothstep(0.30, 0.72, radial);
        color *= mix(1.0 - vignette, 1.0, edge);
        gl_FragColor = vec4(max(color, vec3(0.0)), 1.0);
      }
    `,
  };

  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(pixelRatio);
  composer.setSize(width, height);
  const renderPass = new RenderPass(scene, camera);
  const gradePass = new ShaderPass(gradeShader);
  const outputPass = new OutputPass();
  composer.addPass(renderPass);
  composer.addPass(gradePass);
  composer.addPass(outputPass);

  return {
    composer,
    gradePass,
    render(delta) {
      composer.render(delta);
    },
    resize(nextWidth, nextHeight, nextPixelRatio = pixelRatio) {
      composer.setPixelRatio(nextPixelRatio);
      composer.setSize(nextWidth, nextHeight);
    },
    dispose() {
      composer.dispose();
      gradePass.material.dispose();
    },
  };
}
