"""Create the editable tip / grip / wrist rig used by the iPad writing shot.

Run from the repository root:
    blender --background --python scripts/showcase/ipad/create-pencil-writing-rig.py

This only writes pencil-writing-rig.blend. It imports the existing Pencil and
iPad meshes without modifying their public GLBs, and samples the runtime pose
helper through Node so the Blender controls match the web animation.
"""

import json
import math
import shutil
import subprocess
from pathlib import Path

import bpy
from mathutils import Matrix, Vector


ROOT = Path(__file__).resolve().parents[3]
SOURCE = Path(__file__).resolve().parent
ASSETS = ROOT / "apps/growth/public/showcase/ipad"
OUTPUT = SOURCE / "pencil-writing-rig.blend"
FRAME_RATE = 30
FILM_DURATION = 32
SCREEN_WIDTH = 9.38
SCREEN_HEIGHT = SCREEN_WIDTH * 834 / 1194
SCREEN_SURFACE = 0.14
GLTF_TO_SCENE = Matrix.Rotation(-math.pi / 2, 4, "X")


def runtime_poses(motion):
    node = shutil.which("node")
    if node is None:
        raise RuntimeError("Node 24 or later is required to sample the runtime TypeScript pose helper")
    helper = ROOT / "apps/growth/src/adapters/showcase/pencil-writing-pose.ts"
    script = r"""
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const helperPath = process.argv[1];
const { Vector3 } = createRequire(helperPath)('three');
const { samplePencilWritingPose } = await import(pathToFileURL(helperPath).href);
let input = '';
for await (const chunk of process.stdin) input += chunk;
const { motion, frameRate, duration, screenWidth, screenHeight, surface } = JSON.parse(input);
const positionAt = (time) => {
  const samples = motion.samples;
  const progress = Math.max(0, Math.min(1, (time - 16) / 10));
  const position = progress * (samples.length - 1);
  const index = Math.min(Math.floor(position), samples.length - 2);
  const fraction = position - index;
  const start = samples[index];
  const end = samples[index + 1];
  const coordinate = (axis) => {
    const before = samples[index - 1]?.[axis] ?? 2 * start[axis] - end[axis];
    const after = samples[index + 2]?.[axis] ?? 2 * end[axis] - start[axis];
    const startTangent = (end[axis] - before) / 2;
    const endTangent = (after - start[axis]) / 2;
    const squared = fraction * fraction;
    const cubed = squared * fraction;
    return (2 * cubed - 3 * squared + 1) * start[axis]
      + (cubed - 2 * squared + fraction) * startTangent
      + (-2 * cubed + 3 * squared) * end[axis]
      + (cubed - squared) * endTangent;
  };
  const x = (382 + coordinate(0) / 128 * 768) / 1389;
  const y = (172 + coordinate(1) / 80 * 480) / 970;
  return new Vector3((x - 0.5) * screenWidth, (0.5 - y) * screenHeight, surface);
};
const poses = [];
for (let frame = 1; frame <= frameRate * duration + 1; frame++) {
  const pose = samplePencilWritingPose((frame - 1) / frameRate, positionAt);
  poses.push({ frame, tip: pose.position.toArray(), grip: pose.grip.toArray(),
    wrist: pose.wrist.toArray(), roll: pose.roll });
}
process.stdout.write(JSON.stringify(poses));
"""
    result = subprocess.run(
        [node, "--input-type=module", "--eval", script, str(helper)],
        input=json.dumps({
            "motion": motion,
            "frameRate": FRAME_RATE,
            "duration": FILM_DURATION,
            "screenWidth": SCREEN_WIDTH,
            "screenHeight": SCREEN_HEIGHT,
            "surface": SCREEN_SURFACE,
        }),
        text=True,
        capture_output=True,
        cwd=ROOT,
        check=True,
    )
    return json.loads(result.stdout)


def collection(name):
    result = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(result)
    return result


def move_to_collection(obj, destination):
    for old in tuple(obj.users_collection):
        old.objects.unlink(obj)
    destination.objects.link(obj)


