/** Document clipboard remains in ImageClipboard; the host has no system clipboard. */
export const browserClipboard = {
  canRead: () => false,
  read: async () => null,
  write: async () => false,
  clear: async () => {},
};
