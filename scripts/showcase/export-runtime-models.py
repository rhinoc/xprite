"""Export full-detail runtime inputs without modifying the editable Blender sources."""
import argparse
import sys
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]


def export(objects, path):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.hide_set(False)
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.export_scene.gltf(
        filepath=str(path), export_format="GLB", use_selection=True,
        export_yup=False, export_apply=True, export_extras=True,
        export_image_format="WEBP", export_cameras=False,
        export_lights=False, export_animations=False,
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
    args.output.mkdir(parents=True, exist_ok=True)
    for name in ("macbook-pro", "iphone"):
        bpy.ops.wm.open_mainfile(filepath=str(ROOT / f"scripts/showcase/devices/{name}.blend"))
        export([obj for obj in bpy.context.scene.objects if obj.type == "MESH"], args.output / f"{name}.glb")
    bpy.ops.wm.open_mainfile(filepath=str(ROOT / "scripts/showcase/ipad/ipad-showcase.blend"))
    for name, collection in (("ipad", "iPad"), ("apple-pencil", "ApplePencil")):
        source = bpy.data.collections[collection]
        source.hide_viewport = False
        source.hide_render = False
        export(list(source.objects), args.output / f"{name}.glb")
    bpy.ops.wm.open_mainfile(filepath=str(ROOT / "scripts/showcase/ipad/hand-tap.blend"))
    skin = bpy.data.objects["HandSkin"]
    graph = bpy.context.evaluated_depsgraph_get()
    evaluated = skin.evaluated_get(graph)
    data = bpy.data.meshes.new_from_object(evaluated, depsgraph=graph)
    baked = bpy.data.objects.new("HandSkinExport", data)
    bpy.context.scene.collection.objects.link(baked)
    baked.matrix_world = skin.matrix_world.copy()
    export([baked, bpy.data.objects["FingerContact"], bpy.data.objects["IndexNail"], bpy.data.objects["ThumbNail"]], args.output / "hand.glb")


if __name__ == "__main__":
    main()
