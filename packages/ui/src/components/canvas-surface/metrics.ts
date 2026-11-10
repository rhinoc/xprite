/** Pixel-art UI is authored and rasterized at two samples per logical pixel. */
export const RASTER_SCALE = 2;
export const UI_SCALE = 2;
export const CSS_PIXEL_SCALE = UI_SCALE / RASTER_SCALE;

/**
 * Standard field row height in scene units: 16 GUI units at {@link RASTER_SCALE}.
 * Text entries and comboboxes share it so their centred glyphs sit identically,
 * matching the Settings dialog rows.
 */
export const FIELD_ROW_HEIGHT = 16 * RASTER_SCALE;
