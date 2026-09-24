interface ScreenEyeDropper {
  open(options?: { signal?: AbortSignal }): Promise<{ sRGBHex: string }>;
}

type EyeDropperGlobal = typeof globalThis & {
  EyeDropper?: new () => ScreenEyeDropper;
};

/** Browser-owned screen sampling; call directly from a user activation. */
export const browserEyeDropper = {
  available(): boolean {
    return (
      globalThis.isSecureContext === true &&
      typeof (globalThis as EyeDropperGlobal).EyeDropper === "function"
    );
  },
  async pick(signal: AbortSignal): Promise<string | null> {
    const Constructor = (globalThis as EyeDropperGlobal).EyeDropper;
    if (!this.available() || !Constructor) throw new Error("Screen sampling unavailable");
    try {
      const result = await new Constructor().open({ signal });
      return result.sRGBHex;
    } catch (error) {
      if (signal.aborted || (error instanceof DOMException && error.name === "AbortError"))
        return null;
      throw error;
    }
  },
};
