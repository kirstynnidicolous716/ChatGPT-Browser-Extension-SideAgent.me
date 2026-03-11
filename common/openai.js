// common/openai.js
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MODEL = "gpt-4o-mini";

export async function getApiKey(){
  return await new Promise(r=>chrome.storage.local.get(["openaiKey"],x=>r(x.openaiKey||"")));
}

async function openaiFetch(body){
  const key = await getApiKey();
  if(!key) throw new Error("OpenAI API key not set. Go to the extension's Settings.");
  const resp = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {"Content-Type":"application/json","Authorization":`Bearer ${key}`},
    body: JSON.stringify(body)
  });
  if(!resp.ok){
    const t = await resp.text();
    throw new Error(`OpenAI error ${resp.status}: ${t}`);
  }
  return resp.json();
}

/**
 * Tool-calling chat loop.
 * Applies a small retry that trims older messages if the server says "context_length_exceeded".
 */
export async function chatWithTools({ messages, tools, toolExecutor, maxSteps = 8, systemPrompt }){
  let msgs = messages.slice();
  if (systemPrompt) msgs.unshift({ role: "system", content: systemPrompt });

  async function once(){
    for (let step = 0; step < maxSteps; step++) {
      const res = await openaiFetch({ model: DEFAULT_MODEL, messages: msgs, tools });
      const choice = res.choices?.[0];
      if (!choice) throw new Error("No choices");

      const msg = choice.message;
      msgs.push(msg);

      const toolCalls = msg.tool_calls || msg.tool_calls_v1 || msg.tool_calls_v2 || msg.tool_calls;
      if (Array.isArray(toolCalls) && toolCalls.length) {
        for (const c of toolCalls) {
          const name = c.function?.name;
          const raw = c.function?.arguments || "{}";
          let args = {};
          try { args = JSON.parse(raw); } catch {}
          let result, error;
          try { result = await toolExecutor(name, args); }
          catch (e) { error = e?.message || String(e); }
          msgs.push({ role: "tool", tool_call_id: c.id, content: JSON.stringify({ ok: !error, result, error }) });
        }
        continue; // keep looping to let the assistant consume tool results
      }
      return { messages: msgs, final: msg };
    }
    return { messages: msgs, final: { role: "assistant", content: "Max tool steps reached." } };
  }

  try {
    return await once();
  } catch (e) {
    const s = String(e||"");
    if (s.includes("context_length_exceeded")) {
      // Trim earliest big HTML parts and retry once
      msgs = trimHistoryHeuristically(msgs);
      return await once();
    }
    throw e;
  }
}

/** Heuristic history trimming to lower token usage. */
function trimHistoryHeuristically(msgs, keepLast = 30){
  // Keep system + last N; aggressively drop old BEGIN:HTML parts
  const sys = msgs.filter(m => m.role === "system").slice(0,1);
  const rest = msgs.filter(m => m.role !== "system");
  // Remove older HTML chunk messages
  const filtered = rest.filter((m, i, arr) => {
    if (typeof m.content === "string" && m.content.startsWith("BEGIN:HTML:PART")) {
      // Drop if not in last 8 messages
      return i >= arr.length - 8;
    }
    return true;
  });
  const sliced = filtered.slice(-keepLast);
  return [...sys, ...sliced];
}
