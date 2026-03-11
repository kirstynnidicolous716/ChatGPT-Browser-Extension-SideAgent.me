// sidepanel/sidepanel.js
import { chatWithTools } from "../common/openai.js";
import { TOOL_SPECS } from "../common/protocol.js";

const logEl = document.getElementById("log");
const cmdEl = document.getElementById("cmd");
const sendBtn = document.getElementById("send");
const btnSettings = document.getElementById("btnSettings");
const btnSnapshot = document.getElementById("btnSnapshot");
const btnArm = document.getElementById("btnArm");
const btnWatch = document.getElementById("btnWatch");

let armed = false;
let watchOn = false;
let messages = [
  { role: "system", content: "You are a Dev Agent inside a Chrome side panel. Use tools to inspect/control the page. Start with getSnapshotMeta or getDigest. Request minimal chunks via getSourceChunk. Avoid pulling the entire HTML unless necessary." }
];

btnSettings.onclick = () => chrome.runtime.openOptionsPage();
btnArm.onclick = () => { armed = !armed; btnArm.textContent = armed ? "Disarm" : "Arm"; };
btnWatch.onclick = () => { watchOn = !watchOn; btnWatch.textContent = "Watch: " + (watchOn ? "On" : "Off"); };

sendBtn.onclick = onSend;
cmdEl.addEventListener("keydown", (e) => { if (e.key === "Enter") onSend(); });

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "CN_PAGE_EVENT" && watchOn) {
    append("system", `Page event: ${msg.event} @ ${msg.url}`);
    btnSnapshot.click();
  }
});

function append(role, content, bad = false) {
  const wrap = document.createElement("div");
  wrap.className = "row";
  const r = document.createElement("div"); r.className = "role"; r.textContent = role;
  const pre = document.createElement("pre"); pre.className = "content" + (bad ? " bad" : "");
  pre.textContent = typeof content === "string" ? content : JSON.stringify(content, null, 2);
  wrap.appendChild(r); wrap.appendChild(pre); logEl.appendChild(wrap); logEl.scrollTop = logEl.scrollHeight;
}

async function getActiveTabId() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab?.id;
}

function approxTokenCountOfMessages(msgs){
  let chars = 0;
  for (const m of msgs) if (typeof m.content === "string") chars += m.content.length;
  return Math.ceil(chars / 4);
}
function trimHistoryForBudget(maxTokens=100000){
  const current = approxTokenCountOfMessages(messages);
  if (current <= maxTokens) return;
  const base = messages.filter(m => !(typeof m.content === "string" && m.content.startsWith("BEGIN:HTML:PART")));
  messages = base.slice(0,1).concat(base.slice(-30));
}

