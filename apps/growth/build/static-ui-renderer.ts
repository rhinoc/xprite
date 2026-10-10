import { createReactSsgRenderer } from "../../../infra/react-ssg-renderer.ts";
import type { articleStyleClasses, preparePublicUi } from "../src/public-ssg.tsx";

export const PUBLIC_UI_ASSET_PREFIX = "/theme/ssg-assets/";
let render: Awaited<ReturnType<typeof preparePublicUi>> | undefined;
let articleClasses: ReturnType<typeof articleStyleClasses> | undefined;
export async function createPublicUiRenderer() {
  const result = await createReactSsgRenderer<{
    preparePublicUi: typeof preparePublicUi;
    articleStyleClasses: typeof articleStyleClasses;
  }>({
    entry: "apps/growth/src/public-ssg.tsx",
    assetPrefix: PUBLIC_UI_ASSET_PREFIX,
    cacheDirectory: ".tmp/growth-ssg",
  });
  render = await result.renderer.preparePublicUi();
  articleClasses = result.renderer.articleStyleClasses();
  return result;
}
export function publicArticleClasses() {
  if (!articleClasses)
    throw new Error("Public UI renderer must be initialized before rendering articles.");
  return articleClasses;
}
export function renderPublicUi(
  kind: Parameters<NonNullable<typeof render>>[0],
  props: Record<string, unknown>,
) {
  if (!render) throw new Error("Public UI renderer must be initialized before rendering pages.");
  return render(kind, props);
}
