"""Editable studio props for /showcase/ipad.

Run: blender --background --python scripts/showcase/ipad/create-models.py

The public GLBs deliberately preserve the application's XY screen coordinates:
X right, Y up, Z toward the camera. Blender's automatic Y-up export is disabled.
Dimensions below are the source of truth; no downloaded proprietary models are
used. The .blend retains separate named meshes and their modeling modifiers.
"""

import math
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[3]
OUTPUT = ROOT / "apps/growth/public/showcase/ipad"
SOURCE = Path(__file__).resolve().parent
CORNER_SEGMENTS = 20
IPAD_WIDTH = 10.0
IPAD_HEIGHT = 7.20
IPAD_DEPTH = 0.20
SCREEN_WIDTH = 9.38
SCREEN_HEIGHT = SCREEN_WIDTH * 834 / 1194
SCREEN_Z = 0.121
PENCIL_LENGTH = 4.5


def material(name, color, metallic=0.0, roughness=0.4, subsurface=0.0):
    result = bpy.data.materials.new(name)
    result.diffuse_color = (*color, 1.0)
    result.use_nodes = True
    shader = result.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1.0)
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Subsurface Weight"].default_value = subsurface
    return result


def mesh_object(name, vertices, faces, collection, mat=None, smooth=True):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    if mat:
        mesh.materials.append(mat)
    for polygon in mesh.polygons:
        polygon.use_smooth = smooth
    return obj


def rounded_perimeter(width, height, radius):
    points = []
    for cx, cy, start in (
        (width / 2 - radius, height / 2 - radius, 0),
        (-width / 2 + radius, height / 2 - radius, 90),
        (-width / 2 + radius, -height / 2 + radius, 180),
        (width / 2 - radius, -height / 2 + radius, 270),
    ):
        for index in range(CORNER_SEGMENTS + 1):
            angle = math.radians(start + index * 90 / CORNER_SEGMENTS)
            points.append((cx + radius * math.cos(angle), cy + radius * math.sin(angle)))
    return points


def rounded_slab(name, width, height, depth, radius, z, collection, mat, bevel=0.016):
    """Four perimeter rings produce real edge highlights without cube bevels."""
    rings = (
        (width - bevel * 2, height - bevel * 2, radius - bevel, z - depth / 2),
        (width, height, radius, z - depth / 2 + bevel),
        (width, height, radius, z + depth / 2 - bevel),
        (width - bevel * 2, height - bevel * 2, radius - bevel, z + depth / 2),
    )
    vertices = [(x, y, zz) for ww, hh, rr, zz in rings for x, y in rounded_perimeter(ww, hh, rr)]
    count = len(vertices) // len(rings)
    faces = [tuple(range(count - 1, -1, -1))]
    for ring in range(len(rings) - 1):
        for index in range(count):
            nxt = (index + 1) % count
            faces.append((ring * count + index, ring * count + nxt, (ring + 1) * count + nxt, (ring + 1) * count + index))
    faces.append(tuple(range((len(rings) - 1) * count, len(rings) * count)))
    obj = mesh_object(name, vertices, faces, collection, mat)
    obj.data.polygons[0].use_smooth = False
    obj.data.polygons[-1].use_smooth = False
    return obj


def surface(name, width, height, radius, z, collection, mat):
    perimeter = rounded_perimeter(width, height, radius)
    vertices = [(0, 0, z)] + [(x, y, z) for x, y in perimeter]
    faces = [(0, index + 1, (index + 1) % len(perimeter) + 1) for index in range(len(perimeter))]
    obj = mesh_object(name, vertices, faces, collection, mat, smooth=False)
    uv = obj.data.uv_layers.new(name="ScreenUV")
    for polygon in obj.data.polygons:
        for loop_index in polygon.loop_indices:
            vertex = obj.data.vertices[obj.data.loops[loop_index].vertex_index]
            uv.data[loop_index].uv = (vertex.co.x / width + 0.5, vertex.co.y / height + 0.5)
    return obj


def move_to_collection(obj, collection):
    for old in tuple(obj.users_collection):
        old.objects.unlink(obj)
    collection.objects.link(obj)


def ellipsoid(name, position, scale, collection, mat, segments=32, rings=20):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=position)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    move_to_collection(obj, collection)
    obj.data.materials.append(mat)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return obj


