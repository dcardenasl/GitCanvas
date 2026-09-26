import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
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
const input = path.join(outputDir, "atlas-storefront-walkthrough-en.mp4");
const output = path.join(
  outputDir,
  "atlas-storefront-walkthrough-en-vertical.mp4",
);
const font = "/System/Library/Fonts/Supplemental/Arial.ttf";
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "gitcanvas-vertical-"));
const sections = [
  {
    start: 2.12,
    end: 14.12,
    label: "GITCANVAS   /   01   HISTORY",
    title: "Branches & commits",
    detail: "Trace a feature branch into main.",
  },
  {
    start: 14.12,
    end: 21.94,
    label: "GITCANVAS   /   02   LOCAL CHANGES",
    title: "Review local changes",
    detail: "Compare staged and pending edits.",
  },
  {
    start: 21.94,
    end: 28.78,
    label: "GITCANVAS   /   03   NEW COMMIT",
    title: "Refresh the history",
    detail: "Find the commit you just created.",
  },
  {
    start: 28.78,
    end: 38.72,
    label: "GITCANVAS   /   04   COMMIT DETAILS",
    title: "Inspect any commit",
    detail: "Review its author, files, and diff.",
  },
];

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} exited with code ${result.status}`);
  }
}

function cropXExpression(keyframes) {
  let expression = String(keyframes.at(-1)[1]);
  for (let index = keyframes.length - 2; index >= 0; index -= 1) {
    const [start, from] = keyframes[index];
    const [end, to] = keyframes[index + 1];
    const progress = `(t-${start})/(${end}-${start})`;
    const eased = `(${progress})*(${progress})*(3-2*(${progress}))`;
    expression = `if(lt(t,${end}),${from}+(${to}-${from})*${eased},${expression})`;
  }
  return `'${expression}'`;
}

function makeCaption(section, index) {
  const image = path.join(tempDir, `caption-${index + 1}.png`);
  const args = [
    "-size",
    "1080x1920",
    "xc:none",
    "-fill",
    "#0d1019",
    "-draw",
    "roundrectangle 42,1505 1038,1920 28,28",
    "-fill",
    "#8b7bff",
    "-draw",
    "roundrectangle 78,1550 86,1795 4,4",
    "-font",
    font,
    "-gravity",
    "northwest",
    "-pointsize",
    "26",
    "-fill",
    "#aa9cff",
    "-draw",
    `text 112,1585 '${section.label}'`,
    "-pointsize",
    "52",
    "-fill",
    "#f6f5ff",
    "-draw",
    `text 112,1668 '${section.title}'`,
    "-pointsize",
    "32",
    "-fill",
    "#cbd0df",
    "-draw",
    `text 112,1738 '${section.detail}'`,
    image,
  ];
  run("magick", args);
  return image;
}

function makeLaptopFrame(screen, output) {
  const resizedScreen = path.join(tempDir, "laptop-screen.png");
  const shadow = path.join(tempDir, "laptop-shadow.png");
  run("magick", [
    screen,
    "-resize",
    "968x605!",
    "-fill",
    "#0f121b",
    "-stroke",
    "none",
    "-draw",
    "rectangle 0,490 410,590",
    resizedScreen,
  ]);
  run("magick", [
    "-size",
    "1080x1920",
    "xc:none",
    "-fill",
    "#000000a0",
    "-draw",
    "roundrectangle 28,517 1052,1220 26,26",
    "-blur",
    "0x24",
    shadow,
  ]);
  run("magick", [
    "-size",
    "1080x1920",
    "gradient:#171725-#08090e",
    "-fill",
    "#161927",
    "-draw",
    "ellipse 540,850 800,650 0,360",
    shadow,
    "-compose",
    "over",
    "-composite",
    "-fill",
    "#252832",
    "-stroke",
    "#575c69",
    "-strokewidth",
    "3",
    "-draw",
    "roundrectangle 36,515 1044,1174 25,25",
    resizedScreen,
    "-geometry",
    "+56+538",
    "-compose",
    "over",
    "-composite",
    "-fill",
    "#a9acb5",
    "-stroke",
    "#777b85",
    "-strokewidth",
    "2",
    "-draw",
    "polygon 36,1174 1044,1174 1080,1218 0,1218",
    "-fill",
    "#868a94",
    "-stroke",
    "none",
    "-draw",
    "line 50,1177 1030,1177",
    "-fill",
    "#9296a0",
    "-stroke",
    "#7f838d",
    "-strokewidth",
    "1",
    "-draw",
    "roundrectangle 444,1183 636,1203 7,7",
    output,
  ]);
  return output;
}

function makeLogoCover(source, output) {
  run("ffmpeg", [
    "-y",
    "-ss",
    "0.80",
    "-i",
    source,
    "-frames:v",
    "1",
    "-vf",
    "crop=756:1344:1062:228,scale=1080:1920:flags=lanczos,setsar=1",
    output,
    "-loglevel",
    "error",
  ]);
}

function makeStillClip(image, output, frameCount) {
  run("ffmpeg", [
    "-y",
    "-loop",
    "1",
    "-framerate",
    "25",
    "-i",
    image,
    "-frames:v",
    String(frameCount),
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "slow",
    "-crf",
    "18",
    "-pix_fmt",
    "yuv420p",
    output,
  ]);
}

function makeZoomClip({ image, caption, output, direction, frameCount }) {
  const easing = `min(on/${frameCount - 1},1)*min(on/${frameCount - 1},1)*(3-2*min(on/${frameCount - 1},1))`;
  const targetX = 202.84;
  const targetY = 785.03;
  const zoom =
    direction === "in" ? `1+(4.233-1)*${easing}` : `4.233+(1-4.233)*${easing}`;
  const centerX =
    direction === "in"
      ? `540+(${targetX}-540)*${easing}`
      : `${targetX}+(540-${targetX})*${easing}`;
  const centerY =
    direction === "in"
      ? `960+(${targetY}-960)*${easing}`
      : `${targetY}+(960-${targetY})*${easing}`;
  const videoFilter = `[0:v]zoompan=z='${zoom}':x='${centerX}-iw/zoom/2':y='${centerY}-ih/zoom/2':d=1:s=1080x1920:fps=25,setsar=1[zoom];[zoom][1:v]overlay=0:0:eof_action=repeat,format=yuv420p[outv]`;
  run("ffmpeg", [
    "-y",
    "-loop",
    "1",
    "-framerate",
    "25",
    "-i",
    image,
    "-loop",
    "1",
    "-framerate",
    "25",
    "-i",
    caption,
    "-filter_complex",
    videoFilter,
    "-map",
    "[outv]",
    "-an",
    "-frames:v",
    String(frameCount),
    "-c:v",
    "libx264",
    "-preset",
    "slow",
    "-crf",
    "18",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    output,
  ]);
}

function extractFrame(source, timestamp, target) {
  run("ffmpeg", [
    "-y",
    "-ss",
    timestamp.toFixed(2),
    "-i",
    source,
    "-frames:v",
    "1",
    target,
    "-loglevel",
    "error",
  ]);
}

function stitchLaptopBookends(baseVideo, logoCover, intro, outro) {
  const introDuration = 38 / 25;
  const startMain = 3.64;
  const endMain = 36.24;
  const mainDuration = endMain - startMain;
  const outroDuration = 62 / 25;
  const finalVideo = path.join(tempDir, "vertical-final.mp4");
  const filter =
    `[1:v]setpts=PTS-STARTPTS[a];` +
    `[0:v]trim=start=${startMain}:duration=${mainDuration},setpts=PTS-STARTPTS[c];` +
    `[2:v]setpts=PTS-STARTPTS[b];[3:v]setpts=PTS-STARTPTS[d];` +
    `[a][b][c][d]concat=n=4:v=1:a=0[outv]`;
  run("ffmpeg", [
    "-y",
    "-i",
    baseVideo,
    "-i",
    logoCover,
    "-i",
    intro,
    "-i",
    outro,
    "-filter_complex",
    filter,
    "-map",
    "[outv]",
    "-map",
    "0:a:0",
    "-t",
    (2.12 + introDuration + mainDuration + outroDuration).toFixed(3),
    "-c:v",
    "libx264",
    "-preset",
    "slow",
    "-crf",
    "18",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "copy",
    "-movflags",
    "+faststart",
    finalVideo,
  ]);
  fs.copyFileSync(finalVideo, output);
}

try {
  if (!fs.existsSync(input)) {
    throw new Error(`English source video not found: ${input}`);
  }
  fs.mkdirSync(outputDir, { recursive: true });
  const inputProbe = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      input,
    ],
    { encoding: "utf8" },
  );
  if (inputProbe.status !== 0) {
    throw new Error(
      inputProbe.stderr || "Could not read source video duration",
    );
  }
  const duration = Number(inputProbe.stdout.trim());
  sections[sections.length - 1].end = duration;

  const keyframes = [
    [0, 1060],
    [2.12, 1060],
    [3.2, 0],
    [5.2, 500],
    [14.12, 500],
    [15.5, 1640],
    [16.2, 1640],
    [17.2, 1640],
    [18.1, 1640],
    [19.5, 0],
    [23.74, 0],
    [25.2, 0],
    [26.4, 500],
    [28.78, 500],
    [29.3, 1640],
    [30.8, 1640],
    [32.2, 0],
    [duration, 0],
  ];
  const verticalKeyframes = [
    [0, 0],
    [2.12, 90],
    [23.74, 90],
    [24.06, 0],
    [28.78, 0],
    [29.3, 90],
    [duration, 90],
  ];
  const baseVideo = path.join(tempDir, "vertical-base.mp4");
  const args = [
    "-y",
    "-i",
    input,
    ...sections.flatMap((section, index) => [
      "-loop",
      "1",
      "-framerate",
      "25",
      "-i",
      makeCaption(section, index),
    ]),
  ];
  const filters = [
    `[0:v]crop=756:1344:x=${cropXExpression(keyframes)}:y=${cropXExpression(verticalKeyframes)},scale=1080:1920:flags=lanczos,setsar=1[base]`,
  ];
  let current = "base";
  sections.forEach((section, index) => {
    const next = `captioned${index + 1}`;
    filters.push(
      `[${current}][${index + 1}:v]overlay=0:0:eof_action=repeat:enable='between(t,${section.start},${section.end})'[${next}]`,
    );
    current = next;
  });
  args.push(
    "-filter_complex",
    `${filters.join(";")};[${current}]format=yuv420p[outv]`,
    "-map",
    "[outv]",
    "-map",
    "0:a:0",
    "-t",
    duration.toFixed(3),
    "-c:v",
    "libx264",
    "-preset",
    "slow",
    "-crf",
    "18",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "copy",
    "-movflags",
    "+faststart",
    baseVideo,
  );

  run("ffmpeg", args);
  const originalLandscape = input;
  const introScreenshot = path.join(tempDir, "screen-intro.png");
  const outroScreenshot = path.join(tempDir, "screen-outro.png");
  const introLaptop = path.join(tempDir, "laptop-intro.png");
  const outroLaptop = path.join(tempDir, "laptop-outro.png");
  const logoCover = path.join(tempDir, "logo-cover.png");
  const logoClip = path.join(tempDir, "logo-cover.mp4");
  const introClip = path.join(tempDir, "zoom-in.mp4");
  const outroClip = path.join(tempDir, "zoom-out.mp4");

  extractFrame(originalLandscape, 3.64, introScreenshot);
  extractFrame(originalLandscape, 38.4, outroScreenshot);
  makeLogoCover(originalLandscape, logoCover);
  makeStillClip(logoCover, logoClip, 53);
  makeLaptopFrame(introScreenshot, introLaptop);
  makeLaptopFrame(outroScreenshot, outroLaptop);
  makeZoomClip({
    image: introLaptop,
    caption: makeCaption(sections[0], 0),
    output: introClip,
    direction: "in",
    frameCount: 38,
  });
  makeZoomClip({
    image: outroLaptop,
    caption: makeCaption(sections[3], 3),
    output: outroClip,
    direction: "out",
    frameCount: 62,
  });
  stitchLaptopBookends(baseVideo, logoClip, introClip, outroClip);
  console.log(`Vertical video generated: ${output}`);
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
