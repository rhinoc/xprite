import { mountToolApplication } from "$/bootstrap";
import { createFixAiPixelArtApplication } from "$/FixAiPixelArtApp";
void mountToolApplication("fix-ai-root", createFixAiPixelArtApplication, import.meta.hot);
if (import.meta.hot) import.meta.hot.accept();
