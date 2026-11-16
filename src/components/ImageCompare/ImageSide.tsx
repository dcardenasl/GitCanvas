import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type { ImagePayload, ImageVersion } from "../../bindings";
import { formatImageBytes } from "./format";
import { imageDataUrl } from "./mime";

/** One isolated image and the source facts needed to identify it. */
export function ImageSide({
  payload,
  path,
  version,
  naturalSize,
  onNaturalSize,
  realSize,
  paused,
  onTogglePause,
  onDecodeError,
}: {
  readonly payload: ImagePayload;
  readonly path: string;
  readonly version: ImageVersion;
  readonly naturalSize: {
    readonly width: number;
    readonly height: number;
  } | null;
  readonly onNaturalSize: (size: {
    readonly width: number;
    readonly height: number;
  }) => void;
  readonly realSize: boolean;
  readonly paused: boolean;
  readonly onTogglePause: () => void;
  readonly onDecodeError: () => void;
}) {
  const { t } = useTranslation("image");
  const imageRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loaded, setLoaded] = useState(false);
  const source = imageDataUrl(payload.format, payload.data);
  const width = payload.width ?? naturalSize?.width ?? null;
  const height = payload.height ?? naturalSize?.height ?? null;
  const dimensions =
    width !== null && height !== null
      ? `${String(width)}×${String(height)}`
      : null;
  const alt = t("alt", {
    path,
    version: t(version),
    dimensions: dimensions === null ? "" : `, ${dimensions}`,
    size: formatImageBytes(payload.bytes),
  });

  useEffect(() => {
    const image = imageRef.current;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (
      !paused ||
      !loaded ||
      image === null ||
      canvas === null ||
      context === null ||
      context === undefined
    )
      return;
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
  }, [loaded, paused, source]);

  return (
    <figure className="image-compare__side">
      <div className="image-compare__canvas">
        <img
          ref={imageRef}
          className={
            paused && payload.animated
              ? "image-compare__source image-compare__source--paused"
              : "image-compare__source"
          }
          src={source}
          alt={payload.animated && paused ? "" : alt}
          aria-hidden={payload.animated && paused ? true : undefined}
          draggable={false}
          style={
            realSize ? { width: "max-content", maxWidth: "none" } : undefined
          }
          onLoad={(event) => {
            setLoaded(true);
            const target = event.currentTarget;
            onNaturalSize({
              width: target.naturalWidth,
              height: target.naturalHeight,
            });
          }}
          onError={onDecodeError}
        />
        {paused && payload.animated && loaded && (
          <canvas
            ref={canvasRef}
            className="image-compare__paused-frame"
            role="img"
            aria-label={alt}
          />
        )}
      </div>
      <figcaption className="image-compare__caption">
        <span>{t(version)}</span>
        <span>{t("format", { format: payload.format.toUpperCase() })}</span>
        {dimensions !== null && <span>{dimensions}</span>}
        <span>{formatImageBytes(payload.bytes)}</span>
        {payload.animated && <span>{t("animated")}</span>}
        {payload.animated && (
          <button
            className="button image-compare__play"
            type="button"
            onClick={onTogglePause}
          >
            {t(paused ? "play" : "pause")}
          </button>
        )}
      </figcaption>
    </figure>
  );
}
