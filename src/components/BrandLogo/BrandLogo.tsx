import {
  useThemePreferences,
  type ResolvedTheme,
} from "../../state/themePreferences";

import horizontalDark from "../../assets/branding/gitcanvas-horizontal-dark.png";
import horizontalLight from "../../assets/branding/gitcanvas-horizontal-light.png";
import mark from "../../assets/branding/gitcanvas-mark.png";
import stackedDark from "../../assets/branding/gitcanvas-stacked-dark.png";
import stackedLight from "../../assets/branding/gitcanvas-stacked-light.png";

/** The product name; the same in every language, so it is not in a catalog. */
export const BRAND_NAME = "GitCanvas";

/** Logo lockups available in the application shell. */
export type BrandLogoVariant = "horizontal" | "stacked" | "mark";

interface BrandLogoProps {
  readonly variant: BrandLogoVariant;
  readonly className: string;
  /** The logo repeats a name shown beside it, so assistive tech skips it. */
  readonly decorative?: boolean;
}

interface Artwork {
  readonly src: Readonly<Record<ResolvedTheme, string>>;
  /** Intrinsic size of the exported file, which reserves space before load. */
  readonly width: number;
  readonly height: number;
}

/**
 * Each file is exported at up to four times the size it is drawn at, which
 * keeps it sharp on high-density screens without decoding a print-size bitmap.
 * The wordmark is white on the dark theme and near-black on the light one; the
 * mark reads on both.
 */
const ARTWORK: Readonly<Record<BrandLogoVariant, Artwork>> = {
  horizontal: {
    src: { dark: horizontalDark, light: horizontalLight },
    width: 744,
    height: 160,
  },
  stacked: {
    src: { dark: stackedDark, light: stackedLight },
    width: 1000,
    height: 592,
  },
  mark: { src: { dark: mark, light: mark }, width: 192, height: 192 },
};

/** Selects the supplied high-contrast artwork for the active app theme. */
export function BrandLogo({
  variant,
  className,
  decorative = false,
}: BrandLogoProps) {
  const theme = useThemePreferences((state) => state.resolvedTheme);
  const artwork = ARTWORK[variant];

  return (
    <img
      className={className}
      src={artwork.src[theme]}
      width={artwork.width}
      height={artwork.height}
      alt={decorative ? "" : BRAND_NAME}
      draggable={false}
    />
  );
}
