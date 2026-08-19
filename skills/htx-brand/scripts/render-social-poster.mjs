import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const skillRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const candidates = process.env.HTX_PLAYWRIGHT_MODULE
  ? [process.env.HTX_PLAYWRIGHT_MODULE]
  : [
      "playwright",
      path.join(os.homedir(), ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "node", "node_modules", "playwright", "index.mjs"),
    ];
let playwright;
for (const candidate of candidates) {
  try {
    const specifier = path.isAbsolute(candidate) ? pathToFileURL(candidate).href : candidate;
    playwright = await import(specifier);
    break;
  } catch {
    // Try the next supported runtime location.
  }
}
if (!playwright) {
  throw new Error("Playwright is unavailable. Install it with `npm install playwright`, or set HTX_PLAYWRIGHT_MODULE to its index.mjs path.");
}
const { chromium } = playwright;

const configPath = process.argv[2];
if (!configPath) throw new Error("Usage: node render-social-poster.mjs /absolute/path/config.json");
const config = JSON.parse(await fs.readFile(path.resolve(configPath), "utf8"));
for (const key of ["output", "eyebrow", "headline", "cta"]) {
  if (!config[key]) throw new Error(`Missing required config field: ${key}`);
}
if (!config.asset && !config.scene) {
  throw new Error("Missing required config field: asset (preferred) or scene (legacy)");
}

const artMode = config.asset ? "asset" : "scene";
const artPath = path.resolve(config.asset || config.scene);
const foregroundPath = config.foreground ? path.resolve(config.foreground) : null;
if (foregroundPath && artMode !== "scene") {
  throw new Error("foreground requires scene mode");
}
const outputPath = path.resolve(config.output);
const logoPath = path.join(skillRoot, "assets", "htx-logo-mark-100.svg");
const fontDir = path.join(skillRoot, "assets", "fonts");
const dataUrl = async (file, mime) =>
  `data:${mime};base64,${(await fs.readFile(file)).toString("base64")}`;
const artExt = path.extname(artPath).toLowerCase();
const artMime = artExt === ".webp" ? "image/webp" : artExt === ".jpg" || artExt === ".jpeg" ? "image/jpeg" : "image/png";
const [artSrc, foregroundSrc, logoSrc, urbanistRegularSrc, urbanistMediumSrc, urbanistBoldSrc, cjkRegularSrc, cjkMediumSrc, cjkBoldSrc] = await Promise.all([
  dataUrl(artPath, artMime),
  foregroundPath ? dataUrl(foregroundPath, "image/png") : Promise.resolve(null),
  dataUrl(logoPath, "image/svg+xml"),
  dataUrl(path.join(fontDir, "Urbanist-Regular.ttf"), "font/ttf"),
  dataUrl(path.join(fontDir, "Urbanist-Medium.ttf"), "font/ttf"),
  dataUrl(path.join(fontDir, "Urbanist-Bold.ttf"), "font/ttf"),
  dataUrl(path.join(fontDir, "HarmonyOS-Sans-SC-Regular.ttf"), "font/ttf"),
  dataUrl(path.join(fontDir, "HarmonyOS-Sans-SC-Medium.ttf"), "font/ttf"),
  dataUrl(path.join(fontDir, "HarmonyOS-Sans-SC-Bold.ttf"), "font/ttf"),
]);
const esc = (value) =>
  String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
const headlineLines = Array.isArray(config.headlineLines)
  ? config.headlineLines.map((line) => String(line).trim()).filter(Boolean)
  : null;
if (headlineLines && headlineLines.join(" ") !== String(config.headline).trim()) {
  throw new Error("headlineLines must preserve headline verbatim when joined with spaces");
}
const headlineMarkup = headlineLines
  ? headlineLines.map((line) => `<span class="headline-line">${esc(line)}</span>`).join(" ")
  : esc(config.headline);
const descriptionLines = Array.isArray(config.descriptionLines)
  ? config.descriptionLines.map((line) => String(line).trim()).filter(Boolean)
  : null;
