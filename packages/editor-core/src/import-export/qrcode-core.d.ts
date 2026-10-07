/** The platform-independent encoder entry; no browser or Node rendering APIs. */
declare module "qrcode/lib/core/qrcode.js" {
  const QRCode: {
    create(
      segments: string | { data: Uint8Array | string; mode: "byte" | "alphanumeric" }[],
      options: { errorCorrectionLevel: "M" },
    ): {
      modules: { size: number; get(row: number, column: number): number };
    };
  };
  export default QRCode;
}
