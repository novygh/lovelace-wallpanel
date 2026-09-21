(() => {
  const metadata = new Map();

  function rawConfig() {
    const ha = document.querySelector("home-assistant");
    const main = ha?.shadowRoot?.querySelector("home-assistant-main");
    const panel = main?.shadowRoot?.querySelector("ha-panel-lovelace");
    const lovelace = panel?.lovelace || panel?.__lovelace;
    return lovelace?.config?.wallpanel || lovelace?.rawConfig?.wallpanel || {};
  }

  function infoEnabled() {
    const cfg = rawConfig();
    return cfg.show_image_info === true && Boolean(cfg.image_info_template);
  }

  function infoElement(wp, media) {
    if (media === wp.imageOne) return wp.imageOneInfo;
    if (media === wp.imageTwo) return wp.imageTwoInfo;
    return null;
  }

  function infoContainer(wp, media) {
    if (media === wp.imageOne) return wp.imageOneInfoContainer;
    if (media === wp.imageTwo) return wp.imageTwoInfoContainer;
    return null;
  }

  function pairElement(wp, media) {
    const container = media === wp.imageOne ? wp.imageOneContainer : media === wp.imageTwo ? wp.imageTwoContainer : null;
    return container?.querySelector(".wallpanel-portrait-pair") || null;
  }

  function pairInfoBox(wp, media) {
    const container = media === wp.imageOne ? wp.imageOneContainer : media === wp.imageTwo ? wp.imageTwoContainer : null;
    return container?.querySelector(".wallpanel-portrait-pair-info") || null;
  }

  function htmlText(html) {
    const el = document.createElement("div");
    el.innerHTML = html || "";
    return (el.textContent || "").replace(/\s+/g, " ").trim();
  }

  function staticTemplateText() {
    const template = rawConfig().image_info_template || "";
    return htmlText(template.replace(/\${[^}]+}/g, ""));
  }

  function meaningfulInfo(wp, media) {
    const el = infoElement(wp, media);
    if (!el) return false;
    const text = htmlText(el.innerHTML);
    if (!text) return false;
    const staticText = staticTemplateText();
    return !staticText || text !== staticText;
  }

  function sanitizeInfo(wp, media) {
    const el = infoElement(wp, media);
    if (!el) return;
    if (meaningfulInfo(wp, media)) {
      el.style.display = "block";
    } else {
      el.innerHTML = "";
      el.style.display = "none";
    }
  }

  function waiters(wp) {
    if (!wp.__portraitInfoFixWaiters) wp.__portraitInfoFixWaiters = new Map();
    return wp.__portraitInfoFixWaiters;
  }

  function capture(wp, media) {
    const source = media?.infoCacheUrl;
    if (!source || !Object.prototype.hasOwnProperty.call(media, "exifdata")) return;
    metadata.set(source, media.exifdata || {});
    const entries = waiters(wp).get(source);
    if (!entries) return;
    waiters(wp).delete(source);
    for (const done of entries) done(metadata.get(source));
  }

  function waitForMetadata(wp, source, timeout = 2800) {
    if (!source || metadata.has(source)) return Promise.resolve(metadata.get(source) || {});
    return new Promise((resolve) => {
      const map = waiters(wp);
      const list = map.get(source) || [];
      let finished = false;
      const done = (value) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        resolve(value || {});
      };
      list.push(done);
      map.set(source, list);
      const timer = setTimeout(() => {
        const current = map.get(source) || [];
        const remaining = current.filter((entry) => entry !== done);
        if (remaining.length) map.set(source, remaining);
        else map.delete(source);
        done(metadata.get(source) || {});
      }, timeout);
    });
  }

  function isJpeg(source, resolved = "") {
    const candidate = String(source || resolved || "").split("?")[0];
    return /\.jpe?g$/i.test(candidate);
  }

  async function ensureMainInfo(wp, media) {
    if (!infoEnabled() || !media) return;
    try {
      wp.setMediaDataInfo(media);
    } catch (_) {}
    sanitizeInfo(wp, media);
    if (meaningfulInfo(wp, media)) return;
    if (media.tagName?.toLowerCase() !== "img") return;

    const source = media.infoCacheUrl || "";
    if (!isJpeg(source, media.mediaUrl)) return;
    if (!metadata.has(source)) await waitForMetadata(wp, source);

    try {
      wp.setMediaDataInfo(media);
    } catch (_) {}
    sanitizeInfo(wp, media);
  }

  async function ensurePartnerInfo(wp, media) {
    if (!infoEnabled()) return;
    const pair = pairElement(wp, media);
    if (!pair?.src) return;
    const source = pair.infoCacheUrl || media.dataset.portraitPartner || "";
    if (!isJpeg(source, pair.mediaUrl || pair.src)) return;
    if (!metadata.has(source)) await waitForMetadata(wp, source);
  }

  function valueAtPath(obj, path) {
    let value = obj;
    for (const key of path.replace(/\s/g, "").split(".")) {
      if (value == null) return "";
      value = value[key];
    }
    return value;
  }

  function renderTemplate(mediaInfo) {
    let html = rawConfig().image_info_template || "";
    if (!html || html === "analyze") return "";
    let placeholders = 0;
    let resolved = 0;

    html = html.replace(/\${([^}]+)}/g, (_match, alternatives) => {
      placeholders++;
      for (let alternative of alternatives.split("||")) {
        let prefix = "";
        let suffix = "";
        let options = null;
        if (alternative.includes("!")) {
          const args = alternative.split("!");
          alternative = args.shift();
          for (const arg of args) {
            const pos = arg.indexOf("=");
            if (pos < 0) continue;
            const type = arg.substring(0, pos);
            const argValue = arg.substring(pos + 1);
            if (type === "prefix") prefix = argValue;
            else if (type === "suffix") suffix = argValue;
            else if (type === "options") {
              options = {};
              for (const part of argValue.split(",")) {
                const [key, value] = part.split(":", 2);
                if (key && value) options[key.replace(/\s/g, "")] = value.replace(/\s/g, "");
              }
            }
          }
        }

        let value = "";
        let usedTag = "";
        for (const tag of alternative.split("|")) {
          value = valueAtPath(mediaInfo, tag);
          if (value) {
            usedTag = tag;
            break;
          }
        }
        if (!value) continue;

        if (/DateTime/i.test(usedTag)) {
          const date = new Date(String(value).replace(/(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/, "$1-$2-$3T$4:$5:$6"));
          if (isNaN(date)) continue;
          if (!options) options = { year: "numeric", month: "2-digit", day: "2-digit" };
          const language = document.querySelector("home-assistant")?.hass?.locale?.language || navigator.language;
          value = date.toLocaleDateString(language, options);
        }

        if (typeof value === "object") value = JSON.stringify(value);
        resolved++;
        return prefix + value + suffix;
      }
      return "";
    });

    return placeholders > 0 && resolved === 0 ? "" : html;
  }

  function chip(text, arrow) {
    const span = document.createElement("span");
    span.style.display = "inline-block";
    span.style.padding = "0.12em 0.5em";
    span.style.background = "#00000077";
    span.style.backdropFilter = "blur(2px)";
    span.style.borderRadius = "0.5rem";
    span.style.whiteSpace = "nowrap";
    const strong = document.createElement("strong");
    strong.textContent = arrow;
    strong.style.marginRight = "0.3em";
    span.appendChild(strong);
    const content = document.createElement("span");
    content.innerHTML = text || "—";
    span.appendChild(content);
    return span;
  }

  function renderPairInfo(wp, media) {
    if (media?.dataset?.portraitPaired !== "1" || !infoEnabled()) return;
    const box = pairInfoBox(wp, media);
    if (!box) return;
    const leftSource = media.infoCacheUrl || "";
    const rightSource = media.dataset.portraitPartner || pairElement(wp, media)?.infoCacheUrl || "";
    let left = renderTemplate(metadata.get(leftSource) || {});
    const right = renderTemplate(metadata.get(rightSource) || {});
    if (!left && meaningfulInfo(wp, media)) left = infoElement(wp, media)?.innerHTML || "";

    box.innerHTML = "";
    box.appendChild(chip(left, "←"));
    box.appendChild(chip(right, "→"));
    box.style.display = "flex";
    const nativeContainer = infoContainer(wp, media);
    if (nativeContainer) nativeContainer.style.visibility = "hidden";
  }

  customElements.whenDefined("wallpanel-view").then(() => {
    const prototype = customElements.get("wallpanel-view").prototype;
    if (prototype.__portraitInfoFix) return;

    const previousUpdateMedia = prototype.updateMedia;
    const previousSetMediaDataInfo = prototype.setMediaDataInfo;

    prototype.setMediaDataInfo = function (...args) {
      const media = args[0] || null;
      capture(this, media);
      const result = previousSetMediaDataInfo.apply(this, args);
      const active = this.getActiveMediaElement?.();
      if (active?.dataset?.portraitPaired === "1") renderPairInfo(this, active);
      else if (active) sanitizeInfo(this, active);
      return result;
    };

    prototype.updateMedia = async function (...args) {
      const media = await previousUpdateMedia.apply(this, args);
      if (!media) return media;

      await ensureMainInfo(this, media);
      if (media.dataset?.portraitPaired === "1") {
        await ensurePartnerInfo(this, media);
        renderPairInfo(this, media);
      } else {
        sanitizeInfo(this, media);
      }
      return media;
    };

    Object.defineProperty(prototype, "__portraitInfoFix", { value: true });
  });
})();
