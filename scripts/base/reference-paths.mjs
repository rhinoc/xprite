import path from "node:path";
import { fileURLToPath } from "node:url";

export const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export const asepriteSourceRoot = path.join(repositoryRoot, ".refs/aseprite");
export const librespriteSourceRoot = path.join(repositoryRoot, ".refs/libresprite");
export const skiaRoot = path.join(repositoryRoot, ".refs/skia-arm64");

export const resolveAsepriteSource = (source) =>
  path.resolve(source ?? process.env.ASEPRITE_SOURCE ?? asepriteSourceRoot);

export const resolveLibreSpriteSource = (source) =>
  path.resolve(source ?? process.env.LIBRESPRITE_SOURCE ?? librespriteSourceRoot);

export const resolveAsepriteExecutable = (executable) =>
  path.resolve(
    executable ??
      process.env.ASEPRITE_BINARY ??
      process.env.ASEPRITE_APP ??
      path.join(asepriteSourceRoot, "build/bin/Aseprite.app/Contents/MacOS/aseprite"),
  );

export const resolveAsepriteAppBundle = (bundle) =>
  path.resolve(
    bundle ??
      process.env.ASEPRITE_APP_BUNDLE ??
      path.join(asepriteSourceRoot, "build/bin/Aseprite.app"),
  );

export const resolveSkiaRoot = (root) => path.resolve(root ?? process.env.SKIA_ROOT ?? skiaRoot);
