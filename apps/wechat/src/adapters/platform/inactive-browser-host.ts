/** The native entry must inject its host; browser composition is never selected. */
export function createBrowserEditorHostPorts(): never {
  throw new Error("The WeChat application requires its native editor host.");
}
