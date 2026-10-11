import styles from "$/components/articles/article.module.css";

/** Static article markup uses the same CSS Module compilation as the public UI. */
export function articleStyleClasses() {
  return {
    header: styles.header,
    skipLink: styles.skipLink,
    documents: styles.documents,
    directory: styles.directory,
    article: styles.article,
    readingStack: styles.readingStack,
    related: styles.related,
    tableScroll: styles.tableScroll,
  };
}