def lathe_y(name, profile, collection, mat, segments=64, flatten=False):
    vertices = []
    for y, radius in profile:
        for index in range(segments):
            angle = index * math.tau / segments
            z = radius * math.sin(angle)
            if flatten:
                z = min(z, radius * 0.91)
            vertices.append((radius * math.cos(angle), y, z))
    faces = [tuple(range(segments))]
    for ring in range(len(profile) - 1):
        for index in range(segments):
            nxt = (index + 1) % segments
            faces.append((ring * segments + index, (ring + 1) * segments + index, (ring + 1) * segments + nxt, ring * segments + nxt))
    faces.append(tuple(range(len(profile) * segments - 1, (len(profile) - 1) * segments - 1, -1)))
    return mesh_object(name, vertices, faces, collection, mat)


def make_ipad(collection, mats):
    rounded_slab("AluminumBody", IPAD_WIDTH, IPAD_HEIGHT, IPAD_DEPTH, 0.36, 0, collection, mats["aluminum"])
    rounded_slab("PolishedFrontChamfer", IPAD_WIDTH - 0.012, IPAD_HEIGHT - 0.012, 0.021, 0.354, 0.091, collection, mats["edge"], bevel=0.006)
    rounded_slab("BlackGlassBezel", IPAD_WIDTH - 0.06, IPAD_HEIGHT - 0.06, 0.023, 0.332, 0.106, collection, mats["glass"], bevel=0.005)
    screen = surface("Screen", SCREEN_WIDTH, SCREEN_HEIGHT, 0.20, SCREEN_Z, collection, mats["screen"])
    screen["width"] = SCREEN_WIDTH
    screen["height"] = SCREEN_HEIGHT
    screen["front_z"] = SCREEN_Z
    screen["uv_contract"] = "GLB: left-top 0,0; right-bottom 1,1; CanvasTexture.flipY = false"
    ellipsoid("FrontCameraHousing", (0, IPAD_HEIGHT / 2 - 0.135, 0.120), (0.050, 0.050, 0.009), collection, mats["camera"])
    ellipsoid("FrontCameraLens", (0, IPAD_HEIGHT / 2 - 0.135, 0.126), (0.031, 0.031, 0.004), collection, mats["lens"])
    ellipsoid("FrontCameraReflection", (-0.009, IPAD_HEIGHT / 2 - 0.124, 0.130), (0.008, 0.005, 0.001), collection, mats["lens_glint"])
    ellipsoid("AmbientSensor", (-0.21, IPAD_HEIGHT / 2 - 0.136, 0.120), (0.020, 0.020, 0.003), collection, mats["camera"])
    # Edge furniture remains separate and editable in Blender.
    power = rounded_slab("PowerButton", 0.52, 0.083, 0.083, 0.040, 0.005, collection, mats["edge"], bevel=0.008)
    power.location = (-3.91, IPAD_HEIGHT / 2 + 0.001, 0)
    for index, x in enumerate((3.85, 3.10)):
        button = rounded_slab(f"VolumeButton{index + 1}", 0.55, 0.069, 0.074, 0.030, 0, collection, mats["edge"], bevel=0.008)
        button.location = (x, IPAD_HEIGHT / 2 - 0.001, 0)
    for side in (-1, 1):
        for bank in (-1, 1):
            for index in range(9):
                y = bank * 2.24 + (index - 4) * 0.092
                ellipsoid(f"Speaker_{side}_{bank}_{index}", (side * 4.999, y, 0), (0.003, 0.023, 0.024), collection, mats["camera"], segments=12, rings=8)
    # USB-C recess on the right side, with a thin metal insert.
    port = rounded_slab("USBCPort", 0.35, 0.075, 0.008, 0.035, 0, collection, mats["camera"], bevel=0.002)
    # Local width follows the side's Y axis; height fits within the body's Z depth.
    # Rotate the face normal toward +X, not -Y (which made the port pierce the bezel).
    port.rotation_euler = (math.pi / 2, 0, math.pi / 2)
    port.location = (5.002, 0, 0)
    insert = rounded_slab("USBCInsert", 0.24, 0.015, 0.008, 0.006, 0, collection, mats["edge"], bevel=0.002)
    insert.rotation_euler = port.rotation_euler
    insert.location = (5.007, 0, 0)
    camera_bump = rounded_slab("RearCameraBump", 0.58, 0.64, 0.047, 0.16, -0.113, collection, mats["edge"], bevel=0.012)
    camera_bump.location = (-4.42, IPAD_HEIGHT / 2 - 0.59, 0)
    ellipsoid("RearCameraLens", (-4.42, IPAD_HEIGHT / 2 - 0.58, -0.143), (0.195, 0.195, 0.016), collection, mats["camera"])
    for index in range(3):
        ellipsoid(f"SmartConnector{index + 1}", ((index - 1) * 0.22, -IPAD_HEIGHT / 2 + 0.68, -0.101), (0.045, 0.045, 0.003), collection, mats["edge"])


