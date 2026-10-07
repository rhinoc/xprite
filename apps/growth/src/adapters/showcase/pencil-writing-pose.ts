import * as THREE from "three";

export const PENCIL_WRITING_TIMING = {
  enter: 13,
  contact: 15.8,
  start: 16,
  end: 26,
  exit: 27,
} as const;

/** Tablet-space controls shared with the editable Blender writing rig. */
const PENCIL_WRITING_RIG = {
  gripDistance: 1.35,
  wristRight: 1.45,
  wristBaseline: -1.05,
  wristVerticalFollow: 0.24,
  wristHeight: 0.42,
  wristReachLift: 0.18,
  reachBottom: -0.3,
  reachTop: 1.6,
  elevationDegrees: 48,
  reachElevationDegrees: 15,
  strokeElevationDegrees: 4,
  strokeYawDegrees: 3,
  horizontalRollDegrees: 7,
  verticalRollDegrees: -3,
  turnRollDegrees: 4,
  entranceAzimuthDegrees: -15,
  entranceElevationDegrees: 78,
  entranceRollDegrees: -22,
  exitAzimuthDegrees: -20,
  exitElevationDegrees: 75,
  exitRollDegrees: 18,
  entranceOffset: { x: 3, y: 1.3, z: 3.5 },
  exitOffset: { x: 2.7, y: 2, z: 3 },
} as const;

const WRIST_SAMPLE_STEP = 0.14;
const WRIST_SAMPLE_WEIGHTS = [1, 2, 3, 4, 5, 4, 3, 2, 1] as const;
const WRIST_SAMPLE_MIDDLE = (WRIST_SAMPLE_WEIGHTS.length - 1) / 2;
const WRIST_SAMPLE_TOTAL = WRIST_SAMPLE_WEIGHTS.reduce<number>((sum, weight) => sum + weight, 0);
const STROKE_SAMPLE_STEP = 0.12;
const STROKE_DIRECTION_SOFTNESS = 0.08;
const TURN_DIRECTION_SOFTNESS = 0.04;
const SHAFT_AXIS = new THREE.Vector3(0, 1, 0);

export interface PencilWritingPose {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  grip: THREE.Vector3;
  wrist: THREE.Vector3;
  roll: number;
}

type PositionAt = (time: number) => THREE.Vector3;

