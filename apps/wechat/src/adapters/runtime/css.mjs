/** Evaluate compiled container rules against native measurements of the original containers. */
export function installWechatContainerRules(host, geometry, nativeApi) {
  const source = nativeApi
    .getFileSystemManager()
    .readFileSync("/common/native-container-rules.json", "utf8");
  const rules = JSON.parse(source);
  const observers = new Map();
  const isContainer = (element) =>
    rules.containers.some((selector) =>
      Array.from(host.document.querySelectorAll(selector)).includes(element),
    );
  function refresh() {
    for (const element of host.document.querySelectorAll("*")) {
      if (!element.classList.contains("xprite-node")) element.classList.add("xprite-node");
      for (const rule of rules.attributes ?? []) {
        const value = element.getAttribute(rule.attribute);
        let enabled = value !== null;
        if (enabled && rule.operator) {
          const content = String(value),
            expected = rule.value ?? "";
          switch (rule.operator) {
            case "=":
              enabled = content === expected;
              break;
            case "*=":
              enabled = content.includes(expected);
              break;
            case "^=":
              enabled = content.startsWith(expected);
              break;
            case "$=":
              enabled = content.endsWith(expected);
              break;
            case "~=":
              enabled = content.split(/\s+/).includes(expected);
              break;
            case "|=":
              enabled = content === expected || content.startsWith(expected + "-");
              break;
          }
        }
        if (element.classList.contains(rule.className) !== enabled)
          element.classList.toggle(rule.className, enabled);
      }
    }
    for (const rule of rules.rules) {
      for (const selector of rule.selectors) {
        for (const element of host.document.querySelectorAll(selector)) {
          let container = element.parentElement;
          while (container && !isContainer(container)) container = container.parentElement;
          if (!container) continue;
          if (!observers.has(container)) {
            const observer = new host.ResizeObserver(refresh);
            observers.set(container, observer);
            observer.observe(container);
          }
          let rect;
          try {
            rect = geometry.provider.clientRect(container);
          } catch {
            continue;
          }
          const enabled = rule.mode === "max" ? rect.width <= rule.width : rect.width >= rule.width;
          element.classList.toggle(rule.className, enabled);
        }
      }
    }
  }
  const unsubscribe = geometry.subscribe(refresh);
  host.document.documentElement.addEventListener("$$childNodesUpdate", refresh);
  return {
    dispose() {
      unsubscribe();
      host.document.documentElement.removeEventListener("$$childNodesUpdate", refresh);
      for (const observer of observers.values()) observer.disconnect();
    },
  };
}
