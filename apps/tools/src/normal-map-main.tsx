import { mountToolApplication } from "$/bootstrap";
import { createNormalMapApplication } from "$/NormalMapApp";

void mountToolApplication("normal-map-root", createNormalMapApplication, import.meta.hot);
if (import.meta.hot) import.meta.hot.accept();
