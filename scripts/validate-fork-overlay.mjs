import fs from "node:fs";

const source = fs.readFileSync("wallpanel-src.js", "utf8");
const entry = fs.readFileSync("wallpanel.js", "utf8");
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

const requiredImports = [
  "./wallpanel-src.js",
  "./portrait-pairing.js",
  "./portrait-info-fix.js",
  "./media-info-fallback.js",
  "./ui-polish-r25.js"
];

for (const file of requiredImports) {
  if (!entry.includes(file)) {
    missing.push(`entry import ${file}`);
  }
}

if (hacs.filename !== "wallpanel.js") {
  missing.push('hacs filename must remain "wallpanel.js"');
}

for (const file of [
  "portrait-pairing.js",
  "portrait-info-fix.js",
  "media-info-fallback.js",
  "ui-polish-r25.js"
]) {
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

console.log("Fork overlay compatibility check passed.");
