import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const scriptDir = path.dirname(new URL(import.meta.url).pathname);
const rendererPath = path.join(scriptDir, "render-social-poster.mjs");

const examples = {
  short: {
    profile: "short",
    scene: "/absolute/path/generated-blue-scene.png",
    sceneArchive: "/absolute/path/outputs/campaign-blue-scene.png",
    output: "/absolute/path/outputs/campaign-poster.png",
    eyebrow: "Invite & Earn",
    headline: "Discord Exclusive $300 HTX",
    headlineLines: ["Discord", "Exclusive", "$300", "HTX"],
    cta: "https://discord.gg/htx-official",
  },
  extended: {
    profile: "extended",
    scene: "/absolute/path/generated-blue-scene.png",
    sceneArchive: "/absolute/path/outputs/creator-challenge-blue-scene.png",
    output: "/absolute/path/outputs/creator-challenge-poster.png",
    eyebrow: "火币广场",
    headline: "七月创作 挑战赛",
    headlineLines: ["七月创作", "挑战赛"],
    description: "发帖参与挑战，用优质内容赢取曝光与奖励",
    descriptionLines: ["发帖参与挑战，", "用优质内容赢取曝光与奖励"],
    cta: "创作瓜分 1,500 USDT",
    footerNote: "让每一次表达，都变成被看见的价值",
  },
};

const arg = process.argv[2];
if (arg === "--print-example") {
  const profile = process.argv[3] || "short";
  if (!examples[profile]) throw new Error("Example profile must be short or extended");
  process.stdout.write(`${JSON.stringify(examples[profile], null, 2)}\n`);
  process.exit(0);
}
if (!arg) {
  throw new Error("Usage: node run-fast-poster.mjs /absolute/path/config.json");
}

const startedAt = Date.now();
const configPath = path.resolve(arg);
const config = JSON.parse(await fs.readFile(configPath, "utf8"));
const profile = config.profile || "short";
if (!["short", "extended"].includes(profile)) {
  throw new Error("profile must be short or extended");
}
for (const key of ["scene", "output", "eyebrow", "headline", "headlineLines", "cta"]) {
  if (!config[key]) throw new Error(`Missing required config field: ${key}`);
}
if (!path.isAbsolute(config.scene) || !path.isAbsolute(config.output)) {
  throw new Error("scene and output must be absolute paths");
}
if (!Array.isArray(config.headlineLines) || config.headlineLines.length < 1) {
  throw new Error("headlineLines must be a non-empty array");
}
if (config.foreground || config.asset) {
  throw new Error("Fast poster mode forbids foreground extraction and transparent asset mode");
}
for (const key of ["headlineMinSize", "headlineMaxSize", "sceneBackground", "sceneBackgroundTop", "sceneBackgroundBottom"]) {
  if (config[key] !== undefined) {
    throw new Error(`Fast poster mode forbids runtime tuning field: ${key}`);
  }
}
if (config.headlineSize !== undefined && Number(config.headlineSize) !== 140) {
  throw new Error("Fast poster mode fixes headlineSize at 140");
}
if (config.sceneScale !== undefined && Number(config.sceneScale) !== 1) {
  throw new Error("Fast poster mode fixes sceneScale at 1; crop correctly during generation");
}
if (config.sceneOffsetX !== undefined && Number(config.sceneOffsetX) !== 0) {
  throw new Error("Fast poster mode fixes sceneOffsetX at 0");
}
if (config.sceneOffsetY !== undefined && Number(config.sceneOffsetY) !== 0) {
  throw new Error("Fast poster mode fixes sceneOffsetY at 0");
}

const timeoutMs = Number.isFinite(Number(config.localTimeoutMs))
  ? Math.round(Number(config.localTimeoutMs))
  : 20_000;
if (timeoutMs < 5_000 || timeoutMs > 30_000) {
  throw new Error("localTimeoutMs must be between 5000 and 30000");
}

const sceneStat = await fs.stat(config.scene);
let renderScene = config.scene;
let archiveMs = 0;
if (config.sceneArchive) {
  if (!path.isAbsolute(config.sceneArchive)) {
    throw new Error("sceneArchive must be an absolute path");
  }
  const archiveStartedAt = Date.now();
  await fs.mkdir(path.dirname(config.sceneArchive), { recursive: true });
  await fs.copyFile(config.scene, config.sceneArchive);
  archiveMs = Date.now() - archiveStartedAt;
  renderScene = config.sceneArchive;
}

const rendererConfig = {
  scene: renderScene,
  sceneScale: 1,
  sceneOffsetX: 0,
  sceneOffsetY: 0,
  output: path.resolve(config.output),
  eyebrow: String(config.eyebrow),
  headline: String(config.headline),
  headlineLines: config.headlineLines.map(String),
  headlineSize: 140,
  copyWidth: profile === "extended" ? 670 : 690,
  headlineBottom: 760,
  cta: String(config.cta),
};
if (profile === "extended") {
  if (!config.description || !Array.isArray(config.descriptionLines) || !config.footerNote) {
    throw new Error("extended profile requires description, descriptionLines, and footerNote");
  }
  rendererConfig.description = String(config.description);
  rendererConfig.descriptionLines = config.descriptionLines.map(String);
  rendererConfig.footerNote = String(config.footerNote);
}

await fs.mkdir(path.dirname(rendererConfig.output), { recursive: true });
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "htx-fast-poster-"));
const rendererConfigPath = path.join(tempDir, "render.json");
const reportPath = rendererConfig.output.replace(/\.png$/i, ".timing.json");
await fs.writeFile(rendererConfigPath, `${JSON.stringify(rendererConfig, null, 2)}\n`);

let status = "failed";
let rendererResult = null;
let renderMs = 0;
let failure = null;
try {
  const renderStartedAt = Date.now();
  const { stdout } = await execFileAsync(process.execPath, [rendererPath, rendererConfigPath], {
    timeout: timeoutMs,
    maxBuffer: 2 * 1024 * 1024,
  });
  renderMs = Date.now() - renderStartedAt;
  rendererResult = JSON.parse(stdout.trim());
  status = "complete";
} catch (error) {
  renderMs = renderMs || Date.now() - startedAt;
  failure = error.killed || error.signal
    ? `Local render exceeded ${timeoutMs} ms and was terminated`
    : String(error.stderr || error.message || error);
} finally {
  await fs.rm(tempDir, { recursive: true, force: true });
}

const finishedAt = Date.now();
const report = {
  status,
  profile,
  output: rendererConfig.output,
  scene: config.scene,
  sceneArchive: config.sceneArchive || null,
  headlineSize: 140,
  expectedImageModelCalls: 1,
  observedRenderAttempts: 1,
  archiveMs,
  renderMs,
  localTotalMs: finishedAt - startedAt,
  localTimeoutMs: timeoutMs,
  sceneCreatedAt: new Date(sceneStat.birthtimeMs || sceneStat.mtimeMs).toISOString(),
  sceneToFinalMs: finishedAt - (sceneStat.birthtimeMs || sceneStat.mtimeMs),
  rendererQa: rendererResult?.qa || null,
  failure,
};
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (status !== "complete") process.exitCode = 1;
