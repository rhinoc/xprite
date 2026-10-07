// Command modifier artwork from the Classic Macintosh UI Kit menu export.
const command = {
  width: 9,
  height: 10,
  advance: 11,
  paths: [
    {
      path: "M1 0h1v1h-1Z M2 0h1v1h-1Z M6 0h1v1h-1Z M7 0h1v1h-1Z M0 1h1v1h-1Z M1 1h1v1h-1Z M2 1h1v1h-1Z M3 1h1v1h-1Z M5 1h1v1h-1Z M6 1h1v1h-1Z M7 1h1v1h-1Z M8 1h1v1h-1Z M0 3h1v1h-1Z M1 3h1v1h-1Z M2 3h1v1h-1Z M4 3h1v1h-1Z M6 3h1v1h-1Z M7 3h1v1h-1Z M8 3h1v1h-1Z M1 4h1v1h-1Z M2 4h1v1h-1Z M4 4h1v1h-1Z M6 4h1v1h-1Z M7 4h1v1h-1Z M1 5h1v1h-1Z M2 5h1v1h-1Z M4 5h1v1h-1Z M6 5h1v1h-1Z M7 5h1v1h-1Z M0 6h1v1h-1Z M1 6h1v1h-1Z M2 6h1v1h-1Z M4 6h1v1h-1Z M6 6h1v1h-1Z M7 6h1v1h-1Z M8 6h1v1h-1Z M0 8h1v1h-1Z M1 8h1v1h-1Z M2 8h1v1h-1Z M3 8h1v1h-1Z M5 8h1v1h-1Z M6 8h1v1h-1Z M7 8h1v1h-1Z M8 8h1v1h-1Z M1 9h1v1h-1Z M2 9h1v1h-1Z M6 9h1v1h-1Z M7 9h1v1h-1Z",
      opacity: 0.4980392156862745,
    },
    {
      path: "M0 2h1v1h-1Z M3 2h1v1h-1Z M5 2h1v1h-1Z M8 2h1v1h-1Z M3 3h1v1h-1Z M5 3h1v1h-1Z M3 4h1v1h-1Z M5 4h1v1h-1Z M3 5h1v1h-1Z M5 5h1v1h-1Z M3 6h1v1h-1Z M5 6h1v1h-1Z M0 7h1v1h-1Z M3 7h1v1h-1Z M5 7h1v1h-1Z M8 7h1v1h-1Z",
      opacity: 1,
    },
  ],
};
// Newly drawn, menu-sized Shift, Option and Control symbols.
const shift = {
  width: 11,
  height: 12,
  advance: 12,
  paths: [
    {
      path: "M5 0h1v1H5Z M4 1h3v1H4Z M3 2h1v1H3Z M7 2h1v1H7Z M2 3h1v1H2Z M8 3h1v1H8Z M1 4h1v1H1Z M9 4h1v1H9Z M0 5h4v1H0Z M7 5h4v1H7Z M3 6h1v4H3Z M7 6h1v4H7Z M3 10h5v1H3Z",
      opacity: 1,
    },
  ],
};
const option = {
  width: 11,
  height: 12,
  advance: 12,
  paths: [
    { path: "M0 2h4v1H0Z M6 2h5v1H6Z M3 3h2v2H3Z M4 5h2v2H4Z M5 7h2v2H5Z M6 9h5v1H6Z", opacity: 1 },
  ],
};
const control = {
  width: 9,
  height: 12,
  advance: 10,
  paths: [
    {
      path: "M4 2h1v1H4Z M3 3h3v1H3Z M2 4h2v1H2Z M5 4h2v1H5Z M1 5h2v1H1Z M6 5h2v1H6Z M0 6h2v1H0Z M7 6h2v1H7Z",
      opacity: 1,
    },
  ],
};
export const macintoshMenuShortcutGlyphs = {
  meta: command,
  cmd: command,
  command,
  shift,
  alt: option,
  opt: option,
  option,
  ctrl: control,
  control,
};

const ellipsis = {
  width: 12,
  height: 12,
  advance: 12,
  paths: [
    {
      path: "M1 8h1v1h-1Z",
      opacity: 0.5607843137254902,
    },
    {
      path: "M2 8h1v1h-1Z M6 8h1v1h-1Z",
      opacity: 0.8117647058823529,
    },
    {
      path: "M3 8h1v1h-1Z M3 9h1v1h-1Z",
      opacity: 0.06274509803921569,
    },
    {
      path: "M5 8h1v1h-1Z",
      opacity: 0.4392156862745098,
    },
    {
      path: "M7 8h1v1h-1Z M6 10h1v1h-1Z M10 10h1v1h-1Z",
      opacity: 0.18823529411764706,
    },
    {
      path: "M9 8h1v1h-1Z",
      opacity: 0.3137254901960784,
    },
    {
      path: "M10 8h1v1h-1Z",
      opacity: 0.8745098039215686,
    },
    {
      path: "M11 8h1v1h-1Z",
      opacity: 0.37254901960784315,
    },
    {
      path: "M1 9h1v1h-1Z",
      opacity: 0.7490196078431373,
    },
    {
      path: "M2 9h1v1h-1Z M6 9h1v1h-1Z M10 9h1v1h-1Z",
      opacity: 1,
    },
    {
      path: "M5 9h1v1h-1Z",
      opacity: 0.6235294117647059,
    },
    {
      path: "M7 9h1v1h-1Z",
      opacity: 0.25098039215686274,
    },
    {
      path: "M9 9h1v1h-1Z",
      opacity: 0.43529411764705883,
    },
    {
      path: "M11 9h1v1h-1Z",
      opacity: 0.3764705882352941,
    },
    {
      path: "M1 10h1v1h-1Z M2 10h1v1h-1Z",
      opacity: 0.12549019607843137,
    },
  ],
};
export const macintoshMenuLabelGlyphs = { "...": ellipsis, "…": ellipsis };
