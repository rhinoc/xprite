import * as THREE from "three";

import { DeviceDemoScreen } from "$/adapters/showcase/device-demo-screen";
import type { HelloSpriteProject } from "$/adapters/showcase/hello-sprite-project";
import { FILM_START } from "$/managers/showcase/ipad-story";
import { ShowcaseDevice } from "$/managers/showcase/showcase-device";
import type { ShowcaseLanguage } from "$/managers/showcase/showcase-language";

/** Native viewport-sized demonstrations cover each device's complete display UV. */
export function createDeviceDisplays(language: ShowcaseLanguage, project: HelloSpriteProject) {
  const screens = ([ShowcaseDevice.Computer, ShowcaseDevice.Phone] as const).map((device) => {
    const film = new DeviceDemoScreen(device, language, project);
    const texture = new THREE.CanvasTexture(film.canvas);
    texture.flipY = false;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    return { device, film, texture, time: FILM_START };
  });
  const phoneFilm = screens.find((screen) => screen.device === ShowcaseDevice.Phone)!.film;
  return {
    attach(computer: THREE.Group, phone: THREE.Group) {
      for (const { device, texture } of screens) {
        const model = device === ShowcaseDevice.Computer ? computer : phone;
        const mesh = model.getObjectByName("Screen");
        if (!(mesh instanceof THREE.Mesh)) throw new Error("Missing showcase device screen");
        const original = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        original.forEach((material) => material.dispose());
        mesh.material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
      }
    },
    ready: Promise.all(screens.map((screen) => screen.film.ready)),
    isReady: () => screens.every((screen) => screen.film.isReady),
    render(time: number, selected: ShowcaseDevice) {
      let changed = false;
      for (const screen of screens) {
        if (screen.device === selected) screen.time = time;
        if (screen.film.render(screen.time)) {
          screen.texture.needsUpdate = true;
          changed = true;
        }
      }
      return changed;
    },
    phonePointer: (time: number) => phoneFilm.pointer(time),
    async setLanguage(language: ShowcaseLanguage): Promise<void> {
      await Promise.all(screens.map((screen) => screen.film.setLanguage(language)));
    },
    dispose() {
      for (const { texture, film } of screens) {
        film.dispose();
        texture.dispose();
      }
    },
  };
}
