import { createViewerApplication } from "$/App";
import { mountToolApplication } from "$/bootstrap";

void mountToolApplication("viewer-root", createViewerApplication, import.meta.hot);
if (import.meta.hot) import.meta.hot.accept();
