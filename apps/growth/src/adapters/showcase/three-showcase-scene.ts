import * as THREE from "three";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";

import { afterBrowserPaint } from "$/adapters/showcase/browser-scheduling";
import { ClassicGameFilter } from "$/adapters/showcase/classic-game-filter";
import { createDeviceDisplays } from "$/adapters/showcase/device-models";
import { HelloSpriteProject } from "$/adapters/showcase/hello-sprite-project";
import { IpadPointerTilt } from "$/adapters/showcase/ipad-pointer-tilt";
import { IpadScreen } from "$/adapters/showcase/ipad-screen";
import modelManifest from "$/adapters/showcase/model-manifest.json";
import { observeOverviewDeviceSelection } from "$/adapters/showcase/overview-device-selection";
import {
  PENCIL_WRITING_TIMING,
  samplePencilWritingPose,
} from "$/adapters/showcase/pencil-writing-pose";
import { PhoneDemoHand } from "$/adapters/showcase/phone-demo-hand";
import { CAROUSEL_SPACING, ShowcaseMotion } from "$/adapters/showcase/showcase-motion";
import { CREATE_TIMING, LAUNCH_TIMING, launchFrame } from "$/managers/ports/ipad-launch-motion";
import { SCREEN_TARGETS } from "$/managers/ports/ipad-screen-layout";
import {
  SHOWCASE_FOCUSED_TOP_PROPERTY,
  SHOWCASE_OVERVIEW_TOP_PROPERTY,
  type ShowcaseScreenContent,
  type ShowcaseScene,
} from "$/managers/ports/showcase";
import {
  FILM_DURATION,
  FILM_OUTRO_START,
  FILM_SETTLE_DURATION,
} from "$/managers/showcase/ipad-story";
import { FILM_START } from "$/managers/showcase/ipad-story";
import { ShowcaseDevice, SHOWCASE_DEVICES } from "$/managers/showcase/showcase-device";
import { ShowcaseLanguage } from "$/managers/showcase/showcase-language";
import {
  clientRect,
  clientToLocal,
  displayPixelRatio,
  layoutSize,
  observeResize,
  viewportSize,
} from "@xprite/ui/utils";

const OVERVIEW_POSITIONS = [-18, 2, 18] as const;
const OVERVIEW_WIDTH = 56;
const OVERVIEW_CENTER_X = -3;
const MOBILE_VIEWPORT_MAX_WIDTH = 700;
const MOBILE_OVERVIEW_WIDTH = 18.5;
const MOBILE_OVERVIEW_HEIGHT = 24;
const MOBILE_OVERVIEW_POSITIONS = [
  { x: 0, y: 6 },
  { x: -4.5, y: -5 },
  { x: 5, y: -5 },
] as const;
const MOBILE_OVERVIEW_EXIT_END = 0.24;
const MOBILE_OVERVIEW_EXIT_DIRECTIONS = [
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 1, y: 0 },
] as const;
const MOBILE_FOCUSED_WIDTHS = [9.8, 11.4, 6] as const;
const MOBILE_PHONE_SCALE = 0.9;
// Millimeter widths: 16-inch MacBook Pro, landscape 11-inch iPad, iPhone 15 Pro Max.
const PHYSICAL_DEVICE_WIDTHS = [355.7, 247.6, 76.7] as const;
const PREPARED_COMPUTER_WIDTH = 9.6;
const PREPARED_PHONE_WIDTH = 3.38;
const CAMERA_FAR = 300;
const CAMERA_MIN_NEAR = 0.1;
const CAMERA_NEAR_DISTANCE_RATIO = 0.05;
const CAMERA_FAR_DISTANCE_RATIO = 3;
const MIN_VISIBLE_HEIGHT = 8.8;
const COMPUTER_SCALE = 0.82;
const ENDING_DEVICE_SCALE = 0.8;
const COMPUTER_CENTER_Y = 0.35;
const LANDSCAPE_DEVICE_LIFT = 0.1;
const PORTRAIT_DEVICE_LIFT = 0.28;
const PORTRAIT_ASPECT_RANGE = 0.5;
const DEVICE_TOP_CLEARANCE = 0.035;
const DEVICE_TITLE_GAP_PX = 48;
const DEVICE_TITLE_GAP_HEIGHT_FRACTION = 0.1;
const OVERVIEW_HOVER_LIFT = 0.18;
const OVERVIEW_HOVER_SCALE = 0.08;
const OVERVIEW_HOVER_FOLLOW_MS = 160;
const OVERVIEW_ENTER_DROP = 1.8;
const OVERVIEW_ENTER_SCALE = 0.9;
const OVERVIEW_ENTER_PITCH = THREE.MathUtils.degToRad(8);
const OVERVIEW_ENTER_YAW = THREE.MathUtils.degToRad(6);
const OVERVIEW_HOVER_SETTLED = 0.001;
const OVERVIEW_MAX_PITCH = THREE.MathUtils.degToRad(5);
const OVERVIEW_MAX_YAW = THREE.MathUtils.degToRad(7);
const OVERVIEW_TILT_SETTLED = 0.00001;
const SCREEN_WAKE_FOLLOW_MS = 120;
const MAX_HOVER_FRAME_MS = 64;
const CONTACT_SHADOW_WIDTH = 15;
const CONTACT_SHADOW_HEIGHT = 5;
const CONTACT_SHADOW_WIDTH_RATIO = 1.5;
const CONTACT_SHADOW_ASPECT = CONTACT_SHADOW_WIDTH / CONTACT_SHADOW_HEIGHT;
const CONTACT_SHADOW_VERTICAL_CLEARANCE = 0.15;
const CONTACT_SHADOW_DEPTH_CLEARANCE = 1.1;

