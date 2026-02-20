import { useState, useRef, useEffect, useCallback, useMemo } from "react";

// ═══════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════
const LLM_CONFIG = {
    mode: "local",
    local_url: "http://localhost:8080/v1/chat/completions",
    local_model: "phi-3.5-mini-instruct",
};
const POSTIT_CHAR_LIMIT = 120;
const TASK_CHAR_LIMIT = 80;

// ═══════════════════════════════════════════════════
// SMART EMOJI GUESSER
// ═══════════════════════════════════════════════════
const HAS_EMOJI = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u;
const EMOJI_MAP = [
    [/\b(meet|call|zoom|standup|sync|huddle)\b/i, "📞"],
    [/\b(lunch|dinner|eat|food|restaurant|cook|recipe|breakfast)\b/i, "🍽️"],
    [/\b(coffee|cafe|latte|espresso)\b/i, "☕"],
    [/\b(gym|exercise|workout|run|jog|fitness|yoga|swim)\b/i, "💪"],
    [/\b(doctor|dentist|hospital|health|medical|checkup|appointment)\b/i, "🏥"],
    [/\b(deploy|ship|release|launch|production|hotfix)\b/i, "🚀"],
    [/\b(bug|fix|debug|error|crash)\b/i, "🐛"],
    [/\b(code|develop|program|build|implement|refactor)\b/i, "💻"],
    [/\b(design|sketch|figma|ui|ux|wireframe|prototype)\b/i, "🎨"],
    [/\b(write|draft|blog|article|essay|report|document)\b/i, "✍️"],
    [/\b(review|feedback|check|audit|inspect|proofread)\b/i, "🔍"],
    [/\b(email|mail|inbox|send|reply|message)\b/i, "📧"],
    [/\b(buy|shop|order|purchase|store|grocery|groceries)\b/i, "🛒"],
    [/\b(travel|flight|trip|hotel|vacation|airport|train)\b/i, "✈️"],
    [/\b(learn|study|course|class|read|book|research)\b/i, "📚"],
    [/\b(money|pay|bill|invoice|budget|tax|salary|bank)\b/i, "💰"],
    [/\b(clean|organize|tidy|laundry|vacuum|wash)\b/i, "🧹"],
    [/\b(birthday|party|celebrate|cake|gift|anniversary)\b/i, "🎂"],
    [/\b(plan|strategy|roadmap|brainstorm|think)\b/i, "🧠"],
    [/\b(present|slides|deck|powerpoint|keynote|pitch)\b/i, "📊"],
    [/\b(test|qa|quality|spec|validate)\b/i, "🧪"],
    [/\b(team|hire|interview|onboard|people|hr)\b/i, "👥"],
    [/\b(urgent|asap|critical|emergency|deadline)\b/i, "🔴"],
    [/\b(car|drive|garage|mechanic|oil|tire)\b/i, "🚗"],
    [/\b(pet|dog|cat|vet|walk)\b/i, "🐾"],
    [/\b(music|song|playlist|concert|guitar|piano)\b/i, "🎵"],
    [/\b(movie|film|watch|netflix|cinema|show)\b/i, "🎬"],
    [/\b(game|play|gaming)\b/i, "🎮"],
    [/\b(photo|picture|camera|shoot)\b/i, "📸"],
    [/\b(plant|garden|water|flower)\b/i, "🌱"],
    [/\b(sleep|rest|nap|relax|chill)\b/i, "😴"],
    [/\b(idea|creative|brainstorm|inspiration)\b/i, "💡"],
];
function guessEmoji(text) {
    if (!text || HAS_EMOJI.test(text)) return ""; // Don't duplicate if an emoji is already present
    for (const [re, em] of EMOJI_MAP) { if (re.test(text)) return em; }
    return "";
}

// ═══════════════════════════════════════════════════
// DATE AWARENESS
// ═══════════════════════════════════════════════════
function buildDateContext() {
    const now = new Date(), iso = (d) => d.toISOString().split("T")[0];
    const dn = (d) => ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][d.getDay()];
    const ad = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
    const dow = now.getDay();
    const names = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    const tw = {}, nw = {};
    for (let i = 0; i < 7; i++) {
        const du = (i - dow + 7) % 7;
        tw[names[i]] = iso(ad(now, du === 0 && i !== dow ? 7 : du));
        nw[names[i]] = iso(ad(now, du + 7));
    }
    return `DATE REFERENCE:\nToday: ${iso(now)} (${dn(now)})\nTomorrow: ${iso(ad(now, 1))} (${dn(ad(now, 1))})\nThis week: ${names.map(n => `this ${n}=${tw[n]}`).join(", ")}\nNext week: ${names.map(n => `next ${n}=${nw[n]}`).join(", ")}\nUse these exact dates for "tomorrow", "this wednesday", "next friday", etc.`;
}

const DEFAULT_AMBIENT = {
    glowColor: "transparent", glowIntensity: 0, grainOpacity: 0.03,
    panelBlur: 20, panelOpacity: 0.03, borderWarmth: 0,
    mood: "neutral", particles: "none",
};

// ═══════════════════════════════════════════════════
// SYSTEM PROMPT
// ═══════════════════════════════════════════════════
const SYSTEM_PROMPT = `You control a dashboard. Respond ONLY with a JSON object. No markdown, no explanation.

ACTIONS you can use:
{"type":"add_task","text":"Buy milk 🥛","priority":"medium"}
{"type":"complete_task","text":"milk"} // Triggers on: complete, done, finish, check off, cross out
{"type":"delete_task","text":"milk"}
{"type":"split_task","text":"report","subtasks":["Research 🔍","Write draft ✍️","Edit 📝"]}
{"type":"add_postit","content":"Remember this","color":"#fef68a","x":200,"y":100}
{"type":"add_event","title":"Meeting 📞","date":"2026-02-16","time":"14:00","duration":60,"color":"#6c5ce7"}
{"type":"delete_event","title":"meeting"}
{"type":"add_expense","description":"Coffee ☕","amount":4.50,"category":"food"}
{"type":"set_budget","amount":500}
{"type":"add_timer","minutes":25,"label":"Focus"}
{"type":"change_theme","theme":"cozy"}
{"type":"set_greeting","text":"Hello!"}
{"type":"add_widget","widgetType":"clock"}
{"type":"add_widget","widgetType":"quote"}
{"type":"adjust_ambient","glowColor":"#e17055","glowIntensity":0.12,"borderWarmth":0.7,"particles":"fireflies","mood":"cozy"}
{"type":"change_bg","color":"#1a1a2e"}
{"type":"clear_canvas"}

split_task KEEPS the parent and adds subtasks below it.
adjust_ambient: particles=none|fireflies|stars|rain|sparkle. Use ONLY for emotional content.
Themes: cozy, focus, ocean, sunset, forest, midnight, minimal
Priority: high, medium, low
Categories: food, transport, entertainment, shopping, bills, health, other

FORMAT: {"actions":[...],"reply":"short message"}

EXAMPLES:
User: add task buy groceries
{"actions":[{"type":"add_task","text":"Buy groceries 🛒","priority":"medium"}],"reply":"Task added! 🛒"}

User: I finished the design mockup
{"actions":[{"type":"complete_task","text":"design mockup"}],"reply":"Great job! Checked off. ✅"}

User: logged 20 for train tickets
{"actions":[{"type":"add_expense","description":"Train tickets 🚆","amount":20,"category":"transport"}],"reply":"Expense logged! 🚆"}

User: Trip to Ireland next week
{"actions":[{"type":"add_event","title":"Trip to Ireland 🇮🇪","date":"2026-02-23","time":"09:00","duration":1440,"color":"#00b894"}],"reply":"Ireland trip added! 🇮🇪"}

RULES:
- Extract ACTUAL content. Analyze the deep context (e.g., countries, brands, emotional tone, specific activities) and ALWAYS append ONE fitting, standard Unicode emoji to the end of the text/title.
- CRITICAL EMOJI RULE: Use STRICTLY valid standard Unicode emojis. NEVER mix regional indicator letters with text (e.g., correctly output "Visit Ireland 🇮🇪", NEVER output "Visit Ireland 🇮reland"). 
- Recognize synonyms for completion: "done", "complete", "finish", "check off" all map to "complete_task".
- Use DATE REFERENCE below to resolve dates accurately.
- Keep reply under 20 words
- Output ONLY the JSON object
`;

// ═══════════════════════════════════════════════════
// LLM CALLS
// ═══════════════════════════════════════════════════
let chatCtrl = null;
let bgCtrl = null;

function parseResponse(raw) {
    if (!raw) return null;
    const c = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    try { const p = JSON.parse(c); return { actions: Array.isArray(p.actions) ? p.actions : [], reply: p.reply || "" }; }
    catch {
        const m = c.match(/\{[\s\S]*\}/);
        if (m) { try { const p = JSON.parse(m[0]); return { actions: Array.isArray(p.actions) ? p.actions : [], reply: p.reply || "" }; } catch { } }
    }
    return null;
}

