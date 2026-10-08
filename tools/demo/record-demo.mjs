import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const outputDir = path.resolve(
  process.env.GITCANVAS_VIDEO_DIR ??
    path.join(
      root,
      "..",
      "..",
      "bitacora-engine",
      "registry",
      "projects",
      "gitcanvas-output",
    ),
);
const language = process.env.GITCANVAS_VIDEO_LANGUAGE ?? "es";
const output = path.join(
  outputDir,
  `atlas-storefront-walkthrough-${language}.mp4`,
);
const tempRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), "gitcanvas-product-video-"),
);
const repository = path.join(tempRoot, "atlas-storefront");
const narrationPath = path.join(tempRoot, "narration.wav");
const voice = language === "en" ? "en-US-EmmaNeural" : "es-CL-CatalinaNeural";
const speakingRate = "-5%";
const narration =
  language === "en"
    ? [
        "GitCanvas brings your project history into one clear view. Here we're looking at Atlas Storefront, with its main and summer branches; the merge marks where a pull request came together.",
        "Local changes are split into staged files and changes still in your workspace. Open a file to review the diff.",
        "Make a commit through your usual Git workflow, then refresh GitCanvas to see it appear in the history.",
        "Open any commit to review who made it, which files changed, and the diff. That's how you follow a project as it evolves.",
      ]
    : [
        "GitCanvas reúne la historia de tu proyecto en una sola vista. Aquí vemos Atlas Storefront, con sus ramas principal y de verano; el merge muestra dónde se integró el pull request.",
        "Los cambios locales aparecen separados entre los que ya preparaste y los que siguen en tu espacio de trabajo. Abre un archivo para revisar sus diferencias.",
        "Crea un commit con tu flujo habitual de Git y actualiza GitCanvas para verlo en la historia.",
        "Abre cualquier commit para revisar quién lo creó, qué archivos cambiaron y sus diferencias. Así puedes seguir la evolución del proyecto.",
      ];

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, { cwd: root, env, stdio: "inherit" });
  if (result.error) {
    throw new Error(`Could not start ${command}: ${result.error.message}`, {
      cause: result.error,
    });
  }
  if (result.status !== 0) {
    throw new Error(
      `${command} exited with code ${String(result.status)}${result.signal === null ? "" : ` (signal ${result.signal})`}`,
    );
  }
}

function git(...args) {
  execFileSync("git", ["-C", repository, ...args], { stdio: "pipe" });
}

function write(relativePath, contents) {
  const absolute = path.join(repository, relativePath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, contents);
}

function commit(message, author = "Alex Rivera") {
  git("add", "-A");
  execFileSync(
    "git",
    [
      "-C",
      repository,
      "-c",
      `user.name=${author}`,
      "-c",
      "user.email=demo@example.test",
      "commit",
      "-m",
      message,
    ],
    { stdio: "pipe" },
  );
}

