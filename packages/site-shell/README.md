# Public desktop shell

`@xprite/site-shell` shares public-page desktop presentation across independent
apps. The editor does not depend on this package.

`DesktopManager` owns appearance and pattern preferences through a port.
Composition roots create the browser adapter; components use the manager-backed
`DesktopProvider` and `SiteMenubar`. The menu reuses `@xprite/ui` interaction,
keyboard navigation, popups and theme tokens. It has no document or editor state.

The rainbow menu opens Appearance, Language and Desktop pattern. Language
entries are supplied by each app only when another version exists. Current-page
commands follow the system menu. The application name at the far right opens
hierarchical navigation supplied by the data-only `@xprite/growth-content/navigation`
registry. The shell has no dependency on that registry or any app runtime.

Settings are saved under `xprite.site.desktop-preferences` for the current origin.
They update other public tabs and remain usable in memory when browser storage
is unavailable. Tools use the editor's saved appearance only as an initial value
when a public preference has not been selected. Gallery retains an independent
skin selector for UI demonstrations. Editor preferences are never written.

The startup script and tools' existing Light/Dark HTML variants select the same
initial appearance. Desktop pattern overrides change CSS, leaving the static
HTML and hydration geometry intact. Static document scopes receive the same
semantic tokens as React controls after appearance changes. Automatic restores
each page's authored pattern. The Desktop pattern submenu groups the curated
collection by System 7, System 7.5 and Mac OS 8. Two-color patterns expose a
modeless Pattern colors panel with a local preview, foreground/background picks,
hex entries, Swap, Original colors, Apply and Cancel. Apply saves the pair in the
same public preference record; it does not alter fixed-color resources. No preference schema migration is provided.

References: Apple’s [System 7.5 Upgrade Manual](https://manuals.plus/m/b5e76e006f1233c09948b2498f4e6351c97cb59a81475bf6a23283a59dc38011.pdf),
[Macintosh Human Interface Guidelines (1992)](https://vintageapple.org/inside_r/pdf/Human_Interface_Guidelines_1992.pdf),
and the locally archived Classic Macintosh UI Kit menu sheet (Brian Levy,
CC BY 4.0). Only behavior and layout were studied; no Apple document artwork or
menu source code was copied. Direct appearance/language/pattern choices and web
page navigation adapt that structure to the website; they are not original
System 7.5 commands. Existing fonts and licensed UI artwork are reused.
