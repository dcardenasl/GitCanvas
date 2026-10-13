import {
  useThemePreferences,
  type ResolvedTheme,
} from "../../state/themePreferences";

import horizontalDark from "../../assets/branding/final/gitcanvas-horizontal-dark.png";
import horizontalLight from "../../assets/branding/final/gitcanvas-horizontal-light.png";
import mark from "../../assets/branding/final/gitcanvas-mark.png";
import stackedDark from "../../assets/branding/final/gitcanvas-stacked-dark.png";
import stackedLight from "../../assets/branding/final/gitcanvas-stacked-light.png";

/** Logo lockups available in the application shell. */
export type BrandLogoVariant = "horizontal" | "stacked" | "mark";

interface BrandLogoProps {
  readonly variant: BrandLogoVariant;
  readonly className: string;
  readonly alt: string;
}

const logoSources: Record<BrandLogoVariant, Record<ResolvedTheme, string>> = {
  horizontal: { dark: horizontalDark, light: horizontalLight },
  stacked: { dark: stackedDark, light: stackedLight },
  mark: { dark: mark, light: mark },
};

const logoDimensions: Record<
  BrandLogoVariant,
  { readonly width: number; readonly height: number }
> = {
  horizontal: { width: 3717, height: 802 },
  stacked: { width: 3110, height: 1842 },
  mark: { width: 927, height: 930 },
};

/** Selects the supplied high-contrast artwork for the active app theme. */
export function BrandLogo({ variant, className, alt }: BrandLogoProps) {
  const theme = useThemePreferences((state) => state.resolvedTheme);

  return (
    <img
      className={className}
      src={logoSources[variant][theme]}
      width={logoDimensions[variant].width}
      height={logoDimensions[variant].height}
      alt={alt}
      draggable={false}
    />
  );
}
