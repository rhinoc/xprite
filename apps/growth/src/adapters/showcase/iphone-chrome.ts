import { ShowcaseLanguage } from "$/managers/showcase/showcase-language";

const WIDTH = 430;
const HEIGHT = 934;
const FONT = '-apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif';
const ICON_SIZE = 62;
const ICON_COLUMNS = [74, 168, 262, 356] as const;
const ICON_ROWS = [340, 444] as const;
const DOCK = { x: 18, y: 810, width: 394, height: 104, radius: 36, iconY: 862 } as const;
const WIDGET = { y: 110, size: 164, radius: 25 } as const;
const STATUS_BASELINE = 39;
const SQUIRCLE_SEGMENTS = 64;

export const IPHONE_HOME_ICON = {
  x: ICON_COLUMNS[0] / WIDTH,
  y: ICON_ROWS[0] / HEIGHT,
  size: ICON_SIZE,
} as const;

enum HomeIcon {
  Xprite,
  Calendar,
  Photos,
  Camera,
  Notes,
  Clock,
  Files,
  Settings,
  Phone,
  Safari,
  Messages,
  Music,
}
const HOME_ICONS = [
  HomeIcon.Xprite,
  HomeIcon.Calendar,
  HomeIcon.Photos,
  HomeIcon.Camera,
  HomeIcon.Notes,
  HomeIcon.Clock,
  HomeIcon.Files,
  HomeIcon.Settings,
] as const;
const DOCK_ICONS = [HomeIcon.Phone, HomeIcon.Safari, HomeIcon.Messages, HomeIcon.Music] as const;
const LABELS = {
  [ShowcaseLanguage.English]: [
    "Xprite",
    "Calendar",
    "Photos",
    "Camera",
    "Notes",
    "Clock",
    "Files",
    "Settings",
  ],
  [ShowcaseLanguage.Chinese]: ["Xprite", "日历", "照片", "相机", "备忘录", "时钟", "文件", "设置"],
} as const;

/** Continuous icon corners, rather than rounded rectangles with long straight joins. */
function squircle(c: CanvasRenderingContext2D, x: number, y: number, size: number) {
  c.beginPath();
  for (let i = 0; i <= SQUIRCLE_SEGMENTS; i++) {
    const angle = (i * Math.PI * 2) / SQUIRCLE_SEGMENTS;
    const cosine = Math.cos(angle),
      sine = Math.sin(angle);
    const px = x + size / 2 + (Math.sign(cosine) * Math.abs(cosine) ** 0.45 * size) / 2;
    const py = y + size / 2 + (Math.sign(sine) * Math.abs(sine) ** 0.45 * size) / 2;
    if (i === 0) c.moveTo(px, py);
    else c.lineTo(px, py);
  }
  c.closePath();
}

function roundFill(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  color: string,
) {
  c.fillStyle = color;
  c.beginPath();
  c.roundRect(x, y, w, h, r);
  c.fill();
}

