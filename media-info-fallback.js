(() => {
  function rawConfig() {
    const ha = document.querySelector("home-assistant");
    const main = ha?.shadowRoot?.querySelector("home-assistant-main");
    const panel = main?.shadowRoot?.querySelector("ha-panel-lovelace");
    const lovelace = panel?.lovelace || panel?.__lovelace;
    return lovelace?.config?.wallpanel || lovelace?.rawConfig?.wallpanel || {};
  }

  function infoEnabled() {
    return rawConfig().show_image_info === true;
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

  function slotContainer(wp, media) {
    if (media === wp.imageOne) return wp.imageOneContainer;
    if (media === wp.imageTwo) return wp.imageTwoContainer;
    return null;
  }

  function pairInfoBox(wp, media) {
    return slotContainer(wp, media)?.querySelector(".wallpanel-portrait-pair-info") || null;
  }

  function pairElement(wp, media) {
    return slotContainer(wp, media)?.querySelector(".wallpanel-portrait-pair") || null;
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

  function hasMeaningfulInfo(element) {
    if (!element) return false;
    const text = htmlText(element.innerHTML);
    if (!text) return false;
    const staticText = staticTemplateText();
    return !staticText || text !== staticText;
  }

  function sourceFor(media) {
    return String(media?.infoCacheUrl || media?.mediaUrl || media?.src || "");
  }

  function safeDecode(value) {
    try {
      return decodeURIComponent(value);
    } catch (_) {
      return value;
    }
  }

  function folderName(source) {
    const clean = String(source || "")
      .split("?")[0]
      .split("#")[0]
      .replace(/\\/g, "/")
      .replace(/\/+$/, "");
    const parts = clean.split("/").filter(Boolean);
    return safeDecode(parts.length >= 2 ? parts[parts.length - 2] : "");
  }

  function setSingleFallback(wp, media) {
    const element = infoElement(wp, media);
    const container = infoContainer(wp, media);
    if (!element || !container) return;

    if (hasMeaningfulInfo(element)) {
      element.style.display = "block";
      container.style.removeProperty("visibility");
      return;
    }

    const fallback = folderName(sourceFor(media));
    if (!fallback) {
      element.innerHTML = "";
      element.style.display = "none";
      return;
    }

    element.textContent = fallback;
    element.style.display = "block";
    container.style.removeProperty("visibility");
  }

  function fillPairFallback(wp, media) {
    const box = pairInfoBox(wp, media);
    if (!box) return;

    const leftFallback = folderName(sourceFor(media));
    const pair = pairElement(wp, media);
    const rightSource = media?.dataset?.portraitPartner || sourceFor(pair);
    const rightFallback = folderName(rightSource);
    const chips = Array.from(box.children);

    const fill = (chip, fallback) => {
      if (!chip || !fallback) return;
      const content = chip.querySelector("span");
      if (!content) return;
      const text = htmlText(content.innerHTML);
      if (!text || text === "—") content.textContent = fallback;
    };

    fill(chips[0], leftFallback);
    fill(chips[1], rightFallback);
    box.style.display = "flex";

    const native = infoContainer(wp, media);
    if (native) native.style.visibility = "hidden";
  }

  function hideInfo(wp, media) {
    const element = infoElement(wp, media);
    const container = infoContainer(wp, media);
    const box = pairInfoBox(wp, media);
    if (element) element.style.display = "none";
    if (container) container.style.visibility = "hidden";
    if (box) box.style.display = "none";
  }

  function apply(wp, media) {
    if (!media) return;

    if (!infoEnabled()) {
      hideInfo(wp, media);
      return;
    }

    if (media.dataset?.portraitPaired === "1") {
      fillPairFallback(wp, media);
      return;
    }

    const box = pairInfoBox(wp, media);
    if (box) box.style.display = "none";
    setSingleFallback(wp, media);
  }

  customElements.whenDefined("wallpanel-view").then(() => {
    const prototype = customElements.get("wallpanel-view").prototype;
    if (prototype.__mediaInfoFolderFallback) return;

    const previousUpdateMedia = prototype.updateMedia;
    const previousSetMediaDataInfo = prototype.setMediaDataInfo;

    prototype.updateMedia = async function (...args) {
      const media = await previousUpdateMedia.apply(this, args);
      if (media) apply(this, media);
      return media;
    };

    prototype.setMediaDataInfo = function (...args) {
      const result = previousSetMediaDataInfo.apply(this, args);
      const active = this.getActiveMediaElement?.();
      if (active) apply(this, active);
      return result;
    };

    Object.defineProperty(prototype, "__mediaInfoFolderFallback", { value: true });
  });
})();