function smooth(value: number): number {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function orientation(azimuth: number, elevation: number, roll: number): THREE.Quaternion {
  const direction = new THREE.Vector3(
    Math.cos(azimuth) * Math.cos(elevation),
    Math.sin(azimuth) * Math.cos(elevation),
    Math.sin(elevation),
  );
  return new THREE.Quaternion()
    .setFromUnitVectors(SHAFT_AXIS, direction)
    .multiply(new THREE.Quaternion().setFromAxisAngle(SHAFT_AXIS, roll));
}

/**
 * The forearm advances gradually; fingers move the tip around that wrist.
 * Reach raises the grip, and stroke direction flexes it without steering the
 * shaft along the path. Every control is sampled from absolute film time, so
 * seeking and replay produce the same pose without a frame-dependent filter.
 */
export function samplePencilWritingPose(time: number, positionAt: PositionAt): PencilWritingPose {
  const drawingTime = THREE.MathUtils.clamp(
    time,
    PENCIL_WRITING_TIMING.start,
    PENCIL_WRITING_TIMING.end,
  );
  const pointAt = (sampleTime: number) =>
    positionAt(
      THREE.MathUtils.clamp(sampleTime, PENCIL_WRITING_TIMING.start, PENCIL_WRITING_TIMING.end),
    );
  const tip = pointAt(drawingTime);
  const forearm = new THREE.Vector3();
  WRIST_SAMPLE_WEIGHTS.forEach((weight, index) => {
    forearm.addScaledVector(
      pointAt(drawingTime + (index - WRIST_SAMPLE_MIDDLE) * WRIST_SAMPLE_STEP),
      weight / WRIST_SAMPLE_TOTAL,
    );
  });

  const before = pointAt(drawingTime - STROKE_SAMPLE_STEP);
  const after = pointAt(drawingTime + STROKE_SAMPLE_STEP);
  const incoming = new THREE.Vector2(tip.x - before.x, tip.y - before.y);
  const outgoing = new THREE.Vector2(after.x - tip.x, after.y - tip.y);
  const stroke = new THREE.Vector2(after.x - before.x, after.y - before.y);
  stroke.divideScalar(Math.sqrt(stroke.lengthSq() + STROKE_DIRECTION_SOFTNESS ** 2));
  const bend =
    (incoming.x * outgoing.y - incoming.y * outgoing.x) /
    Math.sqrt(incoming.lengthSq() * outgoing.lengthSq() + TURN_DIRECTION_SOFTNESS ** 2);
  const reach = smooth(
    (tip.y - PENCIL_WRITING_RIG.reachBottom) /
      (PENCIL_WRITING_RIG.reachTop - PENCIL_WRITING_RIG.reachBottom),
  );
  const wrist = new THREE.Vector3(
    forearm.x + PENCIL_WRITING_RIG.wristRight,
    PENCIL_WRITING_RIG.wristBaseline + forearm.y * PENCIL_WRITING_RIG.wristVerticalFollow,
    tip.z + PENCIL_WRITING_RIG.wristHeight + reach * PENCIL_WRITING_RIG.wristReachLift,
  );
  const azimuth =
    Math.atan2(wrist.y - tip.y, wrist.x - tip.x) +
    THREE.MathUtils.degToRad(PENCIL_WRITING_RIG.strokeYawDegrees * stroke.x);
  const elevation = THREE.MathUtils.degToRad(
    PENCIL_WRITING_RIG.elevationDegrees +
      PENCIL_WRITING_RIG.reachElevationDegrees * reach +
      PENCIL_WRITING_RIG.strokeElevationDegrees * stroke.y,
  );
  const writingRoll = THREE.MathUtils.degToRad(
    PENCIL_WRITING_RIG.horizontalRollDegrees * stroke.x +
      PENCIL_WRITING_RIG.verticalRollDegrees * stroke.y +
      PENCIL_WRITING_RIG.turnRollDegrees * bend,
  );
  const arrival =
    1 -
    smooth(
      (time - PENCIL_WRITING_TIMING.enter) /
        (PENCIL_WRITING_TIMING.contact - PENCIL_WRITING_TIMING.enter),
    );
  const departure = smooth(
    (time - PENCIL_WRITING_TIMING.end) / (PENCIL_WRITING_TIMING.exit - PENCIL_WRITING_TIMING.end),
  );
  const quaternion = orientation(azimuth, elevation, writingRoll);
  quaternion.slerp(
    orientation(
      THREE.MathUtils.degToRad(PENCIL_WRITING_RIG.entranceAzimuthDegrees),
      THREE.MathUtils.degToRad(PENCIL_WRITING_RIG.entranceElevationDegrees),
      THREE.MathUtils.degToRad(PENCIL_WRITING_RIG.entranceRollDegrees),
    ),
    arrival,
  );
  quaternion.slerp(
    orientation(
      THREE.MathUtils.degToRad(PENCIL_WRITING_RIG.exitAzimuthDegrees),
      THREE.MathUtils.degToRad(PENCIL_WRITING_RIG.exitElevationDegrees),
      THREE.MathUtils.degToRad(PENCIL_WRITING_RIG.exitRollDegrees),
    ),
    departure,
  );
  const offset = new THREE.Vector3(
    PENCIL_WRITING_RIG.entranceOffset.x * arrival + PENCIL_WRITING_RIG.exitOffset.x * departure,
    PENCIL_WRITING_RIG.entranceOffset.y * arrival + PENCIL_WRITING_RIG.exitOffset.y * departure,
    PENCIL_WRITING_RIG.entranceOffset.z * arrival + PENCIL_WRITING_RIG.exitOffset.z * departure,
  );
  const position = tip.clone().add(offset);
  const shaft = SHAFT_AXIS.clone().applyQuaternion(quaternion);
  const grip = shaft.clone().multiplyScalar(PENCIL_WRITING_RIG.gripDistance).add(position);
  // Decompose the final quaternion so Blender's grip target and barrel-roll
  // controls also reproduce the interpolated arrival and departure exactly.
  const twist = new THREE.Quaternion()
    .setFromUnitVectors(SHAFT_AXIS, shaft)
    .conjugate()
    .multiply(quaternion);
  const roll = 2 * Math.atan2(twist.y, twist.w);
  return { position, quaternion, grip, wrist: wrist.add(offset), roll };
}
