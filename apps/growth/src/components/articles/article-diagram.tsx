import {
  ArticleDiagramKind,
  type ArticleDiagramNode,
  type ArticleDiagramSpec,
} from "$content/articles/diagram";

import {
  Button,
  ButtonAppearance,
  ContentPadding,
  Panel,
  PanelVariant,
  SurfaceTone,
  Text,
  TextRole,
  TextVariant,
} from "@xprite/ui";

import styles from "$/components/articles/article-diagram.module.css";

function DiagramNode({ node }: { node: ArticleDiagramNode }) {
  const label = (
    <Text variant={TextVariant.Reading} wrap>
      {node.label}
    </Text>
  );
  return (
    <div className={styles.nodeCopy}>
      {node.href ? (
        <Button href={node.href} appearance={ButtonAppearance.Quiet} slots={{}}>
          {label}
        </Button>
      ) : (
        label
      )}
      {node.detail && (
        <Text variant={TextVariant.Reading} textRole={TextRole.Caption} wrap>
          {node.detail}
        </Text>
      )}
    </div>
  );
}

export function PublicArticleDiagram({ diagram }: { diagram: ArticleDiagramSpec }) {
  return (
    <figure className={styles.diagram}>
      <figcaption className={styles.caption}>
        <Text variant={TextVariant.Reading} textRole={TextRole.Caption} wrap>
          {diagram.label}
        </Text>
      </figcaption>
      <div className={styles.scroll} role="region" aria-label={diagram.label} tabIndex={0}>
        {diagram.kind === ArticleDiagramKind.Map ? (
          <div className={styles.map}>
            <Panel
              variant={PanelVariant.Group}
              tone={SurfaceTone.Informative}
              contentPadding={ContentPadding.Compact}
              className={styles.rootNode}
            >
              <DiagramNode node={{ label: diagram.root }} />
            </Panel>
            <ul className={styles.branches}>
              {diagram.branches.map((branch) => (
                <li key={branch.label} className={styles.branch}>
                  <Panel
                    variant={PanelVariant.Group}
                    contentPadding={ContentPadding.Compact}
                    tone={branch.featured ? SurfaceTone.Positive : SurfaceTone.Neutral}
                    title={
                      <Text variant={TextVariant.Reading} textRole={TextRole.Caption}>
                        {branch.label}
                      </Text>
                    }
                  >
                    <ul className={styles.items}>
                      {branch.items.map((item) => (
                        <li key={item.label}>
                          <DiagramNode node={item} />
                        </li>
                      ))}
                    </ul>
                  </Panel>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <ol className={styles.flow}>
            {diagram.steps.map((step) => (
              <li key={step.label} className={styles.step}>
                <Panel
                  variant={PanelVariant.Group}
                  contentPadding={ContentPadding.Compact}
                  tone={SurfaceTone.Neutral}
                  className={styles.stepNode}
                >
                  <DiagramNode node={step} />
                </Panel>
              </li>
            ))}
          </ol>
        )}
      </div>
    </figure>
  );
}
