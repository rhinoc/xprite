import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

import {
  IslandCamera,
  IslandFilter,
  IslandGround,
  type IslandScene,
  type IslandSurface,
} from "$/managers/ports/animal-crossing-ground";
import autumnUrl from "@xprite/site-assets/tools/animal-crossing/acnh/grass-autumn.png?url";
import greenUrl from "@xprite/site-assets/tools/animal-crossing/acnh/grass-green.png?url";
import springUrl from "@xprite/site-assets/tools/animal-crossing/acnh/grass-spring.png?url";

const GROUND_URLS = {
  [IslandGround.Green]: greenUrl,
  [IslandGround.Spring]: springUrl,
  [IslandGround.Autumn]: autumnUrl,
};
const FIELD_OF_VIEW = 38;
const MAX_PIXEL_RATIO = 2;
const GROUND_MARGIN = 4;
const PATTERN_ELEVATION = 0.012;
const MIN_DISTANCE = 1.2;
const MAX_DISTANCE = 36;
const NEAR = 0.05;
const FAR = 100;
const LIGHT = 0xfff3dd;
const DEGREE = Math.PI / 180;
export async function createIslandScene(host: HTMLElement): Promise<IslandScene> {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xc9e7ee);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0xc9e7ee);
  renderer.domElement.setAttribute(
    "aria-label",
    "Island ground preview. Drag to orbit, pinch or scroll to zoom.",
  );
  renderer.domElement.style.display = "block";
  renderer.domElement.style.width = renderer.domElement.style.height = "100%";
  renderer.domElement.style.touchAction = "none";
  host.appendChild(renderer.domElement);
  const camera = new THREE.PerspectiveCamera(FIELD_OF_VIEW, 1, NEAR, FAR);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = false;
  controls.enablePan = true;
  controls.minPolarAngle = 0.03;
  controls.maxPolarAngle = Math.PI / 2 - 0.04;
  controls.minDistance = MIN_DISTANCE;
  controls.maxDistance = MAX_DISTANCE;
  controls.target.set(0, PATTERN_ELEVATION, 0);
  scene.add(new THREE.HemisphereLight(0xe6f5ff, 0x527333, 1.8));
  const sun = new THREE.DirectionalLight(LIGHT, 1.0);
  sun.position.set(-4, 8, 6);
  scene.add(sun);
  const groundMaterial = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  const patternMaterial = new THREE.MeshStandardMaterial({
    transparent: true,
    alphaTest: 0.01,
    roughness: 1,
    metalness: 0,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  });
  const pattern = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), patternMaterial);
  pattern.rotation.x = -Math.PI / 2;
  pattern.position.y = PATTERN_ELEVATION;
  pattern.visible = false;
  scene.add(pattern);
  const grid = new THREE.GridHelper(1, 1, 0x2e5035, 0x557543);
  grid.position.y = PATTERN_ELEVATION * 2;
  grid.visible = false;
  scene.add(grid);
  let groundTextures: Record<IslandGround, THREE.Texture> | null = null;
  const loadedTextures = new Set<THREE.Texture>();
  let patternTexture: THREE.DataTexture | null = null;
  let lastPixels: IslandSurface["pixels"] | null = null;
  let span = 3;
  let closed = false;
  const render = () => {
    if (!closed) renderer.render(scene, camera);
  };
  controls.addEventListener("change", render);
  const dispose = () => {
    if (closed) return;
    closed = true;
    controls.removeEventListener("change", render);
    controls.dispose();
    patternTexture?.dispose();
    loadedTextures.forEach((texture) => texture.dispose());
    loadedTextures.clear();
    ground.geometry.dispose();
    groundMaterial.dispose();
    pattern.geometry.dispose();
    patternMaterial.dispose();
    grid.geometry.dispose();
    const materials = Array.isArray(grid.material) ? grid.material : [grid.material];
    materials.forEach((material) => material.dispose());
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
    scene.clear();
  };
  try {
    const loader = new THREE.TextureLoader();
    const loaded = await Promise.all(
      Object.values(IslandGround).map(async (key) => {
        const texture = await loader.loadAsync(GROUND_URLS[key]);
        if (closed) {
          texture.dispose();
          throw new Error("Preview was closed.");
        }
        loadedTextures.add(texture);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.magFilter = THREE.LinearFilter;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        return [key, texture] as const;
      }),
    );
    groundTextures = Object.fromEntries(loaded) as Record<IslandGround, THREE.Texture>;
  } catch {
    dispose();
    throw new Error("The grass preview textures could not be loaded.");
  }
  const setSurface = (next: IslandSurface | null) => {
    pattern.visible = !!next;
    if (!next) {
      render();
      return;
    }
    span = Math.max(next.columns, next.rows);
    const groundSize = span + GROUND_MARGIN * 2;
    ground.scale.set(groundSize, groundSize, 1);
    const grass = groundTextures![next.ground];
    grass.repeat.set(groundSize, groundSize);
    grass.needsUpdate = true;
    groundMaterial.map = grass;
    groundMaterial.needsUpdate = true;
    if (lastPixels !== next.pixels) {
      patternTexture?.dispose();
      patternTexture = new THREE.DataTexture(
        new Uint8Array(next.pixels.data),
        next.pixels.width,
        next.pixels.height,
        THREE.RGBAFormat,
      );
      patternTexture.colorSpace = THREE.SRGBColorSpace;
      patternTexture.wrapS = patternTexture.wrapT = THREE.RepeatWrapping;
      patternTexture.generateMipmaps = true;
      patternTexture.needsUpdate = true;
      lastPixels = next.pixels;
    }
    const smooth = next.filter === IslandFilter.Smooth;
    patternTexture!.magFilter = smooth ? THREE.LinearFilter : THREE.NearestFilter;
    patternTexture!.minFilter = smooth ? THREE.LinearMipmapLinearFilter : THREE.NearestFilter;
    patternTexture!.repeat.set(next.repeat ? next.columns : 1, next.repeat ? -next.rows : -1);
    patternTexture!.offset.set(0, next.repeat ? next.rows : 1);
    patternTexture!.needsUpdate = true;
    patternMaterial.map = patternTexture;
    patternMaterial.needsUpdate = true;
    pattern.scale.set(next.columns, next.rows, 1);
    grid.geometry.dispose();
    const nextGrid = new THREE.GridHelper(groundSize, groundSize);
    grid.geometry = nextGrid.geometry;
    const unusedMaterials = Array.isArray(nextGrid.material)
      ? nextGrid.material
      : [nextGrid.material];
    unusedMaterials.forEach((material) => material.dispose());
    grid.visible = next.grid;
    render();
  };
  const setCamera = (preset: IslandCamera) => {
    const polar =
      (preset === IslandCamera.Top ? 4 : preset === IslandCamera.Close ? 68 : 46) * DEGREE;
    const distance =
      preset === IslandCamera.Close ? Math.max(2, span * 0.95) : Math.max(5, span * 2.3);
    controls.target.set(0, PATTERN_ELEVATION, 0);
    camera.position.set(
      distance * Math.sin(polar) * 0.35,
      distance * Math.cos(polar),
      distance * Math.sin(polar),
    );
    controls.update();
    render();
  };
  return {
    setSurface,
    setCamera,
    setSize(width, height, pixelRatio) {
      if (closed) return;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(Math.min(MAX_PIXEL_RATIO, pixelRatio));
      renderer.setSize(width, height, false);
      render();
    },
    dispose,
  };
}
