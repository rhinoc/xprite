const REFERENCE_WIDTH = 1389;
const REFERENCE_HEIGHT = 970;
const STATUS_FOREGROUND = "#fff";
const STATUS_FONT =
  '-apple-system, BlinkMacSystemFont, "Helvetica Neue", "PingFang SC", sans-serif';
const STATUS = {
  inset: 16,
  centerY: 11.5,
  fontSize: 11.7,
  dateGap: 10,
  wifiRight: 94,
  wifiTop: 6,
  percentageRight: 47,
  batteryRight: 41,
  batteryTop: 6.4,
  batteryWidth: 23,
  batteryHeight: 10.4,
} as const;

export interface IpadStatusBarOptions {
  showTime: boolean;
  time: string;
  date: string;
}

/** Reconstructed shapes and spacing; no pixels from a personal device capture. */
export function drawIpadStatusBar(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  options: IpadStatusBarOptions,
): void {
  const scale = Math.min(width / REFERENCE_WIDTH, height / REFERENCE_HEIGHT);
  const logicalWidth = width / scale;
  context.save();
  context.scale(scale, scale);
  context.fillStyle = STATUS_FOREGROUND;
  context.strokeStyle = STATUS_FOREGROUND;
  context.shadowColor = "transparent";
  context.font = `500 ${STATUS.fontSize}px ${STATUS_FONT}`;
  context.textBaseline = "middle";
  if (options.showTime) {
    context.textAlign = "left";
    context.fillText(options.time, STATUS.inset, STATUS.centerY);
    context.fillText(
      options.date,
      STATUS.inset + context.measureText(options.time).width + STATUS.dateGap,
      STATUS.centerY,
    );
  }

  context.textAlign = "right";
  context.fillText("100%", logicalWidth - STATUS.percentageRight, STATUS.centerY);

  context.save();
  context.translate(logicalWidth - STATUS.wifiRight, STATUS.wifiTop);
  context.beginPath();
  context.moveTo(0, 3);
  context.quadraticCurveTo(7.3, -3.1, 14.6, 3);
  context.lineTo(13.1, 4.55);
  context.quadraticCurveTo(7.3, -0.4, 1.5, 4.55);
  context.closePath();
  context.moveTo(3.05, 6.1);
  context.quadraticCurveTo(7.3, 2.5, 11.55, 6.1);
  context.lineTo(10.02, 7.66);
  context.quadraticCurveTo(7.3, 5.3, 4.58, 7.66);
  context.closePath();
  context.moveTo(5.65, 9.1);
  context.quadraticCurveTo(7.3, 7.72, 8.95, 9.1);
  context.lineTo(7.74, 10.36);
  context.quadraticCurveTo(7.3, 10.8, 6.86, 10.36);
  context.closePath();
  context.fill();
  context.restore();

  const batteryX = logicalWidth - STATUS.batteryRight;
  context.save();
  context.globalAlpha *= 0.52;
  context.lineWidth = 0.9;
  context.beginPath();
  context.roundRect(batteryX, STATUS.batteryTop, STATUS.batteryWidth, STATUS.batteryHeight, 2.5);
  context.stroke();
  context.beginPath();
  context.roundRect(batteryX + STATUS.batteryWidth + 1, STATUS.batteryTop + 3.15, 1.45, 4.1, 0.7);
  context.fill();
  context.restore();
  context.beginPath();
  context.roundRect(
    batteryX + 1.55,
    STATUS.batteryTop + 1.5,
    STATUS.batteryWidth - 3.1,
    STATUS.batteryHeight - 3,
    1.25,
  );
  context.fill();
  context.restore();
}
