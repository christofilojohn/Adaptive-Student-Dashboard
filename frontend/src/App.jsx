import { useState, useRef, useEffect, useCallback, useMemo, createContext, useContext } from "react";

// ═══════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════
const LLM_CONFIG = {
    mode: "local",
    local_url: "/v1/chat/completions",
    local_model: "phi-3.5-mini-instruct",
};
const POSTIT_CHAR_LIMIT = 120;
const TASK_CHAR_LIMIT = 80;

// ═══════════════════════════════════════════════════
// TCD CONSTANTS
// ═══════════════════════════════════════════════════
const TCD_SEMESTERS = { michaelmas: "Michaelmas", hilary: "Hilary", trinity: "Trinity Term", yearlong: "Year-Long" };
const TCD_SEMESTER_COLORS = { michaelmas: "#e17055", hilary: "#00cec9", trinity: "#00b894", yearlong: "#6c5ce7" };
const MODULE_COLORS = ["#6c5ce7", "#00cec9", "#e17055", "#00b894", "#fdcb6e", "#e84393", "#a29bfe", "#74b9ff", "#55efc4", "#ff7675"];
const TIMETABLE_HOURS = Array.from({ length: 13 }, (_, i) => `${(i + 8).toString().padStart(2, "0")}:00`);
const WEEK_DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"];
const WEEK_DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

const toLocalDateStr = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
};

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
    const now = new Date(), iso = (d) => toLocalDateStr(d);
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
{"type":"add_note","content":"Remember this","color":"#fef68a"}
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
{"type":"add_module","code":"CS3012","name":"Software Engineering 💻","credits":5,"semester":"michaelmas","moduleType":"lecture"}
{"type":"remove_module","code":"CS3012"}
{"type":"show_tcd_modules"}
{"type":"show_timetable"}
{"type":"add_timetable_slot","moduleCode":"CS3012","day":"monday","startTime":"09:00","endTime":"10:00","slotType":"lecture","room":"Lloyd 1"}

split_task KEEPS the parent and adds subtasks below it.
adjust_ambient: particles=none|fireflies|stars|rain|sparkle. Use ONLY for emotional content.
Themes: cozy, focus, ocean, sunset, forest, midnight, minimal
Priority: high, medium, low
Categories: food, transport, entertainment, shopping, bills, health, other
Module semesters: michaelmas, hilary, trinity, yearlong
Module types: lecture, tutorial, lab, seminar
TCD year names: Junior Freshman (1), Senior Freshman (2), Junior Sophister (3), Senior Sophister (4)

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
        if (!r.ok) throw new Error(`LLM server error: ${r.status} ${r.statusText}`);
        return (await r.json()).choices?.[0]?.message?.content || "{}";
    }
}

