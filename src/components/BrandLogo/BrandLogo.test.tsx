// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { useThemePreferences } from "../../state/themePreferences";
import { BRAND_NAME, BrandLogo } from "./BrandLogo";

afterEach(() => {
  cleanup();
  useThemePreferences.getState().setPreference("dark");
});

describe("BrandLogo", () => {
  it("names the product for assistive technology by default", () => {
    render(<BrandLogo variant="stacked" className="logo" />);

    expect(screen.getByRole("img", { name: BRAND_NAME })).toBeDefined();
  });

  it("hides a logo that repeats a name shown beside it", () => {
    const { container } = render(
      <BrandLogo variant="mark" className="logo" decorative />,
    );

    const image = container.querySelector("img");
    expect(image?.getAttribute("alt")).toBe("");
    expect(screen.queryByRole("img")).toBeNull();
  });

  it.each(["horizontal", "stacked"] as const)(
    "uses different %s artwork for each theme",
    (variant) => {
      const source = () =>
        render(<BrandLogo variant={variant} className="logo" />)
          .container.querySelector("img")
          ?.getAttribute("src");

      useThemePreferences.getState().setPreference("dark");
      const dark = source();
      cleanup();
      useThemePreferences.getState().setPreference("light");
      const light = source();

      expect(dark).toBeTruthy();
      expect(light).toBeTruthy();
      expect(dark).not.toBe(light);
    },
  );

  it("shares the mark between themes", () => {
    const source = () =>
      render(<BrandLogo variant="mark" className="logo" />)
        .container.querySelector("img")
        ?.getAttribute("src");

    useThemePreferences.getState().setPreference("dark");
    const dark = source();
    cleanup();
    useThemePreferences.getState().setPreference("light");

    expect(source()).toBe(dark);
  });

  it("reserves the exported size so layout does not shift on load", () => {
    const { container } = render(
      <BrandLogo variant="horizontal" className="logo" />,
    );

    const image = container.querySelector("img");
    expect(image?.getAttribute("width")).toBe("744");
    expect(image?.getAttribute("height")).toBe("160");
  });
});
