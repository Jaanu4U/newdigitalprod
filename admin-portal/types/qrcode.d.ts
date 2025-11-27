declare module 'qrcode' {
  // Minimal type shim for dynamic import usage
  interface QRCodeToCanvasOptions {
    errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
    margin?: number;
    scale?: number;
    width?: number;
    color?: {
      dark?: string;
      light?: string;
    };
  }
  interface QRCodeModule {
    toCanvas(canvas: HTMLCanvasElement | null, text: string, options?: QRCodeToCanvasOptions): Promise<void>;
  }
  const qr: QRCodeModule;
  export = qr;
}