def empty(name, destination, shape="PLAIN_AXES", size=0.25, color=(1, 1, 1, 1)):
    obj = bpy.data.objects.new(name, None)
    destination.objects.link(obj)
    obj.empty_display_type = shape
    obj.empty_display_size = size
    obj.color = color
    obj.show_name = True
    obj.show_in_front = True
    return obj


def import_meshes(filename, destination, parent=None):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(ASSETS / filename))
    imported = set(bpy.data.objects) - before
    meshes = [obj for obj in imported if obj.type == "MESH"]
    # Our GLBs intentionally preserve X-right, Y-up, Z-out coordinates. Undo
    # Blender's normal glTF Y-up import conversion before assigning rig parents.
    transforms = {obj: GLTF_TO_SCENE @ obj.matrix_world for obj in meshes}
    for obj in meshes:
        obj.parent = None
        obj.data.transform(transforms[obj])
        obj.matrix_world = Matrix.Identity(4)
        obj.parent = parent
        move_to_collection(obj, destination)
    for obj in imported:
        if obj.type != "MESH":
            bpy.data.objects.remove(obj, do_unlink=True)
    return meshes


def material(name, color, roughness=0.65):
    result = bpy.data.materials.new(name)
    result.diffuse_color = (*color, 1)
    result.use_nodes = True
    node = result.node_tree.nodes.get("Principled BSDF")
    node.inputs["Base Color"].default_value = (*color, 1)
    node.inputs["Roughness"].default_value = roughness
    return result


def artwork_point(sample):
    x = (382 + sample[0] / 128 * 768) / 1389
    y = (172 + sample[1] / 80 * 480) / 970
    return ((x - 0.5) * SCREEN_WIDTH, (0.5 - y) * SCREEN_HEIGHT, SCREEN_SURFACE + 0.02)