async function fetchLLM(systemPrompt, userMsg, signal, maxTok = 500) {
    if (LLM_CONFIG.mode === "local") {
        const r = await fetch(LLM_CONFIG.local_url, {
            method: "POST", signal, headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model: LLM_CONFIG.local_model, messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userMsg }], temperature: 0.3, max_tokens: maxTok, response_format: { type: "json_object" } })
        });
        return (await r.json()).choices?.[0]?.message?.content || "{}";
    } else {
        const r = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST", signal, headers: { "Content-Type": "application/json", "x-api-key": "", "anthropic-version": "2023-06-01" },
            body: JSON.stringify({ model: "claude-3-5-sonnet-20240620", max_tokens: maxTok, system: systemPrompt, messages: [{ role: "user", content: userMsg }] })
        });
        return ((await r.json()).content || []).map(b => b.text || "").join("");
    }
}

async function callLLM(msg, state) {
    if (chatCtrl) chatCtrl.abort();
    chatCtrl = new AbortController();
    const full = SYSTEM_PROMPT + buildDateContext() + `\n\nState: ${JSON.stringify(state)}`;
    try {
        const raw = await fetchLLM(full, msg, chatCtrl.signal, 500);
        chatCtrl = null;
        console.log("[LLM raw]", raw);
        const parsed = parseResponse(raw);
        console.log("[LLM parsed]", parsed);
        if (parsed) return { actions: parsed.actions, reply: parsed.reply || "Done! ✨" };
        return { actions: [], reply: "Done! ✨" };
    } catch (e) {
        chatCtrl = null;
        if (e?.name === "AbortError") return { actions: [], reply: "" };
        return { actions: [], reply: "Couldn't process that — try rephrasing?" };
    }
}

const AMBIENT_PROMPT = `You adjust a dashboard's visual atmosphere. Respond with ONLY JSON, no markdown.
If the content has emotional weight, return: {"actions":[{"type":"adjust_ambient","glowColor":"#hex","glowIntensity":0.1,"borderWarmth":0.5,"particles":"none","mood":"label"}],"reply":""}
If no adjustment needed: {"actions":[],"reply":""}`;

async function callAmbientLLM(contextMsg) {
    if (bgCtrl) bgCtrl.abort();
    bgCtrl = new AbortController();
    try {
        const raw = await fetchLLM(AMBIENT_PROMPT, contextMsg, bgCtrl.signal, 200);
        bgCtrl = null;
        return parseResponse(raw) || { actions: [], reply: "" };
    } catch { bgCtrl = null; return { actions: [], reply: "" }; }
}

// ═══════════════════════════════════════════════════
// HOOKS & HELPERS
// ═══════════════════════════════════════════════════
function useDraggable(ix, iy) {
    const [pos, setPos] = useState({ x: ix, y: iy });
    const dr = useRef(false), off = useRef({ x: 0, y: 0 });
    const onMouseDown = useCallback((e) => {
        if (e.target.closest("button, input, textarea, select, a, [data-nodrag]")) return;
        e.preventDefault(); dr.current = true; off.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
        const mv = ev => { if (dr.current) setPos({ x: ev.clientX - off.current.x, y: ev.clientY - off.current.y }); };
        const up = () => { dr.current = false; window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); };
        window.addEventListener("mousemove", mv); window.addEventListener("mouseup", up);
    }, [pos.x, pos.y]);
    return { pos, onMouseDown };
}

function EditableText({ value, onChange, maxLen, style, multiline }) {
    const [ed, setEd] = useState(false), [dr, setDr] = useState(value), ref = useRef(null);
    useEffect(() => { setDr(value); }, [value]);
    useEffect(() => { if (ed && ref.current) { ref.current.focus(); ref.current.select(); } }, [ed]);
    const commit = () => { setEd(false); const t = dr.trim(); if (t && t !== value) onChange(t); else setDr(value); };
    if (!ed) return <div onClick={e => { e.stopPropagation(); setEd(true); }} style={{ cursor: "text", ...style }} data-nodrag>{value}</div>;
    const T = multiline ? "textarea" : "input";
    return <div data-nodrag style={{ position: "relative" }}>
        <T ref={ref} value={dr} onChange={e => { if (e.target.value.length <= maxLen) setDr(e.target.value); }}
            onBlur={commit} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commit(); } if (e.key === "Escape") { setDr(value); setEd(false); } }}
            style={{ ...style, border: "none", outline: "none", background: "rgba(255,255,255,0.1)", borderRadius: 4, padding: "2px 4px", width: "100%", resize: "none", fontFamily: "inherit", fontSize: "inherit", color: "inherit", lineHeight: "inherit", ...(multiline ? { minHeight: 55 } : {}) }}
            maxLength={maxLen} />
        <span style={{ position: "absolute", bottom: multiline ? 3 : -13, right: 2, fontSize: 8, fontFamily: "'JetBrains Mono'", color: dr.length >= maxLen * 0.9 ? "#e74c3c" : "rgba(128,128,128,0.4)" }}>{dr.length}/{maxLen}</span>
    </div>;
}

