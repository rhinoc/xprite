"""Pose the MIT WebXR generic right hand for a fingertip tap.

Run from the repository root:
    blender --background --python scripts/showcase/ipad/hand-pose.py
The original weighted mesh and editable pose stay in hand-tap.blend.
The exported GLB is a baked presentation mesh; +Y runs toward the wrist,
+Z is the back of the hand, and the index finger pad touches the origin.
"""
from pathlib import Path
import math
import hashlib
import bpy
import bmesh
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
ASSETS = ROOT / 'apps/growth/public/showcase/ipad'
SOURCE = HERE / 'hand-source.glb'
SCALE = 28.0
CURL_DEGREES = {
    'index-finger': (0, 7, 7, 0),
    'middle-finger': (55, 50, 20, 0),
    'ring-finger': (58, 55, 22, 0),
    'pinky-finger': (60, 55, 25, 0),
}
WRIST_LIFT_DEGREES = 44.0


def look_at(obj, target):
    forward = (Vector(target) - obj.location).normalized()
    right = forward.cross(Vector((0, 1, 0))).normalized()
    up = right.cross(forward).normalized()
    obj.rotation_euler = Matrix((right, up, -forward)).transposed().to_euler()


def pose_rotation(pivot, angle):
    return Matrix.Translation(pivot) @ Matrix.Rotation(math.radians(angle), 4, 'X') @ Matrix.Translation(-pivot)


def set_material(mesh):
    material = mesh.data.materials[0]
    material.name = 'HandSkin'
    material.use_nodes = True
    shader = material.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (0.60, 0.355, 0.24, 1)
    shader.inputs['Roughness'].default_value = 0.48
    shader.inputs['Subsurface Weight'].default_value = 0.065
    shader.inputs['Subsurface Radius'].default_value = (1.0, 0.45, 0.25)
    return material


def extend_forearm(mesh):
    """Continue the source mesh's open wrist ring, preserving its silhouette."""
    bm = bmesh.new(); bm.from_mesh(mesh.data)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=0.0001)
    wrist_cut = max(v.co.y for v in bm.verts) - 0.48
    bmesh.ops.bisect_plane(bm, geom=list(bm.verts) + list(bm.edges) + list(bm.faces), dist=0.00001, plane_co=(0, wrist_cut, 0), plane_no=(0, 1, 0), clear_outer=True)
    edges = [e for e in bm.edges if e.is_boundary and all(abs(v.co.y - wrist_cut) < 0.0001 for v in e.verts)]
    center = sum((v.co for v in set(v for e in edges for v in e.verts)), Vector()) / len(set(v for e in edges for v in e.verts))
    current = edges
    previous_distance = 0.0
    for distance, widen in ((0.4, 1.015), (1.5, 1.045), (3.5, 1.10), (6.5, 1.2), (10.0, 1.32)):
        result = bmesh.ops.extrude_edge_only(bm, edges=current)
        verts = [g for g in result['geom'] if isinstance(g, bmesh.types.BMVert)]
        for vert in verts:
            vert.co.y += distance - previous_distance
            vert.co.x = center.x + (vert.co.x - center.x) * widen
            vert.co.z = center.z + (vert.co.z - center.z) * (1 + (widen - 1) * 0.4)
        current = [g for g in result['geom'] if isinstance(g, bmesh.types.BMEdge) and all(v in verts for v in g.verts)]
        previous_distance = distance
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh.data);bm.free()
    if mesh.data.has_custom_normals: mesh.data.normals_split_custom_set([(0, 0, 0)] * len(mesh.data.loops))
    wrist = mesh.vertex_groups.get('wrist')
    for vertex in mesh.data.vertices:
        if vertex.co.y > center.y + 0.05: wrist.add([vertex.index], 1.0, 'REPLACE')


