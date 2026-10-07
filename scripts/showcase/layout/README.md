# Workspace layout recording

The landing page's workspace animation is recorded from the running editor with
real pointer input. It shows dragging Timeline from the bottom to the right,
resizing the docked pane, and dragging it back to the bottom. English and Chinese
have separate captures; menus and panel labels are native editor text.

Use `pnpm run dev:editor`'s existing port 5173 and one Ego Browser TaskSpace.
The recording origin is `http://layout-demo.localhost:5173/editor`, isolated from
the ordinary editor workspace. Open the bundled `example.aseprite`, leave its
animation paused, and toggle Workspace layout to expose panel handles. Set the
language with the real Preferences dialog. Start with Timeline at the bottom.
No editor preferences, storage, or document state are injected by the recorder.

From an Ego Browser Node.js round, resume the recording's TaskSpace and import:

```js
const { recordWorkspaceLayout } =
  await import("/absolute/repository/scripts/showcase/layout/record-layout.mjs");
await recordWorkspaceLayout(page, {
  directory: "/absolute/repository/.tmp/showcase-layout/en",
  language: "en",
});
```

Use `zh-CN` for the Chinese version. The helper requests a 1080 × 720 native
viewport at DPR 1, reads targets through the shared geometry boundary, and saves
unaltered compositor PNG frames with monotonic capture timestamps. It operates
real panel handles and splitters; it does not reconstruct the UI or synthesize
layout transitions. `recording.json` stores action and frame times;
`frames.ffconcat` preserves their recorded durations for encoding.

Encode the frames with FFmpeg, keeping the original pixel dimensions:

```sh
ffmpeg -y -f concat -safe 0 -i .tmp/showcase-layout/en/frames.ffconcat \
  -filter_complex '[0:v]fps=10,split[a][b];[a]palettegen=reserve_transparent=0[p];[b][p]paletteuse=dither=none:diff_mode=rectangle' \
  -loop 0 apps/growth/public/showcase/workspace-layout/en/layout.gif
ffmpeg -y -f concat -safe 0 -i .tmp/showcase-layout/en/frames.ffconcat \
  -vf fps=10 -c:v libvpx-vp9 -crf 24 -b:v 0 -an -pix_fmt yuv420p \
  apps/growth/public/showcase/workspace-layout/en/layout.webm
```

Repeat for `zh-CN`. Copy the first captured PNG unchanged to `poster.png`.
The GIF uses the format's 256-color palette; WebM is an alternate delivery.
The page loads its language's GIF lazily and chooses the still poster when the
browser requests reduced motion. Capture metadata and asset hashes are stored
alongside each delivery in `capture.json`; raw frames stay in `.tmp/`.