function QuickAdd({ placeholder, onSubmit, light, accent }) {
    const [val, setVal] = useState("");
    const submit = () => { const t = val.trim(); if (t) { onSubmit(t); setVal(""); } };
    return (
        <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
            <input value={val} onChange={e => setVal(e.target.value)} onKeyDown={e => e.key === "Enter" && submit()}
                placeholder={placeholder} data-nodrag
                style={{
                    flex: 1, background: light ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.05)", border: `1px solid ${light ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.06)"}`,
                    borderRadius: 6, padding: "4px 8px", fontSize: 10.5, color: light ? "#2d3436" : "rgba(255,255,255,0.8)", outline: "none", fontFamily: "'DM Sans'"
                }} />
            <button onClick={submit} style={{ background: `${accent}22`, border: `1px solid ${accent}44`, borderRadius: 6, padding: "3px 8px", fontSize: 12, cursor: "pointer", color: accent, lineHeight: 1 }}>+</button>
        </div>
    );
}

function Particles({ type, color }) {
    const count = type === "rain" ? 35 : type === "stars" ? 25 : type === "sparkle" ? 15 : 12;
    const particles = useMemo(() => Array.from({ length: count }, (_, i) => ({
        id: i, x: Math.random() * 100, y: Math.random() * 100,
        size: type === "rain" ? 1 : (1 + Math.random() * 2.5),
        dur: type === "rain" ? (0.8 + Math.random() * 0.6) : (4 + Math.random() * 8),
        delay: Math.random() * 5, opacity: 0.15 + Math.random() * 0.35,
    })), [type, count]);
    const anim = type === "fireflies" ? "ff" : type === "stars" ? "st" : type === "rain" ? "rn" : "sp";
    return (
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 3, overflow: "hidden" }}>
            {particles.map(p => (
                <div key={p.id} style={{
                    position: "absolute", left: `${p.x}%`, top: type === "rain" ? "-2%" : `${p.y}%`,
                    width: type === "rain" ? 1 : p.size, height: type === "rain" ? (8 + Math.random() * 14) : p.size, borderRadius: type === "rain" ? 0 : "50%",
                    background: type === "rain" ? `linear-gradient(180deg, transparent, ${color || "#fff"}55)` : (color || "#fff"),
                    opacity: p.opacity, animation: `${anim} ${p.dur}s ${p.delay}s infinite ${type === "sparkle" ? "" : "ease-in-out"}`,
                    ...(type === "sparkle" ? { animationIterationCount: 1, animationFillMode: "forwards", animationDelay: `${p.delay}s` } : {}),
                }} />
            ))}
        </div>
    );
}

// ═══════════════════════════════════════════════════
// LENNY BUDDY — mood-reactive animated character
// ═══════════════════════════════════════════════════
const LENNY_MOODS = [
    { id: "cozy",       face: "( ˘ ω ˘ )", label: "cozy" },
    { id: "focus",      face: "( •̀ᴗ•́ )", label: "locked in" },
    { id: "productive", face: "( •̀ᴗ•́ )و", label: "on it" },
    { id: "energetic",  face: "( ᗒ ᗨᗕ )", label: "hyped!" },
    { id: "happy",      face: "( ◠‿◠ )", label: "happy" },
    { id: "calm",       face: "( ◡ ‿ ◡ )", label: "at peace" },
    { id: "creative",   face: "( ☆ ᗜ ☆ )", label: "inspired" },
    { id: "dreamy",     face: "( ᵕ ꈊ ᵕ )", label: "dreamy" },
    { id: "sleepy",     face: "( ᴗ_ᴗ。)", label: "zzz" },
    { id: "chill",      face: "( ‾́ ◡ ‾́ )", label: "vibing" },
    { id: "mysterious", face: "( ¬‿¬ )", label: "hmm..." },
    { id: "intense",    face: "( ⊙ᗜ⊙ )", label: "intense" },
    { id: "romantic",   face: "( ♡ ᴗ ♡ )", label: "lovely" },
    { id: "sad",        face: "( ◞‸◟ )", label: "aw" },
    { id: "stressed",   face: "( ⊙﹏⊙ )", label: "eep" },
    { id: "proud",      face: "( ˙▿˙ )b", label: "nailed it" },
    { id: "curious",    face: "( ᐛ )", label: "curious" },
    { id: "playful",    face: "( ˙ᗜ˙ )", label: "wheee" },
    { id: "ocean",      face: "( ≧ᗜ≦ )~", label: "wave~" },
    { id: "nature",     face: "( ᵔ ᵕ ᵔ )", label: "nature" },
    { id: "sunset",     face: "( ◠ ꈊ ◠ )", label: "golden" },
    { id: "neutral",    face: "( ˘ ᵕ ˘ )", label: "chillin" },
];

// Client-side mood inference — keyword patterns scored against user input + actions
const MOOD_RULES = [
    { mood: "proud",      pattern: /\b(done|finished|completed|check off|nailed|shipped|deployed|crushed)\b/i, actionBoost: ["complete_task"] },
    { mood: "stressed",   pattern: /\b(stress|anxious|worried|panic|overwhelm|deadline|urgent|asap|behind)\b/i },
    { mood: "sad",        pattern: /\b(sad|upset|bad day|terrible|awful|depressed|lonely|miss|lost)\b/i },
    { mood: "energetic",  pattern: /\b(excited|hyped|amazing|awesome|fantastic|pumped|let'?s go|fire|hell yeah|insane)\b/i },
    { mood: "happy",      pattern: /\b(happy|great|wonderful|love it|perfect|yay|nice|good news|celebrate)\b/i },
    { mood: "romantic",   pattern: /\b(love|date|anniversary|valentine|romantic|heart|wedding|partner)\b/i },
    { mood: "cozy",       pattern: /\b(cozy|cosy|warm|comfort|snug|blanket|candle|tea|fireplace|hygge|homey)\b/i },
    { mood: "focus",      pattern: /\b(focus|concentrate|deep work|grind|lock in|study|exam|pomodoro|timer)\b/i, actionBoost: ["add_timer"] },
    { mood: "creative",   pattern: /\b(creat|design|art|sketch|paint|draw|brainstorm|inspir|imagin|idea|write|draft|blog)\b/i },
    { mood: "sleepy",     pattern: /\b(sleep|tired|exhaust|nap|rest|bedtime|late night|insomnia|zzz)\b/i },
    { mood: "chill",      pattern: /\b(chill|relax|laid back|vibe|mellow|easy|no rush|take it easy|wind down)\b/i },
    { mood: "curious",    pattern: /\b(wonder|curious|what if|how does|why|interest|explore|discover|learn)\b/i },
    { mood: "playful",    pattern: /\b(fun|play|game|silly|goofy|party|joke|lol|haha|😂|🎉)\b/i },
    { mood: "intense",    pattern: /\b(intense|serious|critical|important|power|determined|no excuses|push)\b/i },
    { mood: "mysterious",  pattern: /\b(mysteri|dark|midnight|shadow|secret|enigma|noir|spooky)\b/i },
    { mood: "ocean",      pattern: /\b(ocean|sea|water|wave|beach|surf|coast|marine|island)\b/i },
    { mood: "nature",     pattern: /\b(forest|nature|green|earth|garden|tree|plant|hike|mountain|outdoor)\b/i },
    { mood: "sunset",     pattern: /\b(sunset|sunrise|golden|dusk|twilight|dawn|horizon|sky)\b/i },
    { mood: "dreamy",     pattern: /\b(dream|whimsical|fantasy|magic|wonder|fairy|starry|wish)\b/i },
    { mood: "calm",       pattern: /\b(calm|serene|peaceful|tranquil|zen|meditat|mindful|breathe|quiet)\b/i },
    { mood: "productive", pattern: /\b(productive|efficient|organize|plan|schedule|manage|priorit|todo|task)\b/i, actionBoost: ["add_task", "split_task"] },
];

function inferMood(userText, actions) {
    const text = (userText || "").toLowerCase();
    const actionTypes = (actions || []).map(a => a.type);
    let best = null, bestScore = 0;

    for (const rule of MOOD_RULES) {
        let score = 0;
        // Pattern match against user text
        const matches = text.match(rule.pattern);
        if (matches) score += 2;
        // Boost if associated action was taken
        if (rule.actionBoost && rule.actionBoost.some(a => actionTypes.includes(a))) score += 1.5;
        if (score > bestScore) { bestScore = score; best = rule.mood; }
    }

    // Theme-based overrides from action payloads
    for (const a of (actions || [])) {
        if (a.type === "change_theme") {
            const themeMap = { cozy: "cozy", focus: "focus", ocean: "ocean", sunset: "sunset", forest: "nature", midnight: "mysterious", minimal: "calm" };
            if (themeMap[a.theme]) return themeMap[a.theme];
        }
    }

    return best || null; // null = don't change mood
}

function getLennyByMood(moodId) {
    return LENNY_MOODS.find(m => m.id === moodId) || LENNY_MOODS[LENNY_MOODS.length - 1];
}

function LennyBuddy({ mood, glowColor, light, loading }) {
    const [transitioning, setTransitioning] = useState(false);
    const [blink, setBlink] = useState(false);

    const entry = getLennyByMood(mood);

    useEffect(() => {
        const doBlink = () => { setBlink(true); setTimeout(() => setBlink(false), 150); };
        const interval = setInterval(doBlink, 2500 + Math.random() * 3500);
        return () => clearInterval(interval);
    }, []);

    const currentFaceRef = useRef(entry.face);
    useEffect(() => {
        if (entry.face !== currentFaceRef.current) {
            setTransitioning(true);
            currentFaceRef.current = entry.face;
            const t = setTimeout(() => setTransitioning(false), 400);
            return () => clearTimeout(t);
        }
    }, [entry.face]);

    const txc = light ? "rgba(45,52,54,0.7)" : "rgba(255,255,255,0.7)";
    const subtleColor = (glowColor && glowColor !== "transparent") ? glowColor : txc;

    return (
        <div style={{
            position: "absolute", bottom: 10, left: 20, zIndex: 50,
            display: "flex", alignItems: "center", gap: 8,
            userSelect: "none", pointerEvents: "none",
        }}>
            <div style={{
                position: "relative",
                animation: loading ? "lennyThink 0.6s ease-in-out infinite" : "lennyBreathe 4s ease-in-out infinite",
                filter: `drop-shadow(0 0 ${mood !== "neutral" ? "8px" : "3px"} ${subtleColor}44)`,
                transition: "filter 2s ease",
            }}>
                <div style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 16, color: subtleColor,
                    opacity: blink ? 0.3 : 0.8,
                    transition: "opacity 0.1s, color 2s",
                    whiteSpace: "nowrap",
                    transform: transitioning ? "scale(0.85)" : "scale(1)",
                    transitionProperty: "transform, opacity, color",
                    transitionDuration: "0.3s, 0.1s, 2s",
                }}>
                    {entry.face}
                </div>
            </div>
            <div style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: 8,
                letterSpacing: 2, textTransform: "uppercase",
                color: subtleColor, opacity: 0.45,
                transition: "color 2s, opacity 0.5s",
            }}>
                {loading ? "thinking..." : entry.label}
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════
// COMPONENTS
// ═══════════════════════════════════════════════════
function Panel({ children, x, y, width, title, icon, onClose, ambient, light }) {
    const { pos, onMouseDown } = useDraggable(x, y);
    const txm = light ? "rgba(45,52,54,0.5)" : "rgba(255,255,255,0.45)";
    const bw = ambient.borderWarmth || 0;
    const borderCol = light ? `rgba(${Math.round(80 + bw * 80)},${Math.round(60 + bw * 40)},50,0.1)` : `rgba(${Math.round(255 * (0.3 + bw * 0.3))},${Math.round(255 * (0.25 + bw * 0.15))},${Math.round(255 * 0.2)},${0.06 + bw * 0.06})`;
    const panelBg = light ? `rgba(255,255,255,${0.65 + (ambient.panelOpacity || 0.03) * 3})` : `rgba(255,255,255,${ambient.panelOpacity || 0.03})`;
    const safeGlow = (ambient.glowColor && ambient.glowColor !== "transparent") ? ambient.glowColor : "#ffffff";
    const reflectCol = ambient.glowIntensity > 0 ? `${safeGlow}08` : "transparent";

    return (
        <div onMouseDown={onMouseDown} style={{
            position: "absolute", left: pos.x, top: pos.y, width, background: `linear-gradient(135deg, ${panelBg}, ${reflectCol})`,
            backdropFilter: `blur(${ambient.panelBlur || 20}px)`, border: `1px solid ${borderCol}`, borderRadius: 14, cursor: "grab", zIndex: 15,
            boxShadow: `0 8px 32px rgba(0,0,0,0.18), inset 0 1px 0 ${light ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.04)"}`,
            userSelect: "none", overflow: "hidden", transition: "border-color 1.5s, background 1.5s, box-shadow 1.5s", animation: "panelIn 0.3s ease-out",
        }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 13px 7px", borderBottom: `1px solid ${borderCol}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 12 }}>{icon}</span>
                    <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 9, textTransform: "uppercase", letterSpacing: 2, color: txm }}>{title}</span>
                </div>
                {onClose && <button onClick={e => { e.stopPropagation(); onClose(); }} style={{ background: "none", border: "none", color: txm, cursor: "pointer", fontSize: 13, lineHeight: 1, padding: 0 }}>×</button>}
            </div>
            <div style={{ padding: "9px 13px 13px", cursor: "default" }} onMouseDown={e => e.stopPropagation()}>{children}</div>
        </div>
    );
}

