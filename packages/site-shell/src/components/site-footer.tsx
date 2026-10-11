import { Disclosure, RichText, Text, TextRole, TextVariant } from "@xprite/ui";

import styles from "./site-footer.module.css";

export interface SiteFooterGroup {
  label: string;
  links: readonly { label: string; href: string }[];
}

export interface SiteFooterProps {
  groups: readonly SiteFooterGroup[];
  label?: string;
}

function FooterLinks({ group }: { group: SiteFooterGroup }) {
  return (
    <RichText className={styles.links}>
      <nav aria-label={group.label}>
        <ul>
          {group.links.map((link) => (
            <li key={link.href}>
              <a href={link.href}>{link.label}</a>
            </li>
          ))}
        </ul>
      </nav>
    </RichText>
  );
}

/** One navigation source supports columns and narrow-screen disclosures. */
export function SiteFooter({ groups, label = "Website navigation" }: SiteFooterProps) {
  return (
    <footer className={styles.footer} aria-label={label} data-site-footer>
      <div className={styles.columns}>
        {groups.map((group) => (
          <section key={group.label} className={styles.group}>
            <Text as="h2" variant={TextVariant.Reading} textRole={TextRole.Heading}>
              {group.label}
            </Text>
            <FooterLinks group={group} />
          </section>
        ))}
      </div>
      <div className={styles.disclosures}>
        {groups.map((group) => (
          <Disclosure key={group.label} title={group.label}>
            <FooterLinks group={group} />
          </Disclosure>
        ))}
      </div>
    </footer>
  );
}
