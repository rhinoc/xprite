const VIDEO_EXTENSION = /\.(?:mp4|m4v|mov|webm|mkv|avi|mpg|mpeg|ogv|m2ts|mts|ts)$/i;
const VIDEO_MIME_PREFIX = "video/";

export function isVideoFile(file: File): boolean {
  return file.type.startsWith(VIDEO_MIME_PREFIX) || VIDEO_EXTENSION.test(file.name);
}
