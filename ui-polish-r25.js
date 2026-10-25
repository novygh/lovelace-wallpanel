(() => {
  "use strict";

  const PAIR_WEATHER_OFFSET = 72;

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

  function slotContainer(wp, media) {
    if (media === wp.imageOne) return wp.imageOneContainer;
    if (media === wp.imageTwo) return wp.imageTwoContainer;
    return null;
  }

  function nativeInfoElement(wp, media) {
    if (media === wp.imageOne) return wp.imageOneInfo;
    if (media === wp.imageTwo) return wp.imageTwoInfo;
    return null;
  }

  function nativeInfoContainer(wp, media) {
    if (media === wp.imageOne) return wp.imageOneInfoContainer;
    if (media === wp.imageTwo) return wp.imageTwoInfoContainer;
    return null;
  }

  function pairInfoBox(wp, media) {
    return slotContainer(wp, media)?.querySelector(".wallpanel-portrait-pair-info") || null;
  }

  function singleOverlay(wp, media, create = true) {
    const container = slotContainer(wp, media);
    if (!container) return null;

    let box = container.querySelector(".wallpanel-r25-single-info");
    if (!box && create) {
      box = document.createElement("div");
      box.className = "wallpanel-r25-single-info";
      Object.assign(box.style, {
        position: "absolute",
        left: "50px",
        bottom: "1.35em",
        zIndex: "32",
        display: "none",
        maxWidth: "calc(100% - 1em)",
        padding: "0.1em 0.5em",
        background: "#00000055",
        backdropFilter: "blur(2px)",
        borderRadius: "0.5rem",
        pointerEvents: "none",
        color: "white",
        fontSize: "2em",
        lineHeight: "1.25"
      });
      container.appendChild(box);
    }
    return box;
  }

  function htmlText(html) {
    const el = document.createElement("div");
    el.innerHTML = html || "";
    return (el.textContent || "").replace(/\s+/g, " ").trim();
  }

  function stylePairChip(chip, isRight) {
    if (!chip) return;

    Object.assign(chip.style, {
      display: "inline-block",
      padding: "0.1em 0.5em",
      background: "#00000055",
      backdropFilter: "blur(2px)",
      borderRadius: "0.5rem",
      whiteSpace: "nowrap"
    });
    chip.style.transform = isRight ? "translateX(6px)" : "";

    const mark = chip.querySelector("strong");
    const value = chip.querySelector("span");
    if (!mark || !value) return;

    mark.style.marginLeft = "";
    mark.style.marginRight = "";

    if (isRight) {
      if (chip.firstElementChild !== value) chip.insertBefore(value, chip.firstElementChild);
      if (chip.lastElementChild !== mark) chip.appendChild(mark);
      mark.style.marginLeft = "0.3em";
    } else {
      if (chip.firstElementChild !== mark) chip.insertBefore(mark, chip.firstElementChild);
      if (chip.lastElementChild !== value) chip.appendChild(value);
      mark.style.marginRight = "0.3em";
    }
  }

  function polishPair(wp, media) {
    const box = pairInfoBox(wp, media);
    if (!box) return;

    if (!infoEnabled()) {
      box.style.display = "none";
      return;
    }

    Object.assign(box.style, {
      position: "absolute",
      left: "50px",
      bottom: "1.35em",
      zIndex: "30",
      display: "flex",
      gap: "1em",
      flexWrap: "nowrap",
      width: "calc(100% - 100px)",
      maxWidth: "calc(100% - 100px)",
      justifyContent: "space-between",
      pointerEvents: "none",
      color: "white",
      fontSize: "2em",
      lineHeight: "1.25"
    });

    const chips = Array.from(box.children);
    stylePairChip(chips[0], false);
    stylePairChip(chips[1], true);

    const native = nativeInfoContainer(wp, media);
    if (native) native.style.visibility = "hidden";
    const single = singleOverlay(wp, media, false);
    if (single) single.style.display = "none";
  }

  function polishSingle(wp, media) {
    const box = singleOverlay(wp, media, true);
    const native = nativeInfoElement(wp, media);
    const nativeContainer = nativeInfoContainer(wp, media);

    if (!infoEnabled()) {
      if (box) box.style.display = "none";
      if (nativeContainer) nativeContainer.style.visibility = "hidden";
      return;
    }

    const text = htmlText(native?.innerHTML || "");
    if (!text) {
      if (box) box.style.display = "none";
      return;
    }

    box.innerHTML = native.innerHTML;
    box.style.display = "block";
    if (nativeContainer) nativeContainer.style.visibility = "hidden";

    const pair = pairInfoBox(wp, media);
    if (pair) pair.style.display = "none";
  }

  function syncInfo(wp, media) {
    if (!media) return;
    if (media.dataset?.portraitPaired === "1") polishPair(wp, media);
    else polishSingle(wp, media);
  }

  function resetWeatherOffset(wp) {
    const cards = wp.shadowRoot?.querySelectorAll(".wp-card[data-pp-weather-offset='1']") || [];
    for (const card of cards) {
      card.style.transform = card.dataset.ppOldTransform || "";
      delete card.dataset.ppOldTransform;
      delete card.dataset.ppWeatherOffset;
    }
  }

  function applyWeatherOffset(wp) {
    resetWeatherOffset(wp);

    const active = wp.getActiveMediaElement?.();
    if (!active || active.dataset?.portraitPaired !== "1") return;

    const cards = [...(wp.shadowRoot?.querySelectorAll(".wp-card") || [])];
    if (!cards.length) return;

    const screenMid = window.innerWidth / 2;
    let weatherCard = null;
    let bestArea = 0;

    for (const card of cards) {
      const rect = card.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      const centerX = rect.left + rect.width / 2;
      if (centerX < screenMid) continue;
      const area = rect.width * rect.height;
      if (area > bestArea) {
        bestArea = area;
        weatherCard = card;
      }
    }

    if (!weatherCard) return;

    weatherCard.dataset.ppOldTransform = weatherCard.style.transform || "";
    weatherCard.dataset.ppWeatherOffset = "1";
    const oldTransform = weatherCard.dataset.ppOldTransform;
    weatherCard.style.transform =
      `${oldTransform ? oldTransform + " " : ""}translateY(-${PAIR_WEATHER_OFFSET}px)`;
  }

  function scheduleSync(wp, media) {
    const run = () => {
      syncInfo(wp, media);
      const active = wp.getActiveMediaElement?.();
      if (active) syncInfo(wp, active);
    };

    requestAnimationFrame(run);
    setTimeout(run, 80);
    setTimeout(run, 250);
    setTimeout(run, 1000);
  }

  customElements.whenDefined("wallpanel-view").then(() => {
    const prototype = customElements.get("wallpanel-view")?.prototype;
    if (!prototype || prototype.__wallpanelForkR25Polish) return;

    const previousUpdateMedia = prototype.updateMedia;
    const previousSetMediaDataInfo = prototype.setMediaDataInfo;
    const previousSwitch = prototype._switchActiveMedia;

    prototype.updateMedia = async function (...args) {
      const media = await previousUpdateMedia.apply(this, args);
      if (media) scheduleSync(this, media);
      return media;
    };

    prototype.setMediaDataInfo = function (...args) {
      const result = previousSetMediaDataInfo.apply(this, args);
      const media = args[0] || this.getActiveMediaElement?.();
      if (media) scheduleSync(this, media);
      return result;
    };

    if (typeof previousSwitch === "function") {
      prototype._switchActiveMedia = function (...args) {
        const result = previousSwitch.apply(this, args);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const active = this.getActiveMediaElement?.();
            if (active) syncInfo(this, active);
            applyWeatherOffset(this);
          });
        });
        return result;
      };
    }

    Object.defineProperty(prototype, "__wallpanelForkR25Polish", {
      value: true,
      configurable: false,
      enumerable: false,
      writable: false
    });
  });
})();
