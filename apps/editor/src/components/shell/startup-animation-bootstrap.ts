import { startStartupAnimation } from "$/components/shell/startup-animation";

const canvas = document.querySelector<HTMLCanvasElement>("#xse-startup-canvas");
const startedAt = Number(document.documentElement.dataset.xseStartupStartedAt);

if (canvas) {
  startStartupAnimation(canvas, Number.isFinite(startedAt) ? startedAt : performance.now());
}