const ASSET_ROOT = "/showcase/ipad/";
const MODEL_REVISION = modelManifest.revision;
const IPAD_MODEL_FILE = "ipad.glb";
const PHONE_MODEL_FILE = "iphone.glb";
const SCREEN_WIDTH = 9.38;
const SCREEN_HEIGHT = (SCREEN_WIDTH * 834) / 1194;
const TABLET_WIDTH = 10;
const OVERVIEW_DEVICE_SCALES = [
  (PHYSICAL_DEVICE_WIDTHS[0] * TABLET_WIDTH) /
    (PHYSICAL_DEVICE_WIDTHS[1] * PREPARED_COMPUTER_WIDTH * COMPUTER_SCALE),
  1,
  (PHYSICAL_DEVICE_WIDTHS[2] * TABLET_WIDTH) / (PHYSICAL_DEVICE_WIDTHS[1] * PREPARED_PHONE_WIDTH),
] as const;
const TABLET_HEIGHT = 7.2;
const TABLET_CENTER_Y = 0.15;
const SCREEN_SURFACE = 0.14;
const CAMERA_FOV = 30;
const MAX_PIXEL_RATIO = 2;
const SHADER_BATCH_MESHES = 12;
const DEVICE_RENDER_LAYER = 0;
const PENCIL_RENDER_LAYER = 1;
const HAND_ENVIRONMENT_INTENSITY = 0.22;
const HAND_CREATE_ROTATION = -2.98;
const BACKGROUND_COLOR = 0xffffff;
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const TAP_DURATION = 1.45;
const PLAY_TAP_TIME = 26.8;
const HAND_CONTACT_OFFSET = 0.008;
const HAND_HOVER_HEIGHT = 0.16;
const HAND_LAUNCH_ROTATION = -2.25;
const HAND_APPROACH_START = { x: 6, y: -4, z: 1.9 } as const;
const HAND_APPROACH_CONTROL = { x: 1.2, y: -0.42, z: 0.55 } as const;
const HAND_RETREAT_CONTROL = { x: 0.5, y: -0.3, z: 0.9 } as const;
const HAND_RETREAT_END = { x: 6.4, y: -3.3, z: 3 } as const;
const UNLOCK_GESTURE = { enter: 3.75, touch: 4.3, swipe: 4.4, lifted: 5, exit: 5.45 } as const;
const CAMERA_KEYS = [
  { time: 0, zoom: 1.1 },
  { time: 3, zoom: 1.03 },
  { time: 9, zoom: 1 },
  { time: 13, zoom: 0.97 },
  { time: 16, zoom: 0.98 },
  { time: FILM_OUTRO_START, zoom: 0.98 },
  { time: FILM_DURATION, zoom: 1.08 },
] as const;

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const smooth = (value: number) => {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

function screenPoint(point: { x: number; y: number }, height = SCREEN_SURFACE) {
  return new THREE.Vector3((point.x - 0.5) * SCREEN_WIDTH, (0.5 - point.y) * SCREEN_HEIGHT, height);
}

function disposeObject(object: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  object.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    geometries.add(node.geometry);
    for (const material of Array.isArray(node.material) ? node.material : [node.material])
      materials.add(material);
  });
  for (const material of materials) {
    for (const value of Object.values(material)) {
      if (value instanceof THREE.Texture) textures.add(value);
    }
    material.dispose();
  }
  geometries.forEach((geometry) => geometry.dispose());
  textures.forEach((texture) => texture.dispose());
}

async function compileSceneShaders(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  signal: AbortSignal,
): Promise<void> {
  const meshes: THREE.Mesh[] = [];
  scene.traverse((node) => {
    if (node instanceof THREE.Mesh) meshes.push(node);
  });
  for (let index = 0; index < meshes.length; index += SHADER_BATCH_MESHES) {
    await afterBrowserPaint(signal);
    const batch = new THREE.Group();
    // Shallow clones retain shader inputs without reparenting hardware or duplicating GPU assets.
    for (const mesh of meshes.slice(index, index + SHADER_BATCH_MESHES))
      batch.add(mesh.clone(false));
    try {
      await renderer.compileAsync(batch, camera, scene);
    } finally {
      batch.clear();
    }
    signal.throwIfAborted();
  }
}

function contactShadow(width = CONTACT_SHADOW_WIDTH, height = CONTACT_SHADOW_HEIGHT) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const context = canvas.getContext("2d")!;
  const gradient = context.createRadialGradient(128, 128, 10, 128, 128, 126);
  gradient.addColorStop(0, "rgba(28, 30, 40, 0.18)");
  gradient.addColorStop(0.4, "rgba(28, 30, 40, 0.1)");
  gradient.addColorStop(1, "rgba(28, 30, 40, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 256);
  const texture = new THREE.CanvasTexture(canvas);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }),
  );
  mesh.position.set(0, -3.75, -1.2);
  // Only the device surface is selectable, including where this transparent plane overlaps it.
  mesh.raycast = () => {};
  return { mesh, texture };
}

function attachDeviceShadow(model: THREE.Group) {
  const bounds = new THREE.Box3().setFromObject(model);
  bounds.applyMatrix4(model.matrixWorld.clone().invert());
  const width = bounds.getSize(new THREE.Vector3()).x * CONTACT_SHADOW_WIDTH_RATIO;
  const { mesh } = contactShadow(width, width / CONTACT_SHADOW_ASPECT);
  mesh.position.set(
    bounds.getCenter(new THREE.Vector3()).x,
    bounds.min.y - CONTACT_SHADOW_VERTICAL_CLEARANCE,
    bounds.min.z - CONTACT_SHADOW_DEPTH_CLEARANCE,
  );
  model.add(mesh);
}

