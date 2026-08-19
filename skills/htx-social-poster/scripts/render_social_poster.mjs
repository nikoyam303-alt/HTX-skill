#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = path.dirname(SCRIPT_DIR);
const CODEX_PLAYWRIGHT = path.join(os.homedir(), ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "node", "node_modules", "playwright", "index.mjs");
const DEFAULT_CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const LAYOUTS = new Set(["big-number-grid", "soft-information"]);

function argument(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function fail(message) {
  throw new Error(message);
}

function text(value, field, required = false) {
  if (value === undefined || value === null) value = "";
  if (typeof value !== "string") fail(`${field} must be a string`);
  if (required && !value.trim()) fail(`${field} is required`);
  return value;
}

function optionalFontSize(value, field) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 18 || value > 160) {
    fail(`${field} must be a number from 18 to 160`);
  }
  return value;
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function assetUrl(...parts) {
  return pathToFileURL(path.join(SKILL_ROOT, "assets", ...parts)).href;
}

function compactLength(value) {
  return Array.from(value.replace(/[\s，。！？、：；,.!?:;]/gu, "")).length;
}

const configPath = argument("--config");
if (!configPath) fail("Usage: render_social_poster.mjs --config /absolute/path/poster.json [--playwright-module /absolute/path/playwright/index.mjs]");
if (!path.isAbsolute(configPath)) fail("--config must be an absolute path");
const raw = JSON.parse(fs.readFileSync(configPath, "utf8"));
if (!LAYOUTS.has(raw.layout)) fail(`Unsupported layout: ${raw.layout}`);
if (!path.isAbsolute(raw.output || "") || !raw.output.toLowerCase().endsWith(".png")) {
  fail("output must be an absolute .png path");
}

const config = {
  layout: raw.layout,
  output: raw.output,
  eyebrow: text(raw.eyebrow, "eyebrow"),
  title: text(raw.title, "title", true),
  titleSize: optionalFontSize(raw.titleSize, "titleSize"),
  eyebrowSize: optionalFontSize(raw.eyebrowSize, "eyebrowSize"),
  value: text(raw.value, "value"),
  valueSuffix: text(raw.valueSuffix, "valueSuffix"),
  cta: raw.cta == null ? null : {
    lead: text(raw.cta?.lead, "cta.lead", true),
    emphasis: text(raw.cta?.emphasis, "cta.emphasis", true),
  },
  footer: text(raw.footer, "footer"),
  note: text(raw.note, "note"),
  modules: Array.isArray(raw.modules) ? raw.modules.map((item, index) => ({
    title: text(item?.title, `modules[${index}].title`, true),
    body: text(item?.body, `modules[${index}].body`, true),
  })) : [],
};
if (config.modules.length > 3) fail("modules supports at most 3 items; use htx-brand for denser content");
if (config.cta && config.modules.length) fail("cta and modules are mutually exclusive; do not turn a CTA into a numbered module");

const joinWords = /^(赢|享|领|得|赚|瓜分|最高|至高|可得|赢取|领取|获得|解锁)$/u;
const normalizedTitle = config.title.replace(/\s+/gu, "");
const titleJoinsValue = Boolean(config.value && (joinWords.test(normalizedTitle) || compactLength(config.title) <= 2));
const contentShape = config.modules.length ? "module-led" : config.cta ? "cta-led" : "title-led";
const headlineMarkup = titleJoinsValue
  ? `<span data-field="title">${escapeHtml(config.title)}</span> <span class="statement-value" data-field="value">${escapeHtml(config.value)}</span> <span class="statement-suffix" data-field="valueSuffix">${escapeHtml(config.valueSuffix)}</span>`
  : `<span data-field="title">${escapeHtml(config.title)}</span>`;
const secondaryMarkup = titleJoinsValue
  ? `<div class="amount"></div><div class="currency"></div>`
  : `<div class="amount exact" data-field="value">${escapeHtml(config.value)}</div><div class="currency exact" data-field="valueSuffix">${escapeHtml(config.valueSuffix)}</div>`;
const titleStyle = config.titleSize ? ` style="font-size:${config.titleSize}px"` : "";
const eyebrowStyle = config.eyebrowSize ? ` style="font-size:${config.eyebrowSize}px"` : "";

const moduleMarkup = config.modules.map((item, index) => `
  <article class="info-item">
    ${config.modules.length > 1 ? `<p class="item-index">${String(index + 1).padStart(2, "0")}</p>` : ""}
    <h2 class="item-title exact" data-field="module-title-${index}">${escapeHtml(item.title)}</h2>
    <p class="item-copy exact" data-field="module-body-${index}">${escapeHtml(item.body)}</p>
  </article>`).join("");

