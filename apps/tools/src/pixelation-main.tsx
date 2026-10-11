import { mountToolApplication } from "$/bootstrap";
import { createPixelationApplication } from "$/PixelationApp";
void mountToolApplication("pixelation-root", createPixelationApplication, import.meta.hot);
if (import.meta.hot) import.meta.hot.accept();
