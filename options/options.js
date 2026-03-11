// options/options.js
const keyEl = document.getElementById("key");
const statusEl = document.getElementById("status");
const saveBtn = document.getElementById("save");

chrome.storage.local.get(["openaiKey"], (res) => {
  if (res.openaiKey) keyEl.value = res.openaiKey;
});

saveBtn.onclick = () => {
  const key = keyEl.value.trim();
  chrome.storage.local.set({ openaiKey: key }, () => {
    statusEl.textContent = key ? "Saved." : "Cleared.";
    statusEl.className = key ? "ok" : "bad";
    setTimeout(() => statusEl.textContent = "", 2000);
  });
};