def create_scene():
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(SOURCE))
    armature = bpy.data.objects['Armature'];armature.name = 'HandRig'
    skin = bpy.data.objects['r_handMeshNode'];skin.name = 'HandSkin'
    # glTF import's X normal, -Z fingers become +Z dorsum, -Y fingers.
    basis = Matrix(((0, 1, 0, 0), (0, 0, 1, 0), (1, 0, 0, 0), (0, 0, 0, 1))) @ Matrix.Scale(SCALE, 4)
    skin.data.transform(basis);armature.data.transform(basis)
    # Imported custom bone-shape helper is not model geometry.
    for obj in list(bpy.data.objects):
        if obj.type == 'MESH' and obj != skin: bpy.data.objects.remove(obj, do_unlink=True)
    bpy.context.view_layer.update()
    set_material(skin);extend_forearm(skin)
    for polygon in skin.data.polygons:polygon.use_smooth=True
    for name, angles in CURL_DEGREES.items():
        deform = Matrix.Identity(4)
        for suffix, angle in zip(('phalanx-proximal', 'phalanx-intermediate', 'phalanx-distal', 'tip'), angles):
            bone = armature.pose.bones[f'{name}-{suffix}']
            pivot = bone.bone.head_local
            deform = deform @ pose_rotation(pivot, angle)
            bone.matrix = deform @ bone.bone.matrix_local
    # Thumb flexes gently inward beside the curled fingers.
    deform = Matrix.Identity(4)
    for suffix, angle in (('metacarpal', 4), ('phalanx-proximal', 18), ('phalanx-distal', 15), ('tip', 0)):
        bone = armature.pose.bones[f'thumb-{suffix}']
        deform = deform @ pose_rotation(bone.bone.head_local, angle)
        bone.matrix = deform @ bone.bone.matrix_local
    bpy.context.view_layer.update()
    # Tilt about the index tip; no palm-back flip is necessary at runtime.
    lift = Matrix.Rotation(math.radians(WRIST_LIFT_DEGREES), 4, 'X')
    armature.matrix_world = lift
    sub = skin.modifiers.new('Smooth anatomical topology', 'SUBSURF');sub.levels=1;sub.render_levels=1
    bpy.context.view_layer.update()
    evaluated = skin.evaluated_get(bpy.context.evaluated_depsgraph_get())
    coords = [skin.matrix_world @ vertex.co for vertex in evaluated.data.vertices]
    tip_bone = armature.matrix_world @ armature.pose.bones['index-finger-tip'].head
    near_tip = [co for co in coords if abs(co.x-tip_bone.x)<0.28 and abs(co.y-tip_bone.y)<0.85]
    contact = min(near_tip, key=lambda co:co.z)
    armature.location -= contact
    bpy.context.view_layer.update()
    anchor = bpy.data.objects.new('FingerContact', None);bpy.context.collection.objects.link(anchor)
    anchor.empty_display_type='SPHERE';anchor.empty_display_size=.08
    anchor['description']='Index finger pad touches XY plane at origin; dorsum +Z; wrist +Y.'
    armature['source']='immersive-web/webxr-input-profiles generic-hand/right.glb'
    armature['source_license']='MIT; Copyright (c) 2019 Amazon'
    armature['source_sha256']=hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    nails = create_nails(skin, armature)
    # Keep the source rig editable while exporting only a static evaluated mesh.
    evaluated = skin.evaluated_get(bpy.context.evaluated_depsgraph_get())
    baked_data = bpy.data.meshes.new_from_object(evaluated, depsgraph=bpy.context.evaluated_depsgraph_get())
    baked = bpy.data.objects.new('HandSkinExport', baked_data);bpy.context.collection.objects.link(baked)
    baked.matrix_world=skin.matrix_world.copy()
    bpy.ops.object.select_all(action='DESELECT');baked.select_set(True);anchor.select_set(True)
    for nail in nails: nail.select_set(True)
    bpy.context.view_layer.objects.active=baked
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.ops.export_scene.gltf(filepath=str(ASSETS/'hand.glb'), export_format='GLB', use_selection=True, export_yup=False, export_animations=False)
    print('HAND_LOWEST', tuple(min(baked.data.vertices, key=lambda v:v.co.z).co))
    print('HAND_BOUNDS', [(min(v.co[i] for v in baked.data.vertices),max(v.co[i] for v in baked.data.vertices)) for i in range(3)])
    bpy.data.objects.remove(baked, do_unlink=True)
    return armature, skin