function createDemoRepository() {
  fs.mkdirSync(repository, { recursive: true });
  execFileSync("git", ["init", "-b", "main", repository], { stdio: "pipe" });
  git("config", "user.name", "Alex Rivera");
  git("config", "user.email", "demo@example.test");

  write(
    "README.md",
    "# Atlas Storefront\n\nA small storefront for thoughtfully made outdoor gear.\n",
  );
  write(
    "src/index.html",
    '<!doctype html>\n<html><head><title>Atlas Storefront</title></head><body><header><a href="/">ATLAS</a><nav>New arrivals · Packs · About</nav></header><main><h1>Carry less. Go further.</h1><p>Equipment for the long way around.</p><section class="products"><article class="product-card"><h2>Trail pack</h2><p>Built for the everyday summit.</p></article><article class="product-card"><h2>Camp mug</h2><p>For first light and last call.</p></article></section></main></body></html>\n',
  );
  write(
    "src/styles.css",
    "body { margin: 0; color: #20221f; font: 16px/1.5 sans-serif; }\nheader { display: flex; justify-content: space-between; padding: 24px 6vw; border-bottom: 1px solid #e4e5df; }\nmain { max-width: 1080px; margin: 76px auto; padding: 0 24px; }\n.products { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin-top: 44px; }\n.product-card { min-height: 190px; padding: 24px; background: #f1f2ec; border-radius: 18px; }\n",
  );
  commit("feat: scaffold Atlas storefront");

  git("checkout", "-b", "feature/summer-collection");
  write(
    "src/index.html",
    fs
      .readFileSync(path.join(repository, "src/index.html"), "utf8")
      .replace(
        "</main>",
        '<section class="summer-collection"><h2>Summer, by design</h2><p>Lightweight essentials for the days outside.</p></section></main>',
      ),
  );
  write(
    "src/styles.css",
    `${fs.readFileSync(path.join(repository, "src/styles.css"), "utf8")}\n.summer-collection { margin-top: 52px; padding: 38px; color: #f9f8f4; background: #506b55; border-radius: 18px; }\n`,
  );
  commit("feat: add summer collection");

  git("checkout", "main");
  write(
    "src/navigation-search.ts",
    "export function filterProducts<T extends { name: string }>(products: T[], query: string): T[] {\n  const normalized = query.trim().toLocaleLowerCase();\n  return products.filter((product) => product.name.toLocaleLowerCase().includes(normalized));\n}\n",
  );
  commit("feat: add storefront product search", "Sam Chen");

  git(
    "merge",
    "--no-ff",
    "feature/summer-collection",
    "-m",
    "Merge pull request #24: summer collection",
  );
  write(
    "src/styles.css",
    `${fs.readFileSync(path.join(repository, "src/styles.css"), "utf8")}\n@media (max-width: 640px) { .products { grid-template-columns: 1fr; } }\n`,
  );
  commit("fix: stack product cards on small screens", "Sam Chen");

  write(
    "src/cart.ts",
    "export type CartItem = { productId: string; quantity: number };\n\nexport function itemCount(items: CartItem[]): number {\n  return items.reduce((total, item) => total + item.quantity, 0);\n}\n",
  );
  git("add", "src/cart.ts");
  write(
    "src/styles.css",
    `${fs.readFileSync(path.join(repository, "src/styles.css"), "utf8")}\n/* Local draft: balance product-card spacing. */\n.product-card { gap: 1.25rem; }\n`,
  );
}

function synthesizeNarration() {
  if (language !== "en" && language !== "es") {
    throw new Error('GITCANVAS_VIDEO_LANGUAGE must be "en" or "es".');
  }
  const voiceFiles = narration.map((text, index) => {
    const file = path.join(tempRoot, `voice-${index + 1}.mp3`);
    run(process.env.EDGE_TTS_COMMAND ?? "edge-tts", [
      "--voice",
      voice,
      `--rate=${speakingRate}`,
      "--text",
      text,
      "--write-media",
      file,
    ]);
    return file;
  });
  const inputs = [];
  const segments = [];
  for (const [index, file] of voiceFiles.entries()) {
    inputs.push("-i", file);
    segments.push(`[${index * 2}:a]`);
    if (index < voiceFiles.length - 1) {
      inputs.push(
        "-f",
        "lavfi",
        "-t",
        "0.55",
        "-i",
        "anullsrc=r=24000:cl=mono",
      );
      segments.push(`[${index * 2 + 1}:a]`);
    }
  }
  const chain = segments.join("");
  run("ffmpeg", [
    "-y",
    ...inputs,
    "-filter_complex",
    `${chain}concat=n=${segments.length}:v=0:a=1,adelay=2120:all=1[a]`,
    "-map",
    "[a]",
    "-c:a",
    "pcm_s16le",
    narrationPath,
  ]);
  return voiceFiles.map((file, index) => {
    const raw = execFileSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        file,
      ],
      { encoding: "utf8" },
    ).trim();
    return Number(raw) + (index < voiceFiles.length - 1 ? 0.55 : 0);
  });
}

try {
  fs.mkdirSync(outputDir, { recursive: true });
  createDemoRepository();
  const segmentDurations = synthesizeNarration();
  if (process.env.GITCANVAS_SKIP_APP_BUILD !== "1") {
    run("npm", ["run", "build"]);
    run("cargo", [
      "build",
      "--release",
      "--features",
      "e2e,tauri/custom-protocol",
    ]);
  }
  run(
    "npx",
    [
      "wdio",
      "run",
      "./wdio.conf.ts",
      "--spec",
      "./tools/demo/record-video.ts",
    ],
    {
      ...process.env,
      GITCANVAS_E2E_REPO: repository,
      GITCANVAS_CAPTURE_OUTPUT: output,
      GITCANVAS_RECORDING_AUDIO: narrationPath,
      GITCANVAS_NARRATION_DURATIONS: JSON.stringify(segmentDurations),
      GITCANVAS_VIDEO_LANGUAGE: language,
    },
  );
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
