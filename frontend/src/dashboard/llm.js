import { LLM_CONFIG } from "./constants";
import { AMBIENT_PROMPT, SYSTEM_PROMPT } from "./prompts";
import { buildDateContext } from "./utils";

let chatCtrl = null;
let bgCtrl = null;

function parseResponse(raw) {
    if (!raw) return null;
    const c = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    try {
        const p = JSON.parse(c);
        return { actions: Array.isArray(p.actions) ? p.actions : [], reply: p.reply || "" };
    } catch {
        const m = c.match(/\{[\s\S]*\}/);
        if (m) {
            try {
                const p = JSON.parse(m[0]);
                return { actions: Array.isArray(p.actions) ? p.actions : [], reply: p.reply || "" };
            } catch {
            }
        }
    }
    return null;
}

async function fetchLLM(systemPrompt, userMsg, signal, maxTok = 500) {
    if (LLM_CONFIG.mode === "local") {
        const r = await fetch(LLM_CONFIG.local_url, {
            method: "POST",
            signal,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: LLM_CONFIG.local_model,
                messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userMsg }],
                temperature: 0.3,
                max_tokens: maxTok,
                response_format: { type: "json_object" },
            }),
        });
        if (!r.ok) throw new Error(`LLM server error: ${r.status} ${r.statusText}`);
        return (await r.json()).choices?.[0]?.message?.content || "{}";
    }
}

export async function callLLM(msg, state) {
    if (chatCtrl) chatCtrl.abort();
    chatCtrl = new AbortController();
    const full = SYSTEM_PROMPT + buildDateContext() + `\n\nState: ${JSON.stringify(state)}`;
    try {
        const raw = await fetchLLM(full, msg, chatCtrl.signal, 500);
        chatCtrl = null;
        const parsed = parseResponse(raw);
        if (parsed) return { actions: parsed.actions, reply: parsed.reply || "Done! ✨" };
        return { actions: [], reply: "Done! ✨" };
    } catch (e) {
        chatCtrl = null;
        if (e?.name === "AbortError") return { actions: [], reply: "" };
        return { actions: [], reply: "Couldn't process that — try rephrasing?" };
    }
}

export async function callAmbientLLM(contextMsg) {
    if (bgCtrl) bgCtrl.abort();
    bgCtrl = new AbortController();
    try {
        const raw = await fetchLLM(AMBIENT_PROMPT, contextMsg, bgCtrl.signal, 200);
        bgCtrl = null;
        return parseResponse(raw) || { actions: [], reply: "" };
    } catch {
        bgCtrl = null;
        return { actions: [], reply: "" };
    }
}