function PostIt({ id, content, color, initialX, initialY, onRemove, onEdit }) {
    const { pos, onMouseDown } = useDraggable(initialX, initialY);
    const rot = useRef((-3 + Math.random() * 6).toFixed(1));
    const em = guessEmoji(content);
    return (
        <div onMouseDown={onMouseDown} style={{
            position: "absolute", left: pos.x, top: pos.y, width: 175, minHeight: 95,
            background: color || "#fef68a", borderRadius: 3, padding: "24px 12px 12px", cursor: "grab",
            transform: `rotate(${rot.current}deg)`, zIndex: 12, boxShadow: "2px 4px 18px rgba(0,0,0,0.22), inset 0 -2px 4px rgba(0,0,0,0.05)",
            userSelect: "none", animation: `noteIn_${id} 0.35s cubic-bezier(0.34,1.56,0.64,1)`,
        }}>
            <style>{`@keyframes noteIn_${id}{from{opacity:0;transform:rotate(${rot.current}deg) scale(0.7)}to{opacity:1;transform:rotate(${rot.current}deg) scale(1)}}`}</style>
            <button onClick={e => { e.stopPropagation(); onRemove(id); }} style={{ position: "absolute", top: 3, right: 6, background: "none", border: "none", color: "rgba(0,0,0,0.2)", cursor: "pointer", fontSize: 15, lineHeight: 1 }}>×</button>
            {em && <span style={{ position: "absolute", top: 4, left: 8, fontSize: 13 }}>{em}</span>}
            <EditableText value={content} onChange={v => onEdit(id, v)} maxLen={POSTIT_CHAR_LIMIT} multiline style={{ fontFamily: "'Caveat', cursive", fontSize: 16, color: "#2d3436", lineHeight: 1.4 }} />
        </div>
    );
}

function TimerWidget({ id, minutes, label, onRemove, light }) {
    const [left, setLeft] = useState(minutes * 60), [run, setRun] = useState(true);
    const { pos, onMouseDown } = useDraggable(420 + Math.random() * 150, 40 + Math.random() * 100);
    useEffect(() => { if (!run || left <= 0) return; const t = setInterval(() => setLeft(s => Math.max(0, s - 1)), 1000); return () => clearInterval(t); }, [run, left]);
    const done = left <= 0, pct = 1 - left / (minutes * 60);
    const c = light ? { bg: "rgba(255,255,255,0.65)", bd: "rgba(0,0,0,0.08)", tx: "#2d3436", txm: "rgba(45,52,54,0.4)" } : { bg: "rgba(255,255,255,0.04)", bd: "rgba(255,255,255,0.08)", tx: "#fff", txm: "rgba(255,255,255,0.4)" };
    return <div onMouseDown={onMouseDown} style={{ position: "absolute", left: pos.x, top: pos.y, minWidth: 150, background: done ? "rgba(231,76,60,0.12)" : c.bg, backdropFilter: "blur(16px)", border: `1px solid ${done ? "rgba(231,76,60,0.35)" : c.bd}`, borderRadius: 14, padding: "12px 16px", cursor: "grab", zIndex: 12, boxShadow: "0 6px 24px rgba(0,0,0,0.18)", userSelect: "none", animation: "panelIn 0.3s ease-out" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: 2, color: c.txm, fontFamily: "'JetBrains Mono'" }}>⏱ {label}</span>
            <button onClick={e => { e.stopPropagation(); onRemove(id); }} style={{ background: "none", border: "none", color: "rgba(128,128,128,0.4)", cursor: "pointer", fontSize: 13, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ fontSize: 30, fontWeight: 700, fontFamily: "'JetBrains Mono'", color: done ? "#e74c3c" : c.tx, textAlign: "center", opacity: (!run && !done) ? 0.6 : 1 }}>
            {done ? "DONE!" : `${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}`}
        </div>
        <div style={{ height: 2, background: "rgba(128,128,128,0.12)", borderRadius: 2, marginTop: 6, overflow: "hidden" }}>
            <div style={{ width: `${pct * 100}%`, height: "100%", background: done ? "#e74c3c" : "linear-gradient(90deg,#00b894,#00cec9)", transition: "width 1s linear" }} />
        </div>
        {!done && <button onClick={e => { e.stopPropagation(); setRun(r => !r); }} style={{ marginTop: 6, background: "rgba(128,128,128,0.08)", border: "1px solid rgba(128,128,128,0.12)", borderRadius: 7, color: c.tx, padding: "3px 10px", cursor: "pointer", fontSize: 10, width: "100%", fontFamily: "'JetBrains Mono'" }}>{run ? "Pause" : "Resume"}</button>}
    </div>;
}

function ClockWidget({ id, onRemove, light }) {
    const [now, setNow] = useState(new Date());
    const { pos, onMouseDown } = useDraggable(450 + Math.random() * 100, 180 + Math.random() * 80);
    useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
    const c = light ? { bg: "rgba(255,255,255,0.65)", bd: "rgba(0,0,0,0.08)", tx: "#2d3436", txm: "rgba(45,52,54,0.3)" } : { bg: "rgba(255,255,255,0.04)", bd: "rgba(255,255,255,0.08)", tx: "#fff", txm: "rgba(255,255,255,0.3)" };
    return <div onMouseDown={onMouseDown} style={{ position: "absolute", left: pos.x, top: pos.y, background: c.bg, backdropFilter: "blur(20px)", border: `1px solid ${c.bd}`, borderRadius: 18, padding: "16px 24px", cursor: "grab", userSelect: "none", zIndex: 12, boxShadow: "0 6px 24px rgba(0,0,0,0.15)" }}>
        <button onClick={e => { e.stopPropagation(); onRemove(id); }} style={{ position: "absolute", top: 5, right: 9, background: "none", border: "none", color: "rgba(128,128,128,0.3)", cursor: "pointer", fontSize: 13, lineHeight: 1 }}>×</button>
        <div style={{ fontFamily: "'JetBrains Mono'", fontSize: 34, fontWeight: 200, color: c.tx, letterSpacing: 3 }}>{now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}</div>
        <div style={{ fontFamily: "'DM Sans'", fontSize: 10, color: c.txm, textAlign: "center", marginTop: 2 }}>{now.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" })}</div>
    </div>;
}

function QuoteWidget({ id, onRemove, light }) {
    const qs = [{ t: "The only way to do great work is to love what you do.", a: "Jobs" }, { t: "What stands in the way becomes the way.", a: "Aurelius" }, { t: "Simplicity is the ultimate sophistication.", a: "Da Vinci" }, { t: "Everything you can imagine is real.", a: "Picasso" }];
    const q = useRef(qs[Math.floor(Math.random() * qs.length)]);
    const { pos, onMouseDown } = useDraggable(400 + Math.random() * 200, 300 + Math.random() * 80);
    const c = light ? { bg: "rgba(255,255,255,0.65)", bd: "rgba(0,0,0,0.06)", tx: "rgba(45,52,54,0.8)", txm: "rgba(45,52,54,0.3)" } : { bg: "rgba(255,255,255,0.03)", bd: "rgba(255,255,255,0.06)", tx: "rgba(255,255,255,0.8)", txm: "rgba(255,255,255,0.3)" };
    return <div onMouseDown={onMouseDown} style={{ position: "absolute", left: pos.x, top: pos.y, maxWidth: 250, background: c.bg, backdropFilter: "blur(20px)", border: `1px solid ${c.bd}`, borderRadius: 14, padding: "18px 20px", cursor: "grab", userSelect: "none", zIndex: 12, boxShadow: "0 6px 24px rgba(0,0,0,0.15)" }}>
        <button onClick={e => { e.stopPropagation(); onRemove(id); }} style={{ position: "absolute", top: 5, right: 9, background: "none", border: "none", color: "rgba(128,128,128,0.25)", cursor: "pointer", fontSize: 13, lineHeight: 1 }}>×</button>
        <div style={{ fontFamily: "'Caveat', cursive", fontSize: 17, color: c.tx, lineHeight: 1.5, fontStyle: "italic" }}>"{q.current.t}"</div>
        <div style={{ fontFamily: "'DM Sans'", fontSize: 10, color: c.txm, marginTop: 5, textAlign: "right" }}>— {q.current.a}</div>
    </div>;
}

function TasksPanel({ tasks, onToggle, onEditTask, onRequestSplit, onAddTask, accent, light, onClose, ambient }) {
    const prioC = { high: "#e74c3c", medium: "#f39c12", low: "#00b894" };
    const txm = light ? "rgba(45,52,54,0.5)" : "rgba(255,255,255,0.45)";
    return (
        <Panel x={24} y={90} width={330} title={`Tasks · ${tasks.filter(t => !t.done && !t.isParent).length} active`} icon="✓" light={light} onClose={onClose} ambient={ambient}>
            {tasks.length === 0 && <div style={{ fontSize: 12, color: txm, fontStyle: "italic" }}>No tasks yet</div>}
            {tasks.map(tk => {
                const em = guessEmoji(tk.text);
                return (
                    <div key={tk.id} className="anim-item" style={{ padding: "3px 0" }}>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 7 }}>
                            {tk.isParent ? (
                                <span style={{ fontSize: 11, marginTop: 1, marginLeft: 0, flexShrink: 0 }}>📋</span>
                            ) : (
                                <div onClick={() => onToggle(tk.id)} style={{
                                    width: 14, height: 14, borderRadius: tk.parentId ? 7 : 4, flexShrink: 0, marginTop: 2, cursor: "pointer",
                                    border: `2px solid ${tk.done ? txm : (prioC[tk.priority] || "#f39c12")}`,
                                    background: tk.done ? (light ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.08)") : "transparent",
                                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, marginLeft: tk.parentId ? 14 : 0, transition: "all 0.2s",
                                }}>{tk.done && "✓"}</div>
                            )}
                            <div style={{ flex: 1, opacity: tk.done ? 0.3 : 1, display: "flex", alignItems: "center", gap: 4, transition: "opacity 0.3s" }}>
                                {em && <span style={{ fontSize: 11, flexShrink: 0 }}>{em}</span>}
                                <EditableText value={tk.text} onChange={v => onEditTask(tk.id, v)} maxLen={TASK_CHAR_LIMIT}
                                    style={{ fontSize: tk.isParent ? 12 : (tk.parentId ? 11 : 12), fontWeight: tk.isParent ? 600 : 400, color: light ? "#2d3436" : "rgba(255,255,255,0.85)", textDecoration: tk.done ? "line-through" : "none", flex: 1 }} />
                                {!tk.done && !tk.parentId && !tk.isParent && (
                                    <button onClick={() => onRequestSplit(tk.text)} title="Split into subtasks" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: txm, padding: "0 2px", opacity: 0.4, flexShrink: 0 }}>⑂</button>
                                )}
                            </div>
                        </div>
                    </div>
                );
            })}
            <QuickAdd placeholder="Add task..." onSubmit={onAddTask} light={light} accent={accent} />
        </Panel>
    );
}

