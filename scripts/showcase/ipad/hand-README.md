# Editable showcase hand

The hand comes from the MIT-licensed WebXR Input Profiles `generic-hand/right.glb` anatomical mesh and bone weights. `hand-source.glb` is the unchanged 94 KB upstream file; its license is in `hand-source-LICENSE.txt` and the public asset attribution record.

Run from the repository root:

```sh
blender --background --python scripts/showcase/ipad/hand-pose.py
```

This imports the source, preserves its original weighted hand topology, curls the fingers with the source skeleton, smoothly extends the wrist mesh into a forearm, adds conformal index and thumb nail surfaces, and exports the posed presentation mesh to `apps/growth/public/showcase/ipad/hand.glb`. No runtime skinning library is needed.

Open `hand-tap.blend` to edit the complete weighted hand, its `HandRig` pose bones, materials, nails, preview camera, and lights. `CURL_DEGREES`, `WRIST_LIFT_DEGREES`, and `SCALE` in `hand-pose.py` are the repeatable art-direction controls. The generated nail surfaces should be regenerated after changing finger curl angles. Manual Blender edits should be saved under a different name before rerunning the script.

The GLB preserves X right, Y toward the wrist, and Z toward the back of the hand. The index finger pad touches `(0, 0, 0)`; the other fingers curl toward the palm and stay above the screen contact plane. The extended forearm continues past the camera frame. At scale 1, the palm is approximately 2.4 units wide, and the fingertip-to-wrist distance is approximately 5.7 units. Runtime rotations should preserve this palm-down contact pose: rotate around Z for entry direction and use a small translation along Z for the press.

`hand-preview.png` and `hand-preview-top.png` are Blender previews with a screen contact plane and softbox lighting. They are generated review images, separate from the website's visual-regression baselines.