async function onSend() {
  const text = cmdEl.value.trim();
  if (!text) return;
  cmdEl.value = "";
  append("user", text);
  messages.push({ role: "user", content: text });

  trimHistoryForBudget();

  try {
    const MAX_CHUNKS_THIS_TURN = 2;
    let chunksServed = 0;

    const { final } = await chatWithTools({
      messages,
      tools: TOOL_SPECS,
      toolExecutor: async (name, args) => {
        const tabId = await getActiveTabId();
        if (!tabId) throw new Error("No active tab.");
        switch (name) {
          case "getSnapshotMeta": return await sendToTab(tabId, { type: "CN_GET_SNAPSHOT_META" });
          case "getDigest": return await sendToTab(tabId, { type: "CN_GET_DIGEST", ...args });
          case "getSourceChunk": {
            if (chunksServed >= MAX_CHUNKS_THIS_TURN) throw new Error(`Chunk quota reached (${MAX_CHUNKS_THIS_TURN}). Ask again next turn.`);
            chunksServed++;
            const { index = 0, size } = args || {};
            return await sendToTab(tabId, { type: "CN_GET_SOURCE_CHUNK", index, size });
          }
          case "getHtmlBySelector": {
            const { selector, limit, maxChars } = args || {};
            return await sendToTab(tabId, { type: "CN_GET_HTML_BY_SELECTOR", selector, limit, maxChars });
          }
          case "getTextBySelector": {
            const { selector, limit, maxChars } = args || {};
            return await sendToTab(tabId, { type: "CN_GET_TEXT_BY_SELECTOR", selector, limit, maxChars });
          }
          case "querySelectorAll": {
            const { selector, map, maxResults } = args || {};
            return await sendToTab(tabId, { type: "CN_QUERY_ALL", selector, map, maxResults });
          }
          case "click": {
            const { selector, index } = args || {};
            return await sendToTab(tabId, { type: "CN_CLICK", selector, index });
          }
          case "typeInto": {
            const { selector, text, clear, submit } = args || {};
            return await sendToTab(tabId, { type: "CN_TYPE", selector, text, clear, submit });
          }
          case "scrollPage": {
            const { target, selector } = args || {};
            return await sendToTab(tabId, { type: "CN_SCROLL", target, selector });
          }
          case "evalInPage": {
            if (!armed) throw new Error("Code execution is disarmed. Press Arm first.");
            const { code, world = "ISOLATED" } = args || {};
            return await execEval(tabId, code, world);
          }
          case "callLib": {
            if (!armed) throw new Error("Code execution is disarmed. Press Arm first.");
            const name = args?.name; const a = args?.args || [];
            const code = `(() => { const n=${JSON.stringify(name)}; const A=${JSON.stringify(a)}; if(!window.DynamicLib || typeof window.DynamicLib[n] !== 'function') return {error:'DynamicLib.'+n+' not found'}; return window.DynamicLib[n].apply(window,A); })()`;
            return await execEval(tabId, code, "MAIN");
          }
          default: throw new Error(`Unknown tool: ${name}`);
        }
      }
    });
    if (final?.content) {
      append("assistant", final.content);
      messages.push(final);
    }
  } catch (e) {
    append("error", e.message || String(e), true);
  }
}

btnSnapshot.onclick = async () => {
  try {
    const tabId = await getActiveTabId();
    if (!tabId) throw new Error("No active tab.");
    const meta = await sendToTab(tabId, { type: "CN_GET_SNAPSHOT_META" });
    append("system", `Snapshot: ${meta.title} (len=${meta.htmlLength}, chunks≈${meta.chunks})\n${meta.url}`);
    const header = { role: "user", content: `PAGE META: title=${meta.title}\nurl=${meta.url}\nhtmlLength=${meta.htmlLength}\nchunks≈${meta.chunks}` };
    messages.push(header);
    const digest = await sendToTab(tabId, { type: "CN_GET_DIGEST", maxLinks: 40, maxHeadings: 40 });
    messages.push({ role: "user", content: "PAGE DIGEST: " + JSON.stringify(digest.data).slice(0, 12000) });
    append("user", "Digest added. Model can now request specific chunks or selectors.");
  } catch (e) {
    append("error", e.message || String(e), true);
  }
};

async function execEval(tabId, code, world) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    world,
    func: (code) => {
      try {
        const out = (0, eval)(code);
        try { return JSON.parse(JSON.stringify(out)); } catch { return String(out); }
      } catch (e) { return { error: e?.message || String(e) }; }
    },
    args: [code]
  });
  return result;
}

async function sendToTab(tabId, payload) {
  return await new Promise((resolve, reject) => {
    try {
      chrome.tabs.sendMessage(tabId, payload, (resp) => {
        const err = chrome.runtime.lastError;
        if (err) { reject(new Error(err.message)); return; }
        if (!resp) { reject(new Error("No response from tab")); return; }
        resolve(resp);
      });
    } catch (e) { reject(e); }
  });
}

append("system", "Ready. Use ‘Snapshot DOM’ to send meta/digest; the model can fetch specific chunks on demand. Use ‘Watch’ to auto-resume on URL/DOM changes. ‘Arm’ before running dynamic code.");