async function callLLM(msg, state) {
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
// Shared context so every draggable knows how tall the locked header area is
const HeaderLockCtx = createContext(0);

function useDraggable(ix, iy) {
    const minY = useContext(HeaderLockCtx);
    const minYRef = useRef(minY);
    useEffect(() => { minYRef.current = minY; }, [minY]);
    const [pos, setPos] = useState({ x: ix, y: Math.max(minY, iy) });
    const dr = useRef(false), off = useRef({ x: 0, y: 0 });
    const onMouseDown = useCallback((e) => {
        if (e.target.closest("button, input, textarea, select, a, [data-nodrag]")) return;
        e.preventDefault(); dr.current = true; off.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
        const mv = ev => {
            if (dr.current) setPos({ x: ev.clientX - off.current.x, y: Math.max(minYRef.current, ev.clientY - off.current.y) });
        };
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
                    flex: 1, background: light ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.07)", border: `1px solid ${light ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.10)"}`,
                    borderRadius: 6, padding: "4px 8px", fontSize: 10.5, color: light ? "#2d3436" : "rgba(255,255,255,0.9)", outline: "none", fontFamily: "'DM Sans'"
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
function Panel({ children, x, y, width, title, icon, onClose, ambient, light, accent = "#8b5cf6" }) {
    const { pos, onMouseDown } = useDraggable(x, y);
    const txm = light ? "rgba(45,52,54,0.5)" : "rgba(255,255,255,0.45)";
    const bw = ambient.borderWarmth || 0;
    const borderCol = light ? `rgba(${Math.round(80 + bw * 80)},${Math.round(60 + bw * 40)},50,0.1)` : `rgba(${Math.round(255 * (0.3 + bw * 0.3))},${Math.round(255 * (0.25 + bw * 0.15))},${Math.round(255 * 0.2)},${0.06 + bw * 0.06})`;
    const panelBg = light ? `rgba(255,255,255,${0.65 + (ambient.panelOpacity || 0.03) * 3})` : `rgba(255,255,255,${ambient.panelOpacity || 0.03})`;
    const safeGlow = (ambient.glowColor && ambient.glowColor !== "transparent") ? ambient.glowColor : "#ffffff";
    const reflectCol = ambient.glowIntensity > 0 ? `${safeGlow}08` : "transparent";
    const accentGlow = `${accent}14`;
    const accentBorder = `${accent}30`;
    const headerTint = light ? `${accent}10` : `${accent}12`;

    return (
        <div className="panel-shell" onMouseDown={onMouseDown} style={{
            position: "absolute", left: pos.x, top: pos.y, width, background: `linear-gradient(135deg, ${panelBg}, ${reflectCol})`,
            backdropFilter: `blur(${ambient.panelBlur || 20}px)`, border: `1px solid ${borderCol}`, borderTop: `1px solid ${accentBorder}`, borderRadius: 14, cursor: "grab", zIndex: 15,
            boxShadow: `0 8px 32px rgba(0,0,0,0.18), 0 0 0 1px ${accentGlow}, inset 0 1px 0 ${light ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.04)"}`,
            userSelect: "none", overflow: "hidden", transition: "border-color 1.5s, background 1.5s, box-shadow 1.5s, transform 0.2s ease", animation: "panelIn 0.3s ease-out",
        }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 13px 7px", borderBottom: `1px solid ${borderCol}`, background: `linear-gradient(90deg, ${headerTint}, transparent)` }}>
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
        <div className="panel-shell" onMouseDown={onMouseDown} style={{
            position: "absolute", left: pos.x, top: pos.y, width: 175, minHeight: 95,
            background: color || "#fef68a", borderRadius: 3, padding: "24px 12px 12px", cursor: "grab",
            transform: `rotate(${rot.current}deg)`, zIndex: 12, boxShadow: "2px 4px 18px rgba(0,0,0,0.22), inset 0 -2px 4px rgba(0,0,0,0.05)",
            userSelect: "none", animation: `noteIn_${id} 0.35s cubic-bezier(0.34,1.56,0.64,1)`,
        }}>
            <style>{`@keyframes noteIn_${id}{from{opacity:0;transform:rotate(${rot.current}deg) scale(0.7)}to{opacity:1;transform:rotate(${rot.current}deg) scale(1)}}`}</style>
            <button onClick={e => { e.stopPropagation(); onRemove(id); }} style={{ position: "absolute", top: 3, right: 6, background: "none", border: "none", color: "rgba(0,0,0,0.2)", cursor: "pointer", fontSize: 15, lineHeight: 1 }}>×</button>
            {em && <span style={{ position: "absolute", top: 4, left: 8, fontSize: 13 }}>{em}</span>}
            <EditableText value={content} onChange={v => onEdit(id, v)} maxLen={POSTIT_CHAR_LIMIT} multiline style={{ fontFamily: "'Caveat', cursive", fontSize: 16, color: "#111111", lineHeight: 1.4 }} />
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
        <Panel x={24} y={320} width={330} title={`Tasks · ${tasks.filter(t => !t.done && !t.isParent).length} active`} icon="✓" light={light} onClose={onClose} ambient={ambient} accent={accent}>
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
                            <div style={{ flex: 1, opacity: tk.done ? 0.5 : 1, display: "flex", alignItems: "center", gap: 4, transition: "opacity 0.3s" }}>
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

function CalendarPanel({ events, onDeleteEvent, onAddEvent, onEditEvent, accent, light, onClose, ambient }) {
    const [view, setView] = useState("week");
    const [showForm, setShowForm] = useState(false);
    const [selectedEvent, setSelectedEvent] = useState(null);
    const [selectedDate, setSelectedDate] = useState(null);
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [formTitle, setFormTitle] = useState("");
    const [formDate, setFormDate] = useState("");
    const [formTime, setFormTime] = useState("09:00");
    const [formDuration, setFormDuration] = useState(60);
    const [formColor, setFormColor] = useState("");
    const today = new Date();
    const txm = light ? "rgba(45,52,54,0.5)" : "rgba(255,255,255,0.45)";
    const tx = light ? "#2d3436" : "#fff";
    const dN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const dNF = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const mN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const week = Array.from({ length: 7 }, (_, i) => { const d = new Date(today); d.setDate(d.getDate() + i); return d; });
    const evFor = d => events.filter(e => e.date === toLocalDateStr(d)).sort((a, b) => (a.time || "").localeCompare(b.time || ""));
    const evColors = ["#6c5ce7", "#00cec9", "#e17055", "#00b894", "#fdcb6e", "#e84393", "#74b9ff", "#a29bfe"];

    const exportICS = () => {
        let ics = "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Dashboard//EN\n";
        events.forEach(e => {
            const dt = e.date.replace(/-/g, ""), t = (e.time || "09:00").replace(":", "") + "00", dur = e.duration || 60, em = parseInt(t.slice(0, 2)) * 60 + parseInt(t.slice(2, 4)) + dur;
            ics += `BEGIN:VEVENT\nDTSTART:${dt}T${t}\nDTEND:${dt}T${String(Math.floor(em / 60)).padStart(2, "0")}${String(em % 60).padStart(2, "0")}00\nSUMMARY:${e.title}\nEND:VEVENT\n`;
        });
        ics += "END:VCALENDAR"; const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar" })); a.download = "calendar.ics"; a.click();
    };

    const openAddForm = (date = null, time = "09:00") => {
        setSelectedEvent(null);
        setFormTitle("");
        setFormDate(date || toLocalDateStr(today));
        setFormTime(time);
        setFormDuration(60);
        setFormColor(evColors[Math.floor(Math.random() * evColors.length)]);
        setShowForm(true);
    };

    const openEditForm = (ev) => {
        setSelectedEvent(ev);
        setFormTitle(ev.title);
        setFormDate(ev.date);
        setFormTime(ev.time || "09:00");
        setFormDuration(ev.duration || 60);
        setFormColor(ev.color || accent);
        setShowForm(true);
    };

    const submitEvent = () => {
        if (!formTitle.trim()) return;
        if (selectedEvent) {
            onEditEvent(selectedEvent.id, formTitle.trim(), formDate, formTime, formDuration, formColor);
        } else {
            onAddEvent(formTitle.trim(), formDate, formTime, formDuration, formColor);
        }
        setShowForm(false);
        setSelectedEvent(null);
        setSelectedDate(null);
    };

    const getMonthDays = () => {
        const year = currentMonth.getFullYear();
        const month = currentMonth.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const daysInMonth = lastDay.getDate();
        const startDayOfWeek = firstDay.getDay();
        const days = [];
        for (let i = 0; i < startDayOfWeek; i++) days.push(null);
        for (let i = 1; i <= daysInMonth; i++) days.push(new Date(year, month, i));
        return days;
    };

    const formatDuration = (mins) => {
        if (mins < 60) return `${mins}m`;
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return m > 0 ? `${h}h ${m}m` : `${h}h`;
    };

    const groupEventsByDate = () => {
        const grouped = {};
        [...events].sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)).forEach(ev => {
            if (!grouped[ev.date]) grouped[ev.date] = [];
            grouped[ev.date].push(ev);
        });
        return grouped;
    };

    const isToday = (d) => d.toDateString() === today.toDateString();
    const isPast = (d) => d < new Date(new Date(today).setHours(0, 0, 0, 0));

    return (
        <Panel x={24} y={485} width={360} title="Calendar" icon="📅" light={light} onClose={onClose} ambient={ambient} accent={accent}>
            {/* Header with view switcher and actions */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ display: "flex", gap: 4, background: light ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.05)", borderRadius: 6, padding: 2 }}>
                    {["week", "month", "list"].map(v => (
                        <button key={v} onClick={() => setView(v)} style={{
                            padding: "4px 10px",
                            borderRadius: 5,
                            fontSize: 10,
                            cursor: "pointer",
                            fontFamily: "'JetBrains Mono'",
                            textTransform: "uppercase",
                            letterSpacing: 0.5,
                            background: view === v ? (light ? "#fff" : "rgba(255,255,255,0.15)") : "transparent",
                            border: "none",
                            color: view === v ? accent : txm,
                            boxShadow: view === v ? (light ? "0 1px 3px rgba(0,0,0,0.1)" : "0 1px 3px rgba(0,0,0,0.3)") : "none",
                            transition: "all 0.2s"
                        }}>{v}</button>
                    ))}
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                    <button onClick={() => openAddForm()} style={{
                        padding: "4px 10px",
                        borderRadius: 6,
                        fontSize: 10,
                        cursor: "pointer",
                        fontFamily: "'JetBrains Mono'",
                        background: `${accent}20`,
                        border: `1px solid ${accent}40`,
                        color: accent,
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        transition: "all 0.2s"
                    }}><span>+</span> Event</button>
                    <button onClick={exportICS} style={{
                        padding: "4px 10px",
                        borderRadius: 6,
                        fontSize: 10,
                        cursor: "pointer",
                        fontFamily: "'JetBrains Mono'",
                        background: "transparent",
                        border: `1px solid ${light ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.1)"}`,
                        color: txm,
                        transition: "all 0.2s"
                    }}>Export</button>
                </div>
            </div>

            {/* Add/Edit Form */}
            {showForm && (
                <div className="anim-panel" style={{
                    marginBottom: 12,
                    padding: 12,
                    borderRadius: 10,
                    background: light ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.05)",
                    border: `1px solid ${light ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.08)"}`
                }} data-nodrag>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: tx }}>{selectedEvent ? "Edit Event" : "New Event"}</span>
                        <button onClick={() => setShowForm(false)} style={{ background: "none", border: "none", color: txm, cursor: "pointer", fontSize: 14 }}>×</button>
                    </div>
                    <input
                        value={formTitle}
                        onChange={e => setFormTitle(e.target.value)}
                        placeholder="Event title"
                        onKeyDown={e => e.key === "Enter" && submitEvent()}
                        style={{
                            width: "100%",
                            background: light ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.2)",
                            border: `1px solid ${light ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.1)"}`,
                            borderRadius: 6,
                            outline: "none",
                            fontSize: 12,
                            color: tx,
                            fontFamily: "'DM Sans'",
                            padding: "6px 10px",
                            marginBottom: 8
                        }}
                    />
                    <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                        <div style={{ flex: 1 }}>
                            <label style={{ fontSize: 8, color: txm, fontFamily: "'JetBrains Mono'", textTransform: "uppercase", letterSpacing: 0.5 }}>Date</label>
                            <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} style={{
                                width: "100%",
                                background: light ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.2)",
                                border: `1px solid ${light ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.1)"}`,
                                borderRadius: 6,
                                padding: "5px 8px",
                                fontSize: 10,
                                color: tx,
                                fontFamily: "'JetBrains Mono'",
                                outline: "none",
                                marginTop: 3
                            }} />
                        </div>
                        <div style={{ width: 80 }}>
                            <label style={{ fontSize: 8, color: txm, fontFamily: "'JetBrains Mono'", textTransform: "uppercase", letterSpacing: 0.5 }}>Time</label>
                            <input type="time" value={formTime} onChange={e => setFormTime(e.target.value)} style={{
                                width: "100%",
                                background: light ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.2)",
                                border: `1px solid ${light ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.1)"}`,
                                borderRadius: 6,
                                padding: "5px 8px",
                                fontSize: 10,
                                color: tx,
                                fontFamily: "'JetBrains Mono'",
                                outline: "none",
                                marginTop: 3
                            }} />
                        </div>
                        <div style={{ width: 70 }}>
                            <label style={{ fontSize: 8, color: txm, fontFamily: "'JetBrains Mono'", textTransform: "uppercase", letterSpacing: 0.5 }}>Duration</label>
                            <select value={formDuration} onChange={e => setFormDuration(parseInt(e.target.value))} style={{
                                width: "100%",
                                background: light ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.2)",
                                border: `1px solid ${light ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.1)"}`,
                                borderRadius: 6,
                                padding: "5px 8px",
                                fontSize: 10,
                                color: tx,
                                fontFamily: "'JetBrains Mono'",
                                outline: "none",
                                marginTop: 3
                            }}>
                                <option value={15}>15m</option>
                                <option value={30}>30m</option>
                                <option value={60}>1h</option>
                                <option value={90}>1.5h</option>
                                <option value={120}>2h</option>
                                <option value={180}>3h</option>
                                <option value={240}>4h</option>
                            </select>
                        </div>
                    </div>
                    <div style={{ marginBottom: 10 }}>
                        <label style={{ fontSize: 8, color: txm, fontFamily: "'JetBrains Mono'", textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 4 }}>Color</label>
                        <div style={{ display: "flex", gap: 6 }}>
                            {evColors.map(c => (
                                <button
                                    key={c}
                                    onClick={() => setFormColor(c)}
                                    style={{
                                        width: 22,
                                        height: 22,
                                        borderRadius: "50%",
                                        background: c,
                                        border: formColor === c ? `2px solid ${light ? "#2d3436" : "#fff"}` : "2px solid transparent",
                                        cursor: "pointer",
                                        transform: formColor === c ? "scale(1.1)" : "scale(1)",
                                        transition: "all 0.2s"
                                    }}
                                />
                            ))}
                        </div>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                        {selectedEvent && (
                            <button onClick={() => { onDeleteEvent(selectedEvent.id); setShowForm(false); }} style={{
                                padding: "6px 12px",
                                borderRadius: 6,
                                fontSize: 10,
                                cursor: "pointer",
                                fontFamily: "'JetBrains Mono'",
                                background: "rgba(231, 76, 60, 0.15)",
                                border: "1px solid rgba(231, 76, 60, 0.3)",
                                color: "#e74c3c"
                            }}>Delete</button>
                        )}
                        <button onClick={submitEvent} style={{
                            flex: 1,
                            padding: "6px 12px",
                            borderRadius: 6,
                            fontSize: 10,
                            cursor: "pointer",
                            fontFamily: "'JetBrains Mono'",
                            background: `${accent}25`,
                            border: `1px solid ${accent}50`,
                            color: accent,
                            fontWeight: 600
                        }}>{selectedEvent ? "Save Changes" : "Add Event"}</button>
                    </div>
                </div>
            )}

            {/* Week View */}
            {view === "week" && (
                <div style={{ display: "flex", gap: 4 }}>
                    {week.map((d, i) => {
                        const isTodayDate = isToday(d);
                        const dayEvents = evFor(d);
                        const isPastDate = isPast(d);
                        return (
                            <div
                                key={i}
                                onClick={() => openAddForm(toLocalDateStr(d))}
                                style={{
                                    flex: 1,
                                    textAlign: "center",
                                    padding: "6px 3px",
                                    borderRadius: 8,
                                    background: isTodayDate ? `${accent}15` : (light ? "rgba(0,0,0,0.02)" : "rgba(255,255,255,0.03)"),
                                    border: isTodayDate ? `1px solid ${accent}40` : `1px solid ${light ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.05)"}`,
                                    cursor: "pointer",
                                    transition: "all 0.2s",
                                    opacity: isPastDate ? 0.6 : 1
                                }}
                            >
                                <div style={{ fontSize: 8, color: txm, fontFamily: "'JetBrains Mono'", textTransform: "uppercase" }}>{dN[d.getDay()]}</div>
                                <div style={{
                                    fontSize: 16,
                                    fontWeight: isTodayDate ? 700 : 500,
                                    color: isTodayDate ? accent : tx,
                                    margin: "2px 0 6px"
                                }}>{d.getDate()}</div>
                                <div style={{ display: "flex", flexDirection: "column", gap: 2, minHeight: 20 }}>
                                    {dayEvents.slice(0, 3).map((ev, j) => (
                                        <div
                                            key={j}
                                            onClick={(e) => { e.stopPropagation(); openEditForm(ev); }}
                                            style={{
                                                padding: "2px 4px",
                                                borderRadius: 3,
                                                background: `${ev.color || accent}25`,
                                                border: `1px solid ${ev.color || accent}40`,
                                                fontSize: 7,
                                                color: tx,
                                                overflow: "hidden",
                                                textOverflow: "ellipsis",
                                                whiteSpace: "nowrap",
                                                cursor: "pointer",
                                                transition: "all 0.2s"
                                            }}
                                            title={`${ev.title} (${ev.time}${ev.duration ? `, ${formatDuration(ev.duration)}` : ""})`}
                                        >
                                            {ev.time} {ev.title}
                                        </div>
                                    ))}
                                    {dayEvents.length > 3 && (
                                        <div style={{ fontSize: 7, color: txm, fontFamily: "'JetBrains Mono'" }}>+{dayEvents.length - 3} more</div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Month View */}
            {view === "month" && (
                <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                        <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))} style={{
                            background: "none",
                            border: "none",
                            color: txm,
                            cursor: "pointer",
                            fontSize: 14,
                            padding: "2px 8px",
                            borderRadius: 4,
                            transition: "all 0.2s"
                        }}>‹</button>
                        <span style={{ fontSize: 12, fontWeight: 600, color: tx, fontFamily: "'DM Sans'" }}>
                            {mN[currentMonth.getMonth()]} {currentMonth.getFullYear()}
                        </span>
                        <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))} style={{
                            background: "none",
                            border: "none",
                            color: txm,
                            cursor: "pointer",
                            fontSize: 14,
                            padding: "2px 8px",
                            borderRadius: 4,
                            transition: "all 0.2s"
                        }}>›</button>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 4 }}>
                        {dN.map(d => (
                            <div key={d} style={{ textAlign: "center", fontSize: 8, color: txm, fontFamily: "'JetBrains Mono'", padding: "4px 0" }}>{d}</div>
                        ))}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
                        {getMonthDays().map((d, i) => {
                            if (!d) return <div key={i} style={{ aspectRatio: 1 }} />;
                            const isTodayDate = isToday(d);
                            const dayEvents = evFor(d);
                            const isPastDate = isPast(d);
                            return (
                                <div
                                    key={i}
                                    onClick={() => openAddForm(toLocalDateStr(d))}
                                    style={{
                                        aspectRatio: 1,
                                        padding: 3,
                                        borderRadius: 6,
                                        background: isTodayDate ? `${accent}20` : (light ? "rgba(0,0,0,0.02)" : "rgba(255,255,255,0.03)"),
                                        border: isTodayDate ? `1px solid ${accent}50` : "1px solid transparent",
                                        cursor: "pointer",
                                        display: "flex",
                                        flexDirection: "column",
                                        alignItems: "center",
                                        transition: "all 0.2s",
                                        opacity: isPastDate ? 0.5 : 1
                                    }}
                                >
                                    <span style={{
                                        fontSize: 10,
                                        fontWeight: isTodayDate ? 700 : 400,
                                        color: isTodayDate ? accent : tx,
                                        marginBottom: 2
                                    }}>{d.getDate()}</span>
                                    <div style={{ display: "flex", gap: 1, flexWrap: "wrap", justifyContent: "center" }}>
                                        {dayEvents.slice(0, 3).map((ev, j) => (
                                            <div
                                                key={j}
                                                onClick={(e) => { e.stopPropagation(); openEditForm(ev); }}
                                                style={{
                                                    width: 5,
                                                    height: 5,
                                                    borderRadius: "50%",
                                                    background: ev.color || accent,
                                                    cursor: "pointer"
                                                }}
                                                title={ev.title}
                                            />
                                        ))}
                                        {dayEvents.length > 3 && (
                                            <span style={{ fontSize: 6, color: txm }}>+</span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* List View */}
            {view === "list" && (
                <div style={{ maxHeight: 200, overflowY: "auto" }}>
                    {events.length === 0 && (
                        <div style={{ textAlign: "center", padding: "20px 0", color: txm, fontStyle: "italic", fontSize: 12 }}>
                            No events scheduled
                        </div>
                    )}
                    {Object.entries(groupEventsByDate()).map(([date, dayEvents]) => {
                        const [y, mo, day] = date.split("-").map(Number);
                        const d = new Date(y, mo - 1, day);
                        const isTodayDate = isToday(d);
                        const isPastDate = d < new Date(new Date().setHours(0, 0, 0, 0));
                        return (
                            <div key={date} style={{ marginBottom: 10 }}>
                                <div style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 6,
                                    padding: "4px 0",
                                    borderBottom: `1px solid ${light ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.06)"}`,
                                    marginBottom: 6
                                }}>
                                    <span style={{
                                        fontSize: 11,
                                        fontWeight: 600,
                                        color: isTodayDate ? accent : tx,
                                        fontFamily: "'DM Sans'"
                                    }}>
                                        {isTodayDate ? "Today" : dNF[d.getDay()]}
                                    </span>
                                    <span style={{ fontSize: 9, color: txm, fontFamily: "'JetBrains Mono'" }}>
                                        {date}
                                    </span>
                                    {isPastDate && !isTodayDate && (
                                        <span style={{ fontSize: 7, color: txm, textTransform: "uppercase", letterSpacing: 0.5 }}>Past</span>
                                    )}
                                </div>
                                {dayEvents.map(ev => {
                                    const em = guessEmoji(ev.title);
                                    return (
                                        <div
                                            key={ev.id}
                                            onClick={() => openEditForm(ev)}
                                            className="anim-item"
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                gap: 8,
                                                padding: "6px 8px",
                                                marginBottom: 4,
                                                borderRadius: 6,
                                                background: light ? "rgba(0,0,0,0.02)" : "rgba(255,255,255,0.03)",
                                                border: `1px solid ${light ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.04)"}`,
                                                cursor: "pointer",
                                                transition: "all 0.2s",
                                                opacity: isPastDate && !isTodayDate ? 0.6 : 1
                                            }}
                                        >
                                            <div style={{
                                                width: 3,
                                                height: 28,
                                                borderRadius: 2,
                                                background: ev.color || accent,
                                                flexShrink: 0
                                            }} />
                                            <div style={{
                                                width: 40,
                                                textAlign: "center",
                                                fontSize: 10,
                                                color: txm,
                                                fontFamily: "'JetBrains Mono'"
                                            }}>
                                                {ev.time}
                                            </div>
                                            {em && <span style={{ fontSize: 12 }}>{em}</span>}
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{
                                                    fontSize: 11,
                                                    fontWeight: 500,
                                                    color: tx,
                                                    overflow: "hidden",
                                                    textOverflow: "ellipsis",
                                                    whiteSpace: "nowrap"
                                                }}>{ev.title}</div>
                                                {ev.duration && (
                                                    <div style={{ fontSize: 8, color: txm, fontFamily: "'JetBrains Mono'" }}>
                                                        {formatDuration(ev.duration)}
                                                    </div>
                                                )}
                                            </div>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); onDeleteEvent(ev.id); }}
                                                style={{
                                                    background: "none",
                                                    border: "none",
                                                    color: txm,
                                                    cursor: "pointer",
                                                    fontSize: 14,
                                                    lineHeight: 1,
                                                    flexShrink: 0,
                                                    padding: "2px 6px",
                                                    borderRadius: 4,
                                                    transition: "all 0.2s"
                                                }}
                                            >×</button>
                                        </div>
                                    );
                                })}
                            </div>
                        );
                    })}
                </div>
            )}
        </Panel>
    );
}
//added insights
function BudgetPanel({ expenses, budget, accent, light, onClose, onDeleteExpense, onAddExpense, ambient }) {
    const [showForm, setShowForm] = useState(false);
    const [showInsights, setShowInsights] = useState(false);
    const [desc, setDesc] = useState(""), [amt, setAmt] = useState(""), [cat, setCat] = useState("other");
    const [error, setError] = useState("");
    const [expenseDate, setExpenseDate] = useState(() => toLocalDateStr(new Date()));
    const [insightsPeriod, setInsightsPeriod] = useState("weekly"); // "weekly" or "monthly"
    const [chartType, setChartType] = useState("histogram"); // "histogram" or "line"
    const txm = light ? "rgba(45,52,54,0.5)" : "rgba(255,255,255,0.45)";
    const tx = light ? "#2d3436" : "#fff";
    const total = expenses.reduce((s, e) => s + e.amount, 0);
    const pct = budget > 0 ? Math.min(total / budget, 1) : 0;
    const remaining = budget - total;
    const catI = { food: "🍽️", transport: "🚗", entertainment: "🎬", shopping: "🛍️", bills: "📄", health: "💊", other: "📦" };
    const catC = { food: "#e17055", transport: "#0984e3", entertainment: "#6c5ce7", shopping: "#fdcb6e", bills: "#636e72", health: "#00b894", other: "#b2bec3" };
    const catT = {}; expenses.forEach(e => { catT[e.category] = (catT[e.category] || 0) + e.amount; });
    const submit = () => { 
        setError("");
        const descTrimmed = desc.trim();
        const amtNum = parseFloat(amt);
        
        if (!descTrimmed) {
            setError("Add a description");
            return;
        }
        if (!amt || isNaN(amtNum)) {
            setError("Enter an amount");
            return;
        }
        if (amtNum <= 0) {
            setError("Amount must be > 0");
            return;
        }
        
        onAddExpense(descTrimmed, amtNum, cat, expenseDate);
        setDesc("");
        setAmt("");
        setExpenseDate(toLocalDateStr(new Date()));
        setError("");
        setShowForm(false);
    };

    // Budget Insights Calculations
    const now = new Date();
    const today = new Date();
    // Helper to parse date string as local date (not UTC)
    const parseLocalDate = (dateStr) => {
        if (!dateStr) return new Date();
        // Handle both YYYY-MM-DD and ISO format
        const datePart = typeof dateStr === 'string' ? dateStr.split('T')[0] : dateStr;
        const [year, month, day] = datePart.split('-').map(Number);
        return new Date(year, month - 1, day);
    };
    // Weekly calculations
    const startOfWeek = new Date(now); startOfWeek.setDate(now.getDate() - now.getDay()); startOfWeek.setHours(0,0,0,0);
    const startOfLastWeek = new Date(startOfWeek); startOfLastWeek.setDate(startOfWeek.getDate() - 7);
    
    const thisWeekExpenses = expenses.filter(e => parseLocalDate(e.date) >= startOfWeek);
    const lastWeekExpenses = expenses.filter(e => { const d = parseLocalDate(e.date); return d >= startOfLastWeek && d < startOfWeek; });
    const thisWeekTotal = thisWeekExpenses.reduce((s, e) => s + e.amount, 0);
    const lastWeekTotal = lastWeekExpenses.reduce((s, e) => s + e.amount, 0);
    const weeklyChange = lastWeekTotal > 0 ? ((thisWeekTotal - lastWeekTotal) / lastWeekTotal * 100) : 0;
    
    // Monthly calculations
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(startOfMonth.getFullYear(), startOfMonth.getMonth() - 1, 1);
    
    const thisMonthExpenses = expenses.filter(e => parseLocalDate(e.date) >= startOfMonth);
    const lastMonthExpenses = expenses.filter(e => { const d = parseLocalDate(e.date); return d >= startOfLastMonth && d < startOfMonth; });
    const thisMonthTotal = thisMonthExpenses.reduce((s, e) => s + e.amount, 0);
    const lastMonthTotal = lastMonthExpenses.reduce((s, e) => s + e.amount, 0);
    const monthlyChange = lastMonthTotal > 0 ? ((thisMonthTotal - lastMonthTotal) / lastMonthTotal * 100) : 0;
    
    // Highest spending category (THIS WEEK/MONTH)
    const periodExpenses = insightsPeriod === "weekly" ? thisWeekExpenses : thisMonthExpenses;
    const periodTotal = insightsPeriod === "weekly" ? thisWeekTotal : thisMonthTotal;
    const periodCatT = {};
    periodExpenses.forEach(e => { periodCatT[e.category] = (periodCatT[e.category] || 0) + e.amount; });
    const sortedCats = Object.entries(periodCatT).sort((a, b) => b[1] - a[1]);
    const topCategory = sortedCats[0];
    
    // Daily/Weekly spending data based on period
    let chartData = [];
    if (insightsPeriod === "weekly") {
        // Last 7 days
        for (let i = 6; i >= 0; i--) {
            const d = new Date(now); d.setDate(now.getDate() - i); d.setHours(0,0,0,0);
            const dayTotal = expenses.filter(e => {
                const ed = parseLocalDate(e.date);
                return ed.toDateString() === d.toDateString();
            }).reduce((s, e) => s + e.amount, 0);
            chartData.push({ label: d.toLocaleDateString('en', { weekday: 'narrow' }), amount: dayTotal, date: d });
        }
    } else {
        // Last 30 days of current month + last month
        const startDate = new Date(now);
        startDate.setDate(1);
        for (let i = 0; i < 30; i++) {
            const d = new Date(startDate);
            d.setDate(startDate.getDate() + i);
            if (d.getMonth() !== startOfMonth.getMonth()) break;
            const dayTotal = expenses.filter(e => {
                const ed = parseLocalDate(e.date);
                return ed.toDateString() === d.toDateString();
            }).reduce((s, e) => s + e.amount, 0);
            chartData.push({ label: d.getDate().toString(), amount: dayTotal, date: d });
        }
    }
    const maxChartAmount = Math.max(...chartData.map(d => d.amount), 1);
    return (
        <Panel x={370} y={320} width={250} title="Budget" icon="💰" light={light} onClose={onClose} ambient={ambient} accent={accent}>
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
                    <div style={{ marginTop: 3, fontSize: 8.5, color: pct >= 0.9 ? "#e74c3c" : pct >= 0.7 ? "#f59e0b" : "#34d399", fontFamily: "'JetBrains Mono'" }}>
                        {pct >= 0.9 ? "Over limit" : pct >= 0.7 ? "Watch spend" : "On track"}
                    </div>
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
                    const exDate = parseLocalDate(ex.date);
                    const dateStr = exDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                    const isToday = exDate.toDateString() === today.toDateString();
                    return (
                        <div key={ex.id} style={{ display: "flex", alignItems: "center", gap: 5, padding: "2px 0", borderBottom: `1px solid ${light ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.03)"}` }}>
                            <span style={{ fontSize: 9 }}>{catI[ex.category]}</span>
                            <span style={{ flex: 1, fontSize: 10, color: tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {ex.description} {em && <span style={{ fontSize: 9 }}>{em}</span>}
                            </span>
                            <span style={{ fontSize: 8, color: txm, fontFamily: "'JetBrains Mono'" }}>{isToday ? "Today" : dateStr}</span>
                            <span style={{ fontSize: 9, fontFamily: "'JetBrains Mono'", color: txm, flexShrink: 0 }}>€{ex.amount.toFixed(2)}</span>
                            <button onClick={() => onDeleteExpense(ex.id)} style={{ background: "none", border: "none", color: txm, cursor: "pointer", fontSize: 9, lineHeight: 1, padding: 0 }}>×</button>
                        </div>)
                })}
            </div>
            <div style={{ display: "flex", gap: 3, marginTop: 6 }}>
                <button onClick={() => setShowForm(f => !f)} style={{ flex: 1, padding: "3px 0", borderRadius: 5, fontSize: 9, cursor: "pointer", fontFamily: "'JetBrains Mono'", background: `${accent}15`, border: `1px solid ${accent}33`, color: accent }}>{showForm ? "Cancel" : "+ Expense"}</button>
                <button onClick={() => setShowInsights(i => !i)} style={{ padding: "3px 8px", borderRadius: 5, fontSize: 9, cursor: "pointer", fontFamily: "'JetBrains Mono'", background: light ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.08)", border: `1px solid ${light ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.1)"}`, color: tx }}>{showInsights ? "Hide" : "Insights"}</button>
            </div>
            {showForm && <div className="anim-panel" style={{ marginTop: 5, padding: 6, borderRadius: 6, background: light ? "rgba(0,0,0,0.02)" : "rgba(255,255,255,0.03)" }} data-nodrag>
                <input value={desc} onChange={e => { setDesc(e.target.value); setError(""); }} placeholder="Description" style={{ width: "100%", background: "transparent", border: "none", outline: "none", fontSize: 10, color: tx, marginBottom: 4 }} />
                <div style={{ display: "flex", gap: 3, marginBottom: 3 }}>
                    <input value={amt} onChange={e => { setAmt(e.target.value); setError(""); }} placeholder="€" type="number" step="0.01" style={{ width: 45, background: "transparent", border: `1px solid ${light ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.08)"}`, borderRadius: 4, padding: "2px 4px", fontSize: 9, color: tx, outline: "none" }} />
                    <select value={cat} onChange={e => setCat(e.target.value)} style={{ flex: 1, background: light ? "rgba(0,0,0,0.02)" : "rgba(255,255,255,0.05)", border: `1px solid ${light ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.08)"}`, borderRadius: 4, fontSize: 9, color: tx, outline: "none", padding: "2px" }}>
                        {Object.keys(catI).map(c => <option key={c} value={c}>{catI[c]} {c}</option>)}
                    </select>
                    <button onClick={submit} style={{ background: `${accent}22`, border: `1px solid ${accent}44`, borderRadius: 4, padding: "2px 6px", fontSize: 10, cursor: "pointer", color: accent }}>+</button>
                </div>
                <input type="date" value={expenseDate} onChange={e => { setExpenseDate(e.target.value); setError(""); }} style={{ width: "100%", background: "transparent", border: `1px solid ${light ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.08)"}`, borderRadius: 4, padding: "2px 4px", fontSize: 9, color: tx, outline: "none", marginBottom: error ? 3 : 0 }} />
                {error && <div style={{ fontSize: 8, color: "#e74c3c", fontFamily: "'JetBrains Mono'" }}>{error}</div>}
            </div>}
            {showInsights && expenses.length > 0 && <div className="anim-panel" style={{ marginTop: 6, padding: 8, borderRadius: 6, background: light ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.05)", border: `1px solid ${light ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.08)"}` }}>
                {/* Period and Chart Type Toggles */}
                <div style={{ display: "flex", gap: 3, marginBottom: 8 }}>
                    <div style={{ display: "flex", gap: 2 }}>
                        <button onClick={() => { setInsightsPeriod("weekly"); }} style={{ padding: "2px 6px", fontSize: 8, cursor: "pointer", fontFamily: "'JetBrains Mono'", background: insightsPeriod === "weekly" ? accent : light ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.08)", border: `1px solid ${insightsPeriod === "weekly" ? accent : light ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.1)"}`, borderRadius: 3, color: insightsPeriod === "weekly" ? (light ? "#fff" : "#000") : txm, transition: "all 0.2s" }}>Weekly</button>
                        <button onClick={() => { setInsightsPeriod("monthly"); setChartType("line"); }} style={{ padding: "2px 6px", fontSize: 8, cursor: "pointer", fontFamily: "'JetBrains Mono'", background: insightsPeriod === "monthly" ? accent : light ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.08)", border: `1px solid ${insightsPeriod === "monthly" ? accent : light ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.1)"}`, borderRadius: 3, color: insightsPeriod === "monthly" ? (light ? "#fff" : "#000") : txm, transition: "all 0.2s" }}>Monthly</button>
                    </div>
                    <div style={{ display: "flex", gap: 2, marginLeft: "auto" }}>
                        {insightsPeriod === "weekly" && <button onClick={() => setChartType("histogram")} style={{ padding: "2px 6px", fontSize: 8, cursor: "pointer", fontFamily: "'JetBrains Mono'", background: chartType === "histogram" ? accent : light ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.08)", border: `1px solid ${chartType === "histogram" ? accent : light ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.1)"}`, borderRadius: 3, color: chartType === "histogram" ? (light ? "#fff" : "#000") : txm, transition: "all 0.2s" }}>📊</button>}
                        <button onClick={() => setChartType("line")} style={{ padding: "2px 6px", fontSize: 8, cursor: "pointer", fontFamily: "'JetBrains Mono'", background: chartType === "line" ? accent : light ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.08)", border: `1px solid ${chartType === "line" ? accent : light ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.1)"}`, borderRadius: 3, color: chartType === "line" ? (light ? "#fff" : "#000") : txm, transition: "all 0.2s" }}>📈</button>
                    </div>
                </div>

                {/* Spending Trend */}
                <div style={{ marginBottom: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                        <span style={{ fontSize: 9, color: txm, fontFamily: "'JetBrains Mono'" }}>This {insightsPeriod}</span>
                        <span style={{ fontSize: 9, fontFamily: "'JetBrains Mono'", color: (insightsPeriod === "weekly" ? weeklyChange : monthlyChange) > 0 ? "#e74c3c" : (insightsPeriod === "weekly" ? weeklyChange : monthlyChange) < 0 ? "#00b894" : txm }}>
                            {(insightsPeriod === "weekly" ? weeklyChange : monthlyChange) > 0 ? "↑" : (insightsPeriod === "weekly" ? weeklyChange : monthlyChange) < 0 ? "↓" : "→"} {(insightsPeriod === "weekly" ? lastWeekTotal : lastMonthTotal) > 0 ? Math.abs(insightsPeriod === "weekly" ? weeklyChange : monthlyChange).toFixed(0) + "%" : "New"} {(insightsPeriod === "weekly" ? lastWeekTotal : lastMonthTotal) > 0 ? "vs last " + insightsPeriod : "data"}
                        </span>
                    </div>
                    {/* Chart - Histogram or Line */}
                    {chartType === "histogram" ? (
                        <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 38, padding: "4px 0", overflowX: "auto", overflowY: "hidden", minHeight: 50 }}>
                            {chartData.map((d, i) => (
                                <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, minWidth: 28, flex: "0 0 auto" }}>
                                    <div style={{ 
                                        width: 22, 
                                        height: `${Math.max((d.amount / maxChartAmount) * 20, 2)}px`, 
                                        background: d.amount > 0 && d.amount === maxChartAmount ? accent : light ? "rgba(0,0,0,0.2)" : "rgba(255,255,255,0.3)",
                                        borderRadius: 2,
                                        transition: "all 0.3s"
                                    }} />
                                    <span style={{ fontSize: 7, color: txm, whiteSpace: "nowrap" }}>{d.label}</span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div style={{ width: "100%", height: 45, position: "relative", marginBottom: 4, overflowX: "auto" }}>
                            <svg width="100%" height="45" viewBox={`0 0 ${Math.max(chartData.length - 1, 1) * 25} 45`} preserveAspectRatio="none" style={{ minWidth: "100%", overflow: "visible" }}>
                                {/* Grid lines */}
                                <line x1="0" y1="38" x2={Math.max(chartData.length - 1, 1) * 25} y2="38" stroke={light ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.08)"} strokeWidth="0.5" />
                                {/* Line chart polyline */}
                                <polyline
                                    points={chartData.map((d, i) => `${i * 25},${38 - (d.amount / maxChartAmount) * 32}`).join(" ")}
                                    fill="none"
                                    stroke={accent}
                                    strokeWidth="1"
                                />
                                {/* Points */}
                                {chartData.map((d, i) => (
                                    <circle
                                        key={i}
                                        cx={i * 25}
                                        cy={38 - (d.amount / maxChartAmount) * 32}
                                        r="1.5"
                                        fill={accent}
                                    />
                                ))}
                                {/* Labels */}
                                {chartData.map((d, i) => (
                                    <text
                                        key={`label-${i}`}
                                        x={i * 25}
                                        y="42"
                                        textAnchor="middle"
                                        fontSize="6"
                                        fill={txm}
                                    >
                                        {d.label}
                                    </text>
                                ))}
                            </svg>
                        </div>
                    )}
                </div>
                
                {/* Top Category */}
                {topCategory && (
                    <div style={{ marginBottom: 10, padding: "6px 8px", borderRadius: 5, background: light ? "rgba(0,0,0,0.02)" : "rgba(255,255,255,0.03)" }}>
                        <div style={{ fontSize: 8, color: txm, marginBottom: 2 }}>Top spending</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontSize: 14 }}>{catI[topCategory[0]]}</span>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 10, color: tx, textTransform: "capitalize" }}>{topCategory[0]}</div>
                                <div style={{ fontSize: 9, color: txm, fontFamily: "'JetBrains Mono'" }}>€{topCategory[1].toFixed(2)} ({periodTotal > 0 ? ((topCategory[1] / periodTotal) * 100).toFixed(0) : 0}%)</div>
                            </div>
                        </div>
                    </div>
                )}
                
                {/* Budget Status */}
                <div style={{ padding: "6px 8px", borderRadius: 5, background: pct >= 0.9 ? "rgba(231,76,60,0.1)" : pct >= 0.7 ? "rgba(245,158,11,0.1)" : "rgba(0,184,148,0.1)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 12 }}>{pct >= 0.9 ? "⚠️" : pct >= 0.7 ? "⚡" : "✅"}</span>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 9, color: tx, fontWeight: 600 }}>
                                {pct >= 0.9 ? "Over budget limit" : pct >= 0.7 ? "Approaching limit" : "On track"}
                            </div>
                            <div style={{ fontSize: 8, color: txm }}>
                                {pct >= 0.9 ? "Consider reducing expenses" : pct >= 0.7 ? `${(remaining).toFixed(0)}€ remaining` : "Keep up the good work!"}
                            </div>
                        </div>
                    </div>
                </div>
            </div>}
        </Panel>
    );
}

function RewardsPanel({ weeklyGoalCategory, setWeeklyGoalCategory, weeklyGoalTarget, setWeeklyGoalTarget, weeklyGoalProgress, weeklyGoalLabel, weeklyGoalHelper, weeklyStreak, accent, light, onClose, ambient }) {
    const progress = weeklyGoalTarget > 0 ? Math.min(weeklyGoalProgress / weeklyGoalTarget, 1) : 0;
    const remaining = Math.max(weeklyGoalTarget - weeklyGoalProgress, 0);
    const txm = light ? "rgba(45,52,54,0.5)" : "rgba(255,255,255,0.45)";
    const tx = light ? "#2d3436" : "#fff";
    const goalOptions = [
        { value: "tasks", label: "Tasks completed" },
        { value: "events", label: "Events planned" },
        { value: "study", label: "Study streak" },
    ];
    const rewardSubtext = progress >= 1 ? "Reward unlocked ✦" : progress >= 0.6 ? "On track this week" : "Keep building momentum";

    return (
        <Panel x={645} y={320} width={250} title="Rewards" icon="⭐" light={light} onClose={onClose} ambient={ambient} accent="#f59e0b">
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                <div>
                    <div style={{ fontSize: 9, color: txm, fontFamily: "'JetBrains Mono'", letterSpacing: 1.2, textTransform: "uppercase" }}>Weekly goal</div>
                    <div style={{ marginTop: 4, fontSize: 26, fontWeight: 700, color: tx, fontFamily: "'JetBrains Mono'" }}>{weeklyGoalProgress}/{weeklyGoalTarget}</div>
                    <div style={{ marginTop: 3, fontSize: 9, color: progress >= 1 ? "#f59e0b" : progress >= 0.6 ? "#34d399" : txm, fontFamily: "'JetBrains Mono'" }}>{rewardSubtext}</div>
                </div>
                <div style={{ minWidth: 62, textAlign: "right" }}>
                    <div style={{ fontSize: 9, color: txm, fontFamily: "'JetBrains Mono'", letterSpacing: 1.2, textTransform: "uppercase" }}>Streak</div>
                    <div style={{ marginTop: 4, fontSize: 20, fontWeight: 700, color: "#f59e0b", fontFamily: "'JetBrains Mono'" }}>{weeklyStreak}w</div>
                </div>
            </div>
            <div style={{ marginTop: 12, display: "flex", gap: 6 }} data-nodrag>
                <select value={weeklyGoalCategory} onChange={e => setWeeklyGoalCategory(e.target.value)} style={{ flex: 1, background: light ? "rgba(0,0,0,0.02)" : "rgba(255,255,255,0.05)", border: `1px solid ${light ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.08)"}`, borderRadius: 6, fontSize: 9, color: tx, outline: "none", padding: "4px 6px", backgroundColor: "#000000" }}>
                    {goalOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
                <input type="number" min="1" value={weeklyGoalTarget} onChange={e => setWeeklyGoalTarget(Math.max(1, Number(e.target.value) || 1))} style={{ width: 58, background: light ? "rgba(0,0,0,0.02)" : "rgba(255,255,255,0.05)", border: `1px solid ${light ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.08)"}`, borderRadius: 6, padding: "4px 6px", fontSize: 9, color: tx, outline: "none", fontFamily: "'JetBrains Mono'" }} />
            </div>
            <div style={{ marginTop: 8, fontSize: 9, color: txm, fontFamily: "'JetBrains Mono'" }}>{weeklyGoalLabel}</div>
            <div style={{ marginTop: 12, height: 8, borderRadius: 999, background: light ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                <div style={{ width: `${progress * 100}%`, height: "100%", borderRadius: 999, background: "linear-gradient(90deg,#f59e0b,#fbbf24)", transition: "width 0.3s ease" }} />
            </div>
            <div style={{ marginTop: 10, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <div style={{ fontSize: 10, color: tx }}>{weeklyGoalHelper}</div>
                <div style={{ fontSize: 9, color: txm, fontFamily: "'JetBrains Mono'" }}>{Math.round(progress * 100)}%</div>
            </div>
            <div style={{ marginTop: 12, padding: "8px 10px", borderRadius: 8, background: light ? "rgba(245,158,11,0.08)" : "rgba(245,158,11,0.10)", border: "1px solid rgba(245,158,11,0.18)", fontSize: 10, color: tx, lineHeight: 1.45 }}>
                {progress >= 1 ? `Nice work — your ${weeklyGoalLabel.toLowerCase()} target is complete.` : `Complete ${remaining} more to hit your ${weeklyGoalLabel.toLowerCase()} goal.`}
            </div>
        </Panel>
    );
}



function TypingDots() { return <div style={{ display: "flex", gap: 3, padding: "8px 12px", alignSelf: "flex-start" }}>{[0, 1, 2].map(i => <div key={i} style={{ width: 5, height: 5, borderRadius: "50%", background: "rgba(255,255,255,0.3)", animation: `bk 1.2s ${i * .15}s infinite ease-in-out` }} />)}</div>; }

// ═══════════════════════════════════════════════════
// WEATHER WIDGET  (Open-Meteo — free, no API key)
// ═══════════════════════════════════════════════════
const WMO_CODES = {
    0: ["☀️", "Clear sky"], 1: ["🌤️", "Mainly clear"], 2: ["⛅", "Partly cloudy"], 3: ["☁️", "Overcast"],
    45: ["🌫️", "Fog"], 48: ["🌫️", "Icy fog"],
    51: ["🌦️", "Light drizzle"], 53: ["🌦️", "Drizzle"], 55: ["🌦️", "Heavy drizzle"],
    61: ["🌧️", "Light rain"], 63: ["🌧️", "Rain"], 65: ["🌧️", "Heavy rain"],
    71: ["🌨️", "Light snow"], 73: ["🌨️", "Snow"], 75: ["❄️", "Heavy snow"], 77: ["❄️", "Snow grains"],
    80: ["🌦️", "Light showers"], 81: ["🌧️", "Showers"], 82: ["🌧️", "Heavy showers"],
    85: ["🌨️", "Snow showers"], 86: ["❄️", "Heavy snow showers"],
    95: ["⛈️", "Thunderstorm"], 96: ["⛈️", "Thunderstorm"], 99: ["⛈️", "Thunderstorm"],
};

function WeatherWidget({ light, accent, ambient, onClose }) {
    const [query, setQuery] = useState("Dublin");
    const [editing, setEditing] = useState(false);
    const [suggestions, setSuggestions] = useState([]);
    const [selected, setSelected] = useState(null); // { latitude, longitude, name, country_code }
    const [weather, setWeather] = useState(null);
    const [fetching, setFetching] = useState(false);
    const [err, setErr] = useState(null);
    const inputRef = useRef(null);
    const tx = light ? "#2d3436" : "#fff";
    const txm = light ? "rgba(45,52,54,0.5)" : "rgba(255,255,255,0.45)";
    const panelBg = light ? "rgba(255,255,255,0.92)" : "rgba(15,15,28,0.92)";
    const borderCol = light ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.08)";

    // Fetch suggestions as user types
    useEffect(() => {
        if (!editing || !query.trim()) { setSuggestions([]); return; }
        const ctrl = new AbortController();
        const t = setTimeout(async () => {
            try {
                const geo = await fetch(
                    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query.trim())}&count=5&language=en&format=json`,
                    { signal: ctrl.signal }
                ).then(r => r.json());
                setSuggestions(geo.results ?? []);
            } catch { /* ignore abort */ }
        }, 350);
        return () => { clearTimeout(t); ctrl.abort(); };
    }, [query, editing]);

    // Fetch weather for the selected location
    useEffect(() => {
        if (!selected) return;
        const ctrl = new AbortController();
        setFetching(true); setErr(null);
        fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${selected.latitude}&longitude=${selected.longitude}&current=temperature_2m,apparent_temperature,weathercode,wind_speed_10m,relative_humidity_2m&wind_speed_unit=kmh`,
            { signal: ctrl.signal }
        ).then(r => { if (!r.ok) throw new Error(`Weather API error: ${r.status}`); return r.json(); }).then(wx => {
            setWeather({ ...wx.current, name: selected.name, country_code: selected.country_code });
            setFetching(false);
        }).catch(e => {
            if (e.name !== "AbortError") { setErr("Couldn't reach weather service"); setFetching(false); }
        });
        return () => ctrl.abort();
    }, [selected]);

    // Bootstrap on first render
    useEffect(() => {
        setSelected({ latitude: 53.3331, longitude: -6.2489, name: "Dublin", country_code: "IE" });
    }, []);

    function pickSuggestion(s) {
        setSelected(s);
        setQuery(s.name);
        setSuggestions([]);
        setEditing(false);
    }

    const [icon, desc] = weather ? (WMO_CODES[weather.weathercode] ?? ["🌡️", "Unknown"]) : ["🌡️", "—"];

    return (
        <Panel x={645} y={590} width={210} title="Weather" icon="🌤️" onClose={onClose} ambient={ambient} light={light} accent={accent}>
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>

                {/* City input + suggestions */}
                <div style={{ position: "relative" }} data-nodrag>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                        {editing ? (
                            <input
                                ref={inputRef}
                                value={query}
                                onChange={e => setQuery(e.target.value)}
                                onBlur={() => setTimeout(() => { setSuggestions([]); setEditing(false); }, 150)}
                                onKeyDown={e => {
                                    if (e.key === "Escape") { setQuery(weather?.name ?? query); setSuggestions([]); setEditing(false); }
                                    if (e.key === "Enter" && suggestions.length) pickSuggestion(suggestions[0]);
                                }}
                                autoFocus
                                style={{
                                    fontFamily: "'JetBrains Mono'", fontSize: 9, letterSpacing: 1.5,
                                    textTransform: "uppercase", color: accent, background: "transparent",
                                    border: "none", borderBottom: `1px solid ${accent}55`, outline: "none",
                                    width: "100%", paddingBottom: 2,
                                }}
                            />
                        ) : (
                            <button
                                onClick={() => { setEditing(true); setTimeout(() => inputRef.current?.select(), 10); }}
                                style={{
                                    fontFamily: "'JetBrains Mono'", fontSize: 9, letterSpacing: 1.5,
                                    textTransform: "uppercase", color: accent, background: "none",
                                    border: "none", cursor: "text", padding: 0, textAlign: "left",
                                }}
                            >
                                {weather?.name ?? query}
                            </button>
                        )}
                        {weather && <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 8, color: txm, letterSpacing: 1, flexShrink: 0 }}>{weather.country_code?.toUpperCase()}</span>}
                    </div>

                    {/* Suggestions dropdown */}
                    {suggestions.length > 0 && (
                        <div style={{
                            position: "absolute", top: "100%", left: 0, right: 0, zIndex: 999, marginTop: 4,
                            background: panelBg, border: `1px solid ${borderCol}`,
                            borderRadius: 8, overflow: "hidden",
                            boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
                        }}>
                            {suggestions.map(s => (
                                <button
                                    key={s.id}
                                    onMouseDown={() => pickSuggestion(s)}
                                    style={{
                                        display: "block", width: "100%", textAlign: "left",
                                        padding: "7px 10px", background: "none", border: "none",
                                        cursor: "pointer", borderBottom: `1px solid ${borderCol}`,
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.background = `${accent}18`}
                                    onMouseLeave={e => e.currentTarget.style.background = "none"}
                                >
                                    <div style={{ fontSize: 11, color: tx, fontWeight: 500 }}>{s.name}</div>
                                    <div style={{ fontSize: 9, color: txm, fontFamily: "'JetBrains Mono'", marginTop: 1 }}>
                                        {[s.admin1, s.country].filter(Boolean).join(", ")}
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {fetching && <div style={{ fontSize: 11, color: txm, fontFamily: "'JetBrains Mono'" }}>Fetching…</div>}
                {err && <div style={{ fontSize: 11, color: "#e17055" }}>{err}</div>}

                {weather && !fetching && <>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <span style={{ fontSize: 34, lineHeight: 1 }}>{icon}</span>
                        <div>
                            <div style={{ fontSize: 28, fontWeight: 700, color: tx, lineHeight: 1, fontFamily: "'JetBrains Mono'" }}>{Math.round(weather.temperature_2m)}°</div>
                            <div style={{ fontSize: 9.5, color: txm, marginTop: 3 }}>Feels like {Math.round(weather.apparent_temperature)}°</div>
                        </div>
                    </div>
                    <div style={{ fontSize: 11, color: tx }}>{desc}</div>
                    <div style={{ display: "flex", gap: 12 }}>
                        <span style={{ fontSize: 9, fontFamily: "'JetBrains Mono'", color: txm }}>💧 {weather.relative_humidity_2m}%</span>
                        <span style={{ fontSize: 9, fontFamily: "'JetBrains Mono'", color: txm }}>💨 {Math.round(weather.wind_speed_10m)} km/h</span>
                    </div>
                </>}

                <div style={{ fontSize: 7.5, color: txm, fontFamily: "'JetBrains Mono'", letterSpacing: 0.5, opacity: 0.7 }}>
                    Tap city to search · Open-Meteo
                </div>
            </div>
        </Panel>
    );
}

// ═══════════════════════════════════════════════════
// TCD SEARCH & PARSER
// ═══════════════════════════════════════════════════
async function searchTCDCourse(courseName) {
    const res = await fetch("/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: courseName }),
    });
    if (!res.ok) throw new Error(`Search server returned ${res.status} — is it running?`);
    return res.json();
}

async function searchTCDDirect(url) {
    const res = await fetch("/search/tcd-direct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
    });
    if (!res.ok) throw new Error(`Search server returned ${res.status}`);
    return res.json();
}

// ═══════════════════════════════════════════════════
// TCD MODULES PANEL
// ═══════════════════════════════════════════════════
function TCDModulesPanel({ modules, tcdDegree, onSetDegree, onAddModule, onRemoveModule, accent, light, onClose, ambient }) {
    const [searching, setSearching] = useState(false);
    const [searchStep, setSearchStep] = useState("");
    const [searchQuery, setSearchQuery] = useState(tcdDegree?.name || "");
    // urlResults: list of candidate URLs from DDG search
    const [urlResults, setUrlResults] = useState(null);
    // moduleResults: parsed modules from a chosen/direct URL
    const [moduleResults, setModuleResults] = useState(null);
    const [directUrl, setDirectUrl] = useState("");
    const [showDirectMode, setShowDirectMode] = useState(false);
    const [warnAcked, setWarnAcked] = useState(() => sessionStorage.getItem("tcd_search_acked") === "1");
    const [showWarn, setShowWarn] = useState(false);
    const [pendingAction, setPendingAction] = useState(null);
    const [addForm, setAddForm] = useState(false);
    const [formCode, setFormCode] = useState(""), [formName, setFormName] = useState("");
    const [formCredits, setFormCredits] = useState("5"), [formSemester, setFormSemester] = useState("michaelmas"), [formType, setFormType] = useState("lecture");

    const txm = light ? "rgba(45,52,54,0.5)" : "rgba(255,255,255,0.45)";
    const tx = light ? "#2d3436" : "#fff";
    const bd = light ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.08)";
    const totalCredits = modules.reduce((s, m) => s + (m.credits || 5), 0);
    const semGroups = {};
    modules.forEach(m => { const s = m.semester || "michaelmas"; if (!semGroups[s]) semGroups[s] = []; semGroups[s].push(m); });

    // Stage 1: search DDG → get candidate URLs
    const runSearch = async () => {
        if (!searchQuery.trim()) return;
        setShowWarn(false);
        setSearching(true);
        setSearchStep("Searching portal…");
        setModuleResults(null);
        try {
            const data = await searchTCDCourse(searchQuery);
            setUrlResults({ urls: data.urls || [], query: searchQuery });
            onSetDegree({ name: searchQuery, college: "Trinity College Dublin" });
        } catch (err) {
            setUrlResults({ urls: [], query: searchQuery, error: err.message });
        }
        setSearching(false);
        setSearchStep("");
    };

    // Stage 2: fetch modules from a chosen URL
    const runFetchUrl = async (url) => {
        setSearching(true);
        setSearchStep("Fetching page…");
        setUrlResults(null);
        try {
            const data = await searchTCDDirect(url);
            setModuleResults({ parsed: data.modules || [], url });
        } catch (err) {
            setModuleResults({ parsed: [], url, error: err.message });
        }
        setSearching(false);
        setSearchStep("");
    };

    // Direct URL paste (unchanged flow)
    const runDirect = async () => {
        if (!directUrl.trim()) return;
        setShowWarn(false);
        setSearching(true);
        setSearchStep("Fetching page…");
        try {
            const data = await searchTCDDirect(directUrl.trim());
            setModuleResults({ parsed: data.modules || [], url: directUrl.trim() });
        } catch (err) {
            setModuleResults({ parsed: [], url: directUrl.trim(), error: err.message });
        }
        setSearching(false);
        setSearchStep("");
    };

    const handleSearchClick = () => {
        if (!searchQuery.trim()) return;
        if (warnAcked) { runSearch(); return; }
        setPendingAction("search");
        setShowWarn(true);
    };

    const handleDirectClick = () => {
        if (!directUrl.trim()) return;
        if (warnAcked) { runDirect(); return; }
        setPendingAction("direct");
        setShowWarn(true);
    };

    const confirmSearch = () => {
        sessionStorage.setItem("tcd_search_acked", "1");
        setWarnAcked(true);
        const action = pendingAction;
        setPendingAction(null);
        if (action === "direct") runDirect(); else runSearch();
    };

    const addManual = () => {
        if (!formCode.trim() || !formName.trim()) return;
        onAddModule({ id: `m${Date.now()}`, code: formCode.trim().toUpperCase(), name: formName.trim(), credits: parseInt(formCredits) || 5, semester: formSemester, moduleType: formType, color: MODULE_COLORS[modules.length % MODULE_COLORS.length] });
        setFormCode(""); setFormName(""); setFormCredits("5"); setAddForm(false);
    };

    const importAll = () => {
        (moduleResults?.parsed || []).forEach((m, i) => onAddModule({ ...m, id: `m${Date.now()}${i}`, color: MODULE_COLORS[(modules.length + i) % MODULE_COLORS.length] }));
        setModuleResults(null);
    };

    const selStyle = { background: light ? "rgba(255,255,255,0.8)" : "rgba(30,30,50,0.8)", border: `1px solid ${bd}`, borderRadius: 4, padding: "2px 4px", fontSize: 9, color: tx, outline: "none", colorScheme: light ? "light" : "dark" };
    const inStyle = (extra) => ({ background: "transparent", border: `1px solid ${bd}`, borderRadius: 4, padding: "2px 6px", fontSize: 10, color: tx, outline: "none", fontFamily: "'DM Sans'", ...extra });

    return (
        <Panel x={650} y={320} width={380} title={`TCD Modules · ${modules.length} registered · ${totalCredits} ECTS`} icon="🎓" light={light} onClose={onClose} ambient={ambient} accent={accent}>
            {/* Degree search bar */}
            <div style={{ marginBottom: 8, padding: "8px 10px", borderRadius: 8, background: light ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.04)", border: `1px solid ${bd}` }}>
                {tcdDegree && <div style={{ fontSize: 8, fontFamily: "'JetBrains Mono'", color: accent, marginBottom: 5, letterSpacing: 1 }}>🎓 {tcdDegree.college} · {tcdDegree.name}</div>}
                {!showDirectMode ? (
                    <>
                        <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSearchClick()} placeholder="Search SCSS programmes…" data-nodrag
                                style={{ flex: 1, background: "transparent", border: "none", outline: "none", fontSize: 11, color: tx, fontFamily: "'DM Sans'", minWidth: 120 }} />
                            <button onClick={handleSearchClick} disabled={searching} style={{ padding: "3px 9px", borderRadius: 5, fontSize: 9, cursor: "pointer", fontFamily: "'JetBrains Mono'", background: `${accent}22`, border: `1px solid ${accent}44`, color: accent, opacity: searching ? 0.6 : 1 }}>
                                {searching ? searchStep || "…" : "Search"}
                            </button>
                        </div>
                        <div style={{ marginTop: 4, fontSize: 8, color: txm, fontFamily: "'JetBrains Mono'" }}>
                            Searches the SCSS teaching portal · <button onClick={() => setShowDirectMode(true)} style={{ fontSize: 8, background: "none", border: "none", cursor: "pointer", color: accent, fontFamily: "'JetBrains Mono'", textDecoration: "underline", padding: 0 }}>paste URL for any other course →</button>
                        </div>
                    </>
                ) : (
                    <>
                        <div style={{ fontSize: 8, color: txm, fontFamily: "'JetBrains Mono'", marginBottom: 4 }}>Paste a module listing page URL from any TCD department</div>
                        <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                            <input value={directUrl} onChange={e => setDirectUrl(e.target.value)} onKeyDown={e => e.key === "Enter" && handleDirectClick()} placeholder="https://…" data-nodrag
                                style={{ flex: 1, background: "transparent", border: `1px solid ${bd}`, borderRadius: 4, outline: "none", fontSize: 9, color: tx, fontFamily: "'DM Sans'", padding: "3px 6px" }} />
                            <button onClick={handleDirectClick} disabled={searching} style={{ padding: "3px 9px", borderRadius: 5, fontSize: 9, cursor: "pointer", fontFamily: "'JetBrains Mono'", background: `${accent}22`, border: `1px solid ${accent}44`, color: accent, opacity: searching ? 0.6 : 1 }}>
                                {searching ? searchStep || "…" : "Fetch"}
                            </button>
                        </div>
                        <div style={{ marginTop: 4, fontSize: 8, color: txm, fontFamily: "'JetBrains Mono'" }}>
                            e.g. <span style={{ cursor: "pointer", color: accent, textDecoration: "underline" }} onClick={() => setDirectUrl("https://teaching.scss.tcd.ie/general-information/scss-modules/")}>scss-modules</span>
                            {" · "}<button onClick={() => setShowDirectMode(false)} style={{ fontSize: 8, background: "none", border: "none", cursor: "pointer", color: txm, fontFamily: "'JetBrains Mono'", textDecoration: "underline", padding: 0 }}>back to search</button>
                        </div>
                    </>
                )}
            </div>

            {/* Privacy warning */}
            {showWarn && (
                <div className="anim-panel" style={{ marginBottom: 10, padding: "10px 12px", borderRadius: 8, background: light ? "rgba(253,203,110,0.15)" : "rgba(253,203,110,0.1)", border: "1px solid rgba(253,203,110,0.4)" }} data-nodrag>
                    <div style={{ fontSize: 10, fontWeight: 600, color: "#e67e22", marginBottom: 4, fontFamily: "'JetBrains Mono'" }}>⚠ External search</div>
                    <div style={{ fontSize: 10, color: tx, lineHeight: 1.5, marginBottom: 8 }}>
                        {pendingAction === "direct"
                            ? <>Fetching <strong>{directUrl.slice(0, 50)}{directUrl.length > 50 ? "…" : ""}</strong> will contact that server directly.</>
                            : <>Searching will fetch the <strong>SCSS teaching portal sitemap</strong> from teaching.scss.tcd.ie.</>
                        }
                        {" "}This is the <em>only</em> part of this dashboard that uses an internet connection — everything else runs on-device.
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={confirmSearch} style={{ flex: 1, padding: "4px", borderRadius: 5, fontSize: 9, cursor: "pointer", background: `${accent}22`, border: `1px solid ${accent}55`, color: accent, fontFamily: "'JetBrains Mono'" }}>Proceed</button>
                        <button onClick={() => { setShowWarn(false); setPendingAction(null); }} style={{ padding: "4px 10px", borderRadius: 5, fontSize: 9, cursor: "pointer", background: "transparent", border: `1px solid ${bd}`, color: txm, fontFamily: "'JetBrains Mono'" }}>Cancel</button>
                    </div>
                </div>
            )}

            {/* Stage 1: URL candidates from DDG */}
            {urlResults && (
                <div className="anim-panel" style={{ marginBottom: 10, padding: 8, borderRadius: 8, background: light ? "rgba(0,0,0,0.02)" : "rgba(255,255,255,0.03)", border: `1px solid ${accent}33` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <span style={{ fontSize: 9, fontFamily: "'JetBrains Mono'", color: accent }}>
                            {urlResults.urls.length > 0 ? `${urlResults.urls.length} pages found — pick the right one` : "No TCD pages found"}
                        </span>
                        <button onClick={() => setUrlResults(null)} style={{ padding: "2px 6px", borderRadius: 4, fontSize: 8, cursor: "pointer", background: "transparent", border: `1px solid ${bd}`, color: txm, fontFamily: "'JetBrains Mono'" }}>×</button>
                    </div>
                    {urlResults.error && <div style={{ fontSize: 9, color: "#e74c3c", marginBottom: 4 }}>{urlResults.error}</div>}
                    {urlResults.urls.length === 0 && !urlResults.error && (
                        <div style={{ fontSize: 10, color: txm, lineHeight: 1.5 }}>
                            No match in the SCSS portal. For other TCD courses (Philosophy, Law, Business, etc.) find your department's module listing page and use <span style={{ color: accent, cursor: "pointer", textDecoration: "underline" }} onClick={() => { setUrlResults(null); setShowDirectMode(true); }}>paste URL</span>.
                        </div>
                    )}
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {urlResults.urls.map((r, i) => (
                            <div key={i} style={{ padding: "5px 7px", borderRadius: 6, background: light ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.04)", border: `1px solid ${bd}` }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 6 }}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 10, color: tx, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title}</div>
                                        <div style={{ fontSize: 8, color: txm, fontFamily: "'JetBrains Mono'", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 1 }}>{r.url.replace(/^https?:\/\//, "")}</div>
                                    </div>
                                    <button onClick={() => runFetchUrl(r.url)} style={{ flexShrink: 0, padding: "3px 8px", borderRadius: 4, fontSize: 9, cursor: "pointer", background: `${accent}22`, border: `1px solid ${accent}44`, color: accent, fontFamily: "'JetBrains Mono'" }}>
                                        Load →
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Stage 2: modules from chosen URL */}
            {moduleResults?.error && <div style={{ marginBottom: 8, padding: "6px 8px", borderRadius: 6, background: "rgba(231,76,60,0.08)", border: "1px solid rgba(231,76,60,0.2)", fontSize: 10, color: "#e74c3c" }}>Failed: {moduleResults.error}</div>}
            {moduleResults && !moduleResults.error && (() => {
                const coreMods = moduleResults.parsed.filter(m => m.category === 'core');
                const electiveMods = moduleResults.parsed.filter(m => m.category === 'elective');
                const uncategorised = moduleResults.parsed.filter(m => !m.category);
                const addGroup = (group, offset = 0) => group.forEach((m, i) =>
                    onAddModule({ ...m, id: `m${Date.now()}${offset+i}`, color: MODULE_COLORS[(modules.length + offset + i) % MODULE_COLORS.length] })
                );
                const ModRow = ({ m, i, globalIdx }) => (
                    <div style={{ display: "flex", gap: 5, alignItems: "center", padding: "2px 0" }}>
                        <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 9, fontWeight: 600, color: TCD_SEMESTER_COLORS[m.semester] || accent, minWidth: 60 }}>{m.code}</span>
                        <span style={{ flex: 1, fontSize: 10, color: tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</span>
                        <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 8, color: txm }}>{m.credits}cr</span>
                        <button onClick={() => onAddModule({ ...m, id: `m${Date.now()}${globalIdx}`, color: MODULE_COLORS[(modules.length + globalIdx) % MODULE_COLORS.length] })}
                            style={{ padding: "1px 6px", borderRadius: 3, fontSize: 9, cursor: "pointer", background: `${accent}22`, border: `1px solid ${accent}44`, color: accent, lineHeight: 1 }}>+</button>
                    </div>
                );
                const SectionHeader = ({ label, count, onAddAll }) => (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6, marginBottom: 2 }}>
                        <span style={{ fontSize: 8, fontFamily: "'JetBrains Mono'", letterSpacing: 1, textTransform: "uppercase", color: label === "Core" ? accent : txm }}>{label} · {count}</span>
                        {onAddAll && <button onClick={onAddAll} style={{ padding: "1px 7px", borderRadius: 3, fontSize: 8, cursor: "pointer", background: `${accent}22`, border: `1px solid ${accent}44`, color: accent, fontFamily: "'JetBrains Mono'" }}>Add all {label.toLowerCase()}</button>}
                    </div>
                );
                return (
                    <div className="anim-panel" style={{ marginBottom: 10, padding: 8, borderRadius: 8, background: light ? "rgba(0,0,0,0.02)" : "rgba(255,255,255,0.03)", border: `1px solid ${accent}33` }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                            <span style={{ fontSize: 9, fontFamily: "'JetBrains Mono'", color: accent }}>
                                {moduleResults.parsed.length > 0 ? `${moduleResults.parsed.length} modules` : "No modules found"}
                                {coreMods.length > 0 && <span style={{ color: txm }}> · {coreMods.length} core</span>}
                            </span>
                            <div style={{ display: "flex", gap: 4 }}>
                                {moduleResults.parsed.length > 0 && <button onClick={importAll} style={{ padding: "2px 7px", borderRadius: 4, fontSize: 8, cursor: "pointer", background: `${accent}22`, border: `1px solid ${accent}44`, color: accent, fontFamily: "'JetBrains Mono'" }}>All</button>}
                                <button onClick={() => setModuleResults(null)} style={{ padding: "2px 6px", borderRadius: 4, fontSize: 8, cursor: "pointer", background: "transparent", border: `1px solid ${bd}`, color: txm, fontFamily: "'JetBrains Mono'" }}>×</button>
                            </div>
                        </div>
                        <div style={{ fontSize: 8, color: txm, fontFamily: "'JetBrains Mono'", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            ✓ {moduleResults.url.replace(/^https?:\/\//, "")}
                        </div>
                        {moduleResults.parsed.length === 0 && <div style={{ fontSize: 10, color: txm, fontStyle: "italic" }}>No module codes found on this page.</div>}
                        <div style={{ maxHeight: 180, overflowY: "auto" }}>
                            {coreMods.length > 0 && <><SectionHeader label="Core" count={coreMods.length} onAddAll={() => { addGroup(coreMods); setModuleResults(null); }} />{coreMods.map((m, i) => <ModRow key={m.code} m={m} i={i} globalIdx={i} />)}</>}
                            {electiveMods.length > 0 && <><SectionHeader label="Electives" count={electiveMods.length} onAddAll={() => { addGroup(electiveMods, coreMods.length); setModuleResults(null); }} />{electiveMods.map((m, i) => <ModRow key={m.code} m={m} i={i} globalIdx={coreMods.length + i} />)}</>}
                            {uncategorised.length > 0 && <>{uncategorised.length > 0 && (coreMods.length + electiveMods.length > 0) && <SectionHeader label="Other" count={uncategorised.length} onAddAll={null} />}{uncategorised.map((m, i) => <ModRow key={m.code} m={m} i={i} globalIdx={coreMods.length + electiveMods.length + i} />)}</>}
                        </div>
                    </div>
                );
            })()}

            {/* Module list grouped by semester */}
            {modules.length === 0 && !urlResults && !moduleResults && !showWarn && <div style={{ fontSize: 11, color: txm, fontStyle: "italic", textAlign: "center", padding: "10px 0" }}>Search your TCD course above or add modules manually</div>}
            {["michaelmas", "hilary", "trinity", "yearlong"].filter(s => semGroups[s]?.length > 0).map(sem => (
                <div key={sem} style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 8, fontFamily: "'JetBrains Mono'", letterSpacing: 1.5, textTransform: "uppercase", color: TCD_SEMESTER_COLORS[sem], marginBottom: 4 }}>{TCD_SEMESTERS[sem]}</div>
                    {semGroups[sem].map(m => (
                        <div key={m.id} className="anim-item" style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 0", borderBottom: `1px solid ${bd}` }}>
                            <div style={{ width: 3, height: 30, borderRadius: 2, background: m.color || TCD_SEMESTER_COLORS[sem], flexShrink: 0 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                                    <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 9, fontWeight: 600, color: m.color || accent, flexShrink: 0 }}>{m.code}</span>
                                    <span style={{ fontSize: 10, color: tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</span>
                                </div>
                                <div style={{ display: "flex", gap: 5, marginTop: 1 }}>
                                    <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 8, color: txm }}>{m.credits} ECTS</span>
                                    <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 8, color: txm }}>· {m.moduleType || "lecture"}</span>
                                    {m.deadline && <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 8, color: "#e74c3c" }}>⚡ {m.deadline}</span>}
                                </div>
                            </div>
                            <button onClick={() => onRemoveModule(m.id)} style={{ fontSize: 12, background: "none", border: "none", cursor: "pointer", color: txm, opacity: 0.4, padding: "0 2px", flexShrink: 0 }}>×</button>
                        </div>
                    ))}
                </div>
            ))}

            {/* Manual add form */}
            {addForm ? (
                <div className="anim-panel" style={{ padding: 8, borderRadius: 8, background: light ? "rgba(0,0,0,0.02)" : "rgba(255,255,255,0.03)", border: `1px solid ${bd}` }} data-nodrag>
                    <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
                        <input value={formCode} onChange={e => setFormCode(e.target.value)} placeholder="Code (CS3012)" data-nodrag style={inStyle({ width: 90, fontFamily: "'JetBrains Mono'", fontSize: 9 })} />
                        <input value={formName} onChange={e => setFormName(e.target.value)} placeholder="Module name" data-nodrag style={inStyle({ flex: 1 })} />
                    </div>
                    <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
                        <input value={formCredits} onChange={e => setFormCredits(e.target.value)} placeholder="ECTS" data-nodrag style={inStyle({ width: 50, fontFamily: "'JetBrains Mono'", fontSize: 9 })} />
                        <select value={formSemester} onChange={e => setFormSemester(e.target.value)} data-nodrag style={{ ...selStyle, flex: 1 }}>
                            <option value="michaelmas">Michaelmas</option><option value="hilary">Hilary</option>
                            <option value="trinity">Trinity Term</option><option value="yearlong">Year-Long</option>
                        </select>
                        <select value={formType} onChange={e => setFormType(e.target.value)} data-nodrag style={{ ...selStyle, flex: 1 }}>
                            <option value="lecture">Lecture</option><option value="tutorial">Tutorial</option>
                            <option value="lab">Lab</option><option value="seminar">Seminar</option>
                        </select>
                    </div>
                    <div style={{ display: "flex", gap: 4 }}>
                        <button onClick={addManual} style={{ flex: 1, padding: "3px", borderRadius: 4, fontSize: 9, cursor: "pointer", background: `${accent}22`, border: `1px solid ${accent}44`, color: accent, fontFamily: "'JetBrains Mono'" }}>Add module</button>
                        <button onClick={() => setAddForm(false)} style={{ padding: "3px 9px", borderRadius: 4, fontSize: 9, cursor: "pointer", background: "transparent", border: `1px solid ${bd}`, color: txm, fontFamily: "'JetBrains Mono'" }}>Cancel</button>
                    </div>
                </div>
            ) : (
                <button onClick={() => setAddForm(true)} style={{ marginTop: 4, width: "100%", padding: "5px", borderRadius: 6, fontSize: 9, cursor: "pointer", background: "transparent", border: `1px dashed ${bd}`, color: txm, fontFamily: "'JetBrains Mono'" }}>+ Add module manually</button>
            )}
        </Panel>
    );
}

// ═══════════════════════════════════════════════════
// TIMETABLE PANEL
// ═══════════════════════════════════════════════════
function TimetablePanel({ modules, timetable, onAddSlot, onRemoveSlot, accent, light, onClose, ambient }) {
    const [addForm, setAddForm] = useState(false);
    const [formModule, setFormModule] = useState(modules[0]?.code || "");
    const [formDay, setFormDay] = useState("monday");
    const [formStart, setFormStart] = useState("09:00");
    const [formEnd, setFormEnd] = useState("10:00");
    const [formType, setFormType] = useState("lecture");
    const [formRoom, setFormRoom] = useState("");

    const txm = light ? "rgba(45,52,54,0.5)" : "rgba(255,255,255,0.45)";
    const tx = light ? "#2d3436" : "#fff";
    const bd = light ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.08)";
    const TYPE_LABELS = { lecture: "L", tutorial: "T", lab: "Lab", seminar: "S" };
    const moduleColorMap = {};
    modules.forEach(m => { moduleColorMap[m.code] = m.color || accent; });

    // Compute the range of hours to display (min start → max end, clamped to 08–20)
    const usedHourNums = timetable.flatMap(s => [parseInt(s.startTime), parseInt(s.endTime || s.startTime)]);
    const minH = usedHourNums.length ? Math.max(8, Math.min(...usedHourNums)) : 9;
    const maxH = usedHourNums.length ? Math.min(20, Math.max(...usedHourNums)) : 18;
    const displayHours = TIMETABLE_HOURS.filter(h => { const n = parseInt(h); return n >= minH && n <= maxH; });

    const getSlots = (day, hour) => timetable.filter(s => s.day === day && s.startTime === hour);

    const addSlot = () => {
        if (!formModule) return;
        onAddSlot({ id: `s${Date.now()}`, moduleCode: formModule, day: formDay, startTime: formStart, endTime: formEnd, slotType: formType, room: formRoom });
        setAddForm(false); setFormRoom("");
    };

    const selStyle = { background: light ? "rgba(255,255,255,0.8)" : "rgba(30,30,50,0.8)", border: `1px solid ${bd}`, borderRadius: 4, padding: "2px 4px", fontSize: 9, color: tx, outline: "none", colorScheme: light ? "light" : "dark" };

    return (
        <Panel x={24} y={500} width={520} title="Timetable" icon="📆" light={light} onClose={onClose} ambient={ambient} accent={accent}>
            {timetable.length === 0 && !addForm && <div style={{ fontSize: 11, color: txm, fontStyle: "italic", textAlign: "center", padding: "8px 0 4px" }}>No classes yet — add a slot below</div>}
            {/* Grid */}
            {timetable.length > 0 && (
                <div style={{ overflowX: "auto", marginBottom: 8 }}>
                    <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 9, tableLayout: "fixed" }}>
                        <thead>
                            <tr>
                                <th style={{ width: 38, padding: "2px 3px", color: txm, fontWeight: 400, textAlign: "left", fontFamily: "'JetBrains Mono'" }}></th>
                                {WEEK_DAY_LABELS.map((d, i) => <th key={i} style={{ padding: "2px 3px", color: txm, fontWeight: 500, textAlign: "center", fontFamily: "'JetBrains Mono'", fontSize: 9 }}>{d}</th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {displayHours.map(hour => (
                                <tr key={hour}>
                                    <td style={{ padding: "1px 3px", color: txm, fontFamily: "'JetBrains Mono'", fontSize: 8, verticalAlign: "top", whiteSpace: "nowrap" }}>{hour}</td>
                                    {WEEK_DAYS.map(day => {
                                        const slots = getSlots(day, hour);
                                        return (
                                            <td key={day} style={{ padding: "1px 2px", verticalAlign: "top", borderLeft: `1px solid ${bd}`, borderTop: `1px solid ${bd}`, minWidth: 72, minHeight: 18 }}>
                                                {slots.map(s => (
                                                    <div key={s.id} style={{ background: `${moduleColorMap[s.moduleCode] || accent}22`, border: `1px solid ${moduleColorMap[s.moduleCode] || accent}44`, borderRadius: 3, padding: "1px 3px", marginBottom: 1, display: "flex", gap: 2, alignItems: "center" }}>
                                                        <span style={{ color: moduleColorMap[s.moduleCode] || accent, fontWeight: 700, fontSize: 8, fontFamily: "'JetBrains Mono'" }}>{s.moduleCode}</span>
                                                        <span style={{ color: txm, fontSize: 7 }}>{TYPE_LABELS[s.slotType] || s.slotType}</span>
                                                        {s.room && <span style={{ color: txm, fontSize: 7, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{s.room}</span>}
                                                        <button onClick={() => onRemoveSlot(s.id)} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: txm, fontSize: 9, lineHeight: 1, padding: 0, opacity: 0.4, flexShrink: 0 }}>×</button>
                                                    </div>
                                                ))}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            {/* Add slot */}
            {addForm ? (
                <div className="anim-panel" style={{ padding: 8, borderRadius: 8, background: light ? "rgba(0,0,0,0.02)" : "rgba(255,255,255,0.03)", border: `1px solid ${bd}` }} data-nodrag>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 4 }}>
                        <select value={formModule} onChange={e => setFormModule(e.target.value)} data-nodrag style={selStyle}>
                            {modules.length === 0 ? <option value="">Add modules first</option> : modules.map(m => <option key={m.id} value={m.code}>{m.code} — {m.name.slice(0, 28)}</option>)}
                        </select>
                        <select value={formDay} onChange={e => setFormDay(e.target.value)} data-nodrag style={selStyle}>
                            {WEEK_DAYS.map(d => <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>)}
                        </select>
                        <select value={formType} onChange={e => setFormType(e.target.value)} data-nodrag style={selStyle}>
                            <option value="lecture">Lecture</option><option value="tutorial">Tutorial</option>
                            <option value="lab">Lab</option><option value="seminar">Seminar</option>
                        </select>
                    </div>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
                        <input type="time" value={formStart} onChange={e => setFormStart(e.target.value)} data-nodrag style={{ width: 82, background: "transparent", border: `1px solid ${bd}`, borderRadius: 4, padding: "2px 4px", fontSize: 9, color: tx, fontFamily: "'JetBrains Mono'", outline: "none", colorScheme: light ? "light" : "dark" }} />
                        <span style={{ color: txm, fontSize: 10 }}>→</span>
                        <input type="time" value={formEnd} onChange={e => setFormEnd(e.target.value)} data-nodrag style={{ width: 82, background: "transparent", border: `1px solid ${bd}`, borderRadius: 4, padding: "2px 4px", fontSize: 9, color: tx, fontFamily: "'JetBrains Mono'", outline: "none", colorScheme: light ? "light" : "dark" }} />
                        <input value={formRoom} onChange={e => setFormRoom(e.target.value)} placeholder="Room (optional)" data-nodrag style={{ flex: 1, background: "transparent", border: `1px solid ${bd}`, borderRadius: 4, padding: "2px 6px", fontSize: 9, color: tx, outline: "none", minWidth: 70 }} />
                        <button onClick={addSlot} disabled={!formModule} style={{ padding: "2px 9px", borderRadius: 4, fontSize: 9, cursor: "pointer", background: `${accent}22`, border: `1px solid ${accent}44`, color: accent, fontFamily: "'JetBrains Mono'" }}>Add</button>
                        <button onClick={() => setAddForm(false)} style={{ padding: "2px 7px", borderRadius: 4, fontSize: 9, cursor: "pointer", background: "transparent", border: `1px solid ${bd}`, color: txm, fontFamily: "'JetBrains Mono'" }}>×</button>
                    </div>
                </div>
            ) : (
                <button onClick={() => { setFormModule(modules[0]?.code || ""); setAddForm(true); }} style={{ marginTop: 2, width: "100%", padding: "5px", borderRadius: 6, fontSize: 9, cursor: "pointer", background: "transparent", border: `1px dashed ${bd}`, color: txm, fontFamily: "'JetBrains Mono'" }}>+ Add class slot</button>
            )}
        </Panel>
    );
}

// ═══════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════
export default function App() {
    const [bg, setBg] = useState("linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 50%, #16213e 100%)");
    const [greeting, setGreeting] = useState("Plan your week, not just your tasks.");
    const [accent, setAccent] = useState("#00cec9");
    const [ambient, setAmbient] = useState({ ...DEFAULT_AMBIENT });
    const [showTasks, setShowTasks] = useState(true), [showCal, setShowCal] = useState(true), [showBudget, setShowBudget] = useState(true), [showRewards, setShowRewards] = useState(true), [showWeather, setShowWeather] = useState(true);
    const [showTCDModules, setShowTCDModules] = useState(false), [showTimetable, setShowTimetable] = useState(false);
    // TCD state — persisted to localStorage
    const [modules, setModules] = useState(() => { try { return JSON.parse(localStorage.getItem("tcd_modules") || "[]"); } catch { return []; } });
    const [timetable, setTimetable] = useState(() => { try { return JSON.parse(localStorage.getItem("tcd_timetable") || "[]"); } catch { return []; } });
    const [tcdDegree, setTcdDegree] = useState(() => { try { return JSON.parse(localStorage.getItem("tcd_degree") || "null"); } catch { return null; } });
    useEffect(() => { localStorage.setItem("tcd_modules", JSON.stringify(modules)); }, [modules]);
    useEffect(() => { localStorage.setItem("tcd_timetable", JSON.stringify(timetable)); }, [timetable]);
    useEffect(() => { localStorage.setItem("tcd_degree", JSON.stringify(tcdDegree)); }, [tcdDegree]);
    const [postits, setPostits] = useState([]);
    const [showPostitLibrary, setShowPostitLibrary] = useState(false);
    const [selectedPostitId, setSelectedPostitId] = useState(null);
    const [tasks, setTasks] = useState([
        { id: "t1", text: "Finish adaptive apps UI polish 🎨", priority: "high", done: false },
        { id: "t2", text: "Review CS deadline list 📚", priority: "medium", done: false },
        { id: "t3", text: "Plan study blocks for the week 🗓️", priority: "low", done: false },
    ]);
    const [timers, setTimers] = useState([]), [widgets, setWidgets] = useState([]);
    const [events, setEvents] = useState([
        { id: "e1", title: "Lecture block 📚", date: toLocalDateStr(new Date()), time: "10:00", duration: 60, color: "#6c5ce7" },
        { id: "e2", title: "Team checkpoint 👥", date: (() => { const d = new Date(); d.setDate(d.getDate() + 1); return toLocalDateStr(d); })(), time: "15:00", duration: 45, color: "#00cec9" },
    ]);
    const [expenses, setExpenses] = useState([
        { id: "x1", description: "Coffee ☕", amount: 4.50, category: "food", date: toLocalDateStr(new Date()) },
        { id: "x2", description: "Bus fare 🚍", amount: 20, category: "transport", date: (() => { const d = new Date(); d.setDate(d.getDate() - 1); return toLocalDateStr(d); })() },
        { id: "x3", description: "Library lunch 🥪", amount: 8.90, category: "food", date: (() => { const d = new Date(); d.setDate(d.getDate() - 2); return toLocalDateStr(d); })() }
    ]);
    const [budget, setBudgetVal] = useState(500);
    const [weeklyGoalCategory, setWeeklyGoalCategory] = useState("tasks");
    const [weeklyGoalTarget, setWeeklyGoalTarget] = useState(5);
    const [input, setInput] = useState(""), [loading, setLoading] = useState(false);
    const [lennyMood, setLennyMood] = useState("neutral");
    const [msgs, setMsgs] = useState([{ role: "assistant", text: `Ready! (${LLM_CONFIG.mode === "local" ? "local LLM" : "API"})\n\n• "make it cozy"\n• "check off documentation"\n• "meeting this friday 2pm"\n• "I spent €12 on lunch"\n• "focus mode"` }]);

    const scrollRef = useRef(null), inputRef = useRef(null), idRef = useRef(300), ambientTimerRef = useRef(null);
    const headerRef = useRef(null);
    const [headerLockY, setHeaderLockY] = useState(0);
    useEffect(() => {
        if (!headerRef.current) return;
        const ro = new ResizeObserver(entries => setHeaderLockY(entries[0].contentRect.height + 8));
        ro.observe(headerRef.current);
        return () => ro.disconnect();
    }, []);
    const gid = () => `i${idRef.current++}`;
    useEffect(() => { scrollRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, loading]);
    useEffect(() => {
        if (showPostitLibrary && !selectedPostitId && postits.length) setSelectedPostitId(postits[0].id);
        if (!postits.length && selectedPostitId) setSelectedPostitId(null);
    }, [showPostitLibrary, postits, selectedPostitId]);

    const themes = {
        cozy: { bg: "linear-gradient(135deg, #2d1b14 0%, #1a1410 50%, #0d0a07 100%)", accent: "#e17055" },
        focus: { bg: "#0a0a12", accent: "#636e72" }, ocean: { bg: "linear-gradient(135deg, #0c1829 0%, #0a2a3f 40%, #134e5e 100%)", accent: "#00cec9" },
        sunset: { bg: "linear-gradient(135deg, #1a0a2e 0%, #3d1c56 30%, #c0392b 70%, #e67e22 100%)", accent: "#e67e22" },
        forest: { bg: "linear-gradient(135deg, #0a1a0a 0%, #1a2f1a 50%, #0d1f0d 100%)", accent: "#00b894" },
        midnight: { bg: "linear-gradient(135deg, #020111 0%, #0a0a2e 50%, #060620 100%)", accent: "#6c5ce7" },
        minimal: { bg: "#f5f0eb", accent: "#2d3436" },
    };

    const snap = () => ({
        tasks: tasks.slice(0, 10).map(t => t.text + (t.done ? " ✓" : "")),
        events: events.slice(0, 5).map(e => `${e.title} ${e.date}`),
        notes: postits.slice(0, 6).map(n => n.content),
        budget: `${expenses.reduce((s, e) => s + e.amount, 0).toFixed(0)}/${budget}`,
        mood: ambient.mood,
        modules: modules.slice(0, 10).map(m => `${m.code} ${m.name} (${m.semester})`),
        tcdDegree: tcdDegree ? `${tcdDegree.name}, ${tcdDegree.college}` : null,
    });

    const manualAddTask = (text) => {
        if (!text.trim()) return;
        setTasks(p => [...p, { id: gid(), text: text.trim(), priority: "medium", done: false }]);
        const inferred = inferMood(text, [{ type: "add_task" }]);
        if (inferred) setLennyMood(inferred);
        callAmbientLLM(`User added task: "${text}". Emotional weight?`).then(r => {
            const safe = (r.actions || []).filter(a => a.type === "adjust_ambient");
            if (safe.length) exec(safe);
        });
    };
    const manualAddEvent = (title, date, time, duration = 60, color) => {
        setEvents(p => [...p, { id: gid(), title, date, time, duration, color }]);
        const inferred = inferMood(title, [{ type: "add_event" }]);
        if (inferred) setLennyMood(inferred);
        callAmbientLLM(`User added event: "${title}" on ${date}. Emotional weight?`).then(r => {
            const safe = (r.actions || []).filter(a => a.type === "adjust_ambient");
            if (safe.length) exec(safe);
        });
    };
    const manualEditEvent = (id, title, date, time, duration, color) => {
        setEvents(p => p.map(ev => ev.id === id ? { ...ev, title, date, time, duration, color } : ev));
    };
    const manualAddExpense = (desc, amount, category, date) => {
        const expenseDate = date || toLocalDateStr(new Date());
        setExpenses(p => [...p, { id: gid(), description: desc, amount: parseFloat(amount), category, date: expenseDate }]);
    };

    const exec = (actions) => {
        if (!Array.isArray(actions)) return;
        for (const a of actions) {
            const t = a.type;
            if (t === "change_bg" && a.color) setBg(a.color);
            else if (t === "add_postit") setPostits(p => [...p, { id: gid(), content: a.content || "Note", color: a.color || "#fef68a", x: Number(a.x) || 80 + Math.random() * 900, y: Number(a.y) || 40 + Math.random() * 800 }]);
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
            else if (t === "add_timer") { const mins = Number(a.minutes); if (mins > 0) setTimers(p => [...p, { id: gid(), minutes: mins, label: a.label || "Timer" }]); else console.warn("[exec] add_timer skipped: invalid minutes:", a.minutes); }
            else if (t === "change_theme" && themes[a.theme]) { setBg(themes[a.theme].bg); setAccent(themes[a.theme].accent); }
            else if (t === "set_greeting" && a.text) setGreeting(a.text);
            else if (t === "add_widget" && a.widgetType) setWidgets(p => [...p, { id: gid(), type: a.widgetType }]);
            else if (t === "add_event") setEvents(p => [...p, { id: gid(), title: a.title || "Event", date: a.date || toLocalDateStr(new Date()), time: a.time || "09:00", duration: Number(a.duration) || 60, color: a.color || "#6c5ce7" }]);
            else if (t === "delete_event" && a.title) setEvents(p => p.filter(e => !String(e.title).toLowerCase().includes(String(a.title).toLowerCase())));
            else if (t === "add_expense") setExpenses(p => [...p, { id: gid(), description: a.description || "Expense", amount: Number(a.amount) || 0, category: a.category || "other", date: a.date || toLocalDateStr(new Date()) }]);
            else if (t === "add_note") setPostits(p => {
                const pos = getNextPostitPosition(p.length);
                return [
                    ...p,
                    {
                        id: gid(),
                        content: a.content || "Quick note",
                        color: a.color || "#fef68a",
                        ...pos
                    }
                ];
            });
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
            else if (t === "clear_canvas") { setPostits([]); setTimers([]); setWidgets([]); setSelectedPostitId(null); }
            else if (t === "add_module" && a.code) setModules(p => p.some(m => m.code === a.code) ? p : [...p, { id: gid(), code: a.code, name: a.name || a.code, credits: Number(a.credits) || 5, semester: a.semester || "michaelmas", moduleType: a.moduleType || "lecture", color: MODULE_COLORS[p.length % MODULE_COLORS.length] }]);
            else if (t === "remove_module" && a.code) setModules(p => p.filter(m => m.code !== a.code));
            else if (t === "show_tcd_modules") setShowTCDModules(true);
            else if (t === "show_timetable") setShowTimetable(true);
            else if (t === "add_timetable_slot" && a.moduleCode) setTimetable(p => [...p, { id: gid(), moduleCode: a.moduleCode, day: a.day || "monday", startTime: a.startTime || "09:00", endTime: a.endTime || "10:00", slotType: a.slotType || "lecture", room: a.room || "" }]);
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
                    // Debounce: fire after main reply is rendered to avoid queuing
                    // behind the primary inference call on the serial llama-server.
                    clearTimeout(ambientTimerRef.current);
                    const ambientMsg = `User said: "${txt}". Actions taken: ${r.actions.map(a => a.type).join(", ") || "none"}. Emotional weight?`;
                    ambientTimerRef.current = setTimeout(() => {
                        callAmbientLLM(ambientMsg).then(ar => {
                            const safe = (ar.actions || []).filter(a => a.type === "adjust_ambient");
                            if (safe.length) exec(safe);
                        });
                    }, 1500);
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
    const togs = [
        { k: "t", l: "Tasks", s: showTasks, f: setShowTasks, i: "✓" },
        { k: "c", l: "Calendar", s: showCal, f: setShowCal, i: "📅" },
        { k: "b", l: "Budget", s: showBudget, f: setShowBudget, i: "💰" },
        { k: "r", l: "Rewards", s: showRewards, f: setShowRewards, i: "⭐" },
        { k: "w", l: "Weather", s: showWeather, f: setShowWeather, i: "🌤️" },
        { k: "m", l: "Modules", s: showTCDModules, f: setShowTCDModules, i: "🎓" },
        { k: "tt", l: "Timetable", s: showTimetable, f: setShowTimetable, i: "📆" },
    ];

    const activeTasks = tasks.filter(t => !t.done && !t.isParent).length;
    const completedTasks = tasks.filter(t => t.done).length;
    const upcomingEvents = events.length;
    const weeklySpend = expenses.reduce((s, e) => s + e.amount, 0);
    const budgetProgress = budget > 0 ? Math.min(100, Math.round((weeklySpend / budget) * 100)) : 0;
    const studyStreak = Math.min(7, Math.max(1, activeTasks + completedTasks));
    const weeklyGoalSources = {
        tasks: { label: "Tasks completed", value: completedTasks, unit: "task" },
        events: { label: "Events planned", value: upcomingEvents, unit: "event" },
        study: { label: "Study streak", value: studyStreak, unit: "day" },
    };
    const activeWeeklyGoal = weeklyGoalSources[weeklyGoalCategory] || weeklyGoalSources.tasks;
    const weeklyGoalProgress = Math.min(activeWeeklyGoal.value, weeklyGoalTarget);
    const weeklyGoalMet = weeklyGoalProgress >= weeklyGoalTarget;
    const weeklyGoalRemaining = Math.max(weeklyGoalTarget - weeklyGoalProgress, 0);
    const weeklyGoalHelper = weeklyGoalMet ? "Reward unlocked" : weeklyGoalRemaining === 1 ? `1 ${activeWeeklyGoal.unit} left` : `${weeklyGoalRemaining} ${activeWeeklyGoal.unit}s left`;
    const totalModuleCredits = modules.reduce((s, m) => s + (m.credits || 5), 0);
    const statCards = [
        { label: "Active tasks", value: activeTasks, helper: activeTasks <= 2 ? "On track" : "Busy week" },
        { label: "Upcoming events", value: upcomingEvents, helper: upcomingEvents > 0 ? "Plan ahead" : "Clear calendar" },
        { label: "Budget used", value: `${budgetProgress}%`, helper: budgetProgress >= 70 ? "Watch spend" : "On track" },
        { label: "Study streak", value: `${studyStreak}d`, helper: studyStreak >= 5 ? "Building rhythm" : "Momentum" },
        { label: activeWeeklyGoal.label, value: `${weeklyGoalProgress}/${weeklyGoalTarget}`, helper: weeklyGoalHelper },
        { label: "Modules", value: modules.length > 0 ? `${modules.length}` : "—", helper: modules.length > 0 ? `${totalModuleCredits} ECTS` : "Add via 🎓" },
    ];
    const quickThemes = [
        { key: "focus", label: "Deep focus" },
        { key: "cozy", label: "Cozy study" },
        { key: "ocean", label: "Fresh start" },
        { key: "minimal", label: "Minimal" },
    ];

    const safeAmbientGlowColor = (ambient.glowColor && ambient.glowColor !== "transparent") ? ambient.glowColor : "#ffffff";
    const ambientBg = ambient.glowIntensity > 0 ? `radial-gradient(ellipse at 30% 40%, ${safeAmbientGlowColor}${Math.round(ambient.glowIntensity * 255).toString(16).padStart(2, "0")} 0%, transparent 70%)` : "none";

    const adaptiveStatusMap = {
        focus: "Focus mode active",
        cozy: "Cozy study mode",
        ocean: "Fresh start mode",
        sunset: "High energy mode",
        forest: "Balanced week mode",
        midnight: "Deep work mode",
        minimal: "Low distraction mode",
        neutral: "Planning mode active",
    };

    const adaptiveStatus = adaptiveStatusMap[ambient.mood] || "Planning mode active";

    const noteColors = ["#fef68a", "#ffd6a5", "#caffbf", "#bde0fe", "#e9d5ff"];
    const getNextPostitPosition = (count) => ({
        x: 1025 + (count % 4) * 26,
        y: 245 + (count % 4) * 22
    });
    const selectedPostit = postits.find(p => p.id === selectedPostitId) || null;
    const createPostit = () => {
        const id = gid();

        setPostits(p => {
            const pos = getNextPostitPosition(p.length);
            const next = {
                id,
                content: "New sticky note",
                color: noteColors[p.length % noteColors.length],
                ...pos
            };
            return [...p, next];
        });

        setShowPostitLibrary(true);
        setSelectedPostitId(id);
    };
    const updatePostit = (id, updates) => setPostits(pp => pp.map(n => n.id === id ? { ...n, ...updates } : n));
    const deletePostit = (id) => {
        setPostits(pp => pp.filter(n => n.id !== id));
        setSelectedPostitId(cur => cur === id ? null : cur);
    };

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
            .panel-shell:hover { transform: translateY(-2px); box-shadow: 0 14px 36px rgba(0,0,0,0.22), 0 0 24px rgba(255,255,255,0.04) !important; }
        `}</style>

        <div style={{ width: "100vw", height: "100vh", overflow: "hidden", display: "flex", background: bg, fontFamily: "'DM Sans',sans-serif", color: tx, transition: "background 1.2s ease, color 0.8s" }}>
            <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>

                {/* Ambient layers */}
                <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 1, background: ambientBg, transition: "background 2.5s" }} />
                <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 2, opacity: ambient.grainOpacity, backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E")`, backgroundRepeat: "repeat", backgroundSize: "128px", transition: "opacity 2s" }} />

                {ambient.particles !== "none" && <Particles type={ambient.particles} color={ambient.glowColor !== "transparent" ? ambient.glowColor : accent} />}
                <LennyBuddy mood={lennyMood} glowColor={ambient.glowColor !== "transparent" ? ambient.glowColor : accent} light={light} loading={loading} />

                {/* Header */}
                <div style={{ position: "relative", zIndex: 50, padding: "14px 24px 8px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14 }}>
                    <div style={{ maxWidth: 900 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
                            <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 9, color: txm, letterSpacing: 1.7, textTransform: "uppercase" }}>Adaptive Dashboard</span>
                            <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 8, letterSpacing: 1, padding: "2px 7px", borderRadius: 999, background: "rgba(0,184,148,0.15)", color: "#00b894", border: "1px solid rgba(0,184,148,0.25)" }}>LOCAL</span>
                        </div>
                        <h1 style={{ fontFamily: "'DM Sans'", fontWeight: 300, fontSize: 24, margin: 0, letterSpacing: -0.5, color: light ? "rgba(45,52,54,0.92)" : "rgba(255,255,255,0.92)" }}>{greeting}</h1>
                        <div style={{ fontSize: 11.5, lineHeight: 1.45, marginTop: 5, color: light ? "rgba(45,52,54,0.62)" : "rgba(255,255,255,0.58)", maxWidth: 900 }}>
                            A calmer dashboard for modules, money, and weekly goals — with styling that reacts to how your week feels.
                        </div>
                        <div style={{ marginTop: 10 }}>
                            <span style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 6,
                                padding: "5px 10px",
                                borderRadius: 999,
                                background: light ? "rgba(255,255,255,0.65)" : "rgba(255,255,255,0.05)",
                                border: `1px solid ${accent}33`,
                                color: accent,
                                fontSize: 9.5,
                                fontFamily: "'JetBrains Mono'",
                                letterSpacing: 1,
                                textTransform: "uppercase"
                            }}>
                                ✦ {adaptiveStatus}
                            </span>
                        </div>
                        <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                            {statCards.map((stat) => (
                                <div key={stat.label} style={{ minWidth: 108, padding: "8px 10px", borderRadius: 12, background: light ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.045)", border: `1px solid ${light ? "rgba(0,0,0,0.07)" : "rgba(255,255,255,0.07)"}`, boxShadow: light ? "0 6px 18px rgba(0,0,0,0.04)" : "0 10px 30px rgba(0,0,0,0.12)" }}>
                                    <div style={{ fontFamily: "'JetBrains Mono'", fontSize: 8, letterSpacing: 1.2, textTransform: "uppercase", color: txm }}>{stat.label}</div>
                                    <div style={{ marginTop: 4, fontSize: 16, fontWeight: 700, color: tx }}>{stat.value}</div>
                                    <div style={{ marginTop: 2, fontSize: 8.5, color: stat.label === "Budget used" ? (budgetProgress >= 70 ? "#f59e0b" : "#34d399") : accent, fontFamily: "'JetBrains Mono'", letterSpacing: 0.4 }}>
                                        {stat.helper}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "flex-end" }}>
                            <button onClick={() => setShowPostitLibrary(true)} style={{ padding: "5px 10px", borderRadius: 999, fontSize: 9.5, cursor: "pointer", fontFamily: "'JetBrains Mono'", background: showPostitLibrary ? `${accent}24` : (light ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.04)"), border: `1px solid ${showPostitLibrary ? `${accent}50` : pBd}`, color: showPostitLibrary ? accent : txm, display: "flex", alignItems: "center", gap: 4, transition: "all 0.2s" }}><span style={{ fontSize: 10 }}>📝</span> Post-its</button>
                            {togs.map(t => <button key={t.k} onClick={() => t.f(v => !v)} style={{ padding: "5px 10px", borderRadius: 999, fontSize: 9.5, cursor: "pointer", fontFamily: "'JetBrains Mono'", background: t.s ? `${accent}20` : (light ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.04)"), border: `1px solid ${t.s ? `${accent}40` : pBd}`, color: t.s ? accent : txm, display: "flex", alignItems: "center", gap: 4, transition: "all 0.2s" }}><span style={{ fontSize: 10 }}>{t.i}</span> {t.l}</button>)}
                        </div>
                        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", justifyContent: "flex-end", maxWidth: 260 }}>
                            {quickThemes.map((themeOption) => {
                                //const isActiveTheme = themeOption.key === ambient.mood;
                                const isActiveTheme = themeOption.key === ambient.mood;
                                return (
                                    <button
                                        key={themeOption.key}
                                        onClick={() => exec([{ type: "change_theme", theme: themeOption.key }])}
                                        style={{
                                            padding: isActiveTheme ? "5px 11px" : "5px 10px",
                                            borderRadius: 999,
                                            fontSize: 9.5,
                                            cursor: "pointer",
                                            fontFamily: "'JetBrains Mono'",
                                            background: isActiveTheme ? `linear-gradient(135deg, ${accent}30, ${accent}16)` : (light ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.035)"),
                                            border: `1px solid ${isActiveTheme ? `${accent}88` : (light ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.07)")}`,
                                            color: isActiveTheme ? (light ? accent : "#ffffff") : txm,
                                            boxShadow: isActiveTheme ? `0 0 0 1px ${accent}22, 0 0 18px ${accent}22, 0 8px 18px rgba(0,0,0,0.12)` : "none",
                                            transform: isActiveTheme ? "translateY(-1px)" : "none",
                                            transition: "all 0.2s"
                                        }}
                                    >
                                        {isActiveTheme ? `✦ ${themeOption.label}` : themeOption.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                <HeaderLockCtx.Provider value={headerLockY}>
                {showTasks && <TasksPanel tasks={tasks} onToggle={id => setTasks(t => t.map(tk => tk.id === id ? { ...tk, done: !tk.done } : tk))} onEditTask={(id, v) => setTasks(t => t.map(tk => tk.id === id ? { ...tk, text: v } : tk))} onRequestSplit={t => send(`split the task "${t}" into subtasks`)} onAddTask={manualAddTask} accent={accent} light={light} onClose={() => setShowTasks(false)} ambient={ambient} />}
                {showCal && <CalendarPanel events={events} onDeleteEvent={id => setEvents(e => e.filter(ev => ev.id !== id))} onAddEvent={manualAddEvent} onEditEvent={manualEditEvent} accent={accent} light={light} onClose={() => setShowCal(false)} ambient={ambient} />}
                {showBudget && <BudgetPanel expenses={expenses} budget={budget} accent={accent} light={light} onClose={() => setShowBudget(false)} onDeleteExpense={id => setExpenses(e => e.filter(ex => ex.id !== id))} onAddExpense={manualAddExpense} ambient={ambient} />}
                {showRewards && <RewardsPanel weeklyGoalCategory={weeklyGoalCategory} setWeeklyGoalCategory={setWeeklyGoalCategory} weeklyGoalTarget={weeklyGoalTarget} setWeeklyGoalTarget={setWeeklyGoalTarget} weeklyGoalProgress={weeklyGoalProgress} weeklyGoalLabel={activeWeeklyGoal.label} weeklyGoalHelper={weeklyGoalHelper} weeklyStreak={Math.max(1, Math.ceil(studyStreak / 2))} light={light} ambient={ambient} onClose={() => setShowRewards(false)} accent="#f59e0b" />}
                {showWeather && <WeatherWidget light={light} accent={accent} ambient={ambient} onClose={() => setShowWeather(false)} />}
                {showTCDModules && <TCDModulesPanel modules={modules} tcdDegree={tcdDegree} onSetDegree={setTcdDegree} onAddModule={m => setModules(p => p.some(x => x.code === m.code) ? p : [...p, m])} onRemoveModule={id => setModules(p => p.filter(m => m.id !== id))} accent={accent} light={light} onClose={() => setShowTCDModules(false)} ambient={ambient} />}
                {showTimetable && <TimetablePanel modules={modules} timetable={timetable} onAddSlot={s => setTimetable(p => [...p, s])} onRemoveSlot={id => setTimetable(p => p.filter(s => s.id !== id))} accent={accent} light={light} onClose={() => setShowTimetable(false)} ambient={ambient} />}

                {showPostitLibrary && <div style={{ position: "absolute", inset: 0, zIndex: 120, background: light ? "rgba(245,240,235,0.62)" : "rgba(8,10,18,0.58)", backdropFilter: "blur(10px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
                    <div className="anim-panel" style={{ width: "min(940px, 92vw)", height: "min(620px, 84vh)", display: "grid", gridTemplateColumns: "320px 1fr", background: light ? "rgba(255,255,255,0.78)" : "rgba(10,12,22,0.82)", border: `1px solid ${pBd}`, borderRadius: 22, overflow: "hidden", boxShadow: "0 30px 80px rgba(0,0,0,0.28)" }}>
                        <div style={{ borderRight: `1px solid ${pBd}`, padding: 18, display: "flex", flexDirection: "column", minHeight: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 14 }}>
                                <div>
                                    <div style={{ fontFamily: "'JetBrains Mono'", fontSize: 9, letterSpacing: 1.6, textTransform: "uppercase", color: txm }}>Sticky notes</div>
                                    <div style={{ fontSize: 18, fontWeight: 700, color: tx, marginTop: 4 }}>Notes library</div>
                                </div>
                                <div style={{ display: "flex", gap: 6 }}>
                                    <button onClick={createPostit} style={{ width: 32, height: 32, borderRadius: 10, border: `1px solid ${accent}44`, background: `${accent}18`, color: accent, cursor: "pointer", fontSize: 18, lineHeight: 1 }}>+</button>
                                    <button onClick={() => setShowPostitLibrary(false)} style={{ width: 32, height: 32, borderRadius: 10, border: `1px solid ${pBd}`, background: "transparent", color: txm, cursor: "pointer", fontSize: 16, lineHeight: 1 }}>×</button>
                                </div>
                            </div>
                            <div style={{ display: "grid", gap: 10, overflowY: "auto", paddingRight: 4 }}>
                                {postits.length === 0 && <div style={{ padding: 16, borderRadius: 14, border: `1px dashed ${pBd}`, color: txm, fontSize: 11 }}>No sticky notes yet. Click + to create one.</div>}
                                {postits.map((note, idx) => {
                                    const active = note.id === selectedPostitId;
                                    const noteColor = note.color || noteColors[idx % noteColors.length];
                                    return <button key={note.id} onClick={() => setSelectedPostitId(note.id)} style={{ textAlign: "left", border: `1px solid ${active ? `${accent}55` : pBd}`, background: active ? (light ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.06)") : (light ? "rgba(255,255,255,0.68)" : "rgba(255,255,255,0.03)"), borderRadius: 16, padding: 12, cursor: "pointer", boxShadow: active ? `0 0 0 1px ${accent}18` : "none" }}>
                                        <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                                            <div style={{ width: 12, height: 12, borderRadius: 999, background: noteColor, boxShadow: `0 0 0 3px ${noteColor}22`, marginTop: 2, flexShrink: 0 }} />
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: 11, color: tx, lineHeight: 1.45, fontWeight: active ? 600 : 500 }}>{note.content || "Untitled note"}</div>
                                            </div>
                                        </div>
                                    </button>;
                                })}
                            </div>
                        </div>
                        <div style={{ padding: 22, display: "flex", flexDirection: "column", minHeight: 0 }}>
                            {selectedPostit ? <>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
                                    <div>
                                        <div style={{ fontFamily: "'JetBrains Mono'", fontSize: 9, letterSpacing: 1.6, textTransform: "uppercase", color: txm }}>Editor</div>
                                        <div style={{ fontSize: 18, fontWeight: 700, color: tx, marginTop: 4 }}>Open sticky note</div>
                                    </div>
                                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                        {noteColors.map(c => <button key={c} onClick={() => updatePostit(selectedPostit.id, { color: c })} style={{ width: 20, height: 20, borderRadius: 999, border: `2px solid ${(selectedPostit.color || c) === c ? tx : 'transparent'}`, background: c, cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.12)" }} />)}
                                        <button onClick={() => deletePostit(selectedPostit.id)} style={{ padding: "6px 10px", borderRadius: 10, border: `1px solid ${pBd}`, background: "transparent", color: txm, cursor: "pointer", fontFamily: "'JetBrains Mono'", fontSize: 10 }}>Delete</button>
                                    </div>
                                </div>
                                <div style={{ flex: 1, borderRadius: 24, background: selectedPostit.color || "#fef68a", padding: 22, boxShadow: "0 18px 50px rgba(0,0,0,0.18)", display: "flex", flexDirection: "column" }}>
                                    <div style={{ fontSize: 12, color: "rgba(45,52,54,0.55)", fontFamily: "'JetBrains Mono'", letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 12 }}>Sticky note</div>
                                    <EditableText value={selectedPostit.content} onChange={v => updatePostit(selectedPostit.id, { content: v })} maxLen={POSTIT_CHAR_LIMIT} multiline style={{ fontFamily: "'Caveat', cursive", fontSize: 28, lineHeight: 1.25, color: "#111111", flex: 1 }} />
                                </div>
                            </> : <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: txm, fontSize: 12 }}>Select a sticky note or click + to create one.</div>}
                        </div>
                    </div>
                </div>}

                {postits.map(p => <PostIt key={p.id} id={p.id} content={p.content} color={p.color} initialX={p.x} initialY={p.y} onRemove={id => setPostits(pp => pp.filter(n => n.id !== id))} onEdit={(id, v) => setPostits(pp => pp.map(n => n.id === id ? { ...n, content: v } : n))} />)}
                {timers.map(t => <TimerWidget key={t.id} id={t.id} minutes={t.minutes} label={t.label} onRemove={id => setTimers(tt => tt.filter(n => n.id !== id))} light={light} />)}
                {widgets.map(w => w.type === "clock" ? <ClockWidget key={w.id} id={w.id} onRemove={id => setWidgets(ww => ww.filter(n => n.id !== id))} light={light} /> : w.type === "quote" ? <QuoteWidget key={w.id} id={w.id} onRemove={id => setWidgets(ww => ww.filter(n => n.id !== id))} light={light} /> : null)}

                {!postits.length && !timers.length && !widgets.length && !showTasks && !showCal && !showBudget && !showRewards && !showWeather && !showTCDModules && !showTimetable && <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", textAlign: "center", color: txs, userSelect: "none", zIndex: 5 }}>
                    <div style={{ fontSize: 40, marginBottom: 8 }}>✦</div><div style={{ fontFamily: "'JetBrains Mono'", fontSize: 10, letterSpacing: 2 }}>YOUR STUDENT DASHBOARD IS CLEAR</div><div style={{ marginTop: 8, fontSize: 11, color: txm }}>Turn panels back on or ask the copilot to add something.</div>
                </div>}
                </HeaderLockCtx.Provider>
            </div>

            {/* Chat */}
            <div style={{ width: 320, display: "flex", flexDirection: "column", background: light ? "rgba(255,255,255,0.42)" : "rgba(5,7,16,0.42)", backdropFilter: "blur(40px)", borderLeft: `1px solid ${pBd}`, boxShadow: "-10px 0 30px rgba(0,0,0,0.08)", transition: "all 0.8s" }}>
                <div style={{ padding: "14px 15px 10px", borderBottom: `1px solid ${pBd}` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 26, height: 26, borderRadius: 7, background: `linear-gradient(135deg, ${accent}, ${accent}88)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, transition: "background 0.8s" }}>⚡</div>
                        <div>
                            <div style={{ fontSize: 12, fontWeight: 600 }}>Study Copilot</div>
                            <div style={{ fontSize: 8, color: txm, fontFamily: "'JetBrains Mono'", letterSpacing: 1 }}>{loading ? "THINKING..." : "LOCAL LLM"}</div>
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
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", padding: "0 2px 8px" }}>
                        {["show my modules", "add module CS3012", "log €8 lunch", "add study timer", "make it cozy"].map((prompt) => (
                            <button key={prompt} onClick={() => send(prompt)} disabled={loading} style={{ padding: "5px 8px", borderRadius: 999, border: `1px solid ${light ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.07)"}`, background: light ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.035)", color: txm, fontSize: 9, fontFamily: "'JetBrains Mono'", cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1 }}>
                                {prompt}
                            </button>
                        ))}
                    </div>
                    <div style={{ display: "flex", gap: 5, background: light ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.04)", border: `1px solid ${light ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.08)"}`, borderRadius: 10, padding: "3px 3px 3px 11px", alignItems: "center" }}>
                        <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && send()} placeholder={loading ? "Thinking..." : "Ask about deadlines, money, or focus..."} disabled={loading}
                            style={{ flex: 1, background: "none", border: "none", outline: "none", color: tx, fontSize: 11.5, fontFamily: "'DM Sans'", opacity: loading ? 0.5 : 1 }} />
                        <button onClick={() => send()} disabled={loading} style={{ width: 28, height: 28, borderRadius: 7, border: "none", flexShrink: 0, background: loading ? "rgba(128,128,128,0.25)" : `linear-gradient(135deg, ${accent}, ${accent}88)`, cursor: loading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: "#fff", transition: "background 0.5s" }}>↑</button>
                    </div>
                </div>
            </div>
        </div>
    </>;
}
// ═══════════════════════════════════════════════════
// APP WRAPPER
// ═══════════════════════════════════════════════════
// export default function App() {
//     return <Dashboard />;
// }
