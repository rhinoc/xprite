# itch.io distribution

The itch.io build is a static HTML application with relative asset URLs and hash
routes (`#/home` and `#/editor`). It keeps the CDN directory and `index.html`
path intact when switching views. The existing EdgeOne build and deployment
commands remain separate.

## Build and package

Use Node 24, the repository's pnpm version, and Python 3 (for ZIP packaging).
Run these commands from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm run itch:pack
```

`itch:pack` builds through the existing root `build:editor` pipeline, then creates
`.tmp/itch/xprite-itch.zip`. Its `index.html` is at the ZIP root; JavaScript,
workers, styles, runtime assets and license notices are included. Intermediate
static files are in `.tmp/itch/editor/`, separate from `apps/editor/dist/`.
Run `pnpm run build:itch` when only the static directory is needed.

The packer rejects symlinks, hidden files, source maps and installation/offline
files. It checks itch.io's HTML limits: at most 1,000 files, paths up to 240
characters, individual files up to 200 MB and total extracted content up to
500 MB. Byte limits use decimal MB conservatively.

The itch.io build disables Service Worker registration and removes the install
manifest and mobile installation metadata. Offline caching and app installation
belong to the standalone website. Cross-origin frames use the existing file-input
and file-download flows rather than native file-system pickers.

Optional public `VITE_POSTHOG_PROJECT_TOKEN` / `VITE_POSTHOG_REGION` settings still
apply at build time. Source map generation and uploads are disabled for this
distribution, even when the shell has PostHog CLI credentials. Build metadata in
`release.json` records the package version and release; set `POSTHOG_RELEASE`
before building if a commit SHA should identify the artifact.

## First upload

1. Create an itch.io project and choose **HTML** as the project kind. Describe
   Xprite as a pixel art tool.
2. Upload `.tmp/itch/xprite-itch.zip` and select **This file will be played in the
   browser**.
3. Choose **Click to launch in fullscreen** under Embed options. This gives the
   editor room for the canvas and panels. Fullscreen still uses an embedded page.
4. Keep the project in Draft while checking the interactions below. Enable
   **Mobile Friendly** only after checking the mobile experience.
5. Include a link to the matching source revision and retain the bundled license
   and attribution notices, then publish the project when ready.

Do not upload the containing `editor/` directory as the ZIP root, upload source
files or `.env` files, or use the EdgeOne preparation/publish commands for this
distribution.

## Subsequent uploads with butler

Install the official itch.io butler CLI and authenticate once with `butler login`.
After building or packaging the desired revision:

```sh
pnpm run deploy:itch your-username/xprite
```

This performs a real upload of `.tmp/itch/editor/` to the project's `html`
channel. It does not rebuild. The build's recorded package version is passed as
`--userversion`; repeated pushes update the same channel. For CI, butler accepts
`BUTLER_API_KEY` through the environment; keep it in a secret, outside the static
artifact.

After the first butler push, select **This file will be played in the browser**
for that channel on the itch.io edit page and ensure the project kind is **HTML**.
Naming a channel `html` does not set those options automatically. Save the page.

## Browser acceptance on the actual itch.io page

- Launch the editor and confirm icons, fonts, default artwork and the user guide
  load without asset errors.
- Switch between Home and the editor; use Back/Forward and reload. The application
  should stay under its original CDN path with `#/home` or `#/editor`.
- Open PNG and Aseprite files through **File → Open**. Save to **File Manager**
  and export PNG and an animation; confirm downloads contain the edited work.
- Save to **Browser**, reopen from Recent files, and check recovery after reload.
  Storage depends on the browser's third-party storage policy; use file downloads
  to move projects between the itch.io editor and the standalone website.
- Check clipboard paste. If the browser disallows reading external images,
  use **File → Open**, then copy and paste inside the editor.
- Check fullscreen, panel resizing, shortcuts, and touch input on intended devices.

## Sources

- [itch.io HTML5 upload requirements and embed options](https://itch.io/docs/creators/html5)
- [butler uploads and HTML channel configuration](https://itch.io/docs/butler/pushing.html)
- [Browser save picker restrictions](https://developer.mozilla.org/en-US/docs/Web/API/Window/showSaveFilePicker)

The local Tiled reference (`.refs/tiled/dist/linux/push-to-itch.sh`) also uses
butler channels and `--userversion`. It distributes native builds; its implementation
was not copied. Xprite's ZIP packaging follows the existing mini-tool packer's
Python ZIP workflow.
