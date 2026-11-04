/*
 * 講座投影片播放器
 *
 * 功能：
 *   ← → 空白鍵 PageUp/PageDown：換頁；Home/End：第一頁／最後一頁；輸入數字＋Enter：跳到該頁
 *   P：開啟講者模式視窗（目前頁、下一頁、講者備註、計時），兩個視窗用 BroadcastChannel 同步
 *   O：總覽模式（點縮圖跳頁）；F：全螢幕；B：黑畫面；T：講者模式計時歸零
 * 網址：#/12 代表第 12 頁；?export 進入匯出模式（所有投影片直排，給匯出腳本用）
 */
(() => {
  "use strict";

  /** 所有投影片節點 */
  const slides = Array.from(document.querySelectorAll("#stage > .slide"));
  /** 舞台與外框 */
  const stage = document.getElementById("stage");
  const params = new URLSearchParams(location.search);
  const isExport = params.has("export");
  const isPresenter = params.has("presenter");
  /** 跨視窗同步頻道 */
  const channel = "BroadcastChannel" in window ? new BroadcastChannel("ai-native-deck") : null;
  /** 目前頁索引（0 起算） */
  let current = 0;
  /** 數字跳頁的暫存輸入 */
  let typed = "";
  /** 講者模式計時起點 */
  let timerStart = Date.now();

  if (isExport) {
    document.body.classList.add("export");
    return;
  }

  /** 依視窗大小縮放 1920×1080 舞台（講者模式只佔左側） */
  function fitStage() {
    if (document.body.classList.contains("overview")) return;
    const area = isPresenter ? document.getElementById("viewport").getBoundingClientRect() : { width: innerWidth, height: innerHeight };
    const scale = Math.min(area.width / 1920, area.height / 1080);
    stage.style.transform = `scale(${scale})`;
  }

  /** 每一頁補上頁碼與進度條 */
  function decorate() {
    slides.forEach((s, i) => {
      const hud = document.createElement("div");
      hud.className = "hud";
      hud.textContent = `${String(i + 1).padStart(2, "0")} / ${slides.length}`;
      const bar = document.createElement("div");
      bar.className = "progress";
      bar.style.width = `${((i + 1) / slides.length) * 100}%`;
      s.append(hud, bar);
    });
  }

  /** 切換到第 index 頁；broadcast=true 時通知另一個視窗 */
  function go(index, broadcast = true) {
    current = Math.max(0, Math.min(slides.length - 1, index));
    slides.forEach((s, i) => s.classList.toggle("active", i === current));
    history.replaceState(null, "", `${location.pathname}${location.search}#/${current + 1}`);
    if (isPresenter) renderPresenter();
    if (broadcast && channel) channel.postMessage({ type: "go", index: current });
  }

  /** 講者模式：顯示下一頁縮圖、備註、時間錨點與計時 */
  function renderPresenter() {
    const panel = document.getElementById("presenter-panel");
    if (!panel) return;
    const slide = slides[current];
    const next = slides[current + 1];
    const notes = slide.querySelector(".notes");
    panel.querySelector(".p-pos").textContent = `${current + 1} / ${slides.length}`;
    panel.querySelector(".p-anchor").textContent = slide.dataset.time ? `⏱ 預定 ${slide.dataset.time}` : "";
    const notesBox = panel.querySelector(".p-notes");
    notesBox.replaceChildren(...(notes ? Array.from(notes.childNodes, (n) => n.cloneNode(true)) : [document.createTextNode("（本頁沒有備註）")]));
    const holder = panel.querySelector(".p-next");
    holder.replaceChildren();
    if (next) {
      const clone = next.cloneNode(true);
      clone.classList.add("active");
      clone.querySelectorAll(".notes").forEach((n) => n.remove());
      holder.appendChild(clone);
    } else {
      holder.textContent = "（最後一頁）";
    }
  }

  /** 建立講者模式的右側面板 */
  function buildPresenter() {
    document.body.classList.add("presenter");
    const style = document.createElement("style");
    style.textContent = `
      body.presenter #viewport { right: 34%; }
      #presenter-panel { position: fixed; top: 0; right: 0; bottom: 0; width: 34%; padding: 20px 24px;
        background: #0a1120; border-left: 2px solid rgba(63,214,195,.25); display: flex; flex-direction: column; gap: 14px; }
      #presenter-panel .p-head { display: flex; justify-content: space-between; font: 600 28px var(--mono); color: var(--teal); }
      #presenter-panel .p-clock { font: 700 44px var(--mono); color: var(--text); }
      #presenter-panel .p-anchor { font: 26px var(--mono); color: var(--amber); }
      #presenter-panel .p-next { position: relative; width: 100%; aspect-ratio: 16 / 9; overflow: hidden; border: 2px solid rgba(184,196,214,.2); border-radius: 10px; }
      #presenter-panel .p-next .slide { transform-origin: 0 0; }
      #presenter-panel .p-notes { flex: 1; overflow: auto; font-size: 26px; line-height: 1.6; color: var(--text); padding-right: 6px; }
      #presenter-panel .p-notes p { margin: 0 0 12px; }`;
    document.head.appendChild(style);
    const panel = document.createElement("div");
    panel.id = "presenter-panel";
    panel.innerHTML = `<div class="p-head"><span class="p-pos"></span><span class="p-anchor"></span></div>
      <div class="p-clock">00:00</div><div class="p-next"></div><div class="p-notes"></div>`;
    document.body.appendChild(panel);
    // 下一頁縮圖依面板寬度縮放
    const scaleNext = () => {
      const w = panel.querySelector(".p-next").clientWidth;
      panel.querySelectorAll(".p-next .slide").forEach((s) => (s.style.transform = `scale(${w / 1920})`));
    };
    new ResizeObserver(scaleNext).observe(panel);
    new MutationObserver(scaleNext).observe(panel.querySelector(".p-next"), { childList: true });
    setInterval(() => {
      const sec = Math.floor((Date.now() - timerStart) / 1000);
      panel.querySelector(".p-clock").textContent =
        `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
    }, 500);
  }

  /** 鍵盤操作 */
  function onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    // 放大檢視開著時，Esc 或任何換頁鍵都先關掉放大圖，不換頁
    if (lightbox && lightbox.classList.contains("on")) { e.preventDefault(); closeLightbox(); return; }
    const k = e.key;
    if (/^[0-9]$/.test(k)) { typed += k; return; }
    if (k === "Enter" && typed) { go(parseInt(typed, 10) - 1); typed = ""; return; }
    typed = "";
    if (["ArrowRight", "ArrowDown", "PageDown", " "].includes(k)) { e.preventDefault(); go(current + 1); }
    else if (["ArrowLeft", "ArrowUp", "PageUp"].includes(k)) { e.preventDefault(); go(current - 1); }
    else if (k === "Home") go(0);
    else if (k === "End") go(slides.length - 1);
    else if (k === "p" || k === "P") window.open(`${location.pathname}?presenter#/${current + 1}`, "presenter", "width=1600,height=900");
    else if (k === "o" || k === "O") toggleOverview();
    else if (k === "f" || k === "F") { if (!document.fullscreenElement) document.documentElement.requestFullscreen(); else document.exitFullscreen(); }
    else if (k === "b" || k === "B") document.body.classList.toggle("blackout");
    else if (k === "t" || k === "T") timerStart = Date.now();
  }

  /** 總覽模式：顯示全部縮圖，點擊跳頁 */
  function toggleOverview() {
    const on = document.body.classList.toggle("overview");
    if (on) {
      stage.style.transform = "none";
      slides[current].scrollIntoView({ block: "center" });
    } else {
      fitStage();
    }
  }

  /* 點圖放大（只在展示時有效；?export 匯出模式不掛，匯出的投影片版面不變）
     對象：系統截圖（media/shot）與圖表（media/chart），插畫背景不放大 */
  let lightbox = null; // 放大檢視的遮罩元素
  function closeLightbox() { if (lightbox) lightbox.classList.remove("on"); }
  /** 開啟放大檢視：把被點的圖以原始比例鋪滿視窗 */
  function openLightbox(src, alt) {
    if (!lightbox) {
      lightbox = document.createElement("div");
      lightbox.className = "lightbox";
      lightbox.innerHTML = "<img alt=''>";
      lightbox.addEventListener("click", closeLightbox);
      document.body.appendChild(lightbox);
    }
    const img = lightbox.querySelector("img");
    img.src = src; img.alt = alt || "";
    lightbox.classList.add("on");
  }
  if (!isExport) {
    document.addEventListener("click", (e) => {
      const img = e.target.closest && e.target.closest('.slide img[src*="media/shot/"], .slide img[src*="media/chart/"]');
      if (!img || document.body.classList.contains("overview")) return;
      e.stopPropagation();
      openLightbox(img.currentSrc || img.src, img.alt);
    }, true);
  }

  slides.forEach((s, i) => s.addEventListener("click", () => {
    if (document.body.classList.contains("overview")) { toggleOverview(); go(i); }
  }));

  if (channel) {
    channel.onmessage = (ev) => { if (ev.data && ev.data.type === "go") go(ev.data.index, false); };
  }

  decorate();
  if (isPresenter) buildPresenter();
  window.addEventListener("resize", fitStage);
  document.addEventListener("keydown", onKey);
  const m = location.hash.match(/#\/(\d+)/);
  go(m ? parseInt(m[1], 10) - 1 : 0, false);
  fitStage();
})();