const ctaMarkup = config.cta ? `
  <section class="cta-block safe">
    <p class="cta-lead exact" data-field="cta-lead">${escapeHtml(config.cta.lead)}</p>
    <p class="cta-emphasis exact" data-field="cta-emphasis">${escapeHtml(config.cta.emphasis)}</p>
  </section>` : "";

const logo = config.layout === "soft-information"
  ? assetUrl("htx-logo-mark-inverse-100.svg")
  : assetUrl("htx-logo-mark-100.svg");
const gridBackground = assetUrl("backgrounds", "blue-grid-gradient-01.png");
const softBackground = assetUrl("backgrounds", "soft-blue-white-01.svg");
const font = (name) => assetUrl("fonts", name);
const canvasClasses = [
  config.layout,
  contentShape,
  config.value || config.valueSuffix ? "has-value" : "no-value",
  config.cta ? "has-cta" : "no-cta",
  titleJoinsValue ? "title-joins-value" : "title-independent",
  `modules-${config.modules.length}`,
].join(" ");

const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
@font-face{font-family:"HTX Urbanist";src:url("${font("Urbanist-Regular.ttf")}") format("truetype");font-weight:400;font-style:normal}
@font-face{font-family:"HTX Urbanist";src:url("${font("Urbanist-Medium.ttf")}") format("truetype");font-weight:500;font-style:normal}
@font-face{font-family:"HTX Urbanist";src:url("${font("Urbanist-Bold.ttf")}") format("truetype");font-weight:700;font-style:normal}
@font-face{font-family:"HTX HarmonyOS Sans SC";src:url("${font("HarmonyOS-Sans-SC-Regular.ttf")}") format("truetype");font-weight:400;font-style:normal}
@font-face{font-family:"HTX HarmonyOS Sans SC";src:url("${font("HarmonyOS-Sans-SC-Medium.ttf")}") format("truetype");font-weight:500;font-style:normal}
@font-face{font-family:"HTX HarmonyOS Sans SC";src:url("${font("HarmonyOS-Sans-SC-Bold.ttf")}") format("truetype");font-weight:700;font-style:normal}
*{box-sizing:border-box}html,body{margin:0;background:#0066ff}#wrapper{width:100%;overflow:hidden}
#canvas{position:relative;width:1080px;height:1080px;overflow:hidden;transform-origin:top left;font-family:"HTX Urbanist","HTX HarmonyOS Sans SC",sans-serif;font-style:normal;color:#000;background:#fff}
#canvas.big-number-grid{background-image:url("${gridBackground}");background-size:1080px 1080px;background-position:center;background-repeat:no-repeat}
#canvas.soft-information{background-image:url("${softBackground}");background-size:1080px 1080px;background-position:center;background-repeat:no-repeat}
.logo{position:absolute;top:60px;right:60px;width:100px;height:100px}
.hero{position:absolute}.eyebrow{margin:0;font-family:"HTX HarmonyOS Sans SC",sans-serif;font-weight:400;white-space:pre-line;overflow:hidden}.headline{margin:0;font-family:"HTX HarmonyOS Sans SC",sans-serif;font-weight:700;letter-spacing:-2px;white-space:pre-line;overflow:hidden}.headline .statement-value{font-family:"HTX Urbanist",sans-serif}.headline .statement-suffix{font-family:"HTX Urbanist","HTX HarmonyOS Sans SC",sans-serif}
.prize{position:absolute;display:flex;align-items:center;white-space:nowrap;overflow:hidden}.prize.empty{display:none}.amount{flex:0 0 auto;font-family:"HTX Urbanist",sans-serif;font-weight:700;line-height:1}.currency{flex:0 0 auto;font-family:"HTX Urbanist","HTX HarmonyOS Sans SC",sans-serif;font-weight:500;line-height:1.1;letter-spacing:0;white-space:pre-line}
.info-grid{position:absolute;display:grid;grid-template-columns:repeat(var(--module-count),minmax(0,1fr))}.info-grid.empty{display:none}.info-item{min-width:0}.item-index{margin:0;font-family:"HTX Urbanist",sans-serif;font-weight:500}.item-title{margin:0;font-family:"HTX HarmonyOS Sans SC",sans-serif;font-weight:500;line-height:1.15;white-space:pre-line;overflow:hidden}.item-copy{margin:0;font-family:"HTX Urbanist","HTX HarmonyOS Sans SC",sans-serif;font-weight:400;line-height:1.4;white-space:pre-line;overflow:hidden}
.cta-block{position:absolute}.cta-lead{margin:0;font-family:"HTX HarmonyOS Sans SC",sans-serif;font-weight:500;line-height:1.2;white-space:pre-line;overflow:hidden}.cta-emphasis{margin:0;font-family:"HTX Urbanist","HTX HarmonyOS Sans SC",sans-serif;font-weight:700;line-height:1.15;white-space:pre-line;overflow:hidden}
.footer{position:absolute;display:flex;justify-content:space-between;align-items:center;gap:32px;color:#000;font-size:28px;line-height:1.25;font-weight:400}.footer-primary{display:flex;align-items:center;gap:12px}.time-icon{position:relative;flex:0 0 28px;width:28px;height:28px;border-radius:50%;background:currentColor}.time-icon::before{content:"";position:absolute;left:13px;top:6px;width:3px;height:9px;background:#fff;border-radius:2px}.time-icon::after{content:"";position:absolute;left:13px;top:13px;width:8px;height:3px;background:#fff;border-radius:2px}.note{font-family:"HTX HarmonyOS Sans SC",sans-serif;font-size:28px;font-weight:400;text-align:right}

/* 栅格分区：顶部蓝色区紧凑白色主副标题，下方行动信息。 */
.big-number-grid .hero{top:90px;left:80px;width:840px;height:360px}.big-number-grid .eyebrow{width:780px;height:48px;color:#000;font-size:34px;line-height:1.3}.big-number-grid .headline{position:absolute;top:64px;left:0;width:840px;height:282px;margin:0;color:#000;font-size:108px;line-height:1.3}
.big-number-grid .prize{top:472px;left:80px;width:920px;height:76px;color:#000}.big-number-grid .amount{font-size:58px;letter-spacing:-1px}.big-number-grid .currency{margin-left:18px;font-size:38px}
.big-number-grid .cta-block{top:540px;left:80px;right:80px;height:246px;padding:32px 0 28px;border-top:2px solid rgba(0,0,0,.2);border-bottom:2px solid rgba(0,0,0,.2);color:#000}.big-number-grid .cta-lead{height:48px;margin-bottom:12px;font-size:36px}.big-number-grid .cta-emphasis{height:128px;font-size:60px}
.big-number-grid .info-grid{top:530px;left:80px;right:80px;height:250px;overflow:hidden;border-top:2px solid rgba(0,0,0,.2);border-bottom:2px solid rgba(0,0,0,.2)}.big-number-grid .info-item{padding:32px 30px}.big-number-grid .info-item:first-child{padding-left:0}.big-number-grid .info-item:last-child{padding-right:0}.big-number-grid .info-item+.info-item{border-left:2px solid rgba(0,0,0,.2)}

/* 柔和错位：普通主标题与副标题在中部成组，CTA 右移。 */
.soft-information .hero{top:90px;left:80px;width:820px;height:440px}.soft-information .eyebrow{width:700px;height:48px;color:#000;font-size:34px;line-height:1.3}.soft-information .headline{position:absolute;top:64px;left:0;width:820px;height:282px;margin:0;color:#000;font-size:108px;line-height:1.3}
.soft-information .prize{top:455px;left:80px;width:920px;height:76px;color:#0066ff}.soft-information .amount{font-size:56px;letter-spacing:-1px}.soft-information .currency{margin-left:18px;color:#000;font-size:36px}
.soft-information .cta-block{top:600px;left:300px;right:80px;height:244px;padding:26px 0 18px 30px;border-left:4px solid #0066ff;color:#000}.soft-information .cta-lead{height:42px;margin-bottom:14px;font-size:30px}.soft-information .cta-emphasis{height:142px;font-size:54px}
.soft-information .info-grid{top:590px;left:80px;right:80px;height:260px;gap:36px}.soft-information.modules-1 .info-grid{left:300px}.soft-information .info-item{padding:24px 0 12px;border-top:3px solid #0066ff}.soft-information .info-item+.info-item{border-left:0}

.item-index{height:34px;margin-bottom:12px;color:#0066ff;font-size:28px;line-height:1}.item-title{height:58px;margin-bottom:10px;color:#000;font-size:42px}.item-copy{height:108px;color:#000;font-size:30px}.modules-1 .item-title{height:68px;font-size:50px}.modules-1 .item-copy{font-size:34px}.modules-3 .item-title{font-size:38px}.modules-3 .item-copy{font-size:27px}
.big-number-grid .footer,.soft-information .footer{left:80px;right:80px;bottom:72px;color:#000}.big-number-grid .note,.soft-information .note{color:#000}
</style></head><body>
<div id="wrapper"><main id="canvas" class="${canvasClasses}" style="--module-count:${Math.max(1, config.modules.length)}">
<img class="logo" src="${logo}" alt="HTX">
<section class="hero safe"><p class="eyebrow exact" data-field="eyebrow"${eyebrowStyle}>${escapeHtml(config.eyebrow)}</p><h1 class="headline exact"${titleStyle}>${headlineMarkup}</h1></section>
<section class="prize safe ${config.value || config.valueSuffix ? (titleJoinsValue ? "empty" : "") : "empty"}">${secondaryMarkup}</section>
<section class="info-grid safe modules-${config.modules.length} ${config.modules.length ? "" : "empty"}">${moduleMarkup}</section>
${ctaMarkup}
<footer class="footer safe"><div class="footer-primary">${config.footer ? '<span class="time-icon" aria-hidden="true"></span>' : ''}<div class="exact" data-field="footer">${escapeHtml(config.footer)}</div></div><div class="note exact" data-field="note">${escapeHtml(config.note)}</div></footer>
</main></div>
<script>
function fitCanvas(){const c=document.getElementById("canvas"),w=document.getElementById("wrapper"),s=w.offsetWidth/1080;c.style.transform="scale("+s+")";c.style.transformOrigin="top left";w.style.height=c.offsetHeight*s+"px"}fitCanvas();window.addEventListener("resize",fitCanvas);
</script></body></html>`;

async function loadPlaywright() {
  const explicit = argument("--playwright-module", process.env.HTX_PLAYWRIGHT_MODULE || "");
  const candidates = explicit ? [explicit] : ["playwright", CODEX_PLAYWRIGHT];
  for (const candidate of candidates) {
    try {
      const specifier = path.isAbsolute(candidate) ? pathToFileURL(candidate).href : candidate;
      return await import(specifier);
    } catch {
      // Try the next supported runtime location.
    }
  }
  fail("Playwright is unavailable. Install it with `npm install playwright`, or pass --playwright-module /absolute/path/to/playwright/index.mjs.");
}

const { chromium } = await loadPlaywright();
const browserExecutable = argument("--browser-executable", fs.existsSync(DEFAULT_CHROME) ? DEFAULT_CHROME : "");
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "htx-social-poster-"));
const tempHtml = path.join(tempDir, "poster.html");
fs.writeFileSync(tempHtml, html);
fs.mkdirSync(path.dirname(config.output), { recursive: true });
const started = performance.now();
let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath: browserExecutable || undefined, args: ["--allow-file-access-from-files"] });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1080 }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(tempHtml).href, { waitUntil: "load" });
  const qa = await page.evaluate(async (expected) => {
    await document.fonts.ready;
    const checks = [
      ["700 96px 'HTX HarmonyOS Sans SC'", "社媒海报"],
      ["700 82px 'HTX Urbanist'", "50,000"],
      ["400 30px 'HTX HarmonyOS Sans SC'", "正文检查"],
    ];
    for (const [font, sample] of checks) {
      const loaded = await document.fonts.load(font, sample);
      if (!loaded.length || !document.fonts.check(font, sample)) throw new Error(`Font unavailable: ${font}`);
    }

    const fitAdjustments = [];
    const overflows = (node) => node.scrollWidth > node.clientWidth || node.scrollHeight > node.clientHeight;

    function fitNode(node, preferredMin, step = 2, readableMin = 18) {
      if (!node) return;
      while (overflows(node) && parseFloat(getComputedStyle(node).fontSize) > preferredMin) {
        node.style.fontSize = `${parseFloat(getComputedStyle(node).fontSize) - step}px`;
      }
      while (overflows(node) && parseFloat(getComputedStyle(node).fontSize) > readableMin) {
        node.style.fontSize = `${Math.max(readableMin, parseFloat(getComputedStyle(node).fontSize) - step)}px`;
      }
      if (overflows(node)) {
        const scale = Math.min(node.clientWidth / node.scrollWidth, node.clientHeight / node.scrollHeight);
        node.style.transformOrigin = "top left";
        node.style.transform = `scale(${scale})`;
        fitAdjustments.push({ field: node.dataset.field || node.className, mode: "scale", scale });
      } else if (parseFloat(getComputedStyle(node).fontSize) < preferredMin) {
        fitAdjustments.push({ field: node.dataset.field || node.className, mode: "readable-shrink", fontSize: parseFloat(getComputedStyle(node).fontSize) });
      }
    }

    fitNode(document.querySelector(".eyebrow"), 24);
    fitNode(document.querySelector(".headline"), 64);
    const prize = document.querySelector(".prize");
    const amount = document.querySelector(".amount");
    while (prize.scrollWidth > prize.clientWidth && parseFloat(getComputedStyle(amount).fontSize) > 32) {
      amount.style.fontSize = `${parseFloat(getComputedStyle(amount).fontSize) - 2}px`;
    }
    if (prize.scrollWidth > prize.clientWidth) {
      const scale = prize.clientWidth / prize.scrollWidth;
      prize.style.transformOrigin = "left bottom";
      prize.style.transform = `scale(${scale})`;
      fitAdjustments.push({ field: "value-group", mode: "scale", scale });
    }
    fitNode(document.querySelector(".cta-lead"), 24);
    fitNode(document.querySelector(".cta-emphasis"), 38);
    document.querySelectorAll(".item-title").forEach((node) => fitNode(node, 30));
    document.querySelectorAll(".item-copy").forEach((node) => fitNode(node, 24));

    for (const [field, value] of Object.entries(expected.fields)) {
      const node = document.querySelector(`[data-field="${field}"]`);
      if (!node || node.textContent !== value) throw new Error(`Copy mismatch for ${field}`);
    }
    expected.modules.forEach((item, index) => {
      if (document.querySelector(`[data-field="module-title-${index}"]`).textContent !== item.title) throw new Error(`Copy mismatch for module title ${index}`);
      if (document.querySelector(`[data-field="module-body-${index}"]`).textContent !== item.body) throw new Error(`Copy mismatch for module body ${index}`);
    });
    if (expected.cta) {
      if (document.querySelector('[data-field="cta-lead"]').textContent !== expected.cta.lead) throw new Error("Copy mismatch for CTA lead");
      if (document.querySelector('[data-field="cta-emphasis"]').textContent !== expected.cta.emphasis) throw new Error("Copy mismatch for CTA emphasis");
    }

    const canvas = document.getElementById("canvas").getBoundingClientRect();
    for (const node of document.querySelectorAll(".safe:not(.empty)")) {
      const box = node.getBoundingClientRect();
      if (box.left < canvas.left + 64 || box.right > canvas.right - 64 || box.top < canvas.top + 64 || box.bottom > canvas.bottom - 64) {
        throw new Error(`Safe-area violation: ${node.className}`);
      }
    }

    const visible = (selector) => Array.from(document.querySelectorAll(selector)).filter((node) => getComputedStyle(node).display !== "none");
    const major = visible(".eyebrow,.headline,.prize:not(.empty),.cta-block,.info-grid:not(.empty),.footer");
    const intersects = (a, b) => a.left < b.right - 6 && a.right > b.left + 6 && a.top < b.bottom - 6 && a.bottom > b.top + 6;
    for (let i = 0; i < major.length; i += 1) {
      for (let j = i + 1; j < major.length; j += 1) {
        const a = major[i].getBoundingClientRect();
        const b = major[j].getBoundingClientRect();
        if (intersects(a, b)) throw new Error(`Content collision: ${major[i].className} / ${major[j].className}`);
      }
    }

    const logo = document.querySelector(".logo").getBoundingClientRect();
    if (logo.width !== 100 || logo.height !== 100 || canvas.right - logo.right !== 60 || logo.top - canvas.top !== 60) throw new Error("Logo geometry invalid");
    return {
      width: canvas.width,
      height: canvas.height,
      titleSize: parseFloat(getComputedStyle(document.querySelector(".headline")).fontSize),
      valueSize: parseFloat(getComputedStyle(document.querySelector('[data-field="value"]')).fontSize),
      ctaSize: expected.cta ? parseFloat(getComputedStyle(document.querySelector(".cta-emphasis")).fontSize) : null,
      logoRight: canvas.right - logo.right,
      logoTop: logo.top - canvas.top,
      fitAdjustments,
    };
  }, {
    fields: { eyebrow: config.eyebrow, title: config.title, value: config.value, valueSuffix: config.valueSuffix, footer: config.footer, note: config.note },
    modules: config.modules,
    cta: config.cta,
  });
  await page.locator("#canvas").screenshot({ path: config.output, type: "png" });
  console.log(JSON.stringify({ output: config.output, layout: config.layout, contentShape, titleJoinsValue, qa, renderSeconds: Math.round((performance.now() - started)) / 1000 }, null, 2));
} finally {
  if (browser) await browser.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
}
