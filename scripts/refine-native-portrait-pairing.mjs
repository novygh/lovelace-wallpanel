import fs from "node:fs";

const sourcePath = "wallpanel-src.js";
const docsPath = "docs/configuration.md";
let source = fs.readFileSync(sourcePath, "utf8");
let docs = fs.readFileSync(docsPath, "utf8");

function replaceExact(text, before, after, label) {
  if (!text.includes(before)) throw new Error(`Unable to apply ${label}`);
  return text.replace(before, after);
}

source = replaceExact(source,
  `\t\t\tthis.portraitPairSequentialConsumed ||= new Set();\n\t\t\tthis.portraitPairSequentialConsumed.add(source);\n\t\t\tthis.lastPortraitPairPrimary = primary;`,
  `\t\t\tconst list = this.mediaList || [];\n\t\t\tif (list.length) {\n\t\t\t\tthis.mediaIndex =\n\t\t\t\t\tthis.mediaListDirection === "backwards"\n\t\t\t\t\t\t? (this.mediaIndex - 1 + list.length) % list.length\n\t\t\t\t\t\t: (this.mediaIndex + 1) % list.length;\n\t\t\t}\n\t\t\tthis.lastPortraitPairPrimary = primary;`,
  "sequential index advance");

source = replaceExact(source,
  `\n\t\tisConsumedPortraitPair(img) {\n\t\t\tconst source = img?.infoCacheUrl || "";\n\t\t\tif (!source || !this.portraitPairSequentialConsumed?.has(source)) return false;\n\t\t\tthis.portraitPairSequentialConsumed.delete(source);\n\t\t\treturn true;\n\t\t}\n\n\t\tasync updateMedia(initialTarget) {\n\t\t\tlet target = initialTarget;\n\t\t\tlet loaded = null;\n\t\t\tconst maxAttempts = Math.max((this.mediaList || []).length, 1) + 1;\n\t\t\tfor (let attempt = 0; attempt < maxAttempts; attempt++) {\n\t\t\t\tthis.clearPortraitPair(target);\n\t\t\t\tconst token = (this.portraitPairToken = (this.portraitPairToken || 0) + 1);\n\t\t\t\tloaded = await this._updateMediaSingle(target);\n\t\t\t\tif (!loaded || !config.portrait_pairing) return loaded;\n\t\t\t\tif (config.media_order === "sorted" && this.isConsumedPortraitPair(loaded)) {\n\t\t\t\t\ttarget = loaded;\n\t\t\t\t\tcontinue;\n\t\t\t\t}\n\t\t\t\tif (this.portraitPairingOrientation(loaded) !== "portrait") return loaded;\n\t\t\t\tif (await this.preparePortraitPair(loaded, token)) return loaded;\n\t\t\t\tthis.clearPortraitPair(loaded);\n\t\t\t\treturn loaded;\n\t\t\t}\n\t\t\treturn loaded;\n\t\t}\n`,
  `\n\t\tasync updateMedia(target) {\n\t\t\tthis.clearPortraitPair(target);\n\t\t\tconst token = (this.portraitPairToken = (this.portraitPairToken || 0) + 1);\n\t\t\tconst loaded = await this._updateMediaSingle(target);\n\t\t\tif (!loaded || !config.portrait_pairing) return loaded;\n\t\t\tif (this.portraitPairingOrientation(loaded) !== "portrait") return loaded;\n\t\t\tif (await this.preparePortraitPair(loaded, token)) return loaded;\n\t\t\tthis.clearPortraitPair(loaded);\n\t\t\treturn loaded;\n\t\t}\n`,
  "single-pass updateMedia");

source = replaceExact(source,
  `\t\t\t\tobjectPosition: "center center",\n\t\t\t\tvisibility: "visible",\n\t\t\t\tpointerEvents: "none"\n\t\t\t});\n\t\t\tObject.assign(pair.style, {`,
  `\t\t\t\tobjectPosition: "center center",\n\t\t\t\tvisibility: "visible",\n\t\t\t\tpointerEvents: "none",\n\t\t\t\tanimation: "none"\n\t\t\t});\n\t\t\tObject.assign(pair.style, {`,
  "primary animation guard");

source = replaceExact(source,
  `\t\t\t\tdisplay: "block",\n\t\t\t\tvisibility: "visible",\n\t\t\t\tpointerEvents: "none",\n\t\t\t\tborder: "none"\n\t\t\t});\n\t\t\treturn true;`,
  `\t\t\t\tdisplay: "block",\n\t\t\t\tvisibility: "visible",\n\t\t\t\tpointerEvents: "none",\n\t\t\t\tborder: "none",\n\t\t\t\tanimation: "none"\n\t\t\t});\n\t\t\treturn true;`,
  "secondary animation guard");

source = replaceExact(source,
  `\t\trestartKenBurnsEffect() {\n\t\t\tif (!config.image_animation_ken_burns || !config.image_animation_ken_burns_animations.length) {\n\t\t\t\treturn;\n\t\t\t}\n\t\t\tconst activeElement = this.getActiveMediaElement();\n\t\t\tactiveElement.style.animation = "none";`,
  `\t\trestartKenBurnsEffect() {\n\t\t\tconst activeElement = this.getActiveMediaElement();\n\t\t\tif (activeElement?.dataset?.portraitPaired === "1") {\n\t\t\t\tactiveElement.style.animation = "none";\n\t\t\t\tconst pair = this.getPortraitPairElement(activeElement, false);\n\t\t\t\tif (pair) pair.style.animation = "none";\n\t\t\t\treturn;\n\t\t\t}\n\t\t\tif (!config.image_animation_ken_burns || !config.image_animation_ken_burns_animations.length) {\n\t\t\t\treturn;\n\t\t\t}\n\t\t\tactiveElement.style.animation = "none";`,
  "Ken Burns guard");

docs = replaceExact(docs,
  "Pair selection follows `media_order`: adjacent pairs for `sorted`, random partners for `random`, and deterministic partners for `random_but_synced`.",
  "Pair selection follows `media_order`: adjacent pairs for `sorted`, random partners for `random`, and deterministic partners for `random_but_synced`. Ken Burns animation is skipped while a portrait pair is displayed.",
  "documentation");

fs.writeFileSync(sourcePath, source);
fs.writeFileSync(docsPath, docs);
console.log("Applied final native portrait pairing refinements");
