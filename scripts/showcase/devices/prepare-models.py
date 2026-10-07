"""Prepare licensed device meshes for the showcase's X-right/Y-up/Z-front contract.

blender --background --python scripts/showcase/devices/prepare-models.py
Sources, authors, license, downloads, and transformations: README.md.
"""
import math
from pathlib import Path

import bpy
import bmesh
from mathutils import Matrix, Vector

SOURCE = Path(__file__).resolve().parent
ROOT = SOURCE.parents[2]
OUTPUT = ROOT / "apps/growth/public/showcase/ipad"
PHONE_ISLAND_CLEARANCE = 0.01
MODELS = (
    {"source": "macbook-pro-m3-16-2024.glb", "output": "macbook-pro.glb", "screen": "Object_123", "width": 9.6, "pitch": 0.32,
     "author": "jackbaeten", "url": "https://sketchfab.com/3d-models/macbook-pro-m3-16-inch-2024-8e34fc2b303144f78490007d91ff57c4"},
    {"source": "iphone-15-pro-max.glb", "output": "iphone.glb", "screen": "Object_4", "front_surface": True, "width": 3.38, "pitch": 0,
     "author": "MajdyModels (formerly MpPower)", "url": "https://sketchfab.com/3d-models/iphone-15-pro-max-5b7b35513a154ac69619dc2b2fe15686"},
)


def bounds(objects):
    points = [obj.matrix_world @ vertex.co for obj in objects for vertex in obj.data.vertices]
    return Vector([min(p[i] for p in points) for i in range(3)]), Vector([max(p[i] for p in points) for i in range(3)])


def prepare(item):
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(SOURCE / "source" / item["source"]))
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    screen = bpy.data.objects[item["screen"]]
    if item.get("front_surface"):
        # The phone author joined the display face to the back-panel object.
        # Object_9 is only its border ring, so isolate the actual front face.
        front_y = min((screen.matrix_world @ vertex.co).y for vertex in screen.data.vertices)
        selected = [polygon for polygon in screen.data.polygons
                    if (screen.matrix_world.to_3x3() @ polygon.normal).normalized().y < -0.99
                    and max((screen.matrix_world @ screen.data.vertices[index].co).y
                            for index in polygon.vertices) < front_y + 0.0001]
        indices = sorted({index for polygon in selected for index in polygon.vertices})
        remap = {old: new for new, old in enumerate(indices)}
        data = bpy.data.meshes.new("DisplaySurface")
        data.from_pydata([screen.matrix_world @ screen.data.vertices[index].co for index in indices], [],
                         [tuple(remap[index] for index in polygon.vertices) for polygon in selected])
        data.update()
        editable = bmesh.new()
        editable.from_mesh(screen.data)
        editable.faces.ensure_lookup_table()
        bmesh.ops.delete(editable, geom=[editable.faces[polygon.index] for polygon in selected], context="FACES")
        editable.to_mesh(screen.data)
        editable.free()
        screen = bpy.data.objects.new("DisplaySurface", data)
        bpy.context.scene.collection.objects.link(screen)
        meshes.append(screen)
    low, high = bounds([screen])
    # Both sources have a planar display in Blender X/Z, with the front toward -Y.
    uv = screen.data.uv_layers.active or screen.data.uv_layers.new(name="ScreenUV")
    for polygon in screen.data.polygons:
        for loop_index in polygon.loop_indices:
            vertex = screen.matrix_world @ screen.data.vertices[screen.data.loops[loop_index].vertex_index].co
            uv.data[loop_index].uv = ((vertex.x - low.x) / (high.x - low.x), (vertex.z - low.z) / (high.z - low.z))
    screen.name = "Screen"
    screen["display_aspect"] = (high.x - low.x) / math.hypot(high.y - low.y, high.z - low.z)
    screen["uv_contract"] = "GLB top-left 0,0; CanvasTexture.flipY=false"
    # Drop the source's wallpaper material; Xprite supplies its own display imagery.
    screen.data.materials.clear()
    placeholder = bpy.data.materials.new("Xprite display placeholder")
    placeholder.diffuse_color = (0.01, 0.01, 0.01, 1)
    screen.data.materials.append(placeholder)
    for obj in meshes:
        transform = obj.matrix_world.copy()
        obj.parent = None
        obj.matrix_world = Matrix.Identity(4)
        obj.data.transform(transform)
    for obj in list(bpy.context.scene.objects):
        if obj.type != "MESH":
            bpy.data.objects.remove(obj, do_unlink=True)
    rotation = Matrix.Rotation(-math.pi / 2 + item["pitch"], 4, "X")
    for obj in meshes:
        obj.data.transform(rotation)
    low, high = bounds(meshes)
    scale = item["width"] / (high.x - low.x)
    center = (low + high) / 2
    transform = Matrix.Scale(scale, 4) @ Matrix.Translation(-center)
    for obj in meshes:
        obj.data.transform(transform)
        obj["source_author"] = item["author"]
    if item.get("front_surface"):
        # The source cutout is almost coplanar with the display. A stable front
        # clearance prevents depth fighting when the showcase tilts the phone.
        island = bpy.data.objects["Object_43"]
        island.name = "DynamicIsland"
        offset = max(vertex.co.z for vertex in screen.data.vertices) + PHONE_ISLAND_CLEARANCE - max(vertex.co.z for vertex in island.data.vertices)
        island.data.transform(Matrix.Translation((0, 0, offset)))
        island["display_clearance"] = PHONE_ISLAND_CLEARANCE
    bpy.context.scene["source"] = item["url"]
    bpy.context.scene["license"] = "CC BY 4.0 — https://creativecommons.org/licenses/by/4.0/"
    bpy.context.scene["changes"] = "Normalized size/orientation; planar display UV; replaced display material; separated phone camera cutout from display to prevent depth fighting. Original device detail and body materials preserved."
    bpy.ops.file.pack_all()
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / item["output"].replace(".glb", ".blend")))
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(filepath=str(OUTPUT / item["output"]), export_format="GLB", use_selection=True,
        export_yup=False, export_apply=True, export_extras=True, export_image_format="WEBP",
        export_cameras=False, export_lights=False, export_animations=False)
    print("PREPARED", item["output"], "display aspect", screen["display_aspect"])


for item in MODELS:
    prepare(item)