const description = config.description ? String(config.description).trim() : "";
if (descriptionLines && descriptionLines.join("") !== description.replace(/\s+/g, "")) {
  throw new Error("descriptionLines must preserve description verbatim");
}
const descriptionMarkup = descriptionLines
  ? descriptionLines.map((line) => `<span class="description-line">${esc(line)}</span>`).join("")
  : esc(description);
const footerNote = config.footerNote ? String(config.footerNote).trim() : "";
const assetMode = artMode === "asset";
const requestedTitleSize = Number.isFinite(Number(config.headlineSize))
  ? Math.round(Number(config.headlineSize))
  : null;
if (requestedTitleSize !== null && (requestedTitleSize < 68 || requestedTitleSize > 220)) {
  throw new Error("headlineSize must be between 68 and 220");
}
const headlineMinSize = Number.isFinite(Number(config.headlineMinSize))
  ? Math.round(Number(config.headlineMinSize))
  : 68;
const headlineMaxSize = Number.isFinite(Number(config.headlineMaxSize))
  ? Math.round(Number(config.headlineMaxSize))
  : 220;
if (headlineMinSize < 68 || headlineMaxSize > 220 || headlineMinSize > headlineMaxSize) {
  throw new Error("headlineMinSize/headlineMaxSize must define a valid 68–220 range");
}
const oversizedTitle =
  (requestedTitleSize !== null && requestedTitleSize >= 140) ||
  (requestedTitleSize === null && headlineMaxSize >= 140);
const sceneScale = Number.isFinite(Number(config.sceneScale)) ? Number(config.sceneScale) : 1;
const sceneOffsetX = Number.isFinite(Number(config.sceneOffsetX)) ? Math.round(Number(config.sceneOffsetX)) : 0;
const sceneOffsetY = Number.isFinite(Number(config.sceneOffsetY)) ? Math.round(Number(config.sceneOffsetY)) : 0;
const sceneBackgroundTop = /^#[0-9a-f]{6}$/i.test(String(config.sceneBackgroundTop || ""))
  ? String(config.sceneBackgroundTop)
  : null;
const sceneBackgroundBottom = /^#[0-9a-f]{6}$/i.test(String(config.sceneBackgroundBottom || ""))
  ? String(config.sceneBackgroundBottom)
  : null;
const sceneBackground = sceneBackgroundTop && sceneBackgroundBottom
  ? `linear-gradient(180deg,${sceneBackgroundTop},${sceneBackgroundBottom})`
  : /^#[0-9a-f]{6}$/i.test(String(config.sceneBackground || ""))
    ? String(config.sceneBackground)
    : "linear-gradient(180deg,#0066ff,#2692ff)";
if (sceneScale < 1 || sceneScale > 1.4) {
  throw new Error("sceneScale must be between 1 and 1.4");
}
if (Math.abs(sceneOffsetX) > 320 || Math.abs(sceneOffsetY) > 320) {
  throw new Error("sceneOffsetX and sceneOffsetY must be between -320 and 320");
}
const requestedCopyWidth = Number.isFinite(Number(config.copyWidth))
  ? Math.round(Number(config.copyWidth))
  : null;
if (requestedCopyWidth !== null && (requestedCopyWidth < 360 || requestedCopyWidth > 850)) {
  throw new Error("copyWidth must be between 360 and 850");
}
const copyWidth = requestedCopyWidth ?? (oversizedTitle ? 770 : assetMode ? 580 : 650);
const eyebrowRight = oversizedTitle ? 920 : assetMode ? 650 : 720;
const headlineRight = oversizedTitle ? 920 : assetMode ? 650 : 720;
const requestedHeadlineBottom = Number.isFinite(Number(config.headlineBottom))
  ? Math.round(Number(config.headlineBottom))
  : null;
if (requestedHeadlineBottom !== null && (requestedHeadlineBottom < 480 || requestedHeadlineBottom > 820)) {
  throw new Error("headlineBottom must be between 480 and 820");
}
const headlineBottom = requestedHeadlineBottom ?? (oversizedTitle ? 760 : assetMode ? 480 : 500);
const largeTypeRequired = String(config.headline).length <= 32;
const largeTypeMinimum = assetMode ? 96 : 112;
const artCss = assetMode
  ? ".asset{position:absolute;z-index:1;right:12px;bottom:0;width:600px;height:820px;object-fit:contain;object-position:right bottom}"
  : `.scene{position:absolute;inset:0;width:1080px;height:1080px;object-fit:cover;transform-origin:top left;transform:translate(${sceneOffsetX}px,${sceneOffsetY}px) scale(${sceneScale})}`;
