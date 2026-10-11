import crosshair from "$assets/cursors/aseprite/crosshair.svg?raw";
import eyedropper from "$assets/cursors/aseprite/eyedropper.svg?raw";
import forbidden from "$assets/cursors/aseprite/forbidden.svg?raw";
import hand from "$assets/cursors/aseprite/hand.svg?raw";
import magnifier from "$assets/cursors/aseprite/magnifier.svg?raw";
import manifest from "$assets/cursors/aseprite/manifest.json";
import move from "$assets/cursors/aseprite/move.svg?raw";
import move_selection from "$assets/cursors/aseprite/move_selection.svg?raw";
import normal from "$assets/cursors/aseprite/normal.svg?raw";
import normal_add from "$assets/cursors/aseprite/normal_add.svg?raw";
import rotate_e from "$assets/cursors/aseprite/rotate_e.svg?raw";
import rotate_n from "$assets/cursors/aseprite/rotate_n.svg?raw";
import rotate_ne from "$assets/cursors/aseprite/rotate_ne.svg?raw";
import rotate_nw from "$assets/cursors/aseprite/rotate_nw.svg?raw";
import rotate_s from "$assets/cursors/aseprite/rotate_s.svg?raw";
import rotate_se from "$assets/cursors/aseprite/rotate_se.svg?raw";
import rotate_sw from "$assets/cursors/aseprite/rotate_sw.svg?raw";
import rotate_w from "$assets/cursors/aseprite/rotate_w.svg?raw";
import scroll from "$assets/cursors/aseprite/scroll.svg?raw";
import size_e from "$assets/cursors/aseprite/size_e.svg?raw";
import size_n from "$assets/cursors/aseprite/size_n.svg?raw";
import size_ne from "$assets/cursors/aseprite/size_ne.svg?raw";
import size_ns from "$assets/cursors/aseprite/size_ns.svg?raw";
import size_nw from "$assets/cursors/aseprite/size_nw.svg?raw";
import size_s from "$assets/cursors/aseprite/size_s.svg?raw";
import size_se from "$assets/cursors/aseprite/size_se.svg?raw";
import size_sw from "$assets/cursors/aseprite/size_sw.svg?raw";
import size_w from "$assets/cursors/aseprite/size_w.svg?raw";
import size_we from "$assets/cursors/aseprite/size_we.svg?raw";
import skew_e from "$assets/cursors/aseprite/skew_e.svg?raw";
import skew_n from "$assets/cursors/aseprite/skew_n.svg?raw";
import skew_ne from "$assets/cursors/aseprite/skew_ne.svg?raw";
import skew_nw from "$assets/cursors/aseprite/skew_nw.svg?raw";
import skew_s from "$assets/cursors/aseprite/skew_s.svg?raw";
import skew_se from "$assets/cursors/aseprite/skew_se.svg?raw";
import skew_sw from "$assets/cursors/aseprite/skew_sw.svg?raw";
import skew_w from "$assets/cursors/aseprite/skew_w.svg?raw";

const artwork = {
  crosshair,
  eyedropper,
  forbidden,
  hand,
  magnifier,
  move,
  move_selection,
  normal,
  normal_add,
  rotate_e,
  rotate_n,
  rotate_ne,
  rotate_nw,
  rotate_s,
  rotate_se,
  rotate_sw,
  rotate_w,
  scroll,
  size_e,
  size_n,
  size_ne,
  size_ns,
  size_nw,
  size_s,
  size_se,
  size_sw,
  size_w,
  size_we,
  skew_e,
  skew_n,
  skew_ne,
  skew_nw,
  skew_s,
  skew_se,
  skew_sw,
  skew_w,
};

/** Original pixel artwork is explicitly reusable by visual themes. */
export const asepriteCursors = Object.fromEntries(
  Object.entries(artwork).map(([role, svg]) => {
    const hotspot = manifest.cursors[role as keyof typeof manifest.cursors].sizes["16"];
    return [
      role,
      { svg, width: 16, height: 16, hotspot: { x: hotspot.hotspotX, y: hotspot.hotspotY } },
    ];
  }),
);