function CalendarPanel({ events, onDeleteEvent, onAddEvent, accent, light, onClose, ambient }) {
    const [view, setView] = useState("week");
    const [showForm, setShowForm] = useState(false);
    const [formTitle, setFormTitle] = useState(""), [formDate, setFormDate] = useState(""), [formTime, setFormTime] = useState("09:00");
    const today = new Date();
    const txm = light ? "rgba(45,52,54,0.5)" : "rgba(255,255,255,0.45)";
    const tx = light ? "#2d3436" : "#fff";
    const dN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const week = Array.from({ length: 7 }, (_, i) => { const d = new Date(today); d.setDate(d.getDate() + i); return d; });
    const evFor = d => events.filter(e => e.date === d.toISOString().split("T")[0]);
    const evColors = ["#6c5ce7", "#00cec9", "#e17055", "#00b894", "#fdcb6e", "#e84393"];

    const exportICS = () => {
        let ics = "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Dashboard//EN\n";
        events.forEach(e => {
            const dt = e.date.replace(/-/g, ""), t = (e.time || "09:00").replace(":", "") + "00", dur = e.duration || 60, em = parseInt(t.slice(0, 2)) * 60 + parseInt(t.slice(2, 4)) + dur;
            ics += `BEGIN:VEVENT\nDTSTART:${dt}T${t}\nDTEND:${dt}T${String(Math.floor(em / 60)).padStart(2, "0")}${String(em % 60).padStart(2, "0")}00\nSUMMARY:${e.title}\nEND:VEVENT\n`;
        });
        ics += "END:VCALENDAR"; const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar" })); a.download = "calendar.ics"; a.click();
    };
    const submitEvent = () => {
        if (!formTitle.trim()) return;
        onAddEvent(formTitle.trim(), formDate || today.toISOString().split("T")[0], formTime, evColors[Math.floor(Math.random() * evColors.length)]);
        setFormTitle(""); setFormDate(""); setFormTime("09:00"); setShowForm(false);
    };

    return (
        <Panel x={24} y={385} width={330} title="Calendar" icon="📅" light={light} onClose={onClose} ambient={ambient}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ display: "flex", gap: 3 }}>
                    {["week", "list"].map(v => <button key={v} onClick={() => setView(v)} style={{ padding: "2px 7px", borderRadius: 5, fontSize: 9, cursor: "pointer", fontFamily: "'JetBrains Mono'", textTransform: "uppercase", letterSpacing: 1, background: view === v ? `${accent}22` : "transparent", border: `1px solid ${view === v ? `${accent}44` : "transparent"}`, color: view === v ? accent : txm }}>{v}</button>)}
                </div>
                <div style={{ display: "flex", gap: 3 }}>
                    <button onClick={() => setShowForm(f => !f)} style={{ padding: "2px 7px", borderRadius: 5, fontSize: 9, cursor: "pointer", fontFamily: "'JetBrains Mono'", background: `${accent}15`, border: `1px solid ${accent}33`, color: accent }}>{showForm ? "Cancel" : "+ Event"}</button>
                    <button onClick={exportICS} style={{ padding: "2px 7px", borderRadius: 5, fontSize: 9, cursor: "pointer", fontFamily: "'JetBrains Mono'", background: "transparent", border: `1px solid ${light ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.08)"}`, color: txm }}>.ics</button>
                </div>
            </div>
            {showForm && (
                <div className="anim-panel" style={{ marginBottom: 8, padding: 8, borderRadius: 8, background: light ? "rgba(0,0,0,0.02)" : "rgba(255,255,255,0.03)", border: `1px solid ${light ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.05)"}` }} data-nodrag>
                    <input value={formTitle} onChange={e => setFormTitle(e.target.value)} placeholder="Event title" onKeyDown={e => e.key === "Enter" && submitEvent()}
                        style={{ width: "100%", background: "transparent", border: "none", outline: "none", fontSize: 11, color: tx, fontFamily: "'DM Sans'", marginBottom: 5 }} />
                    <div style={{ display: "flex", gap: 4 }}>
                        <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} style={{ flex: 1, background: "transparent", border: `1px solid ${light ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.08)"}`, borderRadius: 4, padding: "2px 4px", fontSize: 9, color: tx, fontFamily: "'JetBrains Mono'", outline: "none", colorScheme: light ? "light" : "dark" }} />
                        <input type="time" value={formTime} onChange={e => setFormTime(e.target.value)} style={{ width: 70, background: "transparent", border: `1px solid ${light ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.08)"}`, borderRadius: 4, padding: "2px 4px", fontSize: 9, color: tx, fontFamily: "'JetBrains Mono'", outline: "none", colorScheme: light ? "light" : "dark" }} />
                        <button onClick={submitEvent} style={{ background: `${accent}22`, border: `1px solid ${accent}44`, borderRadius: 4, padding: "2px 8px", fontSize: 10, cursor: "pointer", color: accent }}>Add</button>
                    </div>
                </div>
            )}
            {view === "week" && <div style={{ display: "flex", gap: 2 }}>
                {week.map((d, i) => {
                    const isT = i === 0, devs = evFor(d); return (
                        <div key={i} style={{ flex: 1, textAlign: "center", padding: "5px 1px", borderRadius: 7, background: isT ? `${accent}15` : "transparent", border: isT ? `1px solid ${accent}33` : "1px solid transparent" }}>
                            <div style={{ fontSize: 8, color: txm, fontFamily: "'JetBrains Mono'" }}>{dN[d.getDay()]}</div>
                            <div style={{ fontSize: 15, fontWeight: isT ? 700 : 400, color: tx, margin: "1px 0" }}>{d.getDate()}</div>
                            {devs.map((ev, j) => <div key={j} style={{ width: 5, height: 5, borderRadius: "50%", background: ev.color || accent, margin: "1px auto 0" }} title={`${ev.title} ${ev.time}`} />)}
                        </div>);
                })}
            </div>}
            {view === "list" && <div style={{ maxHeight: 120, overflowY: "auto" }}>
                {events.length === 0 && <div style={{ fontSize: 11, color: txm, fontStyle: "italic" }}>No events</div>}
                {[...events].sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)).map(ev => {
                    const em = guessEmoji(ev.title);
                    return <div key={ev.id} className="anim-item" style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 0", borderBottom: `1px solid ${light ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.03)"}` }}>
                        <div style={{ width: 3, height: 22, borderRadius: 2, background: ev.color || accent, flexShrink: 0 }} />
                        {em && <span style={{ fontSize: 11 }}>{em}</span>}
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 11, fontWeight: 500, color: tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.title}</div>
                            <div style={{ fontSize: 8, color: txm, fontFamily: "'JetBrains Mono'" }}>{ev.date} · {ev.time}</div>
                        </div>
                        <button onClick={() => onDeleteEvent(ev.id)} style={{ background: "none", border: "none", color: txm, cursor: "pointer", fontSize: 10, lineHeight: 1, flexShrink: 0 }}>×</button>
                    </div>;
                })}
            </div>}
        </Panel>
    );
}

function BudgetPanel({ expenses, budget, accent, light, onClose, onDeleteExpense, onAddExpense, ambient }) {
    const [showForm, setShowForm] = useState(false);
    const [desc, setDesc] = useState(""), [amt, setAmt] = useState(""), [cat, setCat] = useState("other");
    const txm = light ? "rgba(45,52,54,0.5)" : "rgba(255,255,255,0.45)";
    const tx = light ? "#2d3436" : "#fff";
    const total = expenses.reduce((s, e) => s + e.amount, 0);
    const pct = budget > 0 ? Math.min(total / budget, 1) : 0;
    const remaining = budget - total;
    const catI = { food: "🍽️", transport: "🚗", entertainment: "🎬", shopping: "🛍️", bills: "📄", health: "💊", other: "📦" };
    const catC = { food: "#e17055", transport: "#0984e3", entertainment: "#6c5ce7", shopping: "#fdcb6e", bills: "#636e72", health: "#00b894", other: "#b2bec3" };
    const catT = {}; expenses.forEach(e => { catT[e.category] = (catT[e.category] || 0) + e.amount; });
    const submit = () => { if (!desc.trim() || !amt) return; onAddExpense(desc.trim(), parseFloat(amt), cat); setDesc(""); setAmt(""); setShowForm(false); };

    return (
        <Panel x={370} y={90} width={250} title="Budget" icon="💰" light={light} onClose={onClose} ambient={ambient}>
            <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 8 }}>
                <div style={{ position: "relative", width: 48, height: 48, flexShrink: 0 }}>
                    <svg width="48" height="48" viewBox="0 0 48 48">
                        <circle cx="24" cy="24" r="20" fill="none" stroke={light ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.06)"} strokeWidth="4" />
                        <circle cx="24" cy="24" r="20" fill="none" stroke={pct > 0.9 ? "#e74c3c" : accent} strokeWidth="4" strokeDasharray={`${pct * 125.7} 125.7`} strokeLinecap="round" transform="rotate(-90 24 24)" style={{ transition: "all 1s" }} />
                    </svg>
                    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, fontFamily: "'JetBrains Mono'", color: tx }}>{Math.round(pct * 100)}%</div>
                </div>
                <div>
                    <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "'JetBrains Mono'", color: tx }}>€{total.toFixed(2)}</div>
                    <div style={{ fontSize: 9, color: remaining >= 0 ? "#00b894" : "#e74c3c", fontFamily: "'JetBrains Mono'" }}>{budget > 0 ? `€${remaining.toFixed(2)} ${remaining >= 0 ? "left" : "over"}` : "No budget"}</div>
                </div>
            </div>
            {Object.keys(catT).length > 0 && <div style={{ marginBottom: 6 }}>
                <div style={{ display: "flex", gap: 1, height: 4, borderRadius: 3, overflow: "hidden", marginBottom: 3 }}>
                    {Object.entries(catT).map(([c, a]) => <div key={c} style={{ flex: a, background: catC[c] || catC.other, transition: "flex 0.5s" }} />)}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "1px 6px" }}>
                    {Object.entries(catT).map(([c, a]) => <span key={c} style={{ fontSize: 8, color: txm, fontFamily: "'JetBrains Mono'" }}>{catI[c]} €{a.toFixed(0)}</span>)}
                </div>
            </div>}
            <div style={{ maxHeight: 75, overflowY: "auto" }}>
                {expenses.length === 0 && <div style={{ fontSize: 10, color: txm, fontStyle: "italic" }}>No expenses</div>}
                {[...expenses].reverse().slice(0, 6).map(ex => {
                    const em = guessEmoji(ex.description);
                    return (
                        <div key={ex.id} style={{ display: "flex", alignItems: "center", gap: 5, padding: "2px 0", borderBottom: `1px solid ${light ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.03)"}` }}>
                            <span style={{ fontSize: 9 }}>{catI[ex.category]}</span>
                            <span style={{ flex: 1, fontSize: 10, color: tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {ex.description} {em && <span style={{ fontSize: 9 }}>{em}</span>}
                            </span>
                            <span style={{ fontSize: 9, fontFamily: "'JetBrains Mono'", color: txm, flexShrink: 0 }}>€{ex.amount.toFixed(2)}</span>
                            <button onClick={() => onDeleteExpense(ex.id)} style={{ background: "none", border: "none", color: txm, cursor: "pointer", fontSize: 9, lineHeight: 1, padding: 0 }}>×</button>
                        </div>)
                })}
            </div>
            <div style={{ display: "flex", gap: 3, marginTop: 6 }}>
                <button onClick={() => setShowForm(f => !f)} style={{ flex: 1, padding: "3px 0", borderRadius: 5, fontSize: 9, cursor: "pointer", fontFamily: "'JetBrains Mono'", background: `${accent}15`, border: `1px solid ${accent}33`, color: accent }}>{showForm ? "Cancel" : "+ Expense"}</button>
            </div>
            {showForm && <div className="anim-panel" style={{ marginTop: 5, padding: 6, borderRadius: 6, background: light ? "rgba(0,0,0,0.02)" : "rgba(255,255,255,0.03)" }} data-nodrag>
                <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Description" style={{ width: "100%", background: "transparent", border: "none", outline: "none", fontSize: 10, color: tx, marginBottom: 4 }} />
                <div style={{ display: "flex", gap: 3 }}>
                    <input value={amt} onChange={e => setAmt(e.target.value)} placeholder="€" type="number" step="0.01" style={{ width: 55, background: "transparent", border: `1px solid ${light ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.08)"}`, borderRadius: 4, padding: "2px 4px", fontSize: 9, color: tx, outline: "none" }} />
                    <select value={cat} onChange={e => setCat(e.target.value)} style={{ flex: 1, background: light ? "rgba(0,0,0,0.02)" : "rgba(255,255,255,0.05)", border: `1px solid ${light ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.08)"}`, borderRadius: 4, fontSize: 9, color: tx, outline: "none", padding: "2px" }}>
                        {Object.keys(catI).map(c => <option key={c} value={c}>{catI[c]} {c}</option>)}
                    </select>
                    <button onClick={submit} style={{ background: `${accent}22`, border: `1px solid ${accent}44`, borderRadius: 4, padding: "2px 6px", fontSize: 10, cursor: "pointer", color: accent }}>+</button>
                </div>
            </div>}
        </Panel>
    );
}

