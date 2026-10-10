export const ARTICLE_DIAGRAM_LANGUAGE = "article-diagram";

export enum ArticleDiagramKind {
  Map = "map",
  Flow = "flow",
}

export interface ArticleDiagramNode {
  label: string;
  detail?: string;
  href?: string;
}

interface ArticleDiagramBranch {
  label: string;
  featured?: boolean;
  items: ArticleDiagramNode[];
}

export type ArticleDiagramSpec =
  | {
      kind: ArticleDiagramKind.Map;
      label: string;
      root: string;
      branches: ArticleDiagramBranch[];
    }
  | {
      kind: ArticleDiagramKind.Flow;
      label: string;
      steps: ArticleDiagramNode[];
    };

const ARTICLE_DIAGRAM_LINK = /^(?:https?:\/\/|#|\/(?!\/))/i;

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new TypeError("Article diagram entries must be objects.");
  return value as Record<string, unknown>;
}

function label(value: unknown): string {
  if (typeof value !== "string" || !value.trim())
    throw new TypeError("Article diagram entries need a label.");
  return value;
}

function entries(value: unknown): unknown[] {
  if (!Array.isArray(value) || !value.length)
    throw new TypeError("Article diagrams need at least one entry.");
  return value;
}

function node(value: unknown): ArticleDiagramNode {
  const item = record(value);
  if (
    item.href !== undefined &&
    (typeof item.href !== "string" || !ARTICLE_DIAGRAM_LINK.test(item.href))
  )
    throw new TypeError("Article diagram links must be website URLs or section links.");
  return {
    label: label(item.label),
    detail: item.detail === undefined ? undefined : label(item.detail),
    href: item.href as string | undefined,
  };
}

export function parseArticleDiagram(source: string): ArticleDiagramSpec {
  const diagram = record(JSON.parse(source));
  const diagramLabel = label(diagram.label);
  if (diagram.kind === ArticleDiagramKind.Flow)
    return {
      kind: ArticleDiagramKind.Flow,
      label: diagramLabel,
      steps: entries(diagram.steps).map(node),
    };
  if (diagram.kind !== ArticleDiagramKind.Map)
    throw new TypeError(`Unsupported article diagram: ${String(diagram.kind)}`);
  return {
    kind: ArticleDiagramKind.Map,
    label: diagramLabel,
    root: label(diagram.root),
    branches: entries(diagram.branches).map((value) => {
      const branch = record(value);
      if (branch.featured !== undefined && typeof branch.featured !== "boolean")
        throw new TypeError("Article diagram emphasis must be a boolean.");
      return {
        label: label(branch.label),
        featured: branch.featured as boolean | undefined,
        items: entries(branch.items).map(node),
      };
    }),
  };
}
