import * as THREE from "three";

import type { DemoPointer } from "$/adapters/showcase/device-demo-screen";

// Keep the source hand's anatomical proportions; the phone parent supplies presentation scale.
const HAND_SCALE = 1;
const HAND_ROTATION = -2.25;
const CONTACT_CLEARANCE = 0.012;
const HOVER_HEIGHT = 0.11;
// The complete hand clears the bottom edge before visibility changes, including at top-row taps.
// A shallow depth approach avoids enlarging the forearm as it passes close to the camera.
const APPROACH = { x: 8, y: -12, z: 0.6 } as const;

/** Reuse the iPad's licensed pointing hand, anchored to the phone's actual display mesh. */
export class PhoneDemoHand {
  private readonly hand: THREE.Object3D;
  private readonly screen: THREE.Mesh;
  private readonly bounds: THREE.Box3;
  private readonly point = new THREE.Vector3();
  private readonly offset = new THREE.Vector3();

  get visible(): boolean {
    return this.hand.visible;
  }

  constructor(phone: THREE.Group, source: THREE.Object3D, renderLayer: number) {
    const screen = phone.getObjectByName("Screen");
    if (!(screen instanceof THREE.Mesh)) throw new Error("Missing phone display mesh");
    this.screen = screen;
    screen.geometry.computeBoundingBox();
    this.bounds = screen.geometry.boundingBox!.clone();
    this.hand = source.clone(true);
    this.hand.name = "PhoneDemoHand";
    this.hand.scale.setScalar(HAND_SCALE);
    this.hand.rotation.set(0, 0, HAND_ROTATION);
    this.hand.traverse((node) => node.layers.set(renderLayer));
    this.hand.visible = false;
    phone.add(this.hand);
  }

  render(pointer: DemoPointer | undefined) {
    this.hand.visible = Boolean(pointer?.visible);
    if (!pointer?.visible) return;
    const { min, max } = this.bounds;
    const point = this.point.set(
      min.x + (max.x - min.x) * pointer.point.x,
      max.y - (max.y - min.y) * pointer.point.y,
      max.z,
    );
    this.screen.updateMatrix();
    point.applyMatrix4(this.screen.matrix);
    const lift = pointer.lift;
    this.hand.position
      .copy(point)
      .add(
        this.offset.set(
          APPROACH.x * lift,
          APPROACH.y * lift,
          CONTACT_CLEARANCE + HOVER_HEIGHT * (1 - pointer.contact) + APPROACH.z * lift,
        ),
      );
    this.hand.rotation.set(lift * 0.08, 0, HAND_ROTATION);
  }
}
