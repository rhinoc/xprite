import { ContextBar } from "$/components/tools/context-bar";

/** Context fields retain their horizontal reading and editing direction. */
export function EditorContextBar({ flow = false }: { flow?: boolean } = {}) {
  return (
    <div style={{ width: "100%", height: flow ? "auto" : "100%", minWidth: 0, minHeight: 0 }}>
      <ContextBar flow={flow} />
    </div>
  );
}