function TypingDots() { return <div style={{ display: "flex", gap: 3, padding: "8px 12px", alignSelf: "flex-start" }}>{[0, 1, 2].map(i => <div key={i} style={{ width: 5, height: 5, borderRadius: "50%", background: "rgba(255,255,255,0.3)", animation: `bk 1.2s ${i * .15}s infinite ease-in-out` }} />)}</div>; }

// ═══════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════
export default function App() {
    const [bg, setBg] = useState("linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 50%, #16213e 100%)");
    const [greeting, setGreeting] = useState("Welcome to your dashboard.");
    const [accent, setAccent] = useState("#00cec9");
    const [ambient, setAmbient] = useState({ ...DEFAULT_AMBIENT });
    const [showTasks, setShowTasks] = useState(true), [showCal, setShowCal] = useState(true), [showBudget, setShowBudget] = useState(true);
    const [postits, setPostits] = useState([]);
    const [tasks, setTasks] = useState([
        { id: "t1", text: "Review project proposal 📝", priority: "high", done: false },
        { id: "t2", text: "Prepare meeting notes 📞", priority: "medium", done: false },
        { id: "t3", text: "Update documentation 📚", priority: "low", done: false },
    ]);
    const [timers, setTimers] = useState([]), [widgets, setWidgets] = useState([]);
    const [events, setEvents] = useState([
        { id: "e1", title: "Team standup 👥", date: new Date().toISOString().split("T")[0], time: "09:00", duration: 30, color: "#6c5ce7" },
        { id: "e2", title: "Design review 🎨", date: (() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().split("T")[0]; })(), time: "14:00", duration: 60, color: "#00cec9" },
    ]);
    const [expenses, setExpenses] = useState([{ id: "x1", description: "Coffee ☕", amount: 4.50, category: "food" }, { id: "x2", description: "Bus pass 🚆", amount: 30, category: "transport" }, { id: "x3", description: "Groceries 🛒", amount: 42.80, category: "food" }]);
    const [budget, setBudgetVal] = useState(500);
    const [input, setInput] = useState(""), [loading, setLoading] = useState(false);
    const [lennyMood, setLennyMood] = useState("neutral");
    const [msgs, setMsgs] = useState([{ role: "assistant", text: `Ready! (${LLM_CONFIG.mode === "local" ? "local LLM" : "API"})\n\n• "make it cozy"\n• "check off documentation"\n• "meeting this friday 2pm"\n• "I spent €12 on lunch"\n• "focus mode"` }]);

    const scrollRef = useRef(null), inputRef = useRef(null), idRef = useRef(300);
    const gid = () => `i${idRef.current++}`;
    useEffect(() => { scrollRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, loading]);

    const themes = {
        cozy: { bg: "linear-gradient(135deg, #2d1b14 0%, #1a1410 50%, #0d0a07 100%)", accent: "#e17055" },
        focus: { bg: "#0a0a12", accent: "#636e72" }, ocean: { bg: "linear-gradient(135deg, #0c1829 0%, #0a2a3f 40%, #134e5e 100%)", accent: "#00cec9" },
        sunset: { bg: "linear-gradient(135deg, #1a0a2e 0%, #3d1c56 30%, #c0392b 70%, #e67e22 100%)", accent: "#e67e22" },
        forest: { bg: "linear-gradient(135deg, #0a1a0a 0%, #1a2f1a 50%, #0d1f0d 100%)", accent: "#00b894" },
        midnight: { bg: "linear-gradient(135deg, #020111 0%, #0a0a2e 50%, #060620 100%)", accent: "#6c5ce7" },
        minimal: { bg: "#f5f0eb", accent: "#2d3436" },
    };

    const snap = () => ({ tasks: tasks.slice(0, 10).map(t => t.text + (t.done ? " ✓" : "")), events: events.slice(0, 5).map(e => `${e.title} ${e.date}`), budget: `${expenses.reduce((s, e) => s + e.amount, 0).toFixed(0)}/${budget}`, mood: ambient.mood });

    const manualAddTask = (text) => {
        setTasks(p => [...p, { id: gid(), text, priority: "medium", done: false }]);
        const inferred = inferMood(text, [{ type: "add_task" }]);
        if (inferred) setLennyMood(inferred);
        callAmbientLLM(`User added task: "${text}". Emotional weight?`).then(r => {
            const safe = (r.actions || []).filter(a => a.type === "adjust_ambient");
            if (safe.length) exec(safe);
        });
    };
    const manualAddEvent = (title, date, time, color) => {
        setEvents(p => [...p, { id: gid(), title, date, time, duration: 60, color }]);
        const inferred = inferMood(title, [{ type: "add_event" }]);
        if (inferred) setLennyMood(inferred);
        callAmbientLLM(`User added event: "${title}" on ${date}. Emotional weight?`).then(r => {
            const safe = (r.actions || []).filter(a => a.type === "adjust_ambient");
            if (safe.length) exec(safe);
        });
    };
    const manualAddExpense = (desc, amount, category) => {
        setExpenses(p => [...p, { id: gid(), description: desc, amount, category }]);
    };

    const exec = (actions) => {
        if (!Array.isArray(actions)) return;
        for (const a of actions) {
            const t = a.type;
            if (t === "change_bg" && a.color) setBg(a.color);
            else if (t === "add_postit") setPostits(p => [...p, { id: gid(), content: a.content || "Note", color: a.color || "#fef68a", x: Number(a.x) || 80 + Math.random() * 300, y: Number(a.y) || 40 + Math.random() * 200 }]);
            else if (t === "add_task") setTasks(p => [...p, { id: gid(), text: a.text || "New task", priority: a.priority || "medium", done: false }]);
            else if (t === "complete_task" && a.text) setTasks(p => p.map(tk => !tk.done && !tk.isParent && String(tk.text).toLowerCase().includes(String(a.text).toLowerCase()) ? { ...tk, done: true } : tk));
            else if (t === "delete_task" && a.text) setTasks(p => p.filter(tk => !String(tk.text).toLowerCase().includes(String(a.text).toLowerCase())));
            else if (t === "split_task" && a.text && Array.isArray(a.subtasks)) {
                setTasks(p => {
                    const pi = p.findIndex(tk => String(tk.text).toLowerCase().includes(String(a.text).toLowerCase()));
                    if (pi === -1) return p;
                    const parent = p[pi];
                    const subs = a.subtasks.slice(0, 5).map(st => ({ id: gid(), text: typeof st === "string" ? st : (st?.text || "Subtask"), priority: parent.priority, done: false, parentId: parent.id }));
                    const result = [...p];
                    result[pi] = { ...parent, isParent: true };
                    result.splice(pi + 1, 0, ...subs);
                    return result;
                });
            }
            else if (t === "add_timer") setTimers(p => [...p, { id: gid(), minutes: Number(a.minutes) || 5, label: a.label || "Timer" }]);
            else if (t === "change_theme" && themes[a.theme]) { setBg(themes[a.theme].bg); setAccent(themes[a.theme].accent); }
            else if (t === "set_greeting" && a.text) setGreeting(a.text);
            else if (t === "add_widget" && a.widgetType) setWidgets(p => [...p, { id: gid(), type: a.widgetType }]);
            else if (t === "add_event") setEvents(p => [...p, { id: gid(), title: a.title || "Event", date: a.date || new Date().toISOString().split("T")[0], time: a.time || "09:00", duration: Number(a.duration) || 60, color: a.color || "#6c5ce7" }]);
            else if (t === "delete_event" && a.title) setEvents(p => p.filter(e => !String(e.title).toLowerCase().includes(String(a.title).toLowerCase())));
            else if (t === "add_expense") setExpenses(p => [...p, { id: gid(), description: a.description || "Expense", amount: Number(a.amount) || 0, category: a.category || "other" }]);
            else if (t === "set_budget") setBudgetVal(Number(a.amount) || 0);
            else if (t === "adjust_ambient") {
                setAmbient(prev => ({
                    ...prev, glowColor: a.glowColor || prev.glowColor,
                    glowIntensity: a.glowIntensity != null ? Math.min(0.35, Math.max(0, Number(a.glowIntensity))) : prev.glowIntensity,
                    grainOpacity: a.grainOpacity != null ? Math.min(0.08, Math.max(0, Number(a.grainOpacity))) : prev.grainOpacity,
                    borderWarmth: a.borderWarmth != null ? Math.min(1, Math.max(0, Number(a.borderWarmth))) : prev.borderWarmth,
                    particles: a.particles || prev.particles, mood: a.mood || prev.mood,
                }));
                // Also try to sync lenny from LLM mood if it maps to something
                if (a.mood) { const lm = inferMood(a.mood, []); if (lm) setLennyMood(lm); }
            }
            else if (t === "clear_canvas") { setPostits([]); setTimers([]); setWidgets([]); }
        }
    };

    const send = async (ov) => {
        const inputStr = typeof ov === "string" ? ov : input;
        const txt = inputStr.trim();

        if (!txt || loading) return;
        if (typeof ov !== "string") setInput("");

        setMsgs(m => [...m, { role: "user", text: txt }]);
        setLoading(true);

        try {
            const r = await callLLM(txt, snap());
            if (r.reply) {
                exec(r.actions);
                setMsgs(m => [...m, { role: "assistant", text: r.reply, ac: r.actions.length }]);
                // Client-side mood inference — no extra LLM call needed
                const inferred = inferMood(txt, r.actions);
                if (inferred) setLennyMood(inferred);
                // Still fire ambient for visual effects (particles/glow) if no ambient action came back
                const hasAmbient = r.actions.some(a => a.type === "adjust_ambient");
                if (!hasAmbient) {
                    callAmbientLLM(`User said: "${txt}". Actions taken: ${r.actions.map(a => a.type).join(", ") || "none"}. Emotional weight?`).then(ar => {
                        const safe = (ar.actions || []).filter(a => a.type === "adjust_ambient");
                        if (safe.length) exec(safe);
                    });
                }
            }
        } catch {
            setMsgs(m => [...m, { role: "assistant", text: "Something went wrong — try again?" }]);
        }

        setLoading(false);
        setTimeout(() => inputRef.current?.focus(), 50);
    };

    const light = bg === "#f5f0eb";
    const tx = light ? "#2d3436" : "#fff";
    const txm = light ? "rgba(45,52,54,0.5)" : "rgba(255,255,255,0.45)";
    const txs = light ? "rgba(45,52,54,0.12)" : "rgba(255,255,255,0.1)";
    const pBd = light ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.06)";
    const togs = [{ k: "t", l: "Tasks", s: showTasks, f: setShowTasks, i: "✓" }, { k: "c", l: "Calendar", s: showCal, f: setShowCal, i: "📅" }, { k: "b", l: "Budget", s: showBudget, f: setShowBudget, i: "💰" }];

    const safeAmbientGlowColor = (ambient.glowColor && ambient.glowColor !== "transparent") ? ambient.glowColor : "#ffffff";
    const ambientBg = ambient.glowIntensity > 0 ? `radial-gradient(ellipse at 30% 40%, ${safeAmbientGlowColor}${Math.round(ambient.glowIntensity * 255).toString(16).padStart(2, "0")} 0%, transparent 70%)` : "none";

    return <>
        <link href="https://fonts.googleapis.com/css2?family=Caveat:wght@400;700&family=DM+Sans:ital,wght@0,300;0,400;0,500;0,700;1,400&family=JetBrains+Mono:wght@200;400;600;700&display=swap" rel="stylesheet" />
        <style>{`
            @keyframes bk{0%,60%,100%{transform:translateY(0);opacity:.3}30%{transform:translateY(-5px);opacity:.8}}
            @keyframes ff{0%,100%{transform:translate(0,0);opacity:.15}25%{transform:translate(12px,-18px);opacity:.5}50%{transform:translate(-8px,-30px);opacity:.2}75%{transform:translate(15px,-10px);opacity:.45}}
            @keyframes st{0%,100%{opacity:.1;transform:scale(.8)}50%{opacity:.7;transform:scale(1.2)}}
            @keyframes rn{0%{transform:translateY(-10px);opacity:0}10%{opacity:.4}90%{opacity:.4}100%{transform:translateY(100vh);opacity:0}}
            @keyframes sp{0%{opacity:0;transform:scale(0) rotate(0deg)}30%{opacity:.8;transform:scale(1.2) rotate(90deg)}100%{opacity:0;transform:scale(0) rotate(180deg)}}
            @keyframes panelIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
            @keyframes itemIn{from{opacity:0;transform:translateX(-6px)}to{opacity:1;transform:translateX(0)}}
            @keyframes lennyBreathe{0%,100%{transform:translateY(0)}50%{transform:translateY(-2px)}}
            @keyframes lennyThink{0%,100%{transform:translateY(0) rotate(0deg)}25%{transform:translateY(-2px) rotate(-3deg)}75%{transform:translateY(-1px) rotate(3deg)}}
            .anim-item { animation: itemIn 0.25s ease-out; }
            .anim-panel { animation: panelIn 0.2s ease-out; }
        `}</style>

        <div style={{ width: "100vw", height: "100vh", overflow: "hidden", display: "flex", background: bg, fontFamily: "'DM Sans',sans-serif", color: tx, transition: "background 1.2s ease, color 0.8s" }}>
            <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>

                {/* Ambient layers */}
                <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 1, background: ambientBg, transition: "background 2.5s" }} />
                <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 2, opacity: ambient.grainOpacity, backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E")`, backgroundRepeat: "repeat", backgroundSize: "128px", transition: "opacity 2s" }} />

                {ambient.particles !== "none" && <Particles type={ambient.particles} color={ambient.glowColor !== "transparent" ? ambient.glowColor : accent} />}
                <LennyBuddy mood={lennyMood} glowColor={ambient.glowColor !== "transparent" ? ambient.glowColor : accent} light={light} loading={loading} />

                {/* Header */}
                <div style={{ position: "relative", zIndex: 50, padding: "16px 24px 10px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                        <h1 style={{ fontFamily: "'DM Sans'", fontWeight: 300, fontSize: 24, margin: 0, letterSpacing: -0.5, color: light ? "rgba(45,52,54,0.88)" : "rgba(255,255,255,0.88)" }}>{greeting}</h1>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
                            <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 9, color: txm, letterSpacing: 1.5, textTransform: "uppercase" }}>Adaptive Dashboard</span>
                            <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 8, letterSpacing: 1, padding: "1px 6px", borderRadius: 3, background: LLM_CONFIG.mode === "local" ? "rgba(0,184,148,0.15)" : "rgba(108,92,231,0.15)", color: LLM_CONFIG.mode === "local" ? "#00b894" : "#6c5ce7", border: `1px solid ${LLM_CONFIG.mode === "local" ? "rgba(0,184,148,0.25)" : "rgba(108,92,231,0.25)"}` }}>{LLM_CONFIG.mode === "local" ? "LOCAL" : "API"}</span>
                        </div>
                    </div>
                    <div style={{ display: "flex", gap: 4 }}>
                        {togs.map(t => <button key={t.k} onClick={() => t.f(v => !v)} style={{ padding: "4px 9px", borderRadius: 7, fontSize: 9.5, cursor: "pointer", fontFamily: "'JetBrains Mono'", background: t.s ? `${accent}20` : (light ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.04)"), border: `1px solid ${t.s ? `${accent}40` : pBd}`, color: t.s ? accent : txm, display: "flex", alignItems: "center", gap: 3, transition: "all 0.2s" }}><span style={{ fontSize: 10 }}>{t.i}</span> {t.l}</button>)}
                    </div>
                </div>

                {showTasks && <TasksPanel tasks={tasks} onToggle={id => setTasks(t => t.map(tk => tk.id === id ? { ...tk, done: !tk.done } : tk))} onEditTask={(id, v) => setTasks(t => t.map(tk => tk.id === id ? { ...tk, text: v } : tk))} onRequestSplit={t => send(`split the task "${t}" into subtasks`)} onAddTask={manualAddTask} accent={accent} light={light} onClose={() => setShowTasks(false)} ambient={ambient} />}
                {showCal && <CalendarPanel events={events} onDeleteEvent={id => setEvents(e => e.filter(ev => ev.id !== id))} onAddEvent={manualAddEvent} accent={accent} light={light} onClose={() => setShowCal(false)} ambient={ambient} />}
                {showBudget && <BudgetPanel expenses={expenses} budget={budget} accent={accent} light={light} onClose={() => setShowBudget(false)} onDeleteExpense={id => setExpenses(e => e.filter(ex => ex.id !== id))} onAddExpense={manualAddExpense} ambient={ambient} />}

                {postits.map(p => <PostIt key={p.id} id={p.id} content={p.content} color={p.color} initialX={p.x} initialY={p.y} onRemove={id => setPostits(pp => pp.filter(n => n.id !== id))} onEdit={(id, v) => setPostits(pp => pp.map(n => n.id === id ? { ...n, content: v } : n))} />)}
                {timers.map(t => <TimerWidget key={t.id} id={t.id} minutes={t.minutes} label={t.label} onRemove={id => setTimers(tt => tt.filter(n => n.id !== id))} light={light} />)}
                {widgets.map(w => w.type === "clock" ? <ClockWidget key={w.id} id={w.id} onRemove={id => setWidgets(ww => ww.filter(n => n.id !== id))} light={light} /> : w.type === "quote" ? <QuoteWidget key={w.id} id={w.id} onRemove={id => setWidgets(ww => ww.filter(n => n.id !== id))} light={light} /> : null)}

                {!postits.length && !timers.length && !widgets.length && !showTasks && !showCal && !showBudget && <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", textAlign: "center", color: txs, userSelect: "none", zIndex: 5 }}>
                    <div style={{ fontSize: 40, marginBottom: 8 }}>✦</div><div style={{ fontFamily: "'JetBrains Mono'", fontSize: 10, letterSpacing: 2 }}>CANVAS EMPTY</div>
                </div>}
            </div>

            {/* Chat */}
            <div style={{ width: 300, display: "flex", flexDirection: "column", background: light ? "rgba(0,0,0,0.03)" : "rgba(0,0,0,0.3)", backdropFilter: "blur(40px)", borderLeft: `1px solid ${pBd}`, transition: "all 0.8s" }}>
                <div style={{ padding: "14px 15px 10px", borderBottom: `1px solid ${pBd}` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 26, height: 26, borderRadius: 7, background: `linear-gradient(135deg, ${accent}, ${accent}88)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, transition: "background 0.8s" }}>⚡</div>
                        <div>
                            <div style={{ fontSize: 12, fontWeight: 600 }}>Dashboard AI</div>
                            <div style={{ fontSize: 8, color: txm, fontFamily: "'JetBrains Mono'", letterSpacing: 1 }}>{loading ? "THINKING..." : LLM_CONFIG.mode === "local" ? "LOCAL LLM" : "CLAUDE • API"}</div>
                        </div>
                    </div>
                </div>
                <div style={{ flex: 1, overflowY: "auto", padding: "10px 10px 4px", display: "flex", flexDirection: "column", gap: 7 }}>
                    {msgs.map((m, i) => <div key={i} className="anim-item" style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "90%" }}>
                        <div style={{ padding: "7px 11px", fontSize: 11.5, lineHeight: 1.5, whiteSpace: "pre-wrap", background: m.role === "user" ? `${accent}22` : (light ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.04)"), border: `1px solid ${m.role === "user" ? `${accent}33` : pBd}`, borderRadius: m.role === "user" ? "11px 11px 3px 11px" : "11px 11px 11px 3px", color: light ? "rgba(45,52,54,0.85)" : "rgba(255,255,255,0.85)" }}>{m.text}</div>
                        {m.ac > 0 && <div style={{ fontSize: 8, color: txm, marginTop: 2, fontFamily: "'JetBrains Mono'", paddingLeft: 3 }}>⚡ {m.ac} action{m.ac > 1 ? "s" : ""}</div>}
                    </div>)}
                    {loading && <TypingDots />}
                    <div ref={scrollRef} />
                </div>
                <div style={{ padding: "8px 10px 10px" }}>
                    <div style={{ display: "flex", gap: 5, background: light ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.04)", border: `1px solid ${light ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.08)"}`, borderRadius: 10, padding: "3px 3px 3px 11px", alignItems: "center" }}>
                        <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && send()} placeholder={loading ? "Thinking..." : "Ask me anything..."} disabled={loading}
                            style={{ flex: 1, background: "none", border: "none", outline: "none", color: tx, fontSize: 11.5, fontFamily: "'DM Sans'", opacity: loading ? 0.5 : 1 }} />
                        <button onClick={() => send()} disabled={loading} style={{ width: 28, height: 28, borderRadius: 7, border: "none", flexShrink: 0, background: loading ? "rgba(128,128,128,0.25)" : `linear-gradient(135deg, ${accent}, ${accent}88)`, cursor: loading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: "#fff", transition: "background 0.5s" }}>↑</button>
                    </div>
                </div>
            </div>
        </div>
    </>;
}