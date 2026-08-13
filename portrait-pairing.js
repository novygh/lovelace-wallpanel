(() => {
  const PREFIX = "media-source://";
  const cache = new Map();
  let lastPrimary = "", lastPartner = "";

  function enabled() {
    const ha = document.querySelector("home-assistant");
    const main = ha?.shadowRoot?.querySelector("home-assistant-main");
    const panel = main?.shadowRoot?.querySelector("ha-panel-lovelace");
    const lovelace = panel?.lovelace || panel?.__lovelace;
    const raw = lovelace?.config?.wallpanel || lovelace?.rawConfig?.wallpanel;
    return raw?.portrait_pairing === true;
  }

  function orientation(img) {
    if (img?.tagName?.toLowerCase() !== "img" || !img.naturalWidth || !img.naturalHeight) return null;
    return img.naturalWidth < img.naturalHeight ? "portrait" : "landscape";
  }

  function container(wp, img) {
    return img === wp.imageOne ? wp.imageOneContainer : img === wp.imageTwo ? wp.imageTwoContainer : null;
  }

  function secondary(wp, img) {
    const c = container(wp, img);
    if (!c) return null;
    let s = c.querySelector(".wallpanel-portrait-pair");
    if (!s) {
      s = document.createElement("img");
      s.className = "wallpanel-portrait-pair";
      s.draggable = false;
      Object.assign(s.style, { position:"absolute", display:"none", visibility:"hidden", pointerEvents:"none" });
      c.insertBefore(s, img === wp.imageOne ? wp.imageOneInfoContainer : wp.imageTwoInfoContainer);
    }
    return s;
  }

  function clear(wp, img) {
    if (!img) return;
    img.dataset.portraitPaired = "";
    const s = secondary(wp, img);
    if (s) {
      s.onload = s.onerror = null;
      s.style.display = "none";
      s.style.visibility = "hidden";
      s.removeAttribute("src");
    }
  }

  async function resolve(wp, source) {
    const r = await wp.hass.callWS({ type:"media_source/resolve_media", media_content_id:source });
    if (r.mime_type && !String(r.mime_type).startsWith("image/")) return null;
    if (!r.url) return null;
    return /^https?:\/\//i.test(r.url) ? r.url : document.location.origin + r.url;
  }

  function load(url, target = new Image()) {
    return new Promise((ok, fail) => {
      const timer = setTimeout(() => fail(new Error("portrait pairing load timeout")), 2500);
      target.onload = () => { clearTimeout(timer); target.onload = target.onerror = null; ok(target); };
      target.onerror = () => { clearTimeout(timer); target.onload = target.onerror = null; fail(new Error("portrait pairing load error")); };
      target.src = url;
    });
  }

  async function detect(wp, source) {
    if (cache.has(source)) return cache.get(source);
    try {
      const url = await resolve(wp, source);
      if (!url) return "other";
      const img = await load(url);
      const o = orientation(img);
      cache.set(source, o);
      return o;
    } catch (_) {
      cache.set(source, "error");
      return "error";
    }
  }

  function cyclic(wp, primary) {
    const list = wp.mediaList || [], out = [];
    if (!list.length) return out;
    const i = wp.mediaIndex;
    for (let n = 1; n < list.length; n++) {
      const j = wp.mediaListDirection === "backwards" ? (i - n + list.length) % list.length : (i + n) % list.length;
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

  async function choose(wp, img, token) {
    const primary = img.infoCacheUrl || "";
    if (!primary.startsWith(PREFIX) || orientation(img) !== "portrait") return;
    const all = cyclic(wp, primary);
    let nextPortrait = null;
    for (const s of all) {
      if (token !== wp.__portraitPairToken) return;
      if (await detect(wp, s) === "portrait") { nextPortrait = s; break; }
    }
    let preferred = all.filter(s => s !== nextPortrait && s !== lastPrimary && s !== lastPartner);
    if (!preferred.length) preferred = all.filter(s => s !== nextPortrait);
    const tries = [...shuffle(preferred), ...shuffle(all.filter(s => !preferred.includes(s)))];
    const pair = secondary(wp, img);
    for (const s of tries) {
      if (token !== wp.__portraitPairToken) return;
      if (await detect(wp, s) !== "portrait") continue;
      try {
        const url = await resolve(wp, s);
        if (!url) continue;
        await load(url, pair);
        if (orientation(pair) !== "portrait") continue;
        pair.style.display = "block";
        pair.style.visibility = "visible";
        img.dataset.portraitPaired = "1";
        lastPrimary = primary;
        lastPartner = s;
        layout(wp, img);
        return;
      } catch (_) {}
    }
  }

  function layout(wp, img) {
    if (img?.dataset?.portraitPaired !== "1") return false;
    const pair = secondary(wp, img);
    if (!pair?.src) return false;
    const fit = img.style.objectFit || "contain";
    Object.assign(img.style, { position:"absolute", top:"0", left:"0", width:"50%", height:"100%", objectFit:fit, objectPosition:"center center" });
    Object.assign(pair.style, { position:"absolute", top:"0", left:"50%", width:"50%", height:"100%", objectFit:fit, objectPosition:"center center", display:"block", visibility:"visible" });
    return true;
  }

  customElements.whenDefined("wallpanel-view").then(() => {
    const p = customElements.get("wallpanel-view").prototype;
    if (p.__portraitPairingFork) return;
    const update = p.updateMedia, dimensions = p.setMediaDimensions;
    p.updateMedia = async function(img) {
      clear(this, img);
      const token = this.__portraitPairToken = (this.__portraitPairToken || 0) + 1;
      const loaded = await update.call(this, img);
      if (loaded && enabled()) await choose(this, loaded, token);
      return loaded;
    };
    p.setMediaDimensions = function(...args) {
      const result = dimensions.apply(this, args);
      layout(this, this.getActiveMediaElement?.());
      return result;
    };
    Object.defineProperty(p, "__portraitPairingFork", { value:true });
  });
})();
