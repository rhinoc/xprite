import * as THREE from "three";

const PIXEL_SIZE = 2;
const COLOR_LEVELS = 6;
const GRAY_LEVELS = 40;
const DITHER_STRENGTH = 0.6;
const NEUTRAL_CHROMA_THRESHOLD = 0.14;

/** Low-resolution palette pass for device hardware and scene overlays. */
export class ClassicGameFilter {
  private readonly target = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    generateMipmaps: false,
    depthBuffer: true,
  });
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly scene = new THREE.Scene();
  private readonly geometry = new THREE.PlaneGeometry(2, 2);
  private readonly material = new THREE.ShaderMaterial({
    uniforms: {
      sceneTexture: { value: this.target.texture },
      resolution: { value: new THREE.Vector2(1, 1) },
    },
    depthTest: false,
    depthWrite: false,
    blending: THREE.NoBlending,
    toneMapped: true,
    vertexShader: `
      varying vec2 sceneUv;
      void main() {
        sceneUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D sceneTexture;
      uniform vec2 resolution;
      varying vec2 sceneUv;

      float bayer2(vec2 p) {
        return mod(2.0 * p.x + 3.0 * p.y, 4.0);
      }
      float orderedThreshold(vec2 pixel) {
        vec2 p = mod(pixel, 4.0);
        float value = 4.0 * bayer2(mod(p, 2.0)) + bayer2(floor(p / 2.0));
        return (value + 0.5) / 16.0 - 0.5;
      }
      vec3 colorBias(float light) {
        return mix(vec3(0.012, 0.0, 0.024), vec3(0.018, 0.009, -0.012), light);
      }
      void main() {
        vec4 source = texture2D(sceneTexture, sceneUv);
        if (source.a < 0.001) {
          gl_FragColor = vec4(0.0);
          return;
        }
        vec3 color = source.rgb / source.a;
        #if defined(TONE_MAPPING)
          color = toneMapping(color);
        #endif
        color = linearToOutputTexel(vec4(color, 1.0)).rgb;
        float light = dot(color, vec3(0.2126, 0.7152, 0.0722));
        color = mix(vec3(light), color, 0.86);
        float threshold = orderedThreshold(floor(sceneUv * resolution));
        vec3 palette;
        // A 6x6x6 color cube plus 40 gently tinted neutral shades.
        float chroma = max(color.r, max(color.g, color.b)) - min(color.r, min(color.g, color.b));
        if (chroma < ${NEUTRAL_CHROMA_THRESHOLD}) {
          float gray = floor(clamp(light + threshold * ${DITHER_STRENGTH} / ${GRAY_LEVELS - 1}.0, 0.0, 1.0) * ${GRAY_LEVELS - 1}.0 + 0.5) / ${GRAY_LEVELS - 1}.0;
          palette = clamp(vec3(gray) + colorBias(gray), 0.0, 1.0);
        } else {
          color = clamp(color + colorBias(light) + threshold * ${DITHER_STRENGTH} / ${COLOR_LEVELS - 1}.0, 0.0, 1.0);
          palette = floor(color * ${COLOR_LEVELS - 1}.0 + 0.5) / ${COLOR_LEVELS - 1}.0;
        }
        gl_FragColor = vec4(palette * source.a, source.a);
      }
    `,
  });

  constructor() {
    const quad = new THREE.Mesh(this.geometry, this.material);
    quad.frustumCulled = false;
    this.scene.add(quad);
  }

  setSize(width: number, height: number) {
    const pixelWidth = Math.max(1, Math.ceil(width / PIXEL_SIZE));
    const pixelHeight = Math.max(1, Math.ceil(height / PIXEL_SIZE));
    this.target.setSize(pixelWidth, pixelHeight);
    this.material.uniforms.resolution.value.set(pixelWidth, pixelHeight);
  }

  begin(renderer: THREE.WebGLRenderer) {
    renderer.setRenderTarget(this.target);
    renderer.clear();
  }

  finish(renderer: THREE.WebGLRenderer) {
    renderer.setRenderTarget(null);
    renderer.clear();
    renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.target.dispose();
    this.geometry.dispose();
    this.material.dispose();
  }
}
