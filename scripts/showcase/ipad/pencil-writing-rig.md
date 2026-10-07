# Editable Pencil writing rig

Open `pencil-writing-rig.blend` to adjust the held Pencil's three-dimensional
pose. The file contains the existing Pencil and tablet meshes, separate control
objects and a 30 fps control animation covering the 32-second film. The visible
blue curve is a trajectory guide for editing; the website still displays the
unchanged native Aseprite pixels.

| Control      | Edit                                                                                                               |
| ------------ | ------------------------------------------------------------------------------------------------------------------ |
| `TipContact` | Position of the nib. The writing segment follows `hello/motion.json` on the tablet's surface.                      |
| `Wrist`      | Slowly moving hand support. Moving it also moves its child `Grip`.                                                 |
| `Grip`       | The point where the implied fingers hold the barrel. `PencilAim` directs the shaft from the tip toward this point. |
| `BarrelRoll` | Local Y rotation of the flattened barrel around its shaft.                                                         |

The rig keeps the nib fixed while the grip rises and changes direction. Reaching
the upper parts of letters makes the shaft more upright; the lower strokes let
it lean again. The wrist moves more slowly than the nib. Stroke direction adds
small finger adjustments and roll without making the Pencil spin around each
loop like an arrow following a path.

The scene uses X right, Y up and Z toward the viewer, matching Three.js. The
Pencil's origin is the nib and its local +Y axis runs along the 4.5-unit shaft.
`PencilAim` has a `Damped Track` constraint aimed along +Y at `Grip`. The imported
mesh names and materials remain editable. Timeline markers identify entry,
contact, the end of writing and exit. Select a control and open the Graph Editor
to adjust its sampled curves; the runtime pose is deterministic at any film
time, so arbitrary seeking produces the same position and orientation.

Regenerate from the repository root with Blender and Node 24 or later:

```sh
blender --background --python scripts/showcase/ipad/create-pencil-writing-rig.py
```

The generator calls `pencil-writing-pose.ts` directly to sample the same pose
function used in the page. It does not maintain a second copy of the grip and
wrist formulas. The source curve, film layout mapping and the 30 fps sampling
remain explicit in the generator. For a code-driven change, edit the runtime
pose's named rig parameters and regenerate this file. For manual Blender art
changes, save a separate `.blend` before regenerating.

This command only writes `pencil-writing-rig.blend`. It does not replace the
public GLBs, source Aseprite documents, GIF, captured editor images or any
visual-audit baselines. The imported original Pencil and tablet meshes retain
the repository's GPL-2.0-only license.
