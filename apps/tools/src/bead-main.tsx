import { createBeadApplication } from "$/BeadApp";
import { mountToolApplication } from "$/bootstrap";
void mountToolApplication("beads-root", createBeadApplication, import.meta.hot);
if (import.meta.hot) import.meta.hot.accept();
