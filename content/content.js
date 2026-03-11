// content/content.js
(function(){
  let cachedHTML=""; let cachedChunks=[]; const DEFAULT_CHUNK=120_000;
  const THROTTLE_MS = 1000;
  let lastNotify = 0;

  function snapshotHTML(){
    try{
      cachedHTML=document.documentElement.outerHTML||document.body?.outerHTML||"";
      cachedChunks=[];
      return cachedHTML.length;
    }catch(e){ cachedHTML=""; cachedChunks=[]; return 0; }
  }
  function ensureChunks(size=DEFAULT_CHUNK){
    if(!cachedHTML) snapshotHTML();
    if(cachedChunks.length) return cachedChunks;
    const out=[]; for(let i=0;i<cachedHTML.length;i+=size){ out.push(cachedHTML.slice(i,i+size)); }
    cachedChunks=out; return cachedChunks;
  }

  function getDigest({maxLinks=30,maxHeadings=30}={}){
    const heads = Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6"))
      .slice(0,maxHeadings)
      .map(el=>({ tag: el.tagName, id: el.id||"", cls: el.className||"", text: (el.textContent||"").trim().slice(0,200) }));
    const links = Array.from(document.links).slice(0,maxLinks)
      .map(a=>({ text: (a.textContent||"").trim().slice(0,120), href: a.href }));
    const forms = document.forms?.length||0;
    const buttons = document.querySelectorAll("button,[role=button],input[type=button],input[type=submit]").length;
    return { title: document.title, url: location.href, heads, links, forms, buttons, htmlLength: (document.documentElement.outerHTML||"").length };
  }

  function getHtmlBySelector(selector, limit=5, maxChars=20000){
    const arr = Array.from(document.querySelectorAll(selector)).slice(0, limit).map(el => (el.outerHTML||"").slice(0, maxChars));
    return { selector, count: arr.length, html: arr };
  }
  function getTextBySelector(selector, limit=10, maxChars=20000){
    const arr = Array.from(document.querySelectorAll(selector)).slice(0, limit).map(el => (el.textContent||"").slice(0, maxChars));
    return { selector, count: arr.length, text: arr };
  }

  function notify(type, extra={}){
    const now = Date.now();
    if (now - lastNotify < THROTTLE_MS) return;
    lastNotify = now;
    try { chrome.runtime.sendMessage({ type: "CN_PAGE_EVENT", event: type, url: location.href, ...extra }); } catch {}
  }
  const _ps = history.pushState, _rs = history.replaceState;
  history.pushState = function(){ const r=_ps.apply(this, arguments); window.dispatchEvent(new Event("locationchange")); return r; };
  history.replaceState = function(){ const r=_rs.apply(this, arguments); window.dispatchEvent(new Event("locationchange")); return r; };
  window.addEventListener("popstate", ()=> window.dispatchEvent(new Event("locationchange")));
  window.addEventListener("hashchange", ()=> window.dispatchEvent(new Event("locationchange")));
  window.addEventListener("locationchange", ()=> notify("url-change"));

  const mo = new MutationObserver(()=> notify("dom-change"));
  const startMO = ()=> { try { mo.observe(document.documentElement, { subtree:true, childList:true, attributes:true, characterData:true }); } catch {} };
  document.addEventListener("DOMContentLoaded", startMO);
  startMO();

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    (async () => {
      if (msg?.type === "CN_GET_SNAPSHOT_META") {
        const len = snapshotHTML();
        sendResponse({ ok: true, url: location.href, title: document.title, htmlLength: len, styleSheets: document.styleSheets?.length || 0, chunks: Math.ceil(len / DEFAULT_CHUNK) });
        return;
      }
      if (msg?.type === "CN_GET_DIGEST") {
        sendResponse({ ok: true, data: getDigest(msg||{}) });
        return;
      }
      if (msg?.type === "CN_GET_SOURCE_CHUNK") {
        const size = msg.size || DEFAULT_CHUNK;
        const chunks = ensureChunks(size);
        const index = Math.max(0, Math.min(chunks.length - 1, msg.index || 0));
        sendResponse({ ok: true, index, total: chunks.length, text: chunks[index] });
        return;
      }
      if (msg?.type === "CN_GET_HTML_BY_SELECTOR") {
        const { selector, limit = 5, maxChars = 20000 } = msg;
        sendResponse({ ok: true, data: getHtmlBySelector(selector, limit, maxChars) });
        return;
      }
      if (msg?.type === "CN_GET_TEXT_BY_SELECTOR") {
        const { selector, limit = 10, maxChars = 20000 } = msg;
        sendResponse({ ok: true, data: getTextBySelector(selector, limit, maxChars) });
        return;
      }
      if (msg?.type === "CN_QUERY_ALL") {
        const { selector, map = "outerHTML", maxResults = 50 } = msg;
        const nodes = Array.from(document.querySelectorAll(selector)).slice(0, maxResults);
        const mapped = nodes.map((el) => {
          switch (map) {
            case "text": return el.textContent || "";
            case "value": return (el.value !== undefined ? el.value : el.textContent) || "";
            case "attrs": return Array.from(el.attributes).reduce((acc, a) => (acc[a.name] = a.value, acc), {});
            default: return el.outerHTML || "";
          }
        });
        sendResponse({ ok: true, data: mapped });
        return;
      }
      if (msg?.type === "CN_CLICK") {
        const { selector, index = 0 } = msg;
        const el = document.querySelectorAll(selector)?.[index];
        if (el) { el.click(); sendResponse({ ok: true }); } else { sendResponse({ ok: false, error: "Element not found" }); }
        return;
      }
      if (msg?.type === "CN_TYPE") {
        const { selector, text, clear = true, submit = false } = msg;
        const el = document.querySelector(selector);
        if (!el) { sendResponse({ ok: false, error: "Element not found" }); return; }
        if (clear) { if ("value" in el) el.value = ""; else el.textContent = ""; }
        if ("value" in el) { el.focus(); el.value += text; }
        else if (el.isContentEditable) { el.focus(); document.execCommand("insertText", false, text); }
        if (submit) { el.form?.requestSubmit?.(); }
        sendResponse({ ok: true });
        return;
      }
      if (msg?.type === "CN_SCROLL") {
        const { target = "bottom", selector } = msg;
        if (target === "top") window.scrollTo({ top: 0, behavior: "smooth" });
        else if (target === "bottom") window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
        else if (target === "selector" && selector) {
          const el = document.querySelector(selector);
          el?.scrollIntoView({ behavior: "smooth", block: "center" });
        }
        sendResponse({ ok: true });
        return;
      }
    })();
    return true;
  });
})();
