import { createAnimalCrossingApplication } from "$/AnimalCrossingApp";
import { mountToolApplication } from "$/bootstrap";

void mountToolApplication("animal-crossing-root", createAnimalCrossingApplication, import.meta.hot);
if (import.meta.hot) import.meta.hot.accept();
