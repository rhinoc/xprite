import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { asepriteTheme } from "$/base/theme/themes/aseprite";
import { macintoshTheme } from "$/base/theme/themes/macintosh";
import { Button } from "$/components/button/Button";
import { ButtonVariant } from "$/components/button/types";
import { UIProvider, loadUiThemeSnapshot } from "$/components/theme/appearance";

async function render(children: ReturnType<typeof createElement>, theme = asepriteTheme) {
  const initialTheme = await loadUiThemeSnapshot("light", theme);
  return renderToStaticMarkup(createElement(UIProvider, { theme, initialTheme, children }));
}

describe("one Button family with native action and navigation semantics", () => {
  it.each([asepriteTheme, macintoshTheme])("renders native links in $label", async (theme) => {
    const html = await render(
      createElement(Button, {
        href: "https://xprite.cc/editor",
        target: "_blank",
        rel: "noopener",
        text: "Open editor",
        slots: { trailing: "↗" },
      }),
      theme,
    );
    expect(html).toContain("<a ");
    expect(html).toContain('href="https://xprite.cc/editor"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('data-variant="standard"');
    expect(html).not.toContain('role="button"');
  });

  it("renders an action as a button when no URL is provided", async () => {
    const html = await render(
      createElement(Button, {
        variant: ButtonVariant.Standard,
        text: "Apply",
        slots: { trailing: "↗" },
      }),
    );
    expect(html).toContain("<button ");
    expect(html).toContain('type="button"');
    expect(html).toContain('data-variant="standard"');
    expect(html).not.toContain("<a ");
  });

  it("removes navigation and keyboard focus from a disabled link", async () => {
    const html = await render(
      createElement(Button, {
        href: "https://xprite.cc/editor",
        disabled: true,
        text: "Open editor",
      }),
    );
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('tabindex="-1"');
    expect(html).not.toContain("href=");
  });
});
