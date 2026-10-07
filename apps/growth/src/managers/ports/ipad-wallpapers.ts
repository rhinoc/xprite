/** Downloaded photographs; authors and license links are retained with the assets. */
enum IpadWallpaper {
  MountainLake = "mountain-lake",
  Ocean = "ocean",
  SunriseClouds = "sunrise-clouds",
}

const WALLPAPER_ROOT = "/showcase/ipad/wallpapers/";

const IPAD_WALLPAPERS = {
  [IpadWallpaper.MountainLake]: {
    url: `${WALLPAPER_ROOT}mountain-lake-wolfgang-hasselmann.jpg`,
    positionY: 0.7,
    credit: "Wolfgang Hasselmann / Unsplash",
  },
  [IpadWallpaper.Ocean]: {
    url: `${WALLPAPER_ROOT}ocean-john-lockwood.jpg`,
    positionY: 0.67,
    credit: "John Lockwood / Unsplash",
  },
  [IpadWallpaper.SunriseClouds]: {
    url: `${WALLPAPER_ROOT}sunrise-clouds-balazs-busznyak.jpg`,
    positionY: 0.5,
    credit: "Balazs Busznyak / Unsplash",
  },
} as const;

export const ACTIVE_WALLPAPER = IPAD_WALLPAPERS[IpadWallpaper.MountainLake];
