import fs from "node:fs";
import { createHash } from "node:crypto";

const sourceFile = "wallpanel-src.js";
const overlayFiles = [
  "portrait-pairing.js",
  "portrait-info-fix.js",
  "media-info-fallback.js",
  "ui-polish-r25.js"
];

const source = fs.readFileSync(sourceFile, "utf8");
const hacs = JSON.parse(fs.readFileSync("hacs.json", "utf8"));

const requiredSourcePatterns = [
  ["wallpanel custom element", /wallpanel-view/],
  ["updateMedia method", /\bupdateMedia\s*\(/],
  ["_switchActiveMedia method", /\b_switchActiveMedia\s*\(/],
  ["setMediaDataInfo method", /\bsetMediaDataInfo\s*\(/],
  ["setMediaDimensions method", /\bsetMediaDimensions\s*\(/],
  ["getActiveMediaElement method", /\bgetActiveMediaElement\s*\(/],
  ["getInactiveMediaElement method", /\bgetInactiveMediaElement\s*\(/],
  ["imageOne field", /\bimageOne\b/],
  ["imageTwo field", /\bimageTwo\b/],
  ["imageOneContainer field", /\bimageOneContainer\b/],
  ["imageTwoContainer field", /\bimageTwoContainer\b/],
  ["imageOneInfoContainer field", /\bimageOneInfoContainer\b/],
  ["imageTwoInfoContainer field", /\bimageTwoInfoContainer\b/],
  ["mediaList field", /\bmediaList\b/],
  ["mediaIndex field", /\bmediaIndex\b/],
  ["mediaListDirection field", /\bmediaListDirection\b/],
  ["media_order option", /\bmedia_order\b/],
  ["show_image_info option", /\bshow_image_info\b/],
  ["image_info_template option", /\bimage_info_template\b/]
];

const missing = requiredSourcePatterns
  .filter(([, pattern]) => !pattern.test(source))
  .map(([name]) => name);

if (hacs.filename !== "wallpanel.js") {
  missing.push('hacs filename must remain "wallpanel.js"');
}

for (const file of overlayFiles) {
  if (!fs.existsSync(file)) {
    missing.push(`overlay file ${file}`);
  }
}

if (missing.length) {
  console.error("Fork overlay compatibility check FAILED.");
  console.error("The upstream layout/API changed or the overlay is incomplete:");
  for (const item of missing) console.error(` - ${item}`);
  console.error("No update should be published to HACS.");
  process.exit(1);
}

// HACS only registers wallpanel.js. The remaining files are loaded as ES modules.
// Give every module a content-derived query string so an upstream sync can never
// leave the tablet on an older cached child module.
const hash = createHash("sha256");
for (const file of [sourceFile, ...overlayFiles]) {
  hash.update(file);
  hash.update("\0");
  hash.update(fs.readFileSync(file));
  hash.update("\0");
}
const cacheKey = hash.digest("hex").slice(0, 12);
const entryFiles = [sourceFile, ...overlayFiles];
const expectedEntry = `${entryFiles.map((file) => `import "./${file}?v=${cacheKey}";`).join("\n")}\n`;

const currentEntry = fs.existsSync("wallpanel.js") ? fs.readFileSync("wallpanel.js", "utf8") : "";
if (currentEntry !== expectedEntry) {
  fs.writeFileSync("wallpanel.js", expectedEntry);
  console.log(`Updated wallpanel.js cache key to ${cacheKey}.`);
}

console.log(`Fork overlay compatibility check passed (cache key ${cacheKey}).`);