def make_pencil(collection, mats):
    lathe_y("PencilTip", [(0, 0.004), (0.018, 0.012), (0.075, 0.027), (0.18, 0.053), (0.31, 0.088), (0.345, 0.090)], collection, mats["tip"])
    lathe_y("PencilCollar", [(0.316, 0.090), (0.322, 0.098), (0.370, 0.102), (0.375, 0.104)], collection, mats["white"])
    lathe_y("PencilBarrel", [(0.365, 0.104), (0.391, 0.112), (0.43, 0.115), (4.30, 0.115), (4.39, 0.105), (4.46, 0.071), (PENCIL_LENGTH, 0.008)], collection, mats["white"], flatten=True)
    lathe_y("PencilCapSeam", [(4.302, 0.1152), (4.310, 0.1147)], collection, mats["seam"], flatten=True)


def export_collection(collection, filename):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in collection.objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = next(iter(collection.objects))
    bpy.ops.export_scene.gltf(filepath=str(OUTPUT / filename), export_format="GLB", use_selection=True, export_yup=False, export_apply=True, export_extras=True, export_cameras=False, export_lights=False)


def setup_preview(collection):
    # A camera and studio lights make the .blend immediately usable by artists.
    bpy.ops.object.camera_add(location=(10, -12, 16))
    camera = bpy.context.object
    camera.name = "StudioPreviewCamera"
    camera.rotation_euler = (Vector((0, 0, 0)) - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 13
    bpy.context.scene.camera = camera
    move_to_collection(camera, collection)
    for name, position, energy, size in (("LargeSoftbox", (-3, 1, 9), 1100, 9), ("EdgeSoftbox", (5, 6, 4), 800, 7)):
        bpy.ops.object.light_add(type="AREA", location=position)
        lamp = bpy.context.object
        lamp.name = name
        lamp.data.energy = energy
        lamp.data.shape = "DISK"
        lamp.data.size = size
        lamp.rotation_euler = (-lamp.location).to_track_quat("-Z", "Y").to_euler()
        move_to_collection(lamp, collection)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1200
    scene.render.resolution_y = 900
    scene.render.resolution_percentage = 100
    scene.world.color = (0.18, 0.18, 0.18)
    scene.view_settings.view_transform = "AgX"


def main():
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for collection in list(bpy.data.collections):
        bpy.data.collections.remove(collection)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    collections = {}
    for name in ("iPad", "ApplePencil", "Studio"):
        collections[name] = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(collections[name])
    mats = {
        "aluminum": material("Satin silver aluminum", (0.40, 0.43, 0.47), metallic=0.87, roughness=0.29),
        "edge": material("Diamond cut aluminum", (0.62, 0.65, 0.69), metallic=0.96, roughness=0.20),
        "glass": material("Obsidian cover glass", (0.004, 0.006, 0.009), metallic=0.05, roughness=0.11),
        "screen": material("Display placeholder - replace in Three.js", (0.002, 0.004, 0.006), roughness=0.13),
        "camera": material("Camera and recess black", (0.006, 0.007, 0.010), roughness=0.35),
        "lens": material("Sapphire camera glass", (0.016, 0.035, 0.047), metallic=0.4, roughness=0.11),
        "lens_glint": material("Camera blue reflection", (0.05, 0.14, 0.23), metallic=0.5, roughness=0.17),
        "white": material("Pencil warm white polymer", (0.91, 0.91, 0.88), roughness=0.30),
        "tip": material("Pencil ceramic tip", (0.80, 0.80, 0.76), roughness=0.42),
        "seam": material("Pencil cap seam", (0.66, 0.67, 0.66), roughness=0.40),
    }
    make_ipad(collections["iPad"], mats)
    make_pencil(collections["ApplePencil"], mats)
    export_collection(collections["iPad"], "ipad.glb")
    export_collection(collections["ApplePencil"], "apple-pencil.glb")
    setup_preview(collections["Studio"])
    # Props share animation-friendly origins in exports; in the .blend, hide the
    # pencil so the default viewport is an unobstructed tablet view.
    for name in ("ApplePencil",):
        collections[name].hide_viewport = True
        collections[name].hide_render = True
    bpy.context.scene["coordinate_contract"] = "X right, Y up, Z front; GLB export_yup=False"
    bpy.context.scene["screen_dimensions"] = [SCREEN_WIDTH, SCREEN_HEIGHT, SCREEN_Z]
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / "ipad-showcase.blend"))
    for filename in ("ipad.glb", "apple-pencil.glb"):
        print(f"EXPORTED {filename}: {(OUTPUT / filename).stat().st_size:,} bytes")


if __name__ == "__main__":
    main()
