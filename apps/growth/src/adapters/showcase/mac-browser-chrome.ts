import { MAC_BROWSER_LAYOUT as LAYOUT } from "$/managers/ports/device-demo";
import { ShowcaseLanguage } from "$/managers/showcase/showcase-language";

// Apple silhouette: Simple Icons, CC0. Full source/license recorded in ASSET-LICENSES.md.
const APPLE_PATH =
  "M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701";
const SYSTEM_FONT = '-apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif';
const COLOR = {
  menu: "#29282e",
  toolbar: "#202024",
  group: "#2c2c31",
  groupEdge: "#35353b",
  foreground: "#ededf0",
  icon: "#98989e",
  disabled: "#56565c",
  placeholder: "#9b9ba1",
  focus: "#6e9ee8",
} as const;
const MENU = {
  [ShowcaseLanguage.English]: [
    "File",
    "Edit",
    "View",
    "History",
    "Bookmarks",
    "Develop",
    "Window",
    "Help",
  ],
  [ShowcaseLanguage.Chinese]: ["文件", "编辑", "显示", "历史记录", "书签", "开发", "窗口", "帮助"],
} as const;
const MENU_BASELINE = 23;
const MENU_START = 119;
const MENU_GAP = 20;
const TRAFFIC_LIGHTS = ["#ff6058", "#ffbd2e", "#28c840"] as const;
const ICON_SIZE = 20;
const ADDRESS_TEXT_PADDING = 47;
let applePath: Path2D | undefined;

enum ToolbarIcon {
  Sidebar,
  Back,
  Forward,
  Page,
  Reload,
  Translate,
  Share,
  NewTab,
  Tabs,
}

function pill(c: CanvasRenderingContext2D, x: number, width: number) {
  c.fillStyle = COLOR.group;
  c.strokeStyle = COLOR.groupEdge;
  c.lineWidth = 0.75;
  c.beginPath();
  c.roundRect(x, LAYOUT.controlTop, width, LAYOUT.controlHeight, LAYOUT.controlHeight / 2);
  c.fill();
  c.stroke();
}

function icon(c: CanvasRenderingContext2D, kind: ToolbarIcon, x: number) {
  c.save();
  c.translate(x - ICON_SIZE / 2, LAYOUT.toolbarCenterY - ICON_SIZE / 2);
  c.strokeStyle = kind === ToolbarIcon.Forward ? COLOR.disabled : COLOR.icon;
  c.lineWidth = 1.65;
  c.lineCap = "round";
  c.lineJoin = "round";
  c.beginPath();
  switch (kind) {
    case ToolbarIcon.Sidebar:
      c.roundRect(1, 2, 18, 16, 3);
      c.moveTo(7, 2);
      c.lineTo(7, 18);
      break;
    case ToolbarIcon.Back:
    case ToolbarIcon.Forward: {
      const left = kind === ToolbarIcon.Back ? 12 : 7;
      const right = kind === ToolbarIcon.Back ? 6 : 13;
      c.moveTo(left, 3);
      c.lineTo(right, 10);
      c.lineTo(left, 17);
      break;
    }
    case ToolbarIcon.Page:
      c.roundRect(3, 1, 14, 10, 2);
      c.moveTo(3, 15);
      c.lineTo(17, 15);
      c.moveTo(3, 19);
      c.lineTo(12, 19);
      break;
    case ToolbarIcon.Reload:
      c.arc(10, 11, 7, -Math.PI / 3, Math.PI * 1.45);
      c.moveTo(11, 0);
      c.lineTo(15, 4);
      c.lineTo(10, 6);
      break;
    case ToolbarIcon.Translate:
      c.roundRect(0, 1, 12, 12, 2);
      c.roundRect(8, 7, 12, 12, 2);
      c.moveTo(3, 10);
      c.lineTo(6, 4);
      c.lineTo(9, 10);
      c.moveTo(4, 8);
      c.lineTo(8, 8);
      break;
    case ToolbarIcon.Share:
      c.moveTo(5, 7);
      c.lineTo(2, 7);
      c.lineTo(2, 19);
      c.lineTo(18, 19);
      c.lineTo(18, 7);
      c.lineTo(15, 7);
      c.moveTo(10, 13);
      c.lineTo(10, 0);
      c.moveTo(6, 4);
      c.lineTo(10, 0);
      c.lineTo(14, 4);
      break;
    case ToolbarIcon.NewTab:
      c.moveTo(10, 2);
      c.lineTo(10, 18);
      c.moveTo(2, 10);
      c.lineTo(18, 10);
      break;
    case ToolbarIcon.Tabs:
      c.roundRect(1, 1, 13, 13, 3);
      c.roundRect(6, 6, 13, 13, 3);
      break;
  }
  c.stroke();
  c.restore();
}

