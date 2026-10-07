import { mountToolApplication } from "$/bootstrap";
import { createToolsHomeApplication } from "$/ToolsApp";

void mountToolApplication("tools-root", createToolsHomeApplication, import.meta.hot);
if (import.meta.hot) import.meta.hot.accept();