function clockFace(c: CanvasRenderingContext2D, size: number, dark: boolean) {
  c.save();
  const middle = size / 2,
    radius = size * 0.42;
  c.fillStyle = dark ? "#171719" : "#fafafa";
  c.beginPath();
  c.arc(middle, middle, radius, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = dark ? "#fff" : "#202124";
  for (let i = 0; i < 60; i++) {
    const angle = (i * Math.PI) / 30;
    const inner = radius - (i % 5 === 0 ? size * 0.08 : size * 0.028);
    c.lineWidth = i % 5 === 0 ? size * 0.024 : size * 0.008;
    c.beginPath();
    c.moveTo(middle + Math.sin(angle) * inner, middle - Math.cos(angle) * inner);
    c.lineTo(middle + Math.sin(angle) * (radius - 3), middle - Math.cos(angle) * (radius - 3));
    c.stroke();
  }
  if (size > ICON_SIZE) {
    c.fillStyle = dark ? "#fff" : "#202124";
    c.font = `400 ${size * 0.105}px ${FONT}`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    for (let hour = 1; hour <= 12; hour++) {
      const angle = (hour * Math.PI) / 6;
      c.fillText(
        String(hour),
        middle + Math.sin(angle) * radius * 0.69,
        middle - Math.cos(angle) * radius * 0.69,
      );
    }
  }
  c.lineCap = "round";
  for (const [angle, length, weight] of [
    [((9 + 41 / 60) * Math.PI) / 6, radius * 0.5, 0.045],
    [(41 * Math.PI) / 30, radius * 0.78, 0.032],
  ]) {
    c.lineWidth = size * weight;
    c.beginPath();
    c.moveTo(middle, middle);
    c.lineTo(middle + Math.sin(angle) * length, middle - Math.cos(angle) * length);
    c.stroke();
  }
  c.fillStyle = "#ff453a";
  c.beginPath();
  c.arc(middle, middle, size * 0.035, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

/** Small original vector illustrations; the reference screenshots are not bundled assets. */
function appIcon(
  c: CanvasRenderingContext2D,
  kind: HomeIcon,
  cx: number,
  cy: number,
  language: ShowcaseLanguage,
) {
  c.save();
  c.translate(cx - ICON_SIZE / 2, cy - ICON_SIZE / 2);
  squircle(c, 0, 0, ICON_SIZE);
  c.clip();
  const colors = {
    [HomeIcon.Calendar]: "#fff",
    [HomeIcon.Photos]: "#fff",
    [HomeIcon.Camera]: "#b8b9be",
    [HomeIcon.Notes]: "#fffef9",
    [HomeIcon.Clock]: "#171719",
    [HomeIcon.Files]: "#fff",
    [HomeIcon.Settings]: "#b4b8bd",
    [HomeIcon.Phone]: "#30ce5b",
    [HomeIcon.Safari]: "#fff",
    [HomeIcon.Messages]: "#30d35c",
    [HomeIcon.Music]: "#fb3457",
    [HomeIcon.Xprite]: "#000",
  };
  c.fillStyle = colors[kind];
  c.fillRect(0, 0, ICON_SIZE, ICON_SIZE);
  const sheen = c.createLinearGradient(0, 0, 0, ICON_SIZE);
  sheen.addColorStop(0, "rgba(255,255,255,.2)");
  sheen.addColorStop(1, "rgba(255,255,255,0)");
  c.fillStyle = sheen;
  c.fillRect(0, 0, ICON_SIZE, ICON_SIZE);
  c.strokeStyle = "#fff";
  c.fillStyle = "#fff";
  c.lineWidth = 3;
  c.lineCap = "round";
  c.lineJoin = "round";
  switch (kind) {
    case HomeIcon.Calendar:
      c.textAlign = "center";
      c.fillStyle = "#f34845";
      c.font = `600 10px ${FONT}`;
      c.fillText(language === ShowcaseLanguage.Chinese ? "星期日" : "SUNDAY", 31, 16);
      c.fillStyle = "#19191d";
      c.font = `300 39px ${FONT}`;
      c.fillText("4", 31, 51);
      break;
    case HomeIcon.Photos:
      for (const [i, color] of [
        "#ffc12b",
        "#ff9128",
        "#f34d60",
        "#cf69b8",
        "#7d8de0",
        "#63b4e5",
        "#72c59f",
        "#aed450",
      ].entries()) {
        c.save();
        c.translate(31, 31);
        c.rotate((i * Math.PI) / 4);
        c.globalAlpha = 0.86;
        c.fillStyle = color;
        c.beginPath();
        c.ellipse(0, -13, 8, 13, 0, 0, Math.PI * 2);
        c.fill();
        c.restore();
      }
      break;
    case HomeIcon.Camera:
      roundFill(c, 8, 19, 46, 31, 7, "#2d2e32");
      roundFill(c, 19, 13, 22, 13, 4, "#2d2e32");
      c.strokeStyle = "#b9bbc1";
      c.lineWidth = 2.5;
      c.beginPath();
      c.arc(31, 34, 11, 0, Math.PI * 2);
      c.stroke();
      c.fillStyle = "#f4cf68";
      c.beginPath();
      c.arc(47, 25, 2, 0, Math.PI * 2);
      c.fill();
      break;
    case HomeIcon.Notes:
      c.fillStyle = "#ffd34c";
      c.fillRect(0, 0, 62, 20);
      c.strokeStyle = "#d7d3c8";
      c.lineWidth = 1;
      for (const y of [29, 38, 47, 56]) {
        c.beginPath();
        c.moveTo(0, y);
        c.lineTo(62, y);
        c.stroke();
      }
      break;
    case HomeIcon.Clock:
      clockFace(c, 62, true);
      break;
    case HomeIcon.Files:
      roundFill(c, 7, 17, 25, 27, 4, "#65bdff");
      roundFill(c, 7, 22, 48, 29, 4, "#2499ed");
      break;
    case HomeIcon.Settings:
      c.strokeStyle = "#575b62";
      c.lineWidth = 7;
      for (let i = 0; i < 12; i++) {
        const a = (i * Math.PI) / 6;
        c.beginPath();
        c.moveTo(31 + Math.cos(a) * 18, 31 + Math.sin(a) * 18);
        c.lineTo(31 + Math.cos(a) * 24, 31 + Math.sin(a) * 24);
        c.stroke();
      }
      c.lineWidth = 6;
      c.beginPath();
      c.arc(31, 31, 18, 0, Math.PI * 2);
      c.stroke();
      c.lineWidth = 3;
      c.beginPath();
      c.arc(31, 31, 9, 0, Math.PI * 2);
      c.stroke();
      break;
    case HomeIcon.Phone:
      c.beginPath();
      c.moveTo(18, 10);
      c.bezierCurveTo(13, 10, 10, 14, 11, 21);
      c.bezierCurveTo(13, 35, 29, 50, 42, 51);
      c.bezierCurveTo(49, 51, 52, 47, 51, 43);
      c.bezierCurveTo(50, 41, 44, 37, 42, 37);
      c.bezierCurveTo(40, 37, 37, 40, 35, 41);
      c.bezierCurveTo(28, 38, 23, 32, 20, 25);
      c.bezierCurveTo(22, 23, 25, 21, 25, 19);
      c.bezierCurveTo(24, 16, 21, 10, 18, 10);
      c.closePath();
      c.fill();
      break;
    case HomeIcon.Safari:
      c.fillStyle = "#26a5ec";
      c.beginPath();
      c.arc(31, 31, 25, 0, Math.PI * 2);
      c.fill();
      c.lineWidth = 1;
      for (let i = 0; i < 24; i++) {
        const a = (i * Math.PI) / 12;
        c.beginPath();
        c.moveTo(31 + Math.cos(a) * 20, 31 + Math.sin(a) * 20);
        c.lineTo(31 + Math.cos(a) * 23, 31 + Math.sin(a) * 23);
        c.stroke();
      }
      c.fillStyle = "#ff494c";
      c.beginPath();
      c.moveTo(47, 13);
      c.lineTo(35, 35);
      c.lineTo(27, 27);
      c.fill();
      c.fillStyle = "#fff";
      c.beginPath();
      c.moveTo(15, 49);
      c.lineTo(35, 35);
      c.lineTo(27, 27);
      c.fill();
      break;
    case HomeIcon.Messages:
      c.beginPath();
      c.ellipse(31, 29, 23, 18, 0, 0, Math.PI * 2);
      c.fill();
      c.beginPath();
      c.moveTo(15, 39);
      c.lineTo(12, 51);
      c.lineTo(29, 43);
      c.fill();
      break;
    case HomeIcon.Music:
      c.lineWidth = 4;
      c.beginPath();
      c.moveTo(25, 43);
      c.lineTo(25, 18);
      c.lineTo(46, 13);
      c.lineTo(46, 38);
      c.stroke();
      c.lineWidth = 6;
      c.beginPath();
      c.moveTo(25, 21);
      c.lineTo(46, 16);
      c.stroke();
      c.beginPath();
      c.ellipse(19, 45, 8, 6, -0.35, 0, Math.PI * 2);
      c.ellipse(40, 40, 8, 6, -0.35, 0, Math.PI * 2);
      c.fill();
      break;
    case HomeIcon.Xprite:
      break;
  }
  c.restore();
}

export function createIphoneHome(
  wallpaper: HTMLImageElement,
  language: ShowcaseLanguage,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const c = canvas.getContext("2d")!;
  const scale = Math.max(WIDTH / wallpaper.naturalWidth, HEIGHT / wallpaper.naturalHeight);
  c.drawImage(
    wallpaper,
    (WIDTH - wallpaper.naturalWidth * scale) / 2,
    (HEIGHT - wallpaper.naturalHeight * scale) / 2,
    wallpaper.naturalWidth * scale,
    wallpaper.naturalHeight * scale,
  );
  const shade = c.createLinearGradient(0, 0, 0, HEIGHT);
  shade.addColorStop(0, "rgba(7,20,42,.35)");
  shade.addColorStop(0.55, "rgba(7,20,42,.1)");
  shade.addColorStop(1, "rgba(7,20,42,.25)");
  c.fillStyle = shade;
  c.fillRect(0, 0, WIDTH, HEIGHT);
  for (const x of [27, 239]) {
    c.shadowColor = "rgba(0,0,0,.14)";
    c.shadowBlur = 18;
    c.shadowOffsetY = 5;
    roundFill(c, x, WIDGET.y, WIDGET.size, WIDGET.size, WIDGET.radius, "rgba(255,255,255,.93)");
    c.shadowColor = "transparent";
    c.shadowBlur = 0;
    c.shadowOffsetY = 0;
  }
  c.fillStyle = "#f34f4f";
  c.font = `600 13px ${FONT}`;
  c.fillText(language === ShowcaseLanguage.Chinese ? "星期日" : "SUNDAY", 44, 139);
  c.fillStyle = "#161619";
  c.font = `300 62px ${FONT}`;
  c.fillText("4", 42, 202);
  c.fillStyle = "#78787d";
  c.font = `13px ${FONT}`;
  c.fillText(language === ShowcaseLanguage.Chinese ? "十月" : "October", 45, 246);
  c.save();
  c.translate(247, WIDGET.y + 8);
  clockFace(c, 148, false);
  c.restore();
  c.fillStyle = "#fff";
  c.textAlign = "center";
  c.font = `12px ${FONT}`;
  c.fillText(language === ShowcaseLanguage.Chinese ? "日历" : "Calendar", 109, 290);
  c.fillText(language === ShowcaseLanguage.Chinese ? "时钟" : "Clock", 321, 290);
  for (const [index, kind] of HOME_ICONS.entries()) {
    const x = ICON_COLUMNS[index % ICON_COLUMNS.length],
      y = ICON_ROWS[Math.floor(index / ICON_COLUMNS.length)];
    if (kind !== HomeIcon.Xprite) appIcon(c, kind, x, y, language);
    c.fillStyle = "#fff";
    c.textAlign = "center";
    c.font = `12px ${FONT}`;
    c.shadowColor = "rgba(0,0,0,.45)";
    c.shadowBlur = 4;
    c.shadowOffsetY = 1;
    c.fillText(LABELS[language][index], x, y + 47);
    c.shadowColor = "transparent";
    c.shadowBlur = 0;
    c.shadowOffsetY = 0;
  }
  roundFill(c, 177, 756, 76, 29, 15, "rgba(255,255,255,.18)");
  c.strokeStyle = "rgba(255,255,255,.92)";
  c.lineWidth = 1.5;
  c.beginPath();
  c.arc(193, 769, 4, 0, Math.PI * 2);
  c.moveTo(196, 772);
  c.lineTo(199, 775);
  c.stroke();
  c.fillStyle = "#fff";
  c.font = `500 11px ${FONT}`;
  c.textAlign = "left";
  c.fillText(language === ShowcaseLanguage.Chinese ? "搜索" : "Search", 205, 774);
  const glass = c.createLinearGradient(0, DOCK.y, 0, DOCK.y + DOCK.height);
  glass.addColorStop(0, "rgba(245,248,255,.3)");
  glass.addColorStop(1, "rgba(225,235,255,.16)");
  c.fillStyle = glass;
  c.beginPath();
  c.roundRect(DOCK.x, DOCK.y, DOCK.width, DOCK.height, DOCK.radius);
  c.fill();
  c.strokeStyle = "rgba(255,255,255,.32)";
  c.lineWidth = 1;
  c.stroke();
  DOCK_ICONS.forEach((kind, i) => appIcon(c, kind, ICON_COLUMNS[i], DOCK.iconY, language));
  return canvas;
}

export function drawIphoneAppIcon(
  c: CanvasRenderingContext2D,
  image: HTMLImageElement,
  size: number,
) {
  const x = IPHONE_HOME_ICON.x * WIDTH - size / 2,
    y = IPHONE_HOME_ICON.y * HEIGHT - size / 2;
  c.save();
  c.shadowColor = "rgba(0,0,0,.18)";
  c.shadowBlur = 8;
  c.shadowOffsetY = 3;
  squircle(c, x, y, size);
  c.fillStyle = "#151719";
  c.fill();
  c.shadowColor = "transparent";
  c.clip();
  c.imageSmoothingEnabled = false;
  c.drawImage(image, x, y, size, size);
  c.restore();
}

/** Time and connection icons share the Dynamic Island's center line; its pill is in the model. */
export function drawIphoneStatus(c: CanvasRenderingContext2D, light: boolean) {
  c.save();
  c.fillStyle = light ? "#fff" : "#151619";
  c.strokeStyle = c.fillStyle;
  c.font = `600 17px ${FONT}`;
  c.textAlign = "center";
  c.fillText("9:41", 74, STATUS_BASELINE);
  for (let i = 0; i < 4; i++) {
    const h = 4 + i * 2.5;
    c.beginPath();
    c.roundRect(318 + i * 5, 37 - h, 3.4, h, 1);
    c.fill();
  }
  c.lineWidth = 2.2;
  c.lineCap = "round";
  for (const radius of [10, 6.2]) {
    c.beginPath();
    c.arc(353, 38, radius, Math.PI * 1.25, Math.PI * 1.75);
    c.stroke();
  }
  c.beginPath();
  c.arc(353, 37, 1.4, 0, Math.PI * 2);
  c.fill();
  c.globalAlpha = 0.55;
  c.lineWidth = 1.2;
  c.beginPath();
  c.roundRect(370, 25.5, 26, 12.5, 3.5);
  c.stroke();
  c.beginPath();
  c.roundRect(398, 29.5, 1.8, 4.5, 0.8);
  c.fill();
  c.globalAlpha = 1;
  c.beginPath();
  c.roundRect(372.5, 28, 21, 7.5, 1.7);
  c.fill();
  c.restore();
}

export function drawIphoneHomeIndicator(c: CanvasRenderingContext2D) {
  roundFill(c, (WIDTH - 140) / 2, HEIGHT - 12, 140, 5, 2.5, "#17181a");
}