function menuBar(c: CanvasRenderingContext2D, width: number, language: ShowcaseLanguage) {
  c.fillStyle = COLOR.menu;
  c.fillRect(0, 0, width, LAYOUT.menuHeight);
  c.fillStyle = COLOR.foreground;
  c.save();
  c.translate(22, 8);
  c.scale(0.72, 0.72);
  c.fill((applePath ??= new Path2D(APPLE_PATH)));
  c.restore();
  c.font = `600 14px ${SYSTEM_FONT}`;
  c.fillText("Safari", 56, MENU_BASELINE);
  c.font = `13px ${SYSTEM_FONT}`;
  let x = MENU_START;
  for (const label of MENU[language]) {
    c.fillText(label, x, MENU_BASELINE);
    x += c.measureText(label).width + MENU_GAP;
  }
  // Status items stay to the right of the hardware notch, with no window controls above it.
  c.textAlign = "right";
  c.fillText(
    language === ShowcaseLanguage.Chinese ? "10月4日 周日 9:41" : "Sun Oct 4  9:41",
    width - 21,
    MENU_BASELINE,
  );
  c.textAlign = "left";
  c.strokeStyle = COLOR.foreground;
  c.lineWidth = 1.4;
  c.beginPath();
  c.roundRect(width - 225, 12, 23, 11, 2);
  c.stroke();
  c.fillRect(width - 222, 15, 17, 5);
  c.fillRect(width - 200, 15, 2, 5);
  c.beginPath();
  for (const radius of [4, 8, 12]) {
    c.moveTo(width - 252 - radius * Math.SQRT1_2, 24 - radius * Math.SQRT1_2);
    c.arc(width - 252, 24, radius, Math.PI * 1.25, Math.PI * 1.75);
  }
  c.stroke();
  c.beginPath();
  c.arc(width - 283, 16, 4.5, 0, Math.PI * 2);
  c.moveTo(width - 279, 20);
  c.lineTo(width - 275, 24);
  c.stroke();
}

/** Referenced from the user's native Safari window: one aligned toolbar below the macOS menu. */
export function drawMacBrowserChrome(
  c: CanvasRenderingContext2D,
  width: number,
  language: ShowcaseLanguage,
  address: string,
  editing: boolean,
) {
  c.save();
  c.textAlign = "left";
  menuBar(c, width, language);
  c.fillStyle = COLOR.toolbar;
  c.fillRect(0, LAYOUT.menuHeight, width, LAYOUT.toolbarHeight);
  for (const [index, color] of TRAFFIC_LIGHTS.entries()) {
    c.fillStyle = color;
    c.beginPath();
    c.arc(25 + index * 20, LAYOUT.toolbarCenterY, 6, 0, Math.PI * 2);
    c.fill();
  }
  pill(c, 90, 66);
  icon(c, ToolbarIcon.Sidebar, 114);
  c.strokeStyle = COLOR.icon;
  c.lineWidth = 1.5;
  c.beginPath();
  c.moveTo(138, 62);
  c.lineTo(142, 66);
  c.lineTo(146, 62);
  c.stroke();
  pill(c, 170, 72);
  icon(c, ToolbarIcon.Back, 190);
  icon(c, ToolbarIcon.Forward, 222);
  const addressX = width * LAYOUT.addressLeft;
  const addressWidth = width * LAYOUT.addressWidth;
  pill(c, addressX, addressWidth);
  if (editing) {
    c.strokeStyle = COLOR.focus;
    c.lineWidth = 1.5;
    c.beginPath();
    c.roundRect(
      addressX,
      LAYOUT.controlTop,
      addressWidth,
      LAYOUT.controlHeight,
      LAYOUT.controlHeight / 2,
    );
    c.stroke();
  }
  icon(c, ToolbarIcon.Page, addressX + 22);
  if (!editing) icon(c, ToolbarIcon.Translate, addressX + addressWidth - 50);
  icon(c, ToolbarIcon.Reload, addressX + addressWidth - 21);
  const placeholder =
    language === ShowcaseLanguage.Chinese ? "搜索或输入网站名称" : "Search or enter website name";
  const text = address || (editing ? "" : placeholder);
  c.font = `15px ${SYSTEM_FONT}`;
  c.fillStyle = address || editing ? COLOR.foreground : COLOR.placeholder;
  c.textAlign = editing ? "left" : "center";
  const textX = editing ? addressX + ADDRESS_TEXT_PADDING : width / 2;
  c.fillText(text, textX, LAYOUT.toolbarCenterY + 5);
  if (editing)
    c.fillRect(textX + c.measureText(text).width + 2, LAYOUT.toolbarCenterY - 9, 1.5, 19);
  pill(c, width - 140, 124);
  icon(c, ToolbarIcon.Share, width - 117);
  icon(c, ToolbarIcon.NewTab, width - 78);
  icon(c, ToolbarIcon.Tabs, width - 39);
  c.fillStyle = "#131316";
  c.fillRect(0, LAYOUT.menuHeight + LAYOUT.toolbarHeight - 1, width, 1);
  c.restore();
}
