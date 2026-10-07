import { createReactSsgRenderer } from "../../../infra/react-ssg-renderer.ts";
import type { renderToolPage } from "../src/ssg.tsx";

export async function createSsgRenderer() {
  const result = await createReactSsgRenderer<{ renderToolPage: typeof renderToolPage }>({
    entry: "apps/tools/src/ssg.tsx",
    assetPrefix: "/tools/ssg-assets/",
    cacheDirectory: ".tmp/tools-ssg",
  });
  return { ...result, render: result.renderer.renderToolPage };
}
