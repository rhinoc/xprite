import { UINT16_VALUE_COUNT, UINT8_MAX } from "$/base/numeric-constants";
import type { PixelBuffer, Rect, Rgba } from "$/base/primitives";
import { colorProfileToSrgb, convertPixelsToSrgb } from "$/color/icc-profile";
import type { AsepriteColorProfile } from "$/import-export/aseprite/model";

const RGBA_CHANNELS = 4;
const MAX_PRESENTATION_CACHE_BYTES = 64 * 1024 * 1024;

interface PresentationRasterChange {
  pixels: PixelBuffer;
  bounds: Rect;
  fromRevision: number;
  revision: number;
}

/** One display-space raster, never a working-space or history buffer. The
 * revision must cover all visible content changes. Pass null for transient
 * previews which do not have that guarantee. Profile bytes are immutable,
 * like the ICC parser's source bytes; replacement invalidates the cache. */
export class PresentationColorCache {
  private source: PixelBuffer | null = null;
  private sourceData: Uint8ClampedArray | null = null;
  private image: PixelBuffer | null = null;
  private revision = -1;
  private profileType: AsepriteColorProfile["type"] | undefined;
  private profileGamma: number | undefined;
  private profileData: Uint8Array | undefined;

  constructor(private readonly maxBytes = MAX_PRESENTATION_CACHE_BYTES) {}

  clear(): void {
    this.source = null;
    this.sourceData = null;
    this.image = null;
    this.revision = -1;
    this.profileData = undefined;
  }

  convert(
    source: PixelBuffer,
    profile: AsepriteColorProfile | undefined,
    revision: number | null,
    change?: PresentationRasterChange | null,
  ): PixelBuffer {
    if (
      !profile ||
      profile.type === "none" ||
      (profile.type === "srgb" && profile.gamma === undefined) ||
      revision === null ||
      source.data.byteLength > this.maxBytes
    ) {
      this.clear();
      return convertPixelsToSrgb(source, profile);
    }
    const profileData = profile.type === "icc" ? profile.data : undefined;
    const sameSource =
      this.source === source &&
      this.sourceData === source.data &&
      this.image?.width === source.width &&
      this.image?.height === source.height &&
      this.profileType === profile.type &&
      this.profileGamma === profile.gamma &&
      this.profileData === profileData;
    if (sameSource && revision === this.revision) return this.image!;
    if (
      sameSource &&
      change?.pixels === source &&
      change.fromRevision <= this.revision &&
      this.revision < revision &&
      change.revision === revision
    ) {
      this.updateRegion(source, profile, change.bounds);
      this.revision = revision;
      return this.image!;
    }
    // A full invalidation creates a new buffer. Canvas uploaders can therefore
    // distinguish this from an update backed by a complete dirty-region proof.
    const image = convertPixelsToSrgb(source, profile);
    this.source = source;
    this.sourceData = source.data;
    this.image = image;
    this.revision = revision;
    this.profileType = profile.type;
    this.profileGamma = profile.gamma;
    this.profileData = profileData;
    return image;
  }

  private updateRegion(source: PixelBuffer, profile: AsepriteColorProfile, bounds: Rect): void {
    const data = this.image!.data;
    const colors = new Map<number, Rgba>();
    const left = Math.max(0, Math.floor(bounds.x));
    const top = Math.max(0, Math.floor(bounds.y));
    const right = Math.min(source.width, Math.ceil(bounds.x + bounds.width));
    const bottom = Math.min(source.height, Math.ceil(bounds.y + bounds.height));
    for (let y = top; y < bottom; y++) {
      for (let x = left; x < right; x++) {
        const at = (y * source.width + x) * RGBA_CHANNELS;
        const alpha = source.data[at + 3];
        data[at + 3] = alpha;
        if (!alpha) {
          // Preserve hidden RGB exactly, as full display conversion does.
          data[at] = source.data[at];
          data[at + 1] = source.data[at + 1];
          data[at + 2] = source.data[at + 2];
          continue;
        }
        const key = (source.data[at] << 16) | (source.data[at + 1] << 8) | source.data[at + 2];
        let color = colors.get(key);
        if (!color) {
          color = colorProfileToSrgb(
            [source.data[at], source.data[at + 1], source.data[at + 2], UINT8_MAX],
            profile,
          );
          if (colors.size < UINT16_VALUE_COUNT) colors.set(key, color);
        }
        data[at] = color[0];
        data[at + 1] = color[1];
        data[at + 2] = color[2];
      }
    }
  }
}
