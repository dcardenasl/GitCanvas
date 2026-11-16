import { describe, expect, it } from "vitest";
import pkg from "../../package.json";

/**
 * Guards the release protocol in `docs/releasing.md`: the README presents the
 * product and only its latest release, so a version bump that forgets the
 * README, or a replaced demo that leaves its old file behind, fails here.
 */
const README = import.meta.glob<string>("../../README.md", {
  query: "?raw",
  import: "default",
  eager: true,
})["../../README.md"];

const ASSET_PATHS = Object.keys(import.meta.glob("../../docs/assets/*")).map(
  (path) => path.replace("../../", ""),
);

const referencedAssets = (readme: string): string[] =>
  [...readme.matchAll(/docs\/assets\/[\w.-]+/g)].map((match) => match[0]);

describe("README release protocol", () => {
  it("reads the README", () => {
    expect(README).toBeTypeOf("string");
  });

  it("names the app's current minor version in its single Latest section", () => {
    const [major, minor] = pkg.version.split(".");
    const headings = [...(README ?? "").matchAll(/^## Latest: (\d+\.\d+)\b/gm)];
    expect(headings.map((heading) => heading[1])).toEqual([
      `${major ?? ""}.${minor ?? ""}`,
    ]);
  });

  it("points every image at a file that exists", () => {
    const missing = referencedAssets(README ?? "").filter(
      (path) => !ASSET_PATHS.includes(path),
    );
    expect(missing).toEqual([]);
  });

  it("keeps no asset that the README does not show", () => {
    const used = new Set(referencedAssets(README ?? ""));
    expect(ASSET_PATHS.filter((path) => !used.has(path))).toEqual([]);
  });

  it("is written in English", () => {
    const withoutName = (README ?? "").replace("Cárdenas", "");
    expect(withoutName).not.toMatch(/[áéíóúñ¿¡]/i);
  });
});
