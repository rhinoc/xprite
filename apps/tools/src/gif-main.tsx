import { mountToolApplication } from "$/bootstrap";
import { createGifSheetApplication } from "$/GifApp";

void mountToolApplication("gif-sheet-root", createGifSheetApplication, import.meta.hot);
if (import.meta.hot) import.meta.hot.accept();
