import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type { ImageOutcome, ImagePayload, ImageVersion } from "../../bindings";
import { ErrorMessage } from "../ErrorMessage";
import { ImageSide } from "./ImageSide";
import { ImageSlider } from "./ImageSlider";
import { formatImageBytes } from "./format";
import "./ImageCompare.css";

interface ImageCompareProps {
  readonly path: string;
  readonly previous: ImageOutcome | null;
  readonly saved: ImageOutcome | null;
  readonly previousLoading?: boolean;
  readonly savedLoading?: boolean;
  readonly previousError?: unknown;
  readonly savedError?: unknown;
  readonly previousExpanded?: boolean;
  readonly savedExpanded?: boolean;
  readonly onExpand: (version: ImageVersion) => void;
}

function payload(outcome: ImageOutcome | null): ImagePayload | null {
  return outcome?.kind === "image" ? outcome.image : null;
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/** Compares one or two bounded image versions with keyboard-accessible controls. */
export function ImageCompare({
  path,
  previous,
  saved,
  previousLoading = false,
  savedLoading = false,
  previousError,
  savedError,
  previousExpanded = false,
  savedExpanded = false,
  onExpand,
}: ImageCompareProps) {
  const { t } = useTranslation(["image", "common"]);
  const [layout, setLayout] = useState<"side_by_side" | "slider">(
    "side_by_side",
  );
  const [realSize, setRealSize] = useState(false);
  const [slider, setSlider] = useState(50);
  const [failed, setFailed] = useState<ReadonlySet<ImageVersion>>(
    () => new Set(),
  );
  const [sizes, setSizes] = useState<
    Partial<Record<ImageVersion, { width: number; height: number }>>
  >({});
  const [paused, setPaused] = useState(() => prefersReducedMotion());

  useEffect(() => {
    try {
      const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
      const update = () => {
        setPaused(preference.matches);
      };
      preference.addEventListener("change", update);
      return () => {
        preference.removeEventListener("change", update);
      };
    } catch {
      return;
    }
  }, []);

  const previousImage = payload(previous);
  const savedImage = payload(saved);
  const images = [
    ...(previousImage === null
      ? []
      : [{ version: "previous" as const, image: previousImage }]),
    ...(savedImage === null
      ? []
      : [{ version: "saved" as const, image: savedImage }]),
  ];
  const renderImages = images.filter(({ version }) => !failed.has(version));
  const unavailableVersions = [
    ...(previous === null ||
    previous.kind === "image" ||
    previous.kind === "missing"
      ? []
      : [{ version: "previous" as const, outcome: previous }]),
    ...(saved === null || saved.kind === "image" || saved.kind === "missing"
      ? []
      : [{ version: "saved" as const, outcome: saved }]),
  ];
  const isLoading = images.length === 0 && (previousLoading || savedLoading);
  const errors = [previousError, savedError].filter(
    (error) => error !== undefined && error !== null,
  );
  const updateSize =
    (version: ImageVersion) => (size: { width: number; height: number }) => {
      setSizes((current) => {
        const existing = current[version];
        if (existing === undefined) return { ...current, [version]: size };
        if (existing.width !== size.width || existing.height !== size.height) {
          return { ...current, [version]: size };
        }
        return current;
      });
    };
  const decodeError = (version: ImageVersion) => () => {
    setFailed((current) => new Set(current).add(version));
  };

  if (images.length === 0 && errors.length > 0) {
    return (
      <div className="state image-compare__state" role="alert">
        {errors.map((error, index) => (
          <ErrorMessage key={index} error={error} />
        ))}
      </div>
    );
  }
  if (isLoading)
    return (
      <p className="state image-compare__state" role="status">
        {t("loading")}
      </p>
    );
  if (images.length === 0) {
    const outcomes = [previous, saved].filter(
      (item): item is ImageOutcome => item !== null,
    );
    if (outcomes.some((item) => item.kind === "too_large")) {
      const version: ImageVersion =
        previous?.kind === "too_large" ? "previous" : "saved";
      const outcome = version === "previous" ? previous : saved;
      const expanded =
        version === "previous" ? previousExpanded : savedExpanded;
      if (outcome?.kind === "too_large")
        return (
          <div className="image-compare__notice" role="status">
            <p>
              {expanded
                ? t("hardLimit", { count: formatImageBytes(outcome.bytes) })
                : t("tooLarge", { count: formatImageBytes(outcome.bytes) })}
            </p>
            {!expanded && (
              <button
                className="button"
                type="button"
                onClick={() => {
                  onExpand(version);
                }}
              >
                {t("loadFull")}
              </button>
            )}
          </div>
        );
    }
    const withheld = outcomes.find((item) => item.kind === "withheld");
    if (withheld?.kind === "withheld")
      return (
        <p className="image-compare__notice" role="status">
          {t("withheld", {
            format: withheld.format.toUpperCase(),
            dimensions:
              withheld.width !== null && withheld.height !== null
                ? `${String(withheld.width)}×${String(withheld.height)}`
                : "",
            size: formatImageBytes(withheld.bytes),
          })}
        </p>
      );
    if (outcomes.some((item) => item.kind === "not_image"))
      return (
        <p className="image-compare__notice" role="status">
          {t("notImage")}
        </p>
      );
    if (
      outcomes.every(
        (item) => item.kind === "missing" || item.kind === "unsupported",
      )
    )
      return (
        <p className="image-compare__notice" role="status">
          {t("unavailable")}
        </p>
      );
    return null;
  }
  if (renderImages.length === 0) {
    return (
      <p className="image-compare__notice" role="alert">
        {t("decodeError", { path })}
      </p>
    );
  }

  const twoImages = previousImage !== null && savedImage !== null;
  const dimensions = (image: ImagePayload, version: ImageVersion) => {
    const width = image.width ?? sizes[version]?.width;
    const height = image.height ?? sizes[version]?.height;
    return width !== undefined && height !== undefined
      ? `${String(width)}×${String(height)}`
      : null;
  };
  const previousDimensions =
    previousImage === null ? null : dimensions(previousImage, "previous");
  const savedDimensions =
    savedImage === null ? null : dimensions(savedImage, "saved");
  const dimensionsChanged =
    twoImages &&
    previousDimensions !== null &&
    savedDimensions !== null &&
    previousDimensions !== savedDimensions;

  return (
    <section
      className={`image-compare${realSize ? " image-compare--real" : ""}`}
      aria-label={t("viewerLabel", { path })}
    >
      <div className="image-compare__toolbar">
        {twoImages && (
          <div
            className="segmented"
            role="group"
            aria-label={t("comparisonLayout")}
          >
            <button
              className="segmented__option"
              type="button"
              aria-pressed={layout === "side_by_side"}
              onClick={() => {
                setLayout("side_by_side");
              }}
            >
              {t("sideBySide")}
            </button>
            <button
              className="segmented__option"
              type="button"
              aria-pressed={layout === "slider"}
              onClick={() => {
                setLayout("slider");
              }}
            >
              {t("slider")}
            </button>
          </div>
        )}
        <div className="segmented" role="group" aria-label={t("scale")}>
          <button
            className="segmented__option"
            type="button"
            aria-pressed={!realSize}
            onClick={() => {
              setRealSize(false);
            }}
          >
            {t("fit")}
          </button>
          <button
            className="segmented__option"
            type="button"
            aria-pressed={realSize}
            onClick={() => {
              setRealSize(true);
            }}
          >
            {t("actualSize")}
          </button>
        </div>
      </div>
      {dimensionsChanged && (
        <p className="image-compare__notice" role="status">
          {t("dimensionsChanged", {
            previous: previousDimensions,
            saved: savedDimensions,
          })}
        </p>
      )}
      {unavailableVersions.map(({ version, outcome }) => (
        <p className="image-compare__notice" key={version} role="status">
          {outcome.kind === "too_large"
            ? (version === "previous" ? previousExpanded : savedExpanded)
              ? t("hardLimit", { count: formatImageBytes(outcome.bytes) })
              : t("otherVersionTooLarge")
            : outcome.kind === "withheld"
              ? t("withheld", {
                  format: outcome.format.toUpperCase(),
                  dimensions:
                    outcome.width !== null && outcome.height !== null
                      ? `${String(outcome.width)}×${String(outcome.height)}`
                      : "",
                  size: formatImageBytes(outcome.bytes),
                })
              : outcome.kind === "not_image"
                ? t("notImage")
                : t("versionUnavailable")}
          {outcome.kind === "too_large" &&
            !(version === "previous" ? previousExpanded : savedExpanded) && (
              <button
                className="button"
                type="button"
                onClick={() => {
                  onExpand(version);
                }}
              >
                {t("loadFull")}
              </button>
            )}
        </p>
      ))}
      {errors.map((error, index) => (
        <div className="image-compare__notice" key={index} role="alert">
          <ErrorMessage error={error} />
        </div>
      ))}
      {images.some(({ version }) => failed.has(version)) && (
        <p className="image-compare__notice" role="alert">
          {t("decodeError", { path })}
        </p>
      )}
      {renderImages.length === 2 && layout === "slider" ? (
        <div className="image-compare__slider-view">
          <div className="image-compare__slider-stage">
            {previousImage !== null && !failed.has("previous") && (
              <div className="image-compare__slider-layer">
                <ImageSide
                  payload={previousImage}
                  path={path}
                  version="previous"
                  naturalSize={sizes.previous ?? null}
                  onNaturalSize={updateSize("previous")}
                  realSize={realSize}
                  paused={paused}
                  onTogglePause={() => {
                    setPaused((value) => !value);
                  }}
                  onDecodeError={decodeError("previous")}
                />
              </div>
            )}
            {savedImage !== null && !failed.has("saved") && (
              <div
                className="image-compare__slider-layer image-compare__slider-layer--saved"
                style={{ clipPath: `inset(0 ${String(100 - slider)}% 0 0)` }}
              >
                <ImageSide
                  payload={savedImage}
                  path={path}
                  version="saved"
                  naturalSize={sizes.saved ?? null}
                  onNaturalSize={updateSize("saved")}
                  realSize={realSize}
                  paused={paused}
                  onTogglePause={() => {
                    setPaused((value) => !value);
                  }}
                  onDecodeError={decodeError("saved")}
                />
              </div>
            )}
          </div>
          <ImageSlider value={slider} onChange={setSlider} />
          <div className="image-compare__slider-metadata">
            {[
              ...(previousImage === null || failed.has("previous")
                ? []
                : [{ version: "previous" as const, image: previousImage }]),
              ...(savedImage === null || failed.has("saved")
                ? []
                : [{ version: "saved" as const, image: savedImage }]),
            ].map(({ version, image }) => (
              <span key={version}>
                {t("sideMetadata", {
                  version: t(version),
                  format: image.format.toUpperCase(),
                  dimensions: dimensions(image, version) ?? "",
                  size: formatImageBytes(image.bytes),
                })}
              </span>
            ))}
          </div>
          <div className="image-compare__slider-legend">
            <span>{t("previous")}</span>
            <span>{t("saved")}</span>
          </div>
        </div>
      ) : (
        <div
          className={`image-compare__grid${renderImages.length === 1 ? " image-compare__grid--single" : ""}`}
        >
          {renderImages.map(({ version, image }) => (
            <ImageSide
              key={version}
              payload={image}
              path={path}
              version={version}
              naturalSize={sizes[version] ?? null}
              onNaturalSize={updateSize(version)}
              realSize={realSize}
              paused={paused}
              onTogglePause={() => {
                setPaused((value) => !value);
              }}
              onDecodeError={decodeError(version)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
