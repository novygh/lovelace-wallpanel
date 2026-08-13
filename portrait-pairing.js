(() => {
  const PREFIX = "media-source://";
  const cache = new Map();
  const sequentialConsumed = new Set();
  let lastPrimary = "";
  let lastPartner = "";

  function rawConfig() {
    const internals = window.__wallpanelPortraitPairingInternals;
    if (internals?.config) return internals.config;

    const ha = document.querySelector("home-assistant");
    const main = ha?.shadowRoot?.querySelector("home-assistant-main");
    const panel = main?.shadowRoot?.querySelector("ha-panel-lovelace");
    const lovelace = panel?.lovelace || panel?.__lovelace;
    return lovelace?.config?.wallpanel || lovelace?.rawConfig?.wallpanel || {};
  }

  function enabled() {
    return rawConfig().portrait_pairing === true;
  }

  function pairingOrder() {
    return rawConfig().portrait_pairing_order === "sequential" ? "sequential" : "random";
  }

  function pairingFit() {
    return rawConfig().portrait_pairing_fit === "cover" ? "cover" : "contain";
  }

  function orientation(img) {
    if (img?.tagName?.toLowerCase() !== "img" || !img.naturalWidth || !img.naturalHeight) return null;
    return img.naturalWidth < img.naturalHeight ? "portrait" : "landscape";
  }

  function container(wp, img) {
    return img === wp.imageOne ? wp.imageOneContainer : img === wp.imageTwo ? wp.imageTwoContainer : null;
  }

  function standardInfoContainer(wp, img) {
    if (img === wp.imageOne) return wp.imageOneInfoContainer;
    if (img === wp.imageTwo) return wp.imageTwoInfoContainer;
    return null;
  }

  function standardInfoElement(wp, img) {
    if (img === wp.imageOne) return wp.imageOneInfo;
    if (img === wp.imageTwo) return wp.imageTwoInfo;
    return null;
  }

  function secondary(wp, img, create = true) {
    const c = container(wp, img);
    if (!c) return null;
    let s = c.querySelector(".wallpanel-portrait-pair");
    if (!s && create) {
      s = document.createElement("img");
      s.className = "wallpanel-portrait-pair";
      s.alt = "";
      s.draggable = false;
      Object.assign(s.style, {
        position: "absolute",
        display: "none",
        visibility: "hidden",
        pointerEvents: "none",
        border: "none"
      });
      const info = standardInfoContainer(wp, img);
      c.insertBefore(s, info);
    }
    return s;
  }

  function pairInfo(wp, img, create = true) {
    const c = container(wp, img);
    if (!c) return null;
    let box = c.querySelector(".wallpanel-portrait-pair-info");
    if (!box && create) {
      box = document.createElement("div");
      box.className = "wallpanel-portrait-pair-info";
      Object.assign(box.style, {
        position: "absolute",
        left: "0.5em",
        bottom: "0.5em",
        zIndex: "4",
        display: "none",
        flexWrap: "wrap",
        gap: "0.35em",
        maxWidth: "calc(100% - 1em)",
        pointerEvents: "none",
        color: "white",
        fontSize: "1.55em",
        lineHeight: "1.25"
      });
      c.appendChild(box);
    }
    return box;
  }

  function chip(text, arrow) {
    const el = document.createElement("span");
    Object.assign(el.style, {
      display: "inline-block",
      padding: "0.12em 0.5em",
      background: "#00000077",
      backdropFilter: "blur(2px)",
      borderRadius: "0.5rem",
      whiteSpace: "nowrap"
    });
    const arrowEl = document.createElement("strong");
    arrowEl.textContent = arrow;
    arrowEl.style.marginRight = "0.3em";
    el.appendChild(arrowEl);
    const content = document.createElement("span");
    content.innerHTML = text || "—";
    el.appendChild(content);
    return el;
  }

  function restoreStandardInfo(wp, img) {
    const info = standardInfoContainer(wp, img);
    const box = pairInfo(wp, img, false);
    if (info) info.style.removeProperty("visibility");
    if (box) box.style.display = "none";
  }

  function clear(wp, img) {
    if (!img) return;
    img.dataset.portraitPaired = "";
    img.dataset.portraitPartner = "";
    img.dataset.portraitPartnerResolved = "";
    restoreStandardInfo(wp, img);

    const s = secondary(wp, img, false);
    if (s) {
      s.onload = null;
      s.onerror = null;
      s.style.display = "none";
      s.style.visibility = "hidden";
      s.removeAttribute("src");
      s.mediaUrl = null;
      s.infoCacheUrl = null;
    }
  }

  async function resolve(wp, source) {
    const r = await wp.hass.callWS({ type: "media_source/resolve_media", media_content_id: source });
    if (r.mime_type && !String(r.mime_type).startsWith("image/")) return null;
    if (!r.url) return null;
    return /^https?:\/\//i.test(r.url) ? r.url : document.location.origin + r.url;
  }

  function load(url, target = new Image()) {
    return new Promise((ok, fail) => {
      let done = false;
      const finish = (fn, arg) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        target.onload = null;
        target.onerror = null;
        fn(arg);
      };
      const timer = setTimeout(() => finish(fail, new Error("portrait pairing load timeout")), 3000);
      target.onload = () => finish(ok, target);
      target.onerror = () => finish(fail, new Error("portrait pairing load error"));
      target.src = url;
    });
  }

  async function detect(wp, source) {
    if (cache.has(source)) return cache.get(source);
    try {
      const url = await resolve(wp, source);
      if (!url) {
        cache.set(source, "other");
        return "other";
      }
      const img = await load(url);
      const o = orientation(img);
      cache.set(source, o || "error");
      return o || "error";
    } catch (_) {
      cache.set(source, "error");
      return "error";
    }
  }

  function cyclic(wp, primary) {
    const list = wp.mediaList || [];
    const out = [];
    if (!list.length) return out;
    const i = wp.mediaIndex;
    for (let n = 1; n < list.length; n++) {
      const j =
        wp.mediaListDirection === "backwards"
          ? (i - n + list.length) % list.length
          : (i + n) % list.length;
      const s = list[j];
      if (s && s !== primary && s.startsWith(PREFIX) && !out.includes(s)) out.push(s);
    }
    return out;
  }

  function shuffle(a) {
    a = [...a];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  async function nextPortrait(wp, primary, token) {
    for (const source of cyclic(wp, primary)) {
      if (token !== wp.__portraitPairToken) return null;
      if ((await detect(wp, source)) === "portrait") return source;
    }
    return null;
  }

  async function loadPartner(wp, img, source, token) {
    if (token !== wp.__portraitPairToken) return false;
    const pair = secondary(wp, img);
    try {
      const url = await resolve(wp, source);
      if (!url) return false;
      await load(url, pair);
      if (token !== wp.__portraitPairToken) return false;
      if (orientation(pair) !== "portrait") {
        cache.set(source, orientation(pair) || "error");
        return false;
      }
      cache.set(source, "portrait");
      pair.mediaUrl = url;
      pair.infoCacheUrl = source;
      pair.style.display = "block";
      pair.style.visibility = "visible";
      img.dataset.portraitPartner = source;
      img.dataset.portraitPartnerResolved = url;
      return true;
    } catch (_) {
      return false;
    }
  }

  async function chooseRandom(wp, img, token) {
    const primary = img.infoCacheUrl || "";
    const all = cyclic(wp, primary);
    const next = await nextPortrait(wp, primary, token);
    if (token !== wp.__portraitPairToken) return false;

    let preferred = all.filter(
      (source) => source !== next && source !== lastPrimary && source !== lastPartner
    );
    if (!preferred.length) preferred = all.filter((source) => source !== next);

    const fallback = all.filter((source) => !preferred.includes(source));
    for (const source of [...shuffle(preferred), ...shuffle(fallback)]) {
      if (token !== wp.__portraitPairToken) return false;
      if ((await detect(wp, source)) !== "portrait") continue;
      if (await loadPartner(wp, img, source, token)) {
        lastPrimary = primary;
        lastPartner = source;
        return true;
      }
    }
    return false;
  }

  async function chooseSequential(wp, img, token) {
    const primary = img.infoCacheUrl || "";
    const source = await nextPortrait(wp, primary, token);
    if (!source || token !== wp.__portraitPairToken) return false;
    if (!(await loadPartner(wp, img, source, token))) return false;

    sequentialConsumed.add(source);
    lastPrimary = primary;
    lastPartner = source;
    return true;
  }

  async function choose(wp, img, token) {
    const primary = img.infoCacheUrl || "";
    if (!primary.startsWith(PREFIX) || orientation(img) !== "portrait") return null;

    const paired =
      pairingOrder() === "sequential"
        ? await chooseSequential(wp, img, token)
        : await chooseRandom(wp, img, token);

    if (!paired) return false;

    img.dataset.portraitPaired = "1";
    layout(wp, img);
    schedulePairInfo(wp, img);
    return true;
  }

  function layout(wp, img) {
    if (img?.dataset?.portraitPaired !== "1") return false;
    const pair = secondary(wp, img, false);
    if (!pair?.src) return false;

    const fit = pairingFit();
    Object.assign(img.style, {
      position: "absolute",
      top: "0",
      left: "0",
      width: "50%",
      height: "100%",
      objectFit: fit,
      objectPosition: "center center",
      visibility: "visible",
      pointerEvents: "none"
    });
    Object.assign(pair.style, {
      position: "absolute",
      top: "0",
      left: "50%",
      width: "50%",
      height: "100%",
      objectFit: fit,
      objectPosition: "center center",
      display: "block",
      visibility: "visible",
      pointerEvents: "none",
      border: "none"
    });
    return true;
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
    const cfg = rawConfig();
    let html = cfg.image_info_template || "";
    if (!html || html === "analyze") return "";

    return html.replace(/\${([^}]+)}/g, (_match, alternatives) => {
      const altTags = alternatives.split("||");
      for (let t = 0; t < altTags.length; t++) {
        let tags = altTags[t];
        let prefix = "";
        let suffix = "";
        let options = null;

        if (tags.includes("!")) {
          const args = tags.split("!");
          tags = args[0];
          for (let i = 1; i < args.length; i++) {
            const eq = args[i].indexOf("=");
            if (eq < 0) continue;
            const type = args[i].substring(0, eq);
            const argValue = args[i].substring(eq + 1);
            if (type === "prefix") prefix = argValue;
            else if (type === "suffix") suffix = argValue;
            else if (type === "options") {
              options = {};
              argValue.split(",").forEach((part) => {
                const p = part.split(":", 2);
                if (p[0] && p[1]) options[p[0].replace(/\s/g, "")] = p[1].replace(/\s/g, "");
              });
            }
          }
        }

        const tagList = tags.split("|");
        let value = "";
        let tag = "";
        for (let i = 0; i < tagList.length; i++) {
          tag = tagList[i];
          value = valueAtPath(mediaInfo, tag);
          if (value) break;
        }
        if (!value) continue;

        if (/DateTime/i.test(tag)) {
          const date = new Date(
            String(value).replace(
              /(\d\d\d\d):(\d\d):(\d\d) (\d\d):(\d\d):(\d\d)/,
              "$1-$2-$3T$4:$5:$6"
            )
          );
          if (isNaN(date)) continue;
          if (!options) options = { year: "numeric", month: "2-digit", day: "2-digit" };
          const language =
            document.querySelector("home-assistant")?.hass?.locale?.language ||
            navigator.language;
          value = date.toLocaleDateString(language, options);
        }

        if (typeof value === "object") value = JSON.stringify(value);
        return prefix + value + suffix;
      }
      return "";
    });
  }

  function infoCache() {
    return window.__wallpanelPortraitPairingInternals?.mediaInfoCache;
  }

  function addInfo(source, value) {
    const internals = window.__wallpanelPortraitPairingInternals;
    if (internals?.addToMediaInfoCache) internals.addToMediaInfoCache(source, value);
  }

  function ensureExif(wp, img, source, resolvedUrl) {
    const internals = window.__wallpanelPortraitPairingInternals;
    if (!internals?.getImageData || !source || !resolvedUrl) return;
    if (infoCache()?.has(source)) return;

    const tmp = document.createElement("img");
    tmp.src = resolvedUrl;
    tmp.mediaUrl = resolvedUrl;
    tmp.infoCacheUrl = source;

    try {
      internals.getImageData(tmp, function () {
        addInfo(source, tmp.exifdata || {});
        updatePairInfo(wp, img);
      });
    } catch (_) {}
  }

  function updatePairInfo(wp, img) {
    if (img?.dataset?.portraitPaired !== "1") return;
    const cfg = rawConfig();
    if (!cfg.show_image_info || !cfg.image_info_template) return;

    const primarySource = img.infoCacheUrl || "";
    const partnerSource = img.dataset.portraitPartner || "";
    const primaryInfo = infoCache()?.get(primarySource) || {};
    const partnerInfo = infoCache()?.get(partnerSource) || {};

    let left = renderTemplate(primaryInfo);
    let right = renderTemplate(partnerInfo);

    const existingPrimary = standardInfoElement(wp, img)?.innerHTML || "";
    if (!left && existingPrimary) left = existingPrimary;

    const box = pairInfo(wp, img);
    box.innerHTML = "";
    box.appendChild(chip(left, "←"));
    box.appendChild(chip(right, "→"));
    box.style.display = "flex";

    const standard = standardInfoContainer(wp, img);
    if (standard) standard.style.visibility = "hidden";
  }

  function schedulePairInfo(wp, img) {
    if (img?.dataset?.portraitPaired !== "1") return;

    const primarySource = img.infoCacheUrl || "";
    const partnerSource = img.dataset.portraitPartner || "";
    const primaryResolved = img.mediaUrl || img.src || "";
    const partnerResolved = img.dataset.portraitPartnerResolved || secondary(wp, img, false)?.src || "";

    ensureExif(wp, img, primarySource, primaryResolved);
    ensureExif(wp, img, partnerSource, partnerResolved);

    requestAnimationFrame(() => updatePairInfo(wp, img));
    setTimeout(() => updatePairInfo(wp, img), 150);
    setTimeout(() => updatePairInfo(wp, img), 800);
  }

  function isConsumedSequential(img) {
    const source = img?.infoCacheUrl || "";
    if (!source || !sequentialConsumed.has(source)) return false;
    sequentialConsumed.delete(source);
    return true;
  }

  customElements.whenDefined("wallpanel-view").then(() => {
    const p = customElements.get("wallpanel-view").prototype;
    if (p.__portraitPairingFork) return;

    const update = p.updateMedia;
    const dimensions = p.setMediaDimensions;
    const setInfo = p.setMediaDataInfo;

    p.updateMedia = async function (img) {
      clear(this, img);
      let loaded = null;

      const maxAttempts = Math.max((this.mediaList || []).length, 1) + 1;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const token = (this.__portraitPairToken = (this.__portraitPairToken || 0) + 1);
        loaded = await update.call(this, img);
        if (!loaded || !enabled()) return loaded;

        if (pairingOrder() === "sequential" && isConsumedSequential(loaded)) {
          clear(this, loaded);
          continue;
        }

        if (orientation(loaded) !== "portrait") {
          restoreStandardInfo(this, loaded);
          return loaded;
        }

        const result = await choose(this, loaded, token);
        if (result === true) return loaded;
        clear(this, loaded);
      }

      if (loaded && orientation(loaded) === "portrait") {
        const pair = secondary(this, loaded);
        try {
          await load(loaded.src, pair);
          pair.mediaUrl = loaded.mediaUrl;
          pair.infoCacheUrl = loaded.infoCacheUrl;
          loaded.dataset.portraitPartner = loaded.infoCacheUrl || "";
          loaded.dataset.portraitPartnerResolved = loaded.mediaUrl || loaded.src || "";
          loaded.dataset.portraitPaired = "1";
          layout(this, loaded);
          schedulePairInfo(this, loaded);
        } catch (_) {}
      }
      return loaded;
    };

    p.setMediaDimensions = function (...args) {
      const result = dimensions.apply(this, args);
      const active = this.getActiveMediaElement?.();
      layout(this, active);
      return result;
    };

    p.setMediaDataInfo = function (...args) {
      const result = setInfo.apply(this, args);
      const active = this.getActiveMediaElement?.();
      if (active?.dataset?.portraitPaired === "1") {
        schedulePairInfo(this, active);
      } else if (active) {
        restoreStandardInfo(this, active);
      }
      return result;
    };

    Object.defineProperty(p, "__portraitPairingFork", { value: true });
  });
})();
