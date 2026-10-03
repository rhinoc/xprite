const FRAME_COUNT = 18;
const FRAME_SIZE = 7;
const FRAME_DURATION_MS = 100;
const LOOP_DURATION_MS = FRAME_COUNT * FRAME_DURATION_MS;
const REDUCED_MOTION_FRAME = 9;

const spriteSheet = new Image();
spriteSheet.src = `${import.meta.env.BASE_URL}startup-loading.webp?v=xprite-2`;
const spriteSheetReady = spriteSheet.decode().then(
  () => true,
  () => false,
);

export function startStartupAnimation(canvas: HTMLCanvasElement, startedAt: number): () => void {
  const context = canvas.getContext("2d");
  if (!context) return () => {};

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let frameRequest = 0;
  let previousFrame = -1;
  let stopped = false;
  let ready = false;
  let observer: MutationObserver | undefined;

  const drawFrame = (timestamp: number) => {
    if (stopped || !ready) return;

    const elapsed = Math.max(0, timestamp - startedAt);
    const frame = reducedMotion.matches
      ? REDUCED_MOTION_FRAME
      : Math.floor((elapsed % LOOP_DURATION_MS) / FRAME_DURATION_MS);

    if (frame !== previousFrame) {
      context.clearRect(0, 0, FRAME_SIZE, FRAME_SIZE);
      context.drawImage(
        spriteSheet,
        frame * FRAME_SIZE,
        0,
        FRAME_SIZE,
        FRAME_SIZE,
        0,
        0,
        FRAME_SIZE,
        FRAME_SIZE,
      );
      previousFrame = frame;
    }

    if (!reducedMotion.matches) frameRequest = requestAnimationFrame(drawFrame);
  };

  const startWhenReady = () => {
    void spriteSheetReady.then((loaded) => {
      if (stopped || !loaded) return;
      ready = true;
      drawFrame(performance.now());
    });
  };

  const onMotionPreferenceChange = () => {
    cancelAnimationFrame(frameRequest);
    previousFrame = -1;
    if (ready) frameRequest = requestAnimationFrame(drawFrame);
  };

  const stop = () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(frameRequest);
    reducedMotion.removeEventListener("change", onMotionPreferenceChange);
    observer?.disconnect();
  };

  reducedMotion.addEventListener("change", onMotionPreferenceChange);
  observer = new MutationObserver(() => {
    if (!canvas.isConnected) stop();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  startWhenReady();

  return stop;
}
