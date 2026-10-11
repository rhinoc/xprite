export interface LocalFontsPort {
  available(): boolean;
  /** Return null when access needs a user gesture; never prompt here. */
  readGrantedFamilies(): Promise<readonly string[] | null>;
  /** May prompt for permission; invoke directly from a user gesture. */
  requestFamilies(): Promise<readonly string[]>;
  /** Explicit bitmap strikes found in this family's font files; empty for outlines. */
  readBitmapSizes(family: string): Promise<readonly number[]>;
}
