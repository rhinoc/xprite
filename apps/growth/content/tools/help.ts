/** Help note shown beside a tool: an introduction, task sections and a closing paragraph. */
export interface ToolHelpContent {
  readonly title: string;
  readonly introduction: string;
  readonly sections: readonly {
    readonly id: string;
    readonly title: string;
    readonly steps: readonly string[];
    readonly notes: string;
  }[];
  readonly closing: string;
}