def path_guide(destination, samples):
    curve = bpy.data.curves.new("Hello source curve — motion guide only", "CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth = 0.014
    curve.bevel_resolution = 2
    spline = curve.splines.new("POLY")
    spline.points.add(len(samples) - 1)
    for point, sample in zip(spline.points, samples):
        point.co = (*artwork_point(sample), 1)
    obj = bpy.data.objects.new("Guide_HelloPath", curve)
    destination.objects.link(obj)
    curve.materials.append(material("Motion guide blue", (0.025, 0.18, 0.35)))
    obj["purpose"] = "Editable trajectory reference; film artwork remains native Aseprite pixels."
    curve.bevel_factor_end = 0
    curve.keyframe_insert("bevel_factor_end", frame=16 * FRAME_RATE + 1)
    curve.bevel_factor_end = 1
    curve.keyframe_insert("bevel_factor_end", frame=26 * FRAME_RATE + 1)
    return obj


def set_linear_keys(block):
    if block.animation_data is None or block.animation_data.action is None:
        return
    action = block.animation_data.action
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for fcurve in bag.fcurves:
                    for key in fcurve.keyframe_points:
                        key.interpolation = "LINEAR"


def setup_studio(destination):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1400
    scene.render.resolution_y = 1000
    scene.render.resolution_percentage = 100
    scene.world.color = (0.18, 0.18, 0.18)
    scene.view_settings.view_transform = "AgX"
    # View from the opposite side of the wrist so the shaft's depth is visible
    # in the editable file instead of looking straight along the barrel.
    bpy.ops.object.camera_add(location=(-6, 7, 15))
    camera = bpy.context.object
    camera.name = "WritingRig_Camera"
    target = Vector((0.6, 0.5, 0.7))
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 14
    scene.camera = camera
    move_to_collection(camera, destination)
    for name, location, energy, size in (
        ("WritingRig_Key", (-3, 0, 10), 1300, 8),
        ("WritingRig_Rim", (5, 4, 7), 1000, 6),
    ):
        bpy.ops.object.light_add(type="AREA", location=location)
        lamp = bpy.context.object
        lamp.name = name
        lamp.data.energy = energy
        lamp.data.shape = "DISK"
        lamp.data.size = size
        lamp.rotation_euler = (-lamp.location).to_track_quat("-Z", "Y").to_euler()
        move_to_collection(lamp, destination)


def main():
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for old in list(bpy.data.collections):
        bpy.data.collections.remove(old)
    controls = collection("01 Writing controls")
    pencil_collection = collection("02 Pencil meshes")
    tablet_collection = collection("03 Tablet reference")
    guides = collection("04 Trajectory guide")
    studio = collection("05 Studio")
    tip = empty("TipContact", controls, "SPHERE", 0.07, (1, 0.25, 0.05, 1))
    wrist = empty("Wrist", controls, "CIRCLE", 0.32, (0.1, 0.65, 1, 1))
    grip = empty("Grip", controls, "SPHERE", 0.16, (0.2, 1, 0.35, 1))
    grip.parent = wrist
    aim = empty("PencilAim", controls, size=0.18)
    aim.parent = tip
    track = aim.constraints.new("DAMPED_TRACK")
    track.name = "Shaft follows tip to grip"
    track.target = grip
    track.track_axis = "TRACK_Y"
    roll = empty("BarrelRoll", controls, "CIRCLE", 0.22, (1, 0.7, 0.05, 1))
    roll.parent = aim
    tip["purpose"] = "Contact point follows the exact smooth Hello source trajectory."
    wrist["purpose"] = "The slowly moving hand support; move this to redirect the held Pencil."
    grip["purpose"] = "Grip control, relative to Wrist; Pencil +Y aims from TipContact toward this point."
    roll["purpose"] = "Local Y rotation rolls the flattened barrel around its shaft."
    pencil = import_meshes("apple-pencil.glb", pencil_collection, roll)
    tablet = import_meshes("ipad.glb", tablet_collection)
    for obj in tablet:
        obj.hide_select = True
        if obj.name == "Screen":
            obj.data.materials.clear()
            obj.data.materials.append(material("Rig screen reference", (0.82, 0.84, 0.86)))
    motion = json.loads((ASSETS / "hello/motion.json").read_text())
    trajectory = path_guide(guides, motion["samples"])
    samples = runtime_poses(motion)
    for sample in samples:
        frame = sample["frame"]
        tip.location = sample["tip"]
        wrist.location = sample["wrist"]
        grip.location = Vector(sample["grip"]) - wrist.location
        roll.rotation_euler.y = sample["roll"]
        for obj in (tip, wrist, grip):
            obj.keyframe_insert("location", frame=frame)
        roll.keyframe_insert("rotation_euler", index=1, frame=frame)
    for obj in pencil:
        for frame, hidden in ((1, True), (13 * FRAME_RATE + 1, False), (27 * FRAME_RATE + 1, True)):
            obj.hide_render = hidden
            obj.hide_viewport = hidden
            obj.keyframe_insert("hide_render", frame=frame)
            obj.keyframe_insert("hide_viewport", frame=frame)
    for block in (tip, wrist, grip, roll, trajectory.data):
        set_linear_keys(block)
    scene = bpy.context.scene
    scene.render.fps = FRAME_RATE
    scene.frame_start = 1
    scene.frame_end = FILM_DURATION * FRAME_RATE + 1
    scene["runtime_pose_source"] = "apps/growth/src/adapters/showcase/pencil-writing-pose.ts"
    scene["motion_path_sha256"] = motion["pathSourceSha256"]
    scene["coordinates"] = "X right, Y up, Z toward viewer; tip at screen z=0.14 while writing."
    for name, time in (("Pencil enters", 13), ("Contact / writing", 16), ("Writing ends", 26), ("Pencil exits", 27)):
        scene.timeline_markers.new(name, frame=round(time * FRAME_RATE) + 1)
    setup_studio(studio)
    bpy.data.texts.load(str(Path(__file__).resolve()))
    documentation = SOURCE / "pencil-writing-rig.md"
    if documentation.exists():
        bpy.data.texts.load(str(documentation))
    scene.frame_set(18 * FRAME_RATE + 1)
    bpy.ops.object.select_all(action="DESELECT")
    grip.select_set(True)
    bpy.context.view_layer.objects.active = grip
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == "VIEW_3D":
                area.spaces.active.region_3d.view_perspective = "CAMERA"
                area.spaces.active.shading.type = "MATERIAL"
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT), compress=True)
    print(f"Saved editable writing rig: {OUTPUT}")


if __name__ == "__main__":
    main()