export async function mountScene(
  host: HTMLElement,
  content: ShowcaseScreenContent,
  language: ShowcaseLanguage,
  signal: AbortSignal,
): Promise<ShowcaseScene> {
  signal.throwIfAborted();
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(displayPixelRatio(), MAX_PIXEL_RATIO));
  renderer.setClearColor(BACKGROUND_COLOR, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.autoClear = false;
  const gameFilter = new ClassicGameFilter();
  renderer.domElement.setAttribute("aria-hidden", "true");
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, CAMERA_MIN_NEAR, CAMERA_FAR);
  const interaction = new THREE.Group();
  const product = new THREE.Group();
  scene.add(interaction);
  interaction.add(product);
  scene.environmentIntensity = 0.7;
  const fill = new THREE.HemisphereLight(0xffffff, 0xa6adbb, 0.75);
  fill.layers.enable(PENCIL_RENDER_LAYER);
  scene.add(fill);
  const key = new THREE.DirectionalLight(0xfff6ed, 1.8);
  key.position.set(-4, 6, 10);
  key.layers.enable(PENCIL_RENDER_LAYER);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xe9efff, 1);
  rim.position.set(7, 2, 3);
  rim.layers.enable(PENCIL_RENDER_LAYER);
  scene.add(rim);
  const shadow = contactShadow();
  interaction.add(shadow.mesh);
  const project = new HelloSpriteProject();
  const screen = new IpadScreen(content, language, project);
  let devices: ReturnType<typeof createDeviceDisplays> | undefined;
  let selectedDevice = ShowcaseDevice.Computer;
  const motion = new ShowcaseMotion();
  const motionPreference = window.matchMedia(REDUCED_MOTION_QUERY);
  let previousFrame = performance.now();
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const pmrem = new THREE.PMREMGenerator(renderer);
  let environment: THREE.WebGLRenderTarget | undefined;
  let screenTexture: THREE.CanvasTexture | undefined;
  let stopResize = () => {};
  let stopPointerTilt = () => {};
  let stopDeviceSelection = () => {};
  let disposed = false;
  let invalidateListener: (() => void) | undefined;

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    invalidateListener = undefined;
    signal.removeEventListener("abort", dispose);
    stopResize();
    stopPointerTilt();
    stopDeviceSelection();
    screen.dispose();
    devices?.dispose();
    project.dispose();
    screenTexture?.dispose();
    environment?.dispose();
    pmrem.dispose();
    shadow.texture.dispose();
    disposeObject(scene);
    gameFilter.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  };
  signal.addEventListener("abort", dispose, { once: true });

  try {
    const loadModel = async (file: string, parent: THREE.Object3D = product) => {
      const { scene: model } = await loader.loadAsync(`${ASSET_ROOT}${file}?v=${MODEL_REVISION}`);
      if (disposed) {
        disposeObject(model);
        throw new Error("Scene disposed");
      }
      // Only the model root is animated; imported hardware parts keep their local matrices.
      model.traverse((node) => {
        if (node === model) return;
        node.updateMatrix();
        node.matrixAutoUpdate = false;
      });
      parent.add(model);
      return model;
    };
    devices = createDeviceDisplays(language, project);
    const [ipad, pencil, hand, computer, phone] = await Promise.all([
      loadModel(IPAD_MODEL_FILE),
      loadModel("apple-pencil.glb"),
      loadModel("hand.glb"),
      loadModel("macbook-pro.glb", scene),
      loadModel(PHONE_MODEL_FILE, scene),
      devices.ready,
      screen.ready,
      new HDRLoader().loadAsync(`${ASSET_ROOT}studio_small_08_1k.hdr`).then((hdr) => {
        if (!disposed) {
          environment = pmrem.fromEquirectangular(hdr);
          scene.environment = environment.texture;
        }
        hdr.dispose();
      }),
    ]);
    pmrem.dispose();
    signal.throwIfAborted();
    devices.attach(computer, phone);
    computer.scale.setScalar(COMPUTER_SCALE);
    computer.position.y = COMPUTER_CENTER_Y;
    // Measure hardware before adding the shadows and demonstration hands.
    const bodyBounds = [computer, ipad, phone].map((model) => {
      model.updateWorldMatrix(true, true);
      return new THREE.Box3().setFromObject(model).applyMatrix4(model.matrixWorld.clone().invert());
    });
    attachDeviceShadow(computer);
    attachDeviceShadow(phone);
    const phoneHand = new PhoneDemoHand(phone, hand, PENCIL_RENDER_LAYER);
    const slides = [computer, interaction, phone];
    const pickableModels = [computer, ipad, phone];
    const hoverBounds = pickableModels.map((model) => {
      const display = model.getObjectByName("Screen");
      if (!(display instanceof THREE.Mesh)) throw new Error("Missing overview device screen");
      model.updateWorldMatrix(true, true);
      return new THREE.Box3()
        .setFromObject(display)
        .applyMatrix4(model.matrixWorld.clone().invert());
    });
    // The laptop's top bezel is at display depth, not at the nearer keyboard edge.
    const topEdges = bodyBounds.map((bounds, index) => {
      const display = hoverBounds[index];
      return [
        new THREE.Vector3(bounds.min.x, bounds.max.y, display.min.z),
        new THREE.Vector3(bounds.max.x, bounds.max.y, display.min.z),
        new THREE.Vector3(bounds.min.x, bounds.max.y, display.max.z),
        new THREE.Vector3(bounds.max.x, bounds.max.y, display.max.z),
      ];
    });
    const framingPoint = new THREE.Vector3();
    const baseScales = slides.map((slide) => slide.scale.x);
    const baseHeights = slides.map((slide) => slide.position.y);
    const hoverLevels = slides.map(() => 0);
    const hoverRotations = slides.map(() => ({ x: 0, y: 0 }));
    let hoverPosition = { x: 0, y: 0 };
    let hoveredDevice: ShowcaseDevice | undefined;
    let needsRedraw = true;
    let hoverMoving = false;
    let animating = true;
    let pointerTilt: IpadPointerTilt | undefined;
    const invalidate = () => {
      if (disposed) return;
      if (!animating) {
        const now = performance.now();
        previousFrame = now;
        pointerTilt?.resume(now);
      }
      needsRedraw = true;
      invalidateListener?.();
    };
    const stage = host.parentElement ?? host;
    const page = host.closest<HTMLElement>("[data-showcase-hero]") ?? stage;
    const previewDevice = (device?: ShowcaseDevice, position?: { x: number; y: number }) => {
      const nextDevice = motion.hasSelection ? undefined : device;
      const nextPosition = nextDevice && position ? position : { x: 0, y: 0 };
      if (
        nextDevice === hoveredDevice &&
        nextPosition.x === hoverPosition.x &&
        nextPosition.y === hoverPosition.y
      )
        return;
      if (nextDevice !== hoveredDevice) {
        if (nextDevice) stage.dataset.deviceHovered = nextDevice;
        else delete stage.dataset.deviceHovered;
      }
      hoveredDevice = nextDevice;
      hoverPosition = nextPosition;
      invalidate();
    };
    const raycaster = new THREE.Raycaster();
    const pickBounds = bodyBounds.map(() => new THREE.Box3());
    const pickDevice = (point: { x: number; y: number }) => {
      const local = clientToLocal(renderer.domElement, point);
      const size = layoutSize(renderer.domElement);
      if (size.width <= 0 || size.height <= 0) return undefined;
      raycaster.setFromCamera(
        new THREE.Vector2((local.x / size.width) * 2 - 1, 1 - (local.y / size.height) * 2),
        camera,
      );
      // Reject empty space with hardware bounds before intersecting detailed imported meshes.
      const candidates = pickableModels.filter((model, index) =>
        raycaster.ray.intersectsBox(
          pickBounds[index].copy(bodyBounds[index]).applyMatrix4(model.matrixWorld),
        ),
      );
      const hit = raycaster.intersectObjects(candidates, true)[0];
      if (!hit) return undefined;
      let object: THREE.Object3D | null = hit.object;
      while (object) {
        const index = pickableModels.indexOf(object as THREE.Group);
        if (index >= 0) {
          const point = object.worldToLocal(hit.point.clone());
          const bounds = hoverBounds[index];
          return {
            device: SHOWCASE_DEVICES[index],
            position: {
              x: THREE.MathUtils.clamp(
                ((point.x - bounds.min.x) / (bounds.max.x - bounds.min.x)) * 2 - 1,
                -1,
                1,
              ),
              y: THREE.MathUtils.clamp(
                ((point.y - bounds.min.y) / (bounds.max.y - bounds.min.y)) * 2 - 1,
                -1,
                1,
              ),
            },
          };
        }
        object = object.parent;
      }
      return undefined;
    };
    pencil.traverse((node) => node.layers.set(PENCIL_RENDER_LAYER));
    const screenMesh = ipad.getObjectByName("Screen");
    if (!(screenMesh instanceof THREE.Mesh)) throw new Error("Missing iPad screen");
    const original = screenMesh.material as THREE.Material;
    original.dispose();
    screenTexture = new THREE.CanvasTexture(screen.canvas);
    screenTexture.flipY = false;
    screenTexture.colorSpace = THREE.SRGBColorSpace;
    screenTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    screenTexture.minFilter = THREE.LinearMipmapLinearFilter;
    screenTexture.magFilter = THREE.LinearFilter;
    screenTexture.generateMipmaps = true;
    screenMesh.material = new THREE.MeshBasicMaterial({ map: screenTexture, toneMapped: false });
    const displayMaterials = pickableModels.map((model) => {
      const display = model.getObjectByName("Screen");
      if (
        !(display instanceof THREE.Mesh) ||
        !(display.material instanceof THREE.MeshBasicMaterial)
      )
        throw new Error("Missing showcase display material");
      display.material.color.setScalar(0);
      return display.material;
    });
    const displayLevels = slides.map(() => 0);
    // The lit display emits its own image; a hand must not cast a painted shadow over its pixels.
    hand.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      for (const material of materials) {
        if (material instanceof THREE.MeshStandardMaterial)
          material.envMapIntensity = HAND_ENVIRONMENT_INTENSITY;
      }
    });
    // Warm both layer variants before the entrance; compileAsync uses parallel shader compilation.
    camera.layers.enable(PENCIL_RENDER_LAYER);
    await compileSceneShaders(renderer, scene, camera, signal);
    signal.throwIfAborted();
    camera.layers.set(DEVICE_RENDER_LAYER);
    renderer.domElement.style.opacity = "0";
    host.append(renderer.domElement);
    pointerTilt = new IpadPointerTilt(host, invalidate, () => motion.hasSelection);
    motionPreference.addEventListener("change", invalidate);
    stopPointerTilt = () => {
      motionPreference.removeEventListener("change", invalidate);
      pointerTilt!.dispose();
    };
    let aspect = 1;
    let lastTime = 0;
    let lastScreenTime: number | undefined;
    let viewportHeight = 1;
    let mobilePortrait = false;
    let portrait = false;
    let entranceOpacity = 0;
    let focusedTopStyle: string | undefined;
    // Both render layers share one world-matrix update per visible frame.
    scene.matrixWorldAutoUpdate = false;
    const writingPointAt = (time: number) => screenPoint(screen.pencilPosition(time));

    const render = (time: number) => {
      if (disposed) return;
      const now = performance.now();
      const tiltChanged = pointerTilt!.update(now);
      const elapsed = now - previousFrame;
      const moving = motion.update(elapsed, motionPreference.matches);
      if (entranceOpacity !== motion.entranceOpacity) {
        entranceOpacity = motion.entranceOpacity;
        renderer.domElement.style.opacity = String(entranceOpacity);
      }
      let hoverChanged = false;
      const follow =
        1 -
        Math.exp(-Math.max(0, Math.min(MAX_HOVER_FRAME_MS, elapsed)) / OVERVIEW_HOVER_FOLLOW_MS);
      const screenFollow =
        1 - Math.exp(-Math.max(0, Math.min(MAX_HOVER_FRAME_MS, elapsed)) / SCREEN_WAKE_FOLLOW_MS);
      displayLevels.forEach((level, index) => {
        const target = motion.hasSelection || hoveredDevice === SHOWCASE_DEVICES[index] ? 1 : 0;
        let next = motionPreference.matches ? target : mix(level, target, screenFollow);
        if (Math.abs(target - next) < OVERVIEW_HOVER_SETTLED) next = target;
        hoverChanged ||= next !== level;
        displayLevels[index] = next;
        displayMaterials[index].color.setScalar(next);
      });
      hoverLevels.forEach((level, index) => {
        const target =
          !motion.hasSelection &&
          !motionPreference.matches &&
          hoveredDevice === SHOWCASE_DEVICES[index]
            ? 1
            : 0;
        let next = motionPreference.matches ? target : level + (target - level) * follow;
        if (Math.abs(target - next) < OVERVIEW_HOVER_SETTLED) next = target;
        hoverChanged ||= next !== level;
        hoverLevels[index] = next;
        const rotation = hoverRotations[index];
        const pitch = target ? -hoverPosition.y * OVERVIEW_MAX_PITCH : 0;
        const yaw = target ? hoverPosition.x * OVERVIEW_MAX_YAW : 0;
        let nextPitch = motionPreference.matches ? 0 : mix(rotation.x, pitch, follow);
        let nextYaw = motionPreference.matches ? 0 : mix(rotation.y, yaw, follow);
        if (Math.abs(pitch - nextPitch) < OVERVIEW_TILT_SETTLED) nextPitch = pitch;
        if (Math.abs(yaw - nextYaw) < OVERVIEW_TILT_SETTLED) nextYaw = yaw;
        hoverChanged ||= nextPitch !== rotation.x || nextYaw !== rotation.y;
        rotation.x = nextPitch;
        rotation.y = nextYaw;
      });
      previousFrame = now;
      hoverMoving = hoverChanged;
      animating = motion.needsFrame || pointerTilt!.needsFrame || hoverMoving;
      if (!needsRedraw && time === lastTime && !tiltChanged && !moving && !hoverChanged) return;
      const poseChanged = needsRedraw || tiltChanged || moving || hoverChanged;
      const displaysChanged = devices!.render(time, selectedDevice);
      const ipadTime = selectedDevice === ShowcaseDevice.Ipad ? time : FILM_START;
      let ipadChanged = false;
      if (ipadTime !== lastScreenTime) {
        // Photographs need minification filtering; native pixel UI keeps base-level sampling.
        const wallpaperVisible = ipadTime < LAUNCH_TIMING.opened;
        if (screenTexture!.generateMipmaps !== wallpaperVisible) {
          screenTexture!.generateMipmaps = wallpaperVisible;
          screenTexture!.minFilter = wallpaperVisible
            ? THREE.LinearMipmapLinearFilter
            : THREE.LinearFilter;
          ipadChanged = true;
        }
        ipadChanged = screen.render(ipadTime) || ipadChanged;
        if (ipadChanged) screenTexture!.needsUpdate = true;
        lastScreenTime = ipadTime;
      }
      const settledTime = FILM_DURATION + FILM_SETTLE_DURATION;
      if (
        !poseChanged &&
        time >= settledTime &&
        lastTime >= settledTime &&
        !displaysChanged &&
        !ipadChanged
      ) {
        lastTime = time;
        return;
      }
      needsRedraw = false;
      lastTime = time;
      // Clear the two-row overview before centering and enlarging the selection.
      const leavingMobileOverview = mobilePortrait && motion.hasSelection && motion.focus < 1;
      const overviewExit = smooth(motion.focus / MOBILE_OVERVIEW_EXIT_END);
      const focus = mobilePortrait
        ? smooth((motion.focus - MOBILE_OVERVIEW_EXIT_END) / (1 - MOBILE_OVERVIEW_EXIT_END))
        : motion.focus;
      const focusedPitch = pointerTilt!.rotation.x * focus;
      const focusedYaw = pointerTilt!.rotation.y * focus;
      let left: (typeof CAMERA_KEYS)[number] = CAMERA_KEYS[0];
      let right: (typeof CAMERA_KEYS)[number] = CAMERA_KEYS[CAMERA_KEYS.length - 1];
      for (let index = 1; index < CAMERA_KEYS.length; index++) {
        if (time <= CAMERA_KEYS[index].time) {
          left = CAMERA_KEYS[index - 1];
          right = CAMERA_KEYS[index];
          break;
        }
      }
      if (selectedDevice !== ShowcaseDevice.Ipad) left = right = CAMERA_KEYS[2];
      const progress = smooth((time - left.time) / Math.max(0.01, right.time - left.time));
      product.rotation.set(0, 0, 0);
      product.position.y = TABLET_CENTER_Y;
      const selectedIndex = SHOWCASE_DEVICES.indexOf(selectedDevice);
      const focusedViewportWidth = mobilePortrait ? MOBILE_FOCUSED_WIDTHS[selectedIndex] : 12;
      const visibleHeight = Math.max(MIN_VISIBLE_HEIGHT, focusedViewportWidth / aspect);
      const settled = motionPreference.matches
        ? 1
        : smooth((time - FILM_DURATION) / FILM_SETTLE_DURATION);
      const focusedHeight =
        (visibleHeight * mix(left.zoom, right.zoom, progress)) /
        mix(1, ENDING_DEVICE_SCALE, settled);
      const focusedWidth = focusedHeight * aspect;
      const overviewHeight = mobilePortrait
        ? Math.max(MOBILE_OVERVIEW_HEIGHT, MOBILE_OVERVIEW_WIDTH / aspect)
        : Math.max(visibleHeight, OVERVIEW_WIDTH / aspect);
      const projectedHeight = mix(overviewHeight, focusedHeight, focus);
      const projectedWidth = projectedHeight * aspect;
      const cameraX = mix(mobilePortrait ? 0 : OVERVIEW_CENTER_X, 0, focus);
      // Center portrait devices in the stage; reserve the upward lift for landscape.
      // The phone grows to fill portrait viewports, so its clearance scales with it.
      const framingHeight =
        selectedDevice === ShowcaseDevice.Phone
          ? (TABLET_HEIGHT * visibleHeight) / MIN_VISIBLE_HEIGHT
          : TABLET_HEIGHT;
      const desiredLift = portrait
        ? 0
        : mix(
            LANDSCAPE_DEVICE_LIFT,
            PORTRAIT_DEVICE_LIFT,
            clamp((1 - aspect) / PORTRAIT_ASPECT_RANGE),
          );
      const availableLift = Math.max(
        0,
        (projectedHeight - framingHeight) / (2 * projectedHeight) - DEVICE_TOP_CLEARANCE,
      );
      const cameraY = -projectedHeight * Math.min(desiredLift, availableLift) * focus;
      const cameraDistance =
        projectedHeight / (2 * Math.tan(THREE.MathUtils.degToRad(CAMERA_FOV / 2)));
      camera.position.set(cameraX, cameraY, cameraDistance);
      // The overview pulls far away from millimeter-scale display/glass gaps.
      // Keep depth precision proportional to that distance instead of wasting it near the eye.
      const near = Math.max(CAMERA_MIN_NEAR, cameraDistance * CAMERA_NEAR_DISTANCE_RATIO);
      const far = Math.max(CAMERA_FAR, cameraDistance * CAMERA_FAR_DISTANCE_RATIO);
      if (camera.near !== near || camera.far !== far) {
        camera.near = near;
        camera.far = far;
        camera.updateProjectionMatrix();
      }
      camera.lookAt(cameraX, cameraY, 0);
      const titleGap = Math.min(
        DEVICE_TITLE_GAP_PX,
        viewportHeight * DEVICE_TITLE_GAP_HEIGHT_FRACTION,
      );
      const topLimit = projectedHeight * (0.5 - titleGap / viewportHeight);
      // Anchor the title to the resting hardware, excluding camera animation,
      // pointer tilt, hands, shadows, and the full-page canvas padding.
      const restingZoom =
        selectedDevice === ShowcaseDevice.Ipad
          ? CAMERA_KEYS[CAMERA_KEYS.length - 1].zoom
          : CAMERA_KEYS[2].zoom;
      const restingHeight = visibleHeight * (settled === 1 ? restingZoom / ENDING_DEVICE_SCALE : 1);
      const restingDistance =
        restingHeight / (2 * Math.tan(THREE.MathUtils.degToRad(CAMERA_FOV / 2)));
      const restingLift = Math.min(
        desiredLift,
        Math.max(0, (restingHeight - framingHeight) / (2 * restingHeight) - DEVICE_TOP_CLEARANCE),
      );
      const restingScale =
        selectedDevice === ShowcaseDevice.Phone
          ? (visibleHeight / MIN_VISIBLE_HEIGHT) * (mobilePortrait ? MOBILE_PHONE_SCALE : 1)
          : baseScales[selectedIndex];
      const productOffsetY = selectedDevice === ShowcaseDevice.Ipad ? TABLET_CENTER_Y : 0;
      let focusedTop = 1;
      for (const point of topEdges[selectedIndex]) {
        const y = (point.y + productOffsetY) * restingScale + baseHeights[selectedIndex];
        const depth = (restingDistance - point.z * restingScale) / restingDistance;
        focusedTop = Math.min(
          focusedTop,
          0.5 - (y + restingHeight * restingLift) / (restingHeight * depth),
        );
      }
      const focusedTopValue = String(clamp(Math.max(titleGap / viewportHeight, focusedTop)));
      if (focusedTopStyle !== focusedTopValue) {
        focusedTopStyle = focusedTopValue;
        stage.style.setProperty(SHOWCASE_FOCUSED_TOP_PROPERTY, focusedTopValue);
      }
      slides.forEach((slide, index) => {
        const hover = hoverLevels[index];
        const entering = (1 - motion.deviceEntrance(index)) * (1 - focus);
        const overviewPosition = mobilePortrait
          ? MOBILE_OVERVIEW_POSITIONS[index]
          : { x: OVERVIEW_POSITIONS[index], y: 0 };
        slide.position.y =
          baseHeights[index] +
          overviewPosition.y * (1 - focus) +
          OVERVIEW_HOVER_LIFT * hover -
          OVERVIEW_ENTER_DROP * entering;
        const scale =
          slide === phone
            ? mix(
                1,
                (visibleHeight / MIN_VISIBLE_HEIGHT) * (mobilePortrait ? MOBILE_PHONE_SCALE : 1),
                focus,
              )
            : baseScales[index];
        slide.scale.setScalar(
          scale *
            mix(OVERVIEW_DEVICE_SCALES[index], 1, focus) *
            (1 + OVERVIEW_HOVER_SCALE * hover) *
            mix(1, OVERVIEW_ENTER_SCALE, entering),
        );
        const count = SHOWCASE_DEVICES.length;
        const distance =
          focus < 1
            ? index - motion.position
            : ((((index - motion.position) % count) + count + count / 2) % count) - count / 2;
        slide.position.x = mix(
          overviewPosition.x,
          distance * CAROUSEL_SPACING * focusedWidth,
          focus,
        );
        slide.visible = focus < 1 || Math.abs(distance) < 1.15;
        if (leavingMobileOverview && index !== selectedIndex) {
          // Keep each unselected device on its own row while it exits outward.
          const direction = MOBILE_OVERVIEW_EXIT_DIRECTIONS[index];
          slide.position.x = overviewPosition.x + direction.x * projectedWidth * overviewExit;
          slide.position.y +=
            overviewPosition.y * focus + direction.y * projectedHeight * overviewExit;
          slide.visible = overviewExit < 1;
        }
        slide.rotation.set(
          focusedPitch + hoverRotations[index].x * (1 - focus) + OVERVIEW_ENTER_PITCH * entering,
          focusedYaw +
            hoverRotations[index].y * (1 - focus) +
            (index - (SHOWCASE_DEVICES.length - 1) / 2) * OVERVIEW_ENTER_YAW * entering,
          0,
        );
        if (focus > 0) {
          pickableModels[index].updateWorldMatrix(true, false);
          let clearance = 0;
          for (const point of topEdges[index]) {
            framingPoint.copy(point).applyMatrix4(pickableModels[index].matrixWorld);
            const depth = (cameraDistance - framingPoint.z) / cameraDistance;
            clearance = Math.max(clearance, framingPoint.y - cameraY - topLimit * depth);
          }
          slide.position.y -= clearance * focus;
        }
      });
      phoneHand.render(
        selectedDevice === ShowcaseDevice.Phone && motion.focus === 1
          ? devices!.phonePointer(time)
          : undefined,
      );
      const framingOffsetY = slides[selectedIndex].position.y - baseHeights[selectedIndex];
      pointerTilt!.setBounds({
        x: 0.5 - TABLET_WIDTH / (2 * projectedWidth),
        y: 0.5 - (TABLET_HEIGHT / 2 + TABLET_CENTER_Y + framingOffsetY - cameraY) / projectedHeight,
        width: TABLET_WIDTH / projectedWidth,
        height: TABLET_HEIGHT / projectedHeight,
      });
      hand.visible = false;
      if (time >= UNLOCK_GESTURE.enter && time < UNLOCK_GESTURE.exit) {
        const arrival =
          1 - smooth((time - UNLOCK_GESTURE.enter) / (UNLOCK_GESTURE.touch - UNLOCK_GESTURE.enter));
        const departure = smooth(
          (time - UNLOCK_GESTURE.lifted) / (UNLOCK_GESTURE.exit - UNLOCK_GESTURE.lifted),
        );
        const swipe = smooth(
          (time - UNLOCK_GESTURE.swipe) / (UNLOCK_GESTURE.lifted - UNLOCK_GESTURE.swipe),
        );
        hand.visible = true;
        hand.position
          .copy(screenPoint({ x: 0.5, y: mix(0.94, 0.54, swipe) }))
          .add(
            new THREE.Vector3(
              3 * arrival + 5 * departure,
              -2.5 * arrival - 2 * departure,
              0.015 + 2 * arrival + 3 * departure,
            ),
          );
        hand.rotation.set(0.1 * arrival, 0, -2.25);
        hand.scale.setScalar(1);
      }
      const launch = launchFrame(time);
      if (launch.handVisible) {
        const incoming = 1 - launch.handApproach;
        const outgoing = launch.handRetreat;
        const approachControl = 2 * incoming * launch.handApproach;
        const retreatControl = 2 * outgoing * (1 - outgoing);
        hand.visible = true;
        hand.position
          .copy(screenPoint(SCREEN_TARGETS.app))
          .add(
            new THREE.Vector3(
              HAND_APPROACH_START.x * incoming ** 2 +
                HAND_APPROACH_CONTROL.x * approachControl +
                HAND_RETREAT_CONTROL.x * retreatControl +
                HAND_RETREAT_END.x * outgoing ** 2,
              HAND_APPROACH_START.y * incoming ** 2 +
                HAND_APPROACH_CONTROL.y * approachControl +
                HAND_RETREAT_CONTROL.y * retreatControl +
                HAND_RETREAT_END.y * outgoing ** 2,
              HAND_CONTACT_OFFSET +
                HAND_HOVER_HEIGHT * (1 - launch.handPress + launch.handLift) +
                HAND_APPROACH_START.z * incoming ** 2 +
                HAND_APPROACH_CONTROL.z * approachControl +
                HAND_RETREAT_CONTROL.z * retreatControl +
                HAND_RETREAT_END.z * outgoing ** 2,
            ),
          );
        hand.rotation.set(
          0.06 * incoming - 0.04 * outgoing,
          -0.035 * incoming + 0.06 * outgoing,
          HAND_LAUNCH_ROTATION + 0.07 * incoming - 0.06 * outgoing,
        );
        hand.scale.setScalar(1);
      }
      if (time >= CREATE_TIMING.enter && time < CREATE_TIMING.exit) {
        const arrival =
          1 - smooth((time - CREATE_TIMING.enter) / (CREATE_TIMING.hover - CREATE_TIMING.enter));
        const transfer = smooth(
          (time - CREATE_TIMING.move) / (CREATE_TIMING.arrive - CREATE_TIMING.move),
        );
        const firstContact =
          smooth((time - CREATE_TIMING.press) / (CREATE_TIMING.touch - CREATE_TIMING.press)) *
          (1 -
            smooth(
              (time - CREATE_TIMING.release) / (CREATE_TIMING.lifted - CREATE_TIMING.release),
            ));
        const secondContact =
          smooth(
            (time - CREATE_TIMING.confirmPress) /
              (CREATE_TIMING.confirmTouch - CREATE_TIMING.confirmPress),
          ) *
          (1 -
            smooth(
              (time - CREATE_TIMING.confirmRelease) /
                (CREATE_TIMING.confirmLifted - CREATE_TIMING.confirmRelease),
            ));
        const departure = smooth(
          (time - CREATE_TIMING.confirmRelease) /
            (CREATE_TIMING.exit - CREATE_TIMING.confirmRelease),
        );
        hand.visible = true;
        hand.position
          .copy(
            screenPoint({
              x: mix(SCREEN_TARGETS.newSprite.x, SCREEN_TARGETS.create.x, transfer),
              y: mix(SCREEN_TARGETS.newSprite.y, SCREEN_TARGETS.create.y, transfer),
            }),
          )
          .add(
            new THREE.Vector3(
              HAND_APPROACH_START.x * arrival ** 2 + HAND_RETREAT_END.x * departure ** 2,
              HAND_APPROACH_START.y * arrival ** 2 + HAND_RETREAT_END.y * departure ** 2,
              HAND_CONTACT_OFFSET +
                HAND_HOVER_HEIGHT * (1 - Math.max(firstContact, secondContact)) +
                0.38 * Math.sin(transfer * Math.PI) +
                HAND_APPROACH_START.z * arrival ** 2 +
                HAND_RETREAT_END.z * departure ** 2,
            ),
          );
        hand.rotation.set(
          0.05 * arrival - 0.04 * departure,
          -0.025 * arrival + 0.045 * departure,
          HAND_CREATE_ROTATION + 0.045 * Math.sin(transfer * Math.PI),
        );
        hand.scale.setScalar(1);
      }
      const playElapsed = time - PLAY_TAP_TIME;
      if (playElapsed >= -TAP_DURATION && playElapsed <= TAP_DURATION) {
        const target = screenPoint(SCREEN_TARGETS.play);
        const approach =
          playElapsed < 0
            ? smooth((playElapsed + TAP_DURATION) / (TAP_DURATION - 0.18))
            : 1 - smooth(Math.max(0, playElapsed - 0.12) / (TAP_DURATION - 0.12));
        const contact =
          playElapsed < 0 ? smooth((playElapsed + 0.18) / 0.18) : 1 - smooth(playElapsed / 0.2);
        hand.visible = true;
        hand.position
          .copy(target)
          .add(
            new THREE.Vector3(
              5 * (1 - approach),
              -3.5 * (1 - approach),
              0.015 + 0.16 * (1 - contact) + 3 * (1 - approach),
            ),
          );
        hand.rotation.set(0.1 * (1 - approach), -0.06 * (1 - approach), -2.25);
        hand.scale.setScalar(1);
      }

      pencil.visible = time >= PENCIL_WRITING_TIMING.enter && time < PENCIL_WRITING_TIMING.exit;
      if (pencil.visible) {
        const pose = samplePencilWritingPose(time, writingPointAt);
        pencil.position.copy(pose.position);
        pencil.quaternion.copy(pose.quaternion);
      }
      if (motion.focus < 1 || selectedDevice !== ShowcaseDevice.Ipad) {
        hand.visible = false;
        pencil.visible = false;
      }
      // Every layer shares the full-page canvas, including forearms and contact shadows.
      scene.updateMatrixWorld();
      gameFilter.begin(renderer);
      camera.layers.set(DEVICE_RENDER_LAYER);
      renderer.render(scene, camera);
      if (pencil.visible || phoneHand.visible) {
        renderer.clearDepth();
        camera.layers.set(PENCIL_RENDER_LAYER);
        renderer.render(scene, camera);
      }
      camera.layers.set(DEVICE_RENDER_LAYER);
      gameFilter.finish(renderer);
    };

    let layoutKey: string | undefined;
    let resizeFrame: number | undefined;
    let renderSize = { width: 0, height: 0 };
    const resize = () => {
      const size = layoutSize(host);
      const width = Math.max(1, size.width);
      const height = Math.max(1, size.height);
      const viewport = viewportSize();
      portrait = viewport.height > viewport.width;
      mobilePortrait = viewport.width <= MOBILE_VIEWPORT_MAX_WIDTH && portrait;
      const pageBounds = clientRect(page);
      const top = clientToLocal(host, { x: pageBounds.left, y: pageBounds.top });
      const bottom = clientToLocal(host, { x: pageBounds.right, y: pageBounds.bottom });
      const topBleed = Math.max(0, Math.ceil(-top.y));
      const bottomBleed = Math.max(0, Math.ceil(bottom.y - height));
      const leftBleed = Math.max(0, Math.ceil(-top.x));
      const rightBleed = Math.max(0, Math.ceil(bottom.x - width));
      const renderWidth = width + leftBleed + rightBleed;
      const renderHeight = height + topBleed + bottomBleed;
      const nextKey = [
        width,
        height,
        topBleed,
        bottomBleed,
        leftBleed,
        rightBleed,
        viewport.width,
        viewport.height,
      ].join(":");
      if (layoutKey === nextKey) return;
      layoutKey = nextKey;
      invalidate();
      pointerTilt!.reset();
      viewportHeight = height;
      renderer.domElement.style.setProperty("--film-render-top", `${topBleed}px`);
      renderer.domElement.style.setProperty("--film-render-bottom", `${bottomBleed}px`);
      renderer.domElement.style.setProperty("--film-render-left", `${leftBleed}px`);
      renderer.domElement.style.setProperty("--film-render-right", `${rightBleed}px`);
      aspect = width / height;
      // Publish the resting overview edge, so hovering/entrance poses do not move the title.
      const overviewHeight = mobilePortrait
        ? Math.max(MOBILE_OVERVIEW_HEIGHT, MOBILE_OVERVIEW_WIDTH / aspect)
        : Math.max(MIN_VISIBLE_HEIGHT, OVERVIEW_WIDTH / aspect);
      const overviewDistance =
        overviewHeight / (2 * Math.tan(THREE.MathUtils.degToRad(CAMERA_FOV / 2)));
      let overviewTop = 1;
      topEdges.forEach((points, index) => {
        const scale = baseScales[index] * OVERVIEW_DEVICE_SCALES[index];
        const offsetY =
          baseHeights[index] + (mobilePortrait ? MOBILE_OVERVIEW_POSITIONS[index].y : 0);
        const productOffsetY =
          SHOWCASE_DEVICES[index] === ShowcaseDevice.Ipad ? TABLET_CENTER_Y : 0;
        for (const point of points) {
          const y = (point.y + productOffsetY) * scale + offsetY;
          const depth = (overviewDistance - point.z * scale) / overviewDistance;
          overviewTop = Math.min(overviewTop, 0.5 - y / (overviewHeight * depth));
        }
      });
      stage.style.setProperty(SHOWCASE_OVERVIEW_TOP_PROPERTY, String(clamp(overviewTop)));
      camera.setViewOffset(width, height, -leftBleed, -topBleed, renderWidth, renderHeight);
      if (renderSize.width !== renderWidth || renderSize.height !== renderHeight) {
        renderer.setSize(renderWidth, renderHeight, false);
        gameFilter.setSize(renderWidth, renderHeight);
        renderSize = { width: renderWidth, height: renderHeight };
      }
      render(lastTime);
    };
    const scheduleResize = () => {
      if (resizeFrame !== undefined) return;
      resizeFrame = requestAnimationFrame(() => {
        resizeFrame = undefined;
        resize();
      });
    };
    const removeResize = observeResize([host, page], scheduleResize);
    window.addEventListener("scroll", scheduleResize, { passive: true });
    stopResize = () => {
      if (resizeFrame !== undefined) cancelAnimationFrame(resizeFrame);
      removeResize();
      window.removeEventListener("scroll", scheduleResize);
    };
    resize();
    return {
      render,
      needsFrame: () =>
        !disposed && (needsRedraw || motion.needsFrame || pointerTilt!.needsFrame || hoverMoving),
      observeInvalidation: (callback) => {
        invalidateListener = callback;
        return () => {
          if (invalidateListener === callback) invalidateListener = undefined;
        };
      },
      isDemoReady: () => motion.settled && screen.isReady && devices!.isReady(),
      dispose,
      setDevice: (device) => {
        motion.select(device);
        previewDevice(undefined);
        selectedDevice = device;
        pointerTilt!.reset();
        invalidate();
      },
      showOverview: () => {
        motion.showOverview();
        previewDevice(undefined);
        pointerTilt!.reset();
        invalidate();
      },
      previewDevice,
      observeDeviceSelection: (callback) => {
        stopDeviceSelection();
        stopDeviceSelection = observeOverviewDeviceSelection(
          stage,
          () => !motion.hasSelection,
          pickDevice,
          previewDevice,
          callback,
        );
        return stopDeviceSelection;
      },
      beginDrag: () => {
        motion.beginDrag();
        pointerTilt!.reset();
        invalidate();
      },
      previewDrag: (progress) => {
        motion.previewDrag(progress);
        invalidate();
      },
      setLanguage: async (nextLanguage) => {
        await Promise.all([screen.setLanguage(nextLanguage), devices!.setLanguage(nextLanguage)]);
        if (disposed) return;
        lastScreenTime = undefined;
        invalidate();
      },
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