const artMarkup = `<img class="${assetMode ? "asset" : "scene"} art" src="${artSrc}">`;
const foregroundMarkup = foregroundSrc
  ? `<img class="foreground" src="${foregroundSrc}">`
  : "";

const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>
@font-face{font-family:HTXUrbanist;src:url("${urbanistRegularSrc}");font-weight:400}
@font-face{font-family:HTXUrbanist;src:url("${urbanistMediumSrc}");font-weight:500}
@font-face{font-family:HTXUrbanist;src:url("${urbanistBoldSrc}");font-weight:700}
@font-face{font-family:HTXCJK;src:url("${cjkRegularSrc}");font-weight:400}
@font-face{font-family:HTXCJK;src:url("${cjkMediumSrc}");font-weight:500}
@font-face{font-family:HTXCJK;src:url("${cjkBoldSrc}");font-weight:700}
*{box-sizing:border-box}html,body{margin:0;width:1080px;height:1080px;overflow:hidden;background:#0066ff;font-family:HTXUrbanist,HTXCJK,sans-serif}
#canvas{position:relative;width:1080px;height:1080px;overflow:hidden;background:${sceneBackground}}
${artCss}.foreground{position:absolute;z-index:3;inset:0;width:1080px;height:1080px;object-fit:cover;transform-origin:top left;transform:translate(${sceneOffsetX}px,${sceneOffsetY}px) scale(${sceneScale});pointer-events:none}.logo{position:absolute;z-index:4;top:60px;right:60px;width:100px;height:100px}
.copy{position:absolute;z-index:2;left:70px;top:76px;width:${copyWidth}px;color:#fff}.eyebrow{margin:0;padding:0;white-space:nowrap;width:max-content;max-width:100%;font-weight:500;line-height:1.1}
h1{margin:18px 0 0;padding:0;font-weight:700;line-height:1.02;white-space:normal;width:fit-content;max-width:100%}.headline-line,.description-line{display:block;white-space:nowrap}.description{margin:28px 0 0;padding:0;font-weight:400;line-height:1.35;color:rgba(255,255,255,.9);width:max-content;max-width:100%}
.footer{position:absolute;z-index:2;left:70px;bottom:68px;color:#fff}.cta{margin:0;padding:0;white-space:nowrap;width:max-content;max-width:650px;background:transparent;color:rgba(255,255,255,.8);font-weight:700;line-height:1.1}.footer-note{margin:12px 0 0;padding:0;white-space:nowrap;width:max-content;max-width:650px;color:rgba(255,255,255,.68);font-weight:400;line-height:1.2}
</style></head><body><main id="canvas">${artMarkup}<section class="copy"><p class="eyebrow">${esc(config.eyebrow)}</p><h1>${headlineMarkup}</h1>${description ? `<p class="description">${descriptionMarkup}</p>` : ""}</section><section class="footer"><p class="cta">${esc(config.cta)}</p>${footerNote ? `<p class="footer-note">${esc(footerNote)}</p>` : ""}</section>${foregroundMarkup}<img class="logo" src="${logoSrc}"></main>
<script>
function setSize(s){const e=document.querySelector(".eyebrow"),h=document.querySelector("h1"),d=document.querySelector(".description"),c=document.querySelector(".cta"),n=document.querySelector(".footer-note");const es=Math.min(56,Math.max(30,Math.round(s*.38))),ds=Math.min(32,Math.max(28,Math.round(s*.22))),cs=n?Math.min(50,Math.max(40,Math.round(s*.35))):Math.min(36,Math.max(30,Math.round(s*.24)));h.style.fontSize=s+"px";e.style.fontSize=es+"px";if(d)d.style.fontSize=ds+"px";c.style.fontSize=cs+"px";if(n)n.style.fontSize=Math.min(28,Math.max(24,Math.round(s*.19)))+"px"}
function fits(){const e=document.querySelector(".eyebrow"),h=document.querySelector("h1"),d=document.querySelector(".description"),c=document.querySelector(".cta"),n=document.querySelector(".footer-note"),eb=e.getBoundingClientRect(),hb=h.getBoundingClientRect(),db=d?d.getBoundingClientRect():null,cb=c.getBoundingClientRect(),nb=n?n.getBoundingClientRect():null;return e.scrollWidth<=e.clientWidth&&h.scrollWidth<=h.clientWidth&&(!d||d.scrollWidth<=d.clientWidth)&&c.scrollWidth<=c.clientWidth&&(!n||n.scrollWidth<=n.clientWidth)&&eb.right<=${eyebrowRight}&&hb.right<=${headlineRight}&&hb.bottom<=${headlineBottom}&&(!db||(db.right<=${headlineRight}&&db.bottom<=820))&&cb.left>=60&&cb.right<=720&&cb.top>=880&&(!nb||(nb.right<=720&&nb.bottom<=1020))}
function fit(){const requested=${requestedTitleSize ?? "null"};if(requested!==null){setSize(requested);document.querySelector("#canvas").dataset.titleSize=requested;return}let ok=${headlineMinSize};for(let s=${headlineMinSize};s<=${headlineMaxSize};s+=2){setSize(s);if(!fits())break;ok=s}setSize(ok);document.querySelector("#canvas").dataset.titleSize=ok}
</script></body></html>`;

await fs.mkdir(path.dirname(outputPath), { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: config.chrome || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
try {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1080 }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([
      document.fonts.load('16px "HTXUrbanist"', "Urbanist 123"),
      document.fonts.load('16px "HTXCJK"', "中文"),
    ]);
    await Promise.all([...document.images].map((img) => img.complete ? null : new Promise((resolve, reject) => {
      img.addEventListener("load", resolve, { once: true });
      img.addEventListener("error", reject, { once: true });
    })));
    fit();
  });
  const qa = await page.evaluate(({ eyebrow, headline, description, cta, footerNote, assetMode, hasForeground, copyWidth, eyebrowRight, headlineRight, headlineBottom, largeTypeRequired, largeTypeMinimum, requestedTitleSize }) => {
    const e=document.querySelector(".eyebrow"),h=document.querySelector("h1"),d=document.querySelector(".description"),c=document.querySelector(".cta"),n=document.querySelector(".footer-note"),art=document.querySelector(".art"),foreground=document.querySelector(".foreground");
    const eb=e.getBoundingClientRect(),hb=h.getBoundingClientRect(),db=d?d.getBoundingClientRect():null,cb=c.getBoundingClientRect(),nb=n?n.getBoundingClientRect():null;
    const hs=parseFloat(getComputedStyle(h).fontSize),es=parseFloat(getComputedStyle(e).fontSize),cs=getComputedStyle(c);
    let transparentRatio=null,opaqueRatio=null;
    if(assetMode){
      const canvas=document.createElement("canvas"),size=64;
      canvas.width=size;canvas.height=size;
      const ctx=canvas.getContext("2d",{willReadFrequently:true});
      ctx.clearRect(0,0,size,size);
      ctx.drawImage(art,0,0,size,size);
      const pixels=ctx.getImageData(0,0,size,size).data;
      let transparent=0,opaque=0;
      for(let i=3;i<pixels.length;i+=4){
        if(pixels[i]<250)transparent++;
        if(pixels[i]>20)opaque++;
      }
      transparentRatio=transparent/(pixels.length/4);
      opaqueRatio=opaque/(pixels.length/4);
    }
    const artBox=art.getBoundingClientRect();
    let foregroundTransparentRatio=null,foregroundOpaqueRatio=null,foregroundNotUpsampled=true,foregroundMatchesScene=true,copyBehindForeground=true;
    if(hasForeground){
      const canvas=document.createElement("canvas"),size=64;
      canvas.width=size;canvas.height=size;
      const ctx=canvas.getContext("2d",{willReadFrequently:true});
      ctx.clearRect(0,0,size,size);
      ctx.drawImage(foreground,0,0,size,size);
      const pixels=ctx.getImageData(0,0,size,size).data;
      let transparent=0,opaque=0;
      for(let i=3;i<pixels.length;i+=4){
        if(pixels[i]<10)transparent++;
        if(pixels[i]>245)opaque++;
      }
      foregroundTransparentRatio=transparent/(pixels.length/4);
      foregroundOpaqueRatio=opaque/(pixels.length/4);
      const foregroundBox=foreground.getBoundingClientRect();
      foregroundNotUpsampled=foreground.naturalWidth>=foregroundBox.width&&foreground.naturalHeight>=foregroundBox.height;
      foregroundMatchesScene=foreground.naturalWidth===art.naturalWidth&&foreground.naturalHeight===art.naturalHeight;
      copyBehindForeground=Number(getComputedStyle(document.querySelector(".copy")).zIndex)<Number(getComputedStyle(foreground).zIndex);
    }
    return {
      artMode:assetMode?"asset":"scene",
      fontsReady:document.fonts.status==="loaded",
      urbanistReady:document.fonts.check('16px "HTXUrbanist"', "Urbanist 123"),
      cjkFallbackReady:document.fonts.check('16px "HTXCJK"', "中文"),
      exact:h.textContent.replace(/\s+/g," ").trim()===headline&&c.textContent===cta&&e.textContent===eyebrow&&(!d||d.textContent.replace(/\s+/g,"")===description.replace(/\s+/g,""))&&(!n||n.textContent===footerNote),
      overflow:Boolean(e.scrollWidth>e.clientWidth||h.scrollWidth>h.clientWidth||(d&&d.scrollWidth>d.clientWidth)||c.scrollWidth>c.clientWidth||(n&&n.scrollWidth>n.clientWidth)),
      safe:eb.right<=eyebrowRight&&hb.right<=headlineRight&&hb.bottom<=headlineBottom&&(!db||(db.right<=headlineRight&&db.bottom<=820))&&cb.left>=60&&cb.right<=720&&cb.top>=880&&(!nb||(nb.right<=720&&nb.bottom<=1020)),
      dateUnboxed:cs.backgroundColor==="rgba(0, 0, 0, 0)"&&cs.color==="rgba(255, 255, 255, 0.8)",
      hierarchy:hs/es>=2,
      largeType:!largeTypeRequired||hs>=largeTypeMinimum,
      titleSizeExact:requestedTitleSize===null||Math.abs(hs-requestedTitleSize)<.1,
      titleSize:hs, headlineFill:hb.width/copyWidth,
      artNotUpsampled:art.naturalWidth>=artBox.width&&art.naturalHeight>=artBox.height,
      artSize:[art.naturalWidth,art.naturalHeight],
      assetHasTransparency:!assetMode||(transparentRatio>=.05&&opaqueRatio>=.05),
      transparentRatio,opaqueRatio,
      foregroundValid:!hasForeground||(foregroundTransparentRatio>=.05&&foregroundOpaqueRatio>=.05),
      foregroundNotUpsampled,foregroundMatchesScene,copyBehindForeground,
      foregroundTransparentRatio,foregroundOpaqueRatio,
    };
  }, { eyebrow: config.eyebrow, headline: config.headline, description, cta: config.cta, footerNote, assetMode, hasForeground: Boolean(foregroundSrc), copyWidth, eyebrowRight, headlineRight, headlineBottom, largeTypeRequired, largeTypeMinimum, requestedTitleSize });
  if (!qa.fontsReady||!qa.urbanistReady||!qa.cjkFallbackReady||!qa.exact||qa.overflow||!qa.safe||!qa.dateUnboxed||!qa.hierarchy||!qa.largeType||!qa.titleSizeExact||qa.headlineFill<.82||!qa.artNotUpsampled||!qa.assetHasTransparency||!qa.foregroundValid||!qa.foregroundNotUpsampled||!qa.foregroundMatchesScene||!qa.copyBehindForeground) {
    throw new Error(`HTX poster QA failed: ${JSON.stringify(qa)}`);
  }
  await page.locator("#canvas").screenshot({ path: outputPath });
  console.log(JSON.stringify({ output: outputPath, qa }, null, 2));
} finally {
  await browser.close();
}