def create_nails(skin, armature):
    """Thin conformal nail surfaces on the anatomical mesh, not ellipsoids."""
    graph = bpy.context.evaluated_depsgraph_get()
    evaluated = skin.evaluated_get(graph)
    vertices = [skin.matrix_world @ vertex.co for vertex in evaluated.data.vertices]
    tree = BVHTree.FromPolygons(vertices, [list(p.vertices) for p in evaluated.data.polygons])
    material = bpy.data.materials.new('NaturalNails');material.use_nodes=True
    shader = material.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value=(0.68, 0.42, 0.33, 1)
    shader.inputs['Roughness'].default_value=0.4
    nails=[]
    for prefix, name, half_width, half_length in (('index-finger','IndexNail',.145,.22),('thumb','ThumbNail',.14,.18)):
        distal=armature.pose.bones[f'{prefix}-phalanx-distal']
        tip=armature.pose.bones[f'{prefix}-tip']
        distal_world=armature.matrix_world @ distal.head
        tip_world=armature.matrix_world @ tip.head
        forward=(tip_world-distal_world).normalized()
        deformation=distal.matrix @ distal.bone.matrix_local.inverted()
        dorsal=(armature.matrix_world.to_3x3() @ deformation.to_3x3() @ Vector((0,0,1))).normalized()
        lateral=forward.cross(dorsal).normalized()
        dorsal=lateral.cross(forward).normalized()
        center=tip_world - forward*.055
        positions=[]
        for radius in (0, .5, 1):
            for index in range(32):
                angle=2*math.pi*index/32
                u=math.copysign(abs(math.cos(angle))**.65,math.cos(angle))*half_width*radius
                v=math.copysign(abs(math.sin(angle))**.65,math.sin(angle))*half_length*radius
                target=center+lateral*u+forward*v
                hit,normal,_,_=tree.ray_cast(target+dorsal, -dorsal, 2)
                positions.append(hit+normal*.009 if hit is not None else target)
        faces=[]
        for ring in range(2):
            for index in range(32):
                following=(index+1)%32
                faces.append((ring*32+index,(ring+1)*32+index,(ring+1)*32+following,ring*32+following))
        data=bpy.data.meshes.new(name);data.from_pydata(positions,[],faces);data.materials.append(material);data.update()
        bm=bmesh.new();bm.from_mesh(data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(data);bm.free()
        nail=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(nail)
        for polygon in data.polygons:polygon.use_smooth=True
        nail['description']='Conformal generated nail; rerun hand-pose.py after changing finger curls.'
        nails.append(nail)
    return nails


def configure_preview(armature, skin):
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=24
    scene.render.resolution_x=1200;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
    scene.world.color=(.16,.16,.16)
    scene.view_settings.view_transform='AgX'
    for name, position, power, size in (
        ('KeySoftbox',(-4,-2,9),800,7),('FillSoftbox',(5,6,6),500,5),('EdgeSoftbox',(-3,9,4),350,4)
    ):
        bpy.ops.object.light_add(type='AREA',location=position);light=bpy.context.object;light.name=name
        light.data.energy=power;light.data.shape='DISK';light.data.size=size;look_at(light,(.6,3,1))
    bpy.ops.mesh.primitive_plane_add(size=80,location=(0,0,-.025));floor=bpy.context.object;floor.name='PreviewContactPlane'
    material=bpy.data.materials.new('Preview ivory');material.diffuse_color=(.76,.72,.67,1);floor.data.materials.append(material)
    bpy.ops.object.camera_add(location=(6,-7,13));camera=bpy.context.object;camera.name='TapPreviewCamera';camera.data.type='ORTHO';camera.data.ortho_scale=10
    look_at(camera,(.45,3.4,1.2));scene.camera=camera
    scene.render.filepath=str(HERE/'hand-preview.png')
    bpy.ops.object.select_all(action='DESELECT');armature.select_set(True);bpy.context.view_layer.objects.active=armature
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(HERE/'hand-tap.blend'))
    bpy.ops.render.render(write_still=True)
    camera.location=(0,3.0,16);look_at(camera,(0,3.0,0));camera.data.ortho_scale=10
    scene.render.filepath=str(HERE/'hand-preview-top.png');bpy.ops.render.render(write_still=True)


if __name__=='__main__':
    configure_preview(*create_scene())
