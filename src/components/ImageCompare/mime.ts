import type { ImageFormat } from "../../bindings";

/** Trusted MIME mapping for formats detected by the Rust core. */
export const IMAGE_MIME: Readonly<Record<ImageFormat, string>> = {
  png: "image/png",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  ico: "image/x-icon",
  svg: "image/svg+xml",
};

/** Creates an isolated image data URL without interpreting the path. */
export function imageDataUrl(format: ImageFormat, data: string): string {
  return `data:${IMAGE_MIME[format]};base64,${data}`;
}
