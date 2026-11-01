import { createReactSsgRenderer, cursorStylesheet } from "../../../infra/react-ssg-renderer.ts";
import type {
  articleStyleClasses,
  landingStylesheet,
  preparePublicUi,
  publicCursorVariables,
} from "../src/public-ssg.tsx";

export const PUBLIC_UI_ASSET_PREFIX = "/theme/ssg-assets/";
let render: Awaited<ReturnType<typeof preparePublicUi>> | undefined;
let articleClasses: ReturnType<typeof articleStyleClasses> | undefined;
type PublicUiKind = Parameters<NonNullable<typeof render>>[0];
const PUBLIC_UI_PLACEHOLDER = /<!--public-ui:(\d+)-->/g;
const fragments = new Map<number, { kind: PublicUiKind; props: Record<string, unknown> }>();
let fragmentId = 0;
export async function createPublicUiRenderer() {
  const result = await createReactSsgRenderer<{
    preparePublicUi: typeof preparePublicUi;
    articleStyleClasses: typeof articleStyleClasses;
    publicCursorVariables: typeof publicCursorVariables;
    landingStylesheet: typeof landingStylesheet;
  }>({
    entry: "apps/growth/src/public-ssg.tsx",
    assetPrefix: PUBLIC_UI_ASSET_PREFIX,
    cacheDirectory: ".tmp/growth-ssg",
  });
  render = await result.renderer.preparePublicUi();
  articleClasses = result.renderer.articleStyleClasses();
  const cursors = cursorStylesheet(
    result.renderer.publicCursorVariables,
    result.assets,
    PUBLIC_UI_ASSET_PREFIX,
  );
  return { ...result, css: `${result.css}\n${cursors}\n${result.renderer.landingStylesheet()}` };
}

export function publicArticleClasses() {
  if (!articleClasses)
    throw new Error("Public UI renderer must be initialized before rendering articles.");
  return articleClasses;
}
export function renderPublicUi(kind: PublicUiKind, props: Record<string, unknown>) {
  if (!render) throw new Error("Public UI renderer must be initialized before rendering pages.");
  if (kind !== "page") {
    const id = fragmentId++;
    fragments.set(id, { kind, props });
    return `<!--public-ui:${id}-->`;
  }
  const resolveValue = (value: unknown, appearance: "light" | "dark"): unknown => {
    if (typeof value === "string")
      return value.replace(PUBLIC_UI_PLACEHOLDER, (_match, id) => {
        const fragment = fragments.get(Number(id));
        if (!fragment) throw new Error(`Missing public UI fragment ${id}`);
        return render!(
          fragment.kind,
          {
            language: props.language,
            ...(resolveValue(fragment.props, appearance) as Record<string, unknown>),
          },
          appearance,
        );
      });
    if (Array.isArray(value)) return value.map((item) => resolveValue(item, appearance));
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, resolveValue(item, appearance)]),
      );
    return value;
  };
  try {
    const light = render(kind, resolveValue(props, "light") as Record<string, unknown>, "light");
    const dark = render(kind, resolveValue(props, "dark") as Record<string, unknown>, "dark");
    return `${light}<template data-public-ui-dark>${dark}</template>`;
  } finally {
    fragments.clear();
    fragmentId = 0;
  }
}
