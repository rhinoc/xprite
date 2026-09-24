export function formatShortcutForPlatform(shortcut: string) {
  const platform = typeof navigator === "undefined" ? "" : navigator.platform;
  if (!/Mac|iPhone|iPad|iPod/i.test(platform)) return shortcut;

  return shortcut
    .split("+")
    .map((part) => {
      switch (part.trim().toLowerCase()) {
        case "cmd":
        case "meta":
          return "Cmd";
        case "alt":
          return "Opt";
        default:
          return part;
      }
    })
    .join("+");
}
