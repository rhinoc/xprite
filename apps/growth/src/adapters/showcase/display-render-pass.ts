import * as THREE from "three";

const MAX_DISPLAY_ANISOTROPY = 8;

export enum ShowcaseRenderLayer {
  Device,
  Foreground,
  Display,
}

export function configureDisplayTexture(texture: THREE.Texture, maxAnisotropy: number): void {
  texture.anisotropy = Math.min(MAX_DISPLAY_ANISOTROPY, maxAnisotropy);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
}

/** Composite native-resolution displays while retaining hardware and hand occlusion. */
export class DisplayRenderPass {
  private readonly depth = new THREE.MeshBasicMaterial({
    colorWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  private readonly foregroundDepth = new THREE.ShaderMaterial({
    colorWrite: false,
    side: THREE.DoubleSide,
    depthFunc: THREE.AlwaysDepth,
    toneMapped: false,
    vertexShader: `
      void main() {
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        // The authored foreground layer always covers the device and its display.
        gl_Position.z = -gl_Position.w;
      }
    `,
    fragmentShader: `
      void main() {
        gl_FragColor = vec4(0.0);
      }
    `,
  });

  render(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    foregroundVisible: boolean,
  ): void {
    const material = scene.overrideMaterial;
    const layers = camera.layers.mask;
    try {
      renderer.clearDepth();
      scene.overrideMaterial = this.depth;
      camera.layers.set(ShowcaseRenderLayer.Device);
      // Displays write their own depth in the color pass. Rendering them here
      // with a different shader can make their pixels fail the later depth test.
      renderer.render(scene, camera);
      if (foregroundVisible) {
        scene.overrideMaterial = this.foregroundDepth;
        camera.layers.set(ShowcaseRenderLayer.Foreground);
        renderer.render(scene, camera);
      }
      scene.overrideMaterial = material;
      camera.layers.set(ShowcaseRenderLayer.Display);
      renderer.render(scene, camera);
    } finally {
      scene.overrideMaterial = material;
      camera.layers.mask = layers;
    }
  }

  dispose(): void {
    this.depth.dispose();
    this.foregroundDepth.dispose();
  }
}
