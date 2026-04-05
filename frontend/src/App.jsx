import { useState, useRef, useEffect, useCallback, useMemo, createContext, useContext } from "react";

// ═══════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════
const LLM_CONFIG = {
    mode: "local",
    local_url: "/v1/chat/completions",
    local_model: "phi-3.5-mini-instruct",
};
const RIGHT_RAIL_WIDTH = 320;
const PANEL_EDGE_MARGIN = 12;
const PANEL_FIXED_WIDTH = 320;
const PANEL_COLUMN_GAP = 12;
const PANEL_GRID_SIZE = 20;
const GMAIL_DRAG_MIME = "application/x-adaptive-gmail-email-id";
const POSTIT_CHAR_LIMIT = 120;
const TASK_CHAR_LIMIT = 80;
const EXPENSE_DESC_CHAR_LIMIT = 120;
const DEADLINE_TRIGGER_HOURS = 72;
const DEADLINE_TITLE_RE = /\b(deadline|due|exam|assignment|submission|deliverable|project|report|quiz|midterm|final)\b/i;
const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };
const ADAPTIVE_RISK_THRESHOLDS = { warning: 45, critical: 70 };
const DASHBOARD_STATE_DEBOUNCE_MS = 900;

// ═══════════════════════════════════════════════════
// TCD CONSTANTS
// ═══════════════════════════════════════════════════
const TCD_SEMESTERS = { michaelmas: "Michaelmas", hilary: "Hilary", trinity: "Trinity Term", yearlong: "Year-Long" };
const TCD_SEMESTER_COLORS = { michaelmas: "#e17055", hilary: "#00cec9", trinity: "#00b894", yearlong: "#6c5ce7" };
const MODULE_COLORS = ["#6c5ce7", "#00cec9", "#e17055", "#00b894", "#fdcb6e", "#e84393", "#a29bfe", "#74b9ff", "#55efc4", "#ff7675"];
const TIMETABLE_HOURS = Array.from({ length: 13 }, (_, i) => `${(i + 8).toString().padStart(2, "0")}:00`);
const WEEK_DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"];
const WEEK_DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

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

function parseDateTime(dateStr, timeStr = "23:59") {
    if (!dateStr) return null;
    const normalizedTime = typeof timeStr === "string" && /^\d{2}:\d{2}$/.test(timeStr) ? timeStr : "23:59";
    const parsed = new Date(`${dateStr}T${normalizedTime}:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseLooseDate(input) {
    if (!input || typeof input !== "string") return null;
    const cleaned = input.trim();
    const direct = new Date(cleaned);
    if (!Number.isNaN(direct.getTime())) return direct;
    const withoutOrdinal = cleaned.replace(/(\d+)(st|nd|rd|th)/gi, "$1");
    const fallback = new Date(withoutOrdinal);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function formatHoursLeft(hours) {
    if (!Number.isFinite(hours)) return "";
    if (hours < 1) return "<1h";
    if (hours < 24) return `${Math.ceil(hours)}h`;
    return `${Math.ceil(hours / 24)}d`;
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function snapToGrid(value, origin = 0, gridSize = PANEL_GRID_SIZE) {
    return origin + Math.round((value - origin) / gridSize) * gridSize;
}

function getPanelColumnXPositions(stageWidth, panelWidth = PANEL_FIXED_WIDTH, gap = PANEL_COLUMN_GAP) {
    const safeStageWidth = Math.max(panelWidth + PANEL_EDGE_MARGIN * 2, stageWidth);
    const usableWidth = Math.max(panelWidth, safeStageWidth - PANEL_EDGE_MARGIN * 2);
    const step = panelWidth + gap;
    const colCount = Math.max(1, Math.floor((usableWidth + gap) / step));
    return Array.from({ length: colCount }, (_, i) => PANEL_EDGE_MARGIN + i * step);
}

function snapToNearestColumn(value, columnXs) {
    const xs = Array.isArray(columnXs) ? columnXs.filter(x => Number.isFinite(x)) : [];
    if (!xs.length) return PANEL_EDGE_MARGIN;
    let winner = xs[0];
    let winnerDist = Math.abs(value - winner);
    for (let i = 1; i < xs.length; i++) {
        const dist = Math.abs(value - xs[i]);
        if (dist < winnerDist) {
            winner = xs[i];
            winnerDist = dist;
        }
    }
    return winner;
}

function buildColumnFlowAnchors({
    columnX,
    columnXs,
    occupiedRects,
    minY,
    maxY,
    rowSize = PANEL_GRID_SIZE,
    gap = 10,
}) {
    const safeMinY = Number.isFinite(minY) ? minY : 0;
    const safeMaxY = Number.isFinite(maxY) ? maxY : safeMinY;
    const base = clamp(snapToGrid(safeMinY, safeMinY, rowSize), safeMinY, safeMaxY);
    const blockers = Array.isArray(occupiedRects) ? occupiedRects : [];
    const cols = Array.isArray(columnXs) ? columnXs : [columnX];
    const inColumn = blockers
        .filter(rect => Math.abs(snapToNearestColumn(rect.left, cols) - columnX) < 0.5)
        .sort((a, b) => a.top - b.top);

    const anchors = [base];
    let flowY = base;
    for (const rect of inColumn) {
        const rectBottom = Number(rect.top) + Number(rect.height);
        if (Number.isFinite(rectBottom)) {
            flowY = clamp(snapToGrid(Math.max(flowY, rectBottom + gap), safeMinY, rowSize), safeMinY, safeMaxY);
            anchors.push(flowY);
        }
    }
    return Array.from(new Set(anchors)).sort((a, b) => a - b);
}

function rectsOverlap(a, b, gap = 10) {
    return !(
        (a.left + a.width + gap <= b.left) ||
        (b.left + b.width + gap <= a.left) ||
        (a.top + a.height + gap <= b.top) ||
        (b.top + b.height + gap <= a.top)
    );
}

function findNearestGridSlot({
    targetX,
    targetY,
    minX,
    maxX,
    minY,
    maxY,
    columnXs,
    panelWidth,
    panelHeight,
    occupiedRects,
    rowSize = PANEL_GRID_SIZE,
    gap = 10,
}) {
    const safeMinX = Number.isFinite(minX) ? minX : 0;
    const safeMaxX = Number.isFinite(maxX) ? maxX : safeMinX;
    const safeMinY = Number.isFinite(minY) ? minY : 0;
    const safeMaxY = Number.isFinite(maxY) ? maxY : safeMinY;
    const columns = (Array.isArray(columnXs) && columnXs.length ? columnXs : [safeMinX])
        .map(x => clamp(x, safeMinX, safeMaxX));
    const baseX = snapToNearestColumn(targetX, columns);
    const baseY = clamp(snapToGrid(targetY, safeMinY, rowSize), safeMinY, safeMaxY);
    const blockers = Array.isArray(occupiedRects) ? occupiedRects : [];
    if (!blockers.length) return { x: baseX, y: baseY };

    const collidesAt = (xPos, yPos) => {
        const trial = { left: xPos, top: yPos, width: panelWidth, height: panelHeight };
        return blockers.some(rect => rectsOverlap(trial, rect, gap));
    };

    if (!collidesAt(baseX, baseY)) return { x: baseX, y: baseY };

    let best = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    // Prefer "flow" slots: each card snaps right after previous cards in the same column.
    for (const xPos of columns) {
        const anchors = buildColumnFlowAnchors({
            columnX: xPos,
            columnXs: columns,
            occupiedRects: blockers,
            minY: safeMinY,
            maxY: safeMaxY,
            rowSize,
            gap,
        });
        for (const yPos of anchors) {
            if (collidesAt(xPos, yPos)) continue;
            const distance = Math.abs(xPos - baseX) + Math.abs(yPos - baseY);
            if (distance < bestDistance) {
                bestDistance = distance;
                best = { x: xPos, y: yPos };
            }
        }
    }
    if (best) return best;

    // Fallback to full row scan if flow anchors are temporarily blocked.
    for (let yPos = safeMinY; yPos <= safeMaxY; yPos += rowSize) {
        const snappedY = clamp(snapToGrid(yPos, safeMinY, rowSize), safeMinY, safeMaxY);
        for (const xPos of columns) {
            if (collidesAt(xPos, snappedY)) continue;
            const distance = Math.abs(xPos - baseX) + Math.abs(snappedY - baseY);
            if (distance < bestDistance) {
                bestDistance = distance;
                best = { x: xPos, y: snappedY };
            }
        }
    }

    return best || { x: baseX, y: baseY };
}

function riskLevelFromScore(score) {
    if (score >= ADAPTIVE_RISK_THRESHOLDS.critical) return "critical";
    if (score >= ADAPTIVE_RISK_THRESHOLDS.warning) return "warning";
    return "normal";
}

function evaluateAdaptiveRuleModel({ deadlineCandidates, tasks }) {
    const safeDeadlines = Array.isArray(deadlineCandidates) ? deadlineCandidates : [];
    const safeTasks = Array.isArray(tasks) ? tasks : [];
    const nearestDeadline = safeDeadlines[0] || null;
    const activeTasks = safeTasks.filter(task => !task?.done && !task?.isParent && !task?.parentId);
    const highPriorityCount = activeTasks.filter(task => (task?.priority || "medium") === "high").length;
    const mediumPriorityCount = activeTasks.filter(task => (task?.priority || "medium") === "medium").length;
    const gmailHighPriorityCount = activeTasks.filter(task => task?.sourceEmailId && (task?.priority || "medium") === "high").length;
    const deadlinesWithin72h = safeDeadlines.filter(item => Number.isFinite(item?.hoursLeft) && item.hoursLeft <= DEADLINE_TRIGGER_HOURS).length;

    const breakdown = [];
    let score = 0;
    const addRulePoints = (rule, points, detail) => {
        const safePoints = Math.max(0, Math.round(Number(points) || 0));
        if (safePoints <= 0) return;
        score += safePoints;
        breakdown.push({ rule, points: safePoints, detail });
    };

    if (nearestDeadline) {
        let deadlinePoints = 0;
        if (nearestDeadline.hoursLeft <= 12) deadlinePoints = 55;
        else if (nearestDeadline.hoursLeft <= 24) deadlinePoints = 45;
        else if (nearestDeadline.hoursLeft <= 48) deadlinePoints = 32;
        else if (nearestDeadline.hoursLeft <= DEADLINE_TRIGGER_HOURS) deadlinePoints = 22;
        addRulePoints("deadline_proximity", deadlinePoints, `${formatHoursLeft(nearestDeadline.hoursLeft)} until next deadline`);
    }

    if (deadlinesWithin72h > 1) {
        addRulePoints("deadline_stack", Math.min(18, (deadlinesWithin72h - 1) * 6), `${deadlinesWithin72h} deadlines in 72h window`);
    }
    addRulePoints("high_priority_load", Math.min(20, highPriorityCount * 5), `${highPriorityCount} active high-priority tasks`);
    addRulePoints("medium_priority_load", Math.min(10, mediumPriorityCount * 2), `${mediumPriorityCount} active medium-priority tasks`);
    addRulePoints("gmail_urgency", Math.min(12, gmailHighPriorityCount * 4), `${gmailHighPriorityCount} urgent email-derived tasks`);
    if (activeTasks.length >= 8) {
        addRulePoints("task_volume", Math.min(10, 4 + (activeTasks.length - 8)), `${activeTasks.length} active tasks`);
    }

    const normalizedScore = clamp(Math.round(score), 0, 100);
    const level = riskLevelFromScore(normalizedScore);
    const triggers = [];
    if (nearestDeadline && nearestDeadline.hoursLeft <= DEADLINE_TRIGGER_HOURS) triggers.push("deadline_window_72h");
    if (deadlinesWithin72h >= 2) triggers.push("stacked_deadlines");
    if (highPriorityCount >= 3) triggers.push("high_priority_stack");
    if (gmailHighPriorityCount >= 1) triggers.push("gmail_urgent_signals");
    if (level === "critical") triggers.push("critical_risk_score");

    const shouldActivateFocus = Boolean(nearestDeadline && nearestDeadline.hoursLeft <= DEADLINE_TRIGGER_HOURS && level !== "normal");
    const shouldCompressLowPriority = Boolean(shouldActivateFocus && (level === "critical" || highPriorityCount >= 2));

    return {
        score: normalizedScore,
        level,
        triggers,
        breakdown,
        nearestDeadline,
        deadlinesWithin72h,
        highPriorityCount,
        shouldActivateFocus,
        shouldCompressLowPriority,
        evidence: breakdown.slice(0, 4).map(item => `${item.rule}: +${item.points} (${item.detail})`),
    };
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
let PANEL_MOUNT_SEQ = 0;

function useDraggable(ix, iy, {
    clampToMainStage = false,
    panelWidth = 0,
    snapOnRelease = false,
    snapWhileDragging = false,
    gridSize = PANEL_GRID_SIZE,
} = {}) {
    const minY = useContext(HeaderLockCtx);
    const minYRef = useRef(minY);
    useEffect(() => { minYRef.current = minY; }, [minY]);
    const [pos, setPos] = useState({ x: ix, y: Math.max(minY, iy) });
    const [isDragging, setIsDragging] = useState(false);
    const posRef = useRef(pos);
    useEffect(() => { posRef.current = pos; }, [pos]);
    const dr = useRef(false), off = useRef({ x: 0, y: 0 });
    const onMouseDown = useCallback((e) => {
        if (e.target.closest("button, input, textarea, select, a, [data-nodrag]")) return;
        e.preventDefault(); dr.current = true; setIsDragging(true); off.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
        const mv = ev => {
            if (!dr.current) return;
            let nextX = ev.clientX - off.current.x;
            let nextY = Math.max(minYRef.current, ev.clientY - off.current.y);
            let columnXs = [PANEL_EDGE_MARGIN];
            let minX = PANEL_EDGE_MARGIN;
            let maxX = PANEL_EDGE_MARGIN;
            let minTop = minYRef.current + 2;
            let maxY = Number.POSITIVE_INFINITY;
            if (clampToMainStage) {
                const stageWidth = Math.max(640, window.innerWidth - RIGHT_RAIL_WIDTH);
                columnXs = getPanelColumnXPositions(stageWidth, panelWidth);
                minX = columnXs[0];
                maxX = columnXs[columnXs.length - 1];
                maxY = Math.max(minYRef.current + PANEL_EDGE_MARGIN, window.innerHeight - PANEL_EDGE_MARGIN - 120);
                nextX = clamp(nextX, minX, maxX);
                nextY = clamp(nextY, minTop, maxY);
            }
            if (snapWhileDragging) {
                nextX = clampToMainStage
                    ? snapToNearestColumn(nextX, columnXs)
                    : snapToGrid(nextX, 0, gridSize);
                nextY = snapToGrid(nextY, minTop, gridSize);
                if (clampToMainStage) {
                    nextX = clamp(nextX, minX, maxX);
                    nextY = clamp(nextY, minTop, maxY);
                }
            }
            setPos({ x: nextX, y: nextY });
        };
        const up = () => {
            dr.current = false;
            setIsDragging(false);
            if (clampToMainStage && snapOnRelease) {
                const stageWidth = Math.max(640, window.innerWidth - RIGHT_RAIL_WIDTH);
                const columnXs = getPanelColumnXPositions(stageWidth, panelWidth);
                const minX = columnXs[0];
                const maxX = columnXs[columnXs.length - 1];
                const minTop = minYRef.current + 2;
                const maxY = Math.max(minYRef.current + PANEL_EDGE_MARGIN, window.innerHeight - PANEL_EDGE_MARGIN - 120);
                const snappedX = clamp(snapToNearestColumn(posRef.current.x, columnXs), minX, maxX);
                const snappedY = clamp(snapToGrid(posRef.current.y, minTop, gridSize), minTop, maxY);
                if (Math.abs(snappedX - posRef.current.x) > 1 || Math.abs(snappedY - posRef.current.y) > 1) {
                    setPos({ x: snappedX, y: snappedY });
                }
            }
            window.removeEventListener("mousemove", mv);
            window.removeEventListener("mouseup", up);
        };
        window.addEventListener("mousemove", mv); window.addEventListener("mouseup", up);
    }, [clampToMainStage, gridSize, panelWidth, pos.x, pos.y, snapOnRelease, snapWhileDragging]);
    return { pos, posRef, setPos, onMouseDown, isDragging };
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
function Panel({ children, x, y, width, title, icon, onClose, ambient, light, accent = "#8b5cf6", overflow = "hidden", zIndex = 15 }) {
    const minY = useContext(HeaderLockCtx);
    const shellRef = useRef(null);
    const panelWidth = PANEL_FIXED_WIDTH;
    const { pos, posRef, setPos, onMouseDown, isDragging } = useDraggable(x, y, {
        clampToMainStage: true,
        panelWidth,
        snapOnRelease: true,
        snapWhileDragging: true,
        gridSize: PANEL_GRID_SIZE,
    });
    const normalizeRafRef = useRef(0);
    const panelOrderRef = useRef(0);
    if (!panelOrderRef.current) panelOrderRef.current = ++PANEL_MOUNT_SEQ;
    const panelId = useMemo(() => `${String(title || "panel")}::${String(icon || "")}::${String(panelWidth)}`, [title, icon, panelWidth]);
    const txm = light ? "rgba(45,52,54,0.5)" : "rgba(255,255,255,0.45)";
    const bw = ambient.borderWarmth || 0;
    const borderCol = light ? `rgba(${Math.round(80 + bw * 80)},${Math.round(60 + bw * 40)},50,0.1)` : `rgba(${Math.round(255 * (0.3 + bw * 0.3))},${Math.round(255 * (0.25 + bw * 0.15))},${Math.round(255 * 0.2)},${0.06 + bw * 0.06})`;
    const panelBg = light ? `rgba(255,255,255,${0.65 + (ambient.panelOpacity || 0.03) * 3})` : `rgba(255,255,255,${ambient.panelOpacity || 0.03})`;
    const safeGlow = (ambient.glowColor && ambient.glowColor !== "transparent") ? ambient.glowColor : "#ffffff";
    const reflectCol = ambient.glowIntensity > 0 ? `${safeGlow}08` : "transparent";
    const accentGlow = `${accent}14`;
    const accentBorder = `${accent}30`;
    const headerTint = light ? `${accent}10` : `${accent}12`;

    const normalizePosition = useCallback((avoidOverlaps) => {
        const shell = shellRef.current;
        if (!shell) return;

        const stageWidth = Math.max(640, window.innerWidth - RIGHT_RAIL_WIDTH);
        const columnXs = getPanelColumnXPositions(stageWidth, panelWidth);
        const panelHeight = shell.offsetHeight || 220;
        const minX = columnXs[0];
        const maxX = columnXs[columnXs.length - 1];
        const minTop = minY + PANEL_EDGE_MARGIN;
        const maxTop = Math.max(minTop, window.innerHeight - panelHeight - PANEL_EDGE_MARGIN);

        let nextX = clamp(snapToNearestColumn(posRef.current.x, columnXs), minX, maxX);
        let nextY = clamp(snapToGrid(posRef.current.y, minTop, PANEL_GRID_SIZE), minTop, maxTop);

        if (avoidOverlaps) {
            const currentOrder = panelOrderRef.current;
            const occupiedRects = Array.from(document.querySelectorAll(".panel-shell[data-panel-id]"))
                .filter(el => el !== shell)
                .map(el => ({ rect: el.getBoundingClientRect(), order: Number(el.getAttribute("data-panel-order") || "0") }))
                .filter(item => item.order > 0 && item.order < currentOrder)
                .map(item => item.rect)
                .filter(rect => rect.width > 0 && rect.height > 0 && rect.left < stageWidth - PANEL_EDGE_MARGIN);
            const resolved = findNearestGridSlot({
                targetX: nextX,
                targetY: nextY,
                minX,
                maxX,
                minY: minTop,
                maxY: maxTop,
                columnXs,
                panelWidth,
                panelHeight,
                occupiedRects,
                rowSize: PANEL_GRID_SIZE,
                gap: 10,
            });
            nextX = resolved.x;
            nextY = resolved.y;
        }

        if (Math.abs(nextX - posRef.current.x) > 1 || Math.abs(nextY - posRef.current.y) > 1) {
            setPos({ x: nextX, y: nextY });
        }
    }, [minY, panelWidth, posRef, setPos]);

    const scheduleNormalize = useCallback((avoidOverlaps = true) => {
        if (normalizeRafRef.current) window.cancelAnimationFrame(normalizeRafRef.current);
        normalizeRafRef.current = window.requestAnimationFrame(() => {
            normalizeRafRef.current = 0;
            normalizePosition(avoidOverlaps);
        });
    }, [normalizePosition]);

    useEffect(() => {
        scheduleNormalize(true);
        // Run a couple of additional settling passes because some panels
        // compute final height after first paint / font load.
        const t1 = window.setTimeout(() => scheduleNormalize(true), 120);
        const t2 = window.setTimeout(() => scheduleNormalize(true), 300);
        return () => {
            window.clearTimeout(t1);
            window.clearTimeout(t2);
            if (normalizeRafRef.current) window.cancelAnimationFrame(normalizeRafRef.current);
        };
    }, [scheduleNormalize]);

    useEffect(() => {
        // Header height is measured asynchronously; when it changes,
        // re-run overlap-aware placement to prevent top-stack collisions.
        scheduleNormalize(true);
    }, [minY, scheduleNormalize]);

    useEffect(() => {
        const onResize = () => scheduleNormalize(false);
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, [scheduleNormalize]);

    useEffect(() => {
        if (typeof ResizeObserver === "undefined") return;
        const shell = shellRef.current;
        if (!shell) return;
        let rafId = 0;
        const observer = new ResizeObserver(() => {
            if (rafId) window.cancelAnimationFrame(rafId);
            rafId = window.requestAnimationFrame(() => {
                rafId = 0;
                scheduleNormalize(true);
            });
        });
        observer.observe(shell);
        return () => {
            if (rafId) window.cancelAnimationFrame(rafId);
            observer.disconnect();
        };
    }, [scheduleNormalize]);

    useEffect(() => {
        if (!isDragging) scheduleNormalize(true);
    }, [isDragging, scheduleNormalize]);

    return (
        <div ref={shellRef} data-panel-id={panelId} data-panel-order={panelOrderRef.current} className="panel-shell" onMouseDown={onMouseDown} style={{
            position: "absolute", left: pos.x, top: pos.y, width: panelWidth, background: `linear-gradient(135deg, ${panelBg}, ${reflectCol})`,
            backdropFilter: `blur(${ambient.panelBlur || 20}px)`, border: `1px solid ${borderCol}`, borderTop: `1px solid ${accentBorder}`, borderRadius: 14, cursor: "grab", zIndex,
            boxShadow: `0 8px 32px rgba(0,0,0,0.18), 0 0 0 1px ${accentGlow}, inset 0 1px 0 ${light ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.04)"}`,
            userSelect: "none", overflow, transition: "border-color 1.5s, background 1.5s, box-shadow 1.5s, transform 0.2s ease", animation: "panelIn 0.3s ease-out",
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

function EmailDropHint({ loading, accent, light, idleText, loadingText }) {
    if (!loading) {
        return (
            <div
                style={{
                    marginBottom: 6,
                    padding: "4px 7px",
                    borderRadius: 7,
                    border: `1px solid ${light ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.18)"}`,
                    background: light ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.04)",
                    fontSize: 8.5,
                    color: light ? "rgba(45,52,54,0.5)" : "rgba(255,255,255,0.45)",
                    fontFamily: "'JetBrains Mono'",
                    letterSpacing: 0.2,
                }}
            >
                {idleText}
            </div>
        );
    }

    return (
        <div
            className="drop-convert-banner"
            style={{
                "--drop-accent": accent,
                marginBottom: 6,
                border: `1px solid ${accent}66`,
                background: light ? `${accent}14` : `${accent}18`,
            }}
        >
            <span
                className="drop-convert-spinner"
                style={{
                    borderColor: light ? "rgba(45,52,54,0.24)" : "rgba(255,255,255,0.26)",
                    borderTopColor: accent,
                }}
            />
            <span className="drop-convert-label">{loadingText}</span>
            <span className="drop-convert-dots" aria-hidden="true">
                <span />
                <span />
                <span />
            </span>
            <span
                className="drop-convert-progress"
                style={{
                    backgroundImage: `linear-gradient(90deg, transparent 0%, ${accent}55 45%, ${accent}cc 50%, ${accent}55 55%, transparent 100%)`,
                }}
            />
        </div>
    );
}

function TasksPanel({
    tasks,
    onToggle,
    onEditTask,
    onRequestSplit,
    onAddTask,
    onEmailDropTask,
    canAcceptEmailDrop = false,
    emailDropLoading = false,
    accent,
    light,
    onClose,
    ambient,
    deadlineAdaptive,
    compressedLowCount = 0,
}) {
    const prioC = { high: "#e74c3c", medium: "#f39c12", low: "#00b894" };
    const txm = light ? "rgba(45,52,54,0.5)" : "rgba(255,255,255,0.45)";
    const dragDepthRef = useRef(0);
    const [dropHover, setDropHover] = useState(false);
    const isDropActive = dropHover || emailDropLoading;

    const hasGmailPayload = (ev) => {
        const types = ev?.dataTransfer?.types;
        if (!types) return false;
        const arr = Array.from(types);
        return arr.includes(GMAIL_DRAG_MIME) || arr.includes("text/plain");
    };

    const handleDragEnter = (ev) => {
        if (!canAcceptEmailDrop || !hasGmailPayload(ev)) return;
        ev.preventDefault();
        dragDepthRef.current += 1;
        setDropHover(true);
    };

    const handleDragOver = (ev) => {
        if (!canAcceptEmailDrop || !hasGmailPayload(ev)) return;
        ev.preventDefault();
        ev.dataTransfer.dropEffect = "copy";
        if (!dropHover) setDropHover(true);
    };

    const handleDragLeave = () => {
        if (!canAcceptEmailDrop) return;
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
        if (dragDepthRef.current === 0) setDropHover(false);
    };

    const handleDrop = (ev) => {
        if (!canAcceptEmailDrop) return;
        ev.preventDefault();
        dragDepthRef.current = 0;
        setDropHover(false);
        const raw = ev.dataTransfer.getData(GMAIL_DRAG_MIME) || ev.dataTransfer.getData("text/plain");
        const emailId = String(raw || "").trim();
        if (!emailId) return;
        onEmailDropTask?.(emailId);
    };

    return (
        <Panel x={24} y={320} width={330} title={`Tasks · ${tasks.filter(t => !t.done && !t.isParent).length} active`} icon="✓" light={light} onClose={onClose} ambient={ambient} accent={accent}>
            <div
                data-nodrag
                onDragEnter={handleDragEnter}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                style={{
                    borderRadius: 10,
                    padding: isDropActive ? "5px 5px 6px" : "0",
                    border: `1px dashed ${isDropActive ? `${accent}88` : "transparent"}`,
                    background: isDropActive
                        ? (light ? `${accent}12` : `${accent}18`)
                        : "transparent",
                    transition: "all 0.16s ease",
                }}
            >
                {(canAcceptEmailDrop || isDropActive) && (
                    <EmailDropHint
                        loading={emailDropLoading}
                        accent={accent}
                        light={light}
                        idleText="Drag a Gmail email here to create a task"
                        loadingText="Converting email to task"
                    />
                )}
                {tasks.length === 0 && <div style={{ fontSize: 12, color: txm, fontStyle: "italic" }}>No tasks yet</div>}
                {deadlineAdaptive && compressedLowCount > 0 && (
                    <div style={{ marginBottom: 6, padding: "4px 7px", borderRadius: 6, background: light ? "rgba(99,110,114,0.08)" : "rgba(99,110,114,0.22)", border: "1px solid rgba(99,110,114,0.35)", fontSize: 8.5, color: txm, fontFamily: "'JetBrains Mono'" }}>
                        ⚡ Deadline mode: {compressedLowCount} low-priority task{compressedLowCount > 1 ? "s" : ""} tucked away.
                    </div>
                )}
                <div style={{ maxHeight: 210, overflowY: "auto", paddingRight: 2 }}>
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
                </div>
                <QuickAdd placeholder="Add task..." onSubmit={onAddTask} light={light} accent={accent} />
            </div>
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
        <Panel x={24} y={485} width={330} title="Calendar" icon="📅" light={light} onClose={onClose} ambient={ambient} accent={accent}>
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

function BudgetPanel({
    expenses,
    budget,
    accent,
    light,
    onClose,
    onDeleteExpense,
    onAddExpense,
    onEmailDropExpense,
    canAcceptEmailDrop = false,
    emailDropLoading = false,
    ambient
}) {
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
    const submit = () => { if (!desc.trim() || !amt || parseFloat(amt) <= 0) return; onAddExpense(desc.trim(), parseFloat(amt), cat); setDesc(""); setAmt(""); setShowForm(false); };
    const dragDepthRef = useRef(0);
    const [dropHover, setDropHover] = useState(false);
    const isDropActive = dropHover || emailDropLoading;

    const hasGmailPayload = (ev) => {
        const types = ev?.dataTransfer?.types;
        if (!types) return false;
        const arr = Array.from(types);
        return arr.includes(GMAIL_DRAG_MIME) || arr.includes("text/plain");
    };

    const handleDragEnter = (ev) => {
        if (!canAcceptEmailDrop || !hasGmailPayload(ev)) return;
        ev.preventDefault();
        dragDepthRef.current += 1;
        setDropHover(true);
    };

    const handleDragOver = (ev) => {
        if (!canAcceptEmailDrop || !hasGmailPayload(ev)) return;
        ev.preventDefault();
        ev.dataTransfer.dropEffect = "copy";
        if (!dropHover) setDropHover(true);
    };

    const handleDragLeave = () => {
        if (!canAcceptEmailDrop) return;
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
        if (dragDepthRef.current === 0) setDropHover(false);
    };

    const handleDrop = (ev) => {
        if (!canAcceptEmailDrop) return;
        ev.preventDefault();
        dragDepthRef.current = 0;
        setDropHover(false);
        const raw = ev.dataTransfer.getData(GMAIL_DRAG_MIME) || ev.dataTransfer.getData("text/plain");
        const emailId = String(raw || "").trim();
        if (!emailId) return;
        onEmailDropExpense?.(emailId);
    };

    return (
        <Panel x={370} y={320} width={250} title="Budget" icon="💰" light={light} onClose={onClose} ambient={ambient} accent={accent}>
            <div
                data-nodrag
                onDragEnter={handleDragEnter}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                style={{
                    borderRadius: 10,
                    padding: isDropActive ? "5px 5px 6px" : "0",
                    border: `1px dashed ${isDropActive ? `${accent}88` : "transparent"}`,
                    background: isDropActive
                        ? (light ? `${accent}12` : `${accent}18`)
                        : "transparent",
                    transition: "all 0.16s ease",
                }}
            >
                {(canAcceptEmailDrop || isDropActive) && (
                    <EmailDropHint
                        loading={emailDropLoading}
                        accent={accent}
                        light={light}
                        idleText="Drag a billing email here to add expense"
                        loadingText="Converting email to budget expense"
                    />
                )}
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
            </div>
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

function GmailPanel({
    emails,
    loading,
    error,
    fetchedAt,
    onRefresh,
    onGenerateSamples,
    generatingSamples,
    onOpenEmail,
    onEmailDragStart,
    onEmailDragEnd,
    selectedEmailId,
    selectedEmailDetail,
    detailLoading,
    detailError,
    light,
    accent,
    ambient,
    onClose
}) {
    const tx = light ? "#2d3436" : "#fff";
    const txm = light ? "rgba(45,52,54,0.5)" : "rgba(255,255,255,0.45)";
    const panelBodyRef = useRef(null);

    const sanitizedDetailHtml = useMemo(() => {
        const raw = String(selectedEmailDetail?.bodyHtml || "").trim();
        if (!raw || typeof window === "undefined" || typeof DOMParser === "undefined") return "";
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(raw, "text/html");

            doc.querySelectorAll("script,style,iframe,object,embed,link,meta,img,video,audio,source,picture,svg,canvas,form,input,button,textarea").forEach(el => el.remove());

            doc.querySelectorAll("*").forEach(el => {
                for (const attr of Array.from(el.attributes || [])) {
                    const name = String(attr.name || "").toLowerCase();
                    const value = String(attr.value || "");

                    if (name.startsWith("on")) el.removeAttribute(attr.name);
                    if (name === "style" || name === "srcset" || name === "class" || name === "id") el.removeAttribute(attr.name);
                    if ((name === "href" || name === "src") && /^\s*javascript:/i.test(value)) el.removeAttribute(attr.name);
                }

                if (el.tagName === "A") {
                    const href = String(el.getAttribute("href") || "");
                    if (!/^(https?:|mailto:)/i.test(href)) {
                        el.removeAttribute("href");
                    } else {
                        el.setAttribute("target", "_blank");
                        el.setAttribute("rel", "noopener noreferrer");
                    }
                }
            });

            return String(doc.body?.innerHTML || "").trim();
        } catch {
            return "";
        }
    }, [selectedEmailDetail?.bodyHtml]);

    const formatEmailTime = (input) => {
        if (!input) return "Unknown time";
        const parsed = new Date(input);
        if (Number.isNaN(parsed.getTime())) return String(input);
        return parsed.toLocaleString([], {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
        });
    };

    const [showDetailPopover, setShowDetailPopover] = useState(false);
    const [detailSide, setDetailSide] = useState("right");

    const recomputeDetailSide = useCallback(() => {
        const el = panelBodyRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const popoverWidth = 360;
        const usableRightEdge = Math.max(640, window.innerWidth - RIGHT_RAIL_WIDTH);
        const spaceRight = usableRightEdge - rect.right;
        const spaceLeft = rect.left;
        if (spaceRight >= popoverWidth + 14) {
            setDetailSide("right");
        } else if (spaceLeft >= popoverWidth + 14) {
            setDetailSide("left");
        } else {
            setDetailSide("right");
        }
    }, []);

    useEffect(() => {
        if (!showDetailPopover) return;
        recomputeDetailSide();
        window.addEventListener("resize", recomputeDetailSide);
        return () => window.removeEventListener("resize", recomputeDetailSide);
    }, [showDetailPopover, recomputeDetailSide, selectedEmailId]);

    const handleOpenEmail = (emailId) => {
        setShowDetailPopover(true);
        recomputeDetailSide();
        onOpenEmail(emailId, { force: false });
    };

    return (
        <Panel
            x={PANEL_EDGE_MARGIN + PANEL_FIXED_WIDTH + PANEL_COLUMN_GAP}
            y={70}
            width={420}
            title={`Gmail · ${emails.length}`}
            icon="📧"
            light={light}
            onClose={onClose}
            ambient={ambient}
            accent={accent}
            overflow="visible"
            zIndex={showDetailPopover ? 90 : 15}
        >
            <div ref={panelBodyRef} style={{ display: "flex", flexDirection: "column", gap: 8, position: "relative" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ fontSize: 9, color: txm, fontFamily: "'JetBrains Mono'" }}>
                        {loading ? "Syncing inbox..." : (fetchedAt ? `Updated ${formatEmailTime(fetchedAt)}` : "Inbox not synced yet")}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <button
                            onClick={onGenerateSamples}
                            disabled={loading || generatingSamples}
                            style={{
                                padding: "3px 8px",
                                borderRadius: 6,
                                border: `1px solid ${accent}44`,
                                background: `${accent}12`,
                                color: accent,
                                cursor: (loading || generatingSamples) ? "not-allowed" : "pointer",
                                fontSize: 9,
                                fontFamily: "'JetBrains Mono'",
                                opacity: (loading || generatingSamples) ? 0.6 : 1,
                            }}
                        >
                            {generatingSamples ? "Generating..." : "Generate tests"}
                        </button>
                        <button
                            onClick={onRefresh}
                            disabled={loading || generatingSamples}
                            style={{
                                padding: "3px 8px",
                                borderRadius: 6,
                                border: `1px solid ${accent}44`,
                                background: `${accent}18`,
                                color: accent,
                                cursor: (loading || generatingSamples) ? "not-allowed" : "pointer",
                                fontSize: 9,
                                fontFamily: "'JetBrains Mono'",
                                opacity: (loading || generatingSamples) ? 0.6 : 1,
                            }}
                        >
                            {loading ? "..." : "Refresh"}
                        </button>
                    </div>
                </div>

                {error && (
                    <div style={{ padding: "7px 8px", borderRadius: 8, border: "1px solid rgba(225,112,85,0.4)", background: "rgba(225,112,85,0.12)", color: "#e17055", fontSize: 10 }}>
                        {error}
                    </div>
                )}

                {!loading && emails.length === 0 && (
                    <div style={{ fontSize: 11, color: txm, fontStyle: "italic" }}>
                        No recent emails matched your Gmail query.
                    </div>
                )}

                <div style={{ maxHeight: 220, overflowY: "auto", display: "grid", gap: 6 }}>
                    {emails.map(mail => {
                        const active = mail.id === selectedEmailId;
                        const fromText = String(mail.from || "").trim() || "Unknown sender";
                        const subjectText = String(mail.subject || "(no subject)").trim() || "(no subject)";
                        const snippetText = String(mail.snippet || "").replace(/\s+/g, " ").trim();
                        const previewText = snippetText || "No preview available";
                        return (
                            <button
                                key={mail.id}
                                className="anim-item"
                                onClick={() => handleOpenEmail(mail.id)}
                                draggable
                                onDragStart={(ev) => {
                                    ev.dataTransfer.effectAllowed = "copy";
                                    ev.dataTransfer.setData(GMAIL_DRAG_MIME, String(mail.id || ""));
                                    ev.dataTransfer.setData("text/plain", String(mail.id || ""));
                                    onEmailDragStart?.(mail.id);
                                }}
                                onDragEnd={() => onEmailDragEnd?.()}
                                style={{
                                    textAlign: "left",
                                    padding: "7px 8px",
                                    borderRadius: 9,
                                    border: `1px solid ${active ? `${accent}88` : (light ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.08)")}`,
                                    background: active ? `${accent}18` : (light ? "rgba(255,255,255,0.62)" : "rgba(255,255,255,0.03)"),
                                    cursor: "pointer",
                                    width: "100%",
                                }}
                            >
                                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0, flex: 1 }}>
                                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: mail.unread ? "#34d399" : "rgba(128,128,128,0.45)", flexShrink: 0 }} />
                                        <div style={{ fontSize: 10, color: txm, fontFamily: "'JetBrains Mono'", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                            {fromText}
                                        </div>
                                    </div>
                                    <div style={{ flexShrink: 0, fontSize: 8.5, color: txm, fontFamily: "'JetBrains Mono'" }}>
                                        {formatEmailTime(mail.receivedAt || mail.date)}
                                    </div>
                                </div>
                                <div style={{ marginTop: 4, fontSize: 11, fontWeight: 600, color: tx, lineHeight: 1.35 }}>
                                    {subjectText}
                                </div>
                                <div style={{ marginTop: 3, fontSize: 10, color: snippetText ? txm : `${txm}bb`, lineHeight: 1.4, fontStyle: snippetText ? "normal" : "italic" }}>
                                    {previewText.slice(0, 180)}
                                </div>
                            </button>
                        );
                    })}
                </div>

                {selectedEmailId && showDetailPopover && (
                    <div
                        onMouseLeave={() => setShowDetailPopover(false)}
                        style={{
                            position: "absolute",
                            top: 0,
                            ...(detailSide === "left" ? { right: "calc(100% + 10px)" } : { left: "calc(100% + 10px)" }),
                            width: 360,
                            maxHeight: 420,
                            zIndex: 30,
                            borderRadius: 12,
                            border: `1px solid ${light ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.1)"}`,
                            background: light ? "rgba(255,255,255,0.94)" : "rgba(14,16,28,0.94)",
                            backdropFilter: "blur(14px)",
                            boxShadow: "0 14px 34px rgba(0,0,0,0.26)",
                            padding: 10,
                            overflow: "hidden",
                        }}
                    >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                            <div style={{ fontSize: 9, color: txm, fontFamily: "'JetBrains Mono'", textTransform: "uppercase", letterSpacing: 1.1 }}>
                                Email detail
                            </div>
                            <button
                                onClick={() => setShowDetailPopover(false)}
                                style={{ background: "none", border: "none", color: txm, cursor: "pointer", fontSize: 13, lineHeight: 1, padding: 0 }}
                            >
                                ×
                            </button>
                        </div>

                        {detailLoading && (
                            <div style={{ marginTop: 8, fontSize: 10, color: txm, fontFamily: "'JetBrains Mono'" }}>
                                Loading detail...
                            </div>
                        )}

                        {detailError && !detailLoading && (
                            <div style={{ marginTop: 8, padding: "6px 7px", borderRadius: 8, border: "1px solid rgba(225,112,85,0.4)", background: "rgba(225,112,85,0.12)", color: "#e17055", fontSize: 10 }}>
                                {detailError}
                            </div>
                        )}

                        {selectedEmailDetail && !detailLoading && !detailError && (
                            <div style={{ marginTop: 8, display: "grid", gap: 5 }}>
                                <div style={{ fontSize: 11, fontWeight: 600, color: tx, lineHeight: 1.35 }}>
                                    {selectedEmailDetail.subject || "(no subject)"}
                                </div>
                                <div style={{ fontSize: 9, color: txm, fontFamily: "'JetBrains Mono'" }}>
                                    From: {selectedEmailDetail.from || "Unknown"}
                                </div>
                                <div style={{ fontSize: 9, color: txm, fontFamily: "'JetBrains Mono'" }}>
                                    To: {selectedEmailDetail.to || "—"}
                                </div>
                                <div style={{ fontSize: 9, color: txm, fontFamily: "'JetBrains Mono'" }}>
                                    Time: {formatEmailTime(selectedEmailDetail.receivedAt || selectedEmailDetail.date)}
                                </div>
                                {selectedEmailDetail.contentLimited && (
                                    <div style={{ marginTop: 2, padding: "6px 7px", borderRadius: 8, border: "1px solid rgba(245,158,11,0.45)", background: "rgba(245,158,11,0.12)", color: light ? "#8a5a00" : "#fbbf24", fontSize: 10, lineHeight: 1.4 }}>
                                        {selectedEmailDetail.contentLimitedReason || "Body unavailable for current Gmail scope."}
                                    </div>
                                )}
                                {selectedEmailDetail.gmailWebUrl && (
                                    <a
                                        href={selectedEmailDetail.gmailWebUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{ fontSize: 9, color: accent, fontFamily: "'JetBrains Mono'", textDecoration: "underline" }}
                                    >
                                        Open in Gmail
                                    </a>
                                )}
                                {sanitizedDetailHtml ? (
                                    <div
                                        style={{
                                            maxHeight: 285,
                                            overflowY: "auto",
                                            marginTop: 2,
                                            padding: "7px 8px",
                                            borderRadius: 8,
                                            border: `1px solid ${light ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.06)"}`,
                                            background: light ? "rgba(0,0,0,0.02)" : "rgba(0,0,0,0.14)",
                                            fontSize: 10,
                                            color: tx,
                                            lineHeight: 1.5,
                                            wordBreak: "break-word",
                                        }}
                                        dangerouslySetInnerHTML={{ __html: sanitizedDetailHtml }}
                                    />
                                ) : (
                                    <div style={{ maxHeight: 285, overflowY: "auto", marginTop: 2, padding: "7px 8px", borderRadius: 8, border: `1px solid ${light ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.06)"}`, background: light ? "rgba(0,0,0,0.02)" : "rgba(0,0,0,0.14)", fontSize: 10, color: tx, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                                        {selectedEmailDetail.body || selectedEmailDetail.snippet || (selectedEmailDetail.contentLimited ? "Body unavailable in API response. Use 'Open in Gmail' to view full content." : "No text body found for this email.")}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </Panel>
    );
}

function AdaptiveInspectorPanel({
    logs,
    ruleModel,
    light,
    accent,
    ambient,
    onClose,
    adaptivePausedUntil,
    onPauseAdaptive,
    onResumeAdaptive
}) {
    const tx = light ? "#2d3436" : "#fff";
    const txm = light ? "rgba(45,52,54,0.5)" : "rgba(255,255,255,0.45)";
    const isPaused = Boolean(adaptivePausedUntil && new Date(adaptivePausedUntil).getTime() > Date.now());
    const untilLabel = isPaused
        ? new Date(adaptivePausedUntil).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })
        : "";
    const ruleLevelColor = ruleModel?.level === "critical" ? "#e17055" : (ruleModel?.level === "warning" ? "#f59e0b" : "#34d399");
    const triggerLabel = Array.isArray(ruleModel?.triggers) && ruleModel.triggers.length > 0
        ? ruleModel.triggers.join(" · ")
        : "none";
    const formatLogTime = (iso) => {
        if (!iso) return "--";
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return "--";
        return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
    };

    return (
        <Panel x={1080} y={70} width={320} title="Adaptive inspector" icon="🧭" light={light} onClose={onClose} ambient={ambient} accent={accent}>
            <div style={{ display: "grid", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ fontSize: 10, color: isPaused ? "#f59e0b" : accent, fontFamily: "'JetBrains Mono'" }}>
                        {isPaused ? `Paused until ${untilLabel}` : "Adaptive automation active"}
                    </div>
                    <button
                        onClick={isPaused ? onResumeAdaptive : onPauseAdaptive}
                        style={{
                            padding: "4px 8px",
                            borderRadius: 7,
                            fontSize: 9,
                            cursor: "pointer",
                            fontFamily: "'JetBrains Mono'",
                            border: `1px solid ${isPaused ? `${accent}55` : "rgba(245,158,11,0.5)"}`,
                            background: isPaused ? `${accent}18` : "rgba(245,158,11,0.15)",
                            color: isPaused ? accent : "#f59e0b",
                        }}
                    >
                        {isPaused ? "Resume now" : "Pause 2h"}
                    </button>
                </div>

                {ruleModel && (
                    <div style={{ borderRadius: 10, padding: "7px 8px", border: `1px solid ${light ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.08)"}`, background: light ? "rgba(255,255,255,0.58)" : "rgba(255,255,255,0.03)", display: "grid", gap: 4 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                            <div style={{ fontSize: 9, color: txm, fontFamily: "'JetBrains Mono'", textTransform: "uppercase", letterSpacing: 1 }}>
                                Rule model
                            </div>
                            <div style={{ fontSize: 10, color: ruleLevelColor, fontFamily: "'JetBrains Mono'" }}>
                                {ruleModel.level.toUpperCase()} · {ruleModel.score}/100
                            </div>
                        </div>
                        <div style={{ fontSize: 8.5, color: txm, fontFamily: "'JetBrains Mono'", lineHeight: 1.45 }}>
                            Triggers: {triggerLabel}
                        </div>
                        {Array.isArray(ruleModel?.evidence) && ruleModel.evidence.length > 0 && (
                            <div style={{ fontSize: 8.5, color: txm, fontFamily: "'JetBrains Mono'", lineHeight: 1.45 }}>
                                {ruleModel.evidence.slice(0, 2).join(" · ")}
                            </div>
                        )}
                    </div>
                )}

                <div style={{ maxHeight: 280, overflowY: "auto", display: "grid", gap: 6 }}>
                    {logs.length === 0 && (
                        <div style={{ fontSize: 10, color: txm, fontStyle: "italic" }}>
                            No adaptive decisions recorded yet.
                        </div>
                    )}
                    {logs.map((item) => (
                        <div
                            key={item.id}
                            style={{
                                borderRadius: 10,
                                border: `1px solid ${light ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.08)"}`,
                                background: light ? "rgba(255,255,255,0.58)" : "rgba(255,255,255,0.03)",
                                padding: "7px 8px",
                                display: "grid",
                                gap: 4,
                            }}
                        >
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                                <div style={{ fontSize: 10, fontWeight: 600, color: tx }}>{item.title || "Adaptive event"}</div>
                                <div style={{ fontSize: 8.5, color: txm, fontFamily: "'JetBrains Mono'" }}>{formatLogTime(item.at)}</div>
                            </div>
                            {item.reason && <div style={{ fontSize: 9.5, color: txm, lineHeight: 1.4 }}>{item.reason}</div>}
                            {Array.isArray(item.evidence) && item.evidence.length > 0 && (
                                <div style={{ fontSize: 8.5, color: txm, fontFamily: "'JetBrains Mono'", lineHeight: 1.45 }}>
                                    {item.evidence.slice(0, 3).join(" · ")}
                                </div>
                            )}
                            {item.outcome && (
                                <div style={{ fontSize: 8.5, color: accent, fontFamily: "'JetBrains Mono'" }}>
                                    Outcome: {item.outcome}
                                </div>
                            )}
                        </div>
                    ))}
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
    const [showTasks, setShowTasks] = useState(true), [showCal, setShowCal] = useState(true), [showBudget, setShowBudget] = useState(true), [showRewards, setShowRewards] = useState(true), [showWeather, setShowWeather] = useState(true), [showGmail, setShowGmail] = useState(true), [showInspector, setShowInspector] = useState(true);
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
        { id: "t_deadline_test", text: "Submit adaptive report draft (72h test) 🧪", priority: "high", done: false },
        { id: "t3", text: "Plan study blocks for the week 🗓️", priority: "low", done: false },
    ]);
    const [timers, setTimers] = useState([]), [widgets, setWidgets] = useState([]);
    const [events, setEvents] = useState([
        { id: "e1", title: "Lecture block 📚", date: new Date().toISOString().split("T")[0], time: "10:00", duration: 60, color: "#6c5ce7" },
        { id: "e2", title: "Team checkpoint 👥", date: (() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().split("T")[0]; })(), time: "15:00", duration: 45, color: "#00cec9" },
        { id: "e_deadline_test", title: "Assignment deadline test ⚡", date: (() => { const d = new Date(); d.setDate(d.getDate() + 2); return d.toISOString().split("T")[0]; })(), time: "23:00", duration: 30, color: "#e17055" },
    ]);
    const [expenses, setExpenses] = useState([{ id: "x1", description: "Coffee ☕", amount: 4.50, category: "food" }, { id: "x2", description: "Bus fare 🚍", amount: 20, category: "transport" }, { id: "x3", description: "Library lunch 🥪", amount: 8.90, category: "food" }]);
    const [budget, setBudgetVal] = useState(500);
    const [weeklyGoalCategory, setWeeklyGoalCategory] = useState("tasks");
    const [weeklyGoalTarget, setWeeklyGoalTarget] = useState(5);
    const [gmailEmails, setGmailEmails] = useState([]);
    const [gmailLoading, setGmailLoading] = useState(false);
    const [gmailError, setGmailError] = useState("");
    const [gmailFetchedAt, setGmailFetchedAt] = useState("");
    const [selectedGmailEmailId, setSelectedGmailEmailId] = useState(null);
    const [gmailDetailById, setGmailDetailById] = useState({});
    const [gmailDetailLoading, setGmailDetailLoading] = useState(false);
    const [gmailDetailError, setGmailDetailError] = useState("");
    const [gmailGenerateLoading, setGmailGenerateLoading] = useState(false);
    const [isGmailDragging, setIsGmailDragging] = useState(false);
    const [emailDropLoading, setEmailDropLoading] = useState(false);
    const [emailBudgetDropLoading, setEmailBudgetDropLoading] = useState(false);
    const [adaptiveLog, setAdaptiveLog] = useState([]);
    const [adaptivePausedUntil, setAdaptivePausedUntil] = useState(null);
    const [input, setInput] = useState(""), [loading, setLoading] = useState(false);
    const [lennyMood, setLennyMood] = useState("neutral");
    const [nowTick, setNowTick] = useState(() => Date.now());
    const [msgs, setMsgs] = useState([{ role: "assistant", text: `Ready! (${LLM_CONFIG.mode === "local" ? "local LLM" : "API"})\n\n• "make it cozy"\n• "check off documentation"\n• "meeting this friday 2pm"\n• "I spent €12 on lunch"\n• "focus mode"\n• "sync gmail tasks"\n• "show gmail emails"\n• Drag a billing email into Budget` }]);

    const scrollRef = useRef(null), inputRef = useRef(null), idRef = useRef(300), ambientTimerRef = useRef(null), deadlineModeKeyRef = useRef("");
    const gmailAutoSyncKeyRef = useRef("");
    const gmailAutoSyncInFlightRef = useRef(false);
    const adaptivePauseExpiryRef = useRef(null);
    const dashboardStateReadyRef = useRef(false);
    const lastPersistedStateJsonRef = useRef("");
    const headerRef = useRef(null);
    const [headerLockY, setHeaderLockY] = useState(0);
    useEffect(() => {
        if (!headerRef.current) return;
        const ro = new ResizeObserver(entries => setHeaderLockY(entries[0].contentRect.height + 8));
        ro.observe(headerRef.current);
        return () => ro.disconnect();
    }, []);
    const gid = () => `i${idRef.current++}`;
    const loadDashboardStateFromDb = useCallback(async () => {
        const res = await fetch("/search/dashboard-state-load", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || `Dashboard state load failed (${res.status})`);
        return data;
    }, []);
    const saveDashboardStateToDb = useCallback(async (state) => {
        const res = await fetch("/search/dashboard-state-save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ state }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || `Dashboard state save failed (${res.status})`);
        return data;
    }, []);
    const pushAdaptiveLog = useCallback((entry) => {
        const row = {
            id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
            at: new Date().toISOString(),
            title: entry?.title || "Adaptive event",
            reason: entry?.reason || "",
            evidence: Array.isArray(entry?.evidence) ? entry.evidence : [],
            outcome: entry?.outcome || "",
        };
        setAdaptiveLog(prev => [row, ...prev].slice(0, 40));
    }, []);

    const pauseAdaptiveForTwoHours = useCallback(() => {
        const until = new Date(Date.now() + 2 * 60 * 60 * 1000);
        setAdaptivePausedUntil(until.toISOString());
        pushAdaptiveLog({
            title: "Adaptive mode paused",
            reason: "Manual override by user.",
            evidence: [`Pause window: 2h`, `Until: ${until.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })}`],
            outcome: "Deadline-triggered automation temporarily disabled.",
        });
    }, [pushAdaptiveLog]);

    const resumeAdaptiveNow = useCallback(() => {
        setAdaptivePausedUntil(null);
        pushAdaptiveLog({
            title: "Adaptive mode resumed",
            reason: "Manual resume by user.",
            evidence: ["Pause override removed."],
            outcome: "Automatic adaptation re-enabled.",
        });
    }, [pushAdaptiveLog]);

    useEffect(() => {
        if (!adaptivePausedUntil) {
            adaptivePauseExpiryRef.current = null;
            return;
        }
        const untilMs = new Date(adaptivePausedUntil).getTime();
        if (Number.isNaN(untilMs) || untilMs > nowTick) return;
        if (adaptivePauseExpiryRef.current === adaptivePausedUntil) return;
        adaptivePauseExpiryRef.current = adaptivePausedUntil;
        setAdaptivePausedUntil(null);
        pushAdaptiveLog({
            title: "Adaptive pause expired",
            reason: "Pause window reached its end.",
            evidence: [`Expired at ${new Date(untilMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })}`],
            outcome: "Automatic adaptation re-enabled.",
        });
    }, [adaptivePausedUntil, nowTick, pushAdaptiveLog]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const payload = await loadDashboardStateFromDb();
                if (cancelled) return;
                const state = payload?.state;
                if (!state || typeof state !== "object" || Array.isArray(state)) {
                    dashboardStateReadyRef.current = true;
                    return;
                }

                if (typeof state.bg === "string" && state.bg.trim()) setBg(state.bg);
                if (typeof state.greeting === "string" && state.greeting.trim()) setGreeting(state.greeting);
                if (typeof state.accent === "string" && state.accent.trim()) setAccent(state.accent);
                if (state.ambient && typeof state.ambient === "object" && !Array.isArray(state.ambient)) {
                    setAmbient(prev => ({
                        ...prev,
                        ...state.ambient,
                        glowIntensity: Math.min(0.35, Math.max(0, Number(state.ambient?.glowIntensity ?? prev.glowIntensity))),
                        grainOpacity: Math.min(0.08, Math.max(0, Number(state.ambient?.grainOpacity ?? prev.grainOpacity))),
                        borderWarmth: Math.min(1, Math.max(0, Number(state.ambient?.borderWarmth ?? prev.borderWarmth))),
                    }));
                }
                if (typeof state.lennyMood === "string" && state.lennyMood.trim()) setLennyMood(state.lennyMood);

                if (typeof state.showTasks === "boolean") setShowTasks(state.showTasks);
                if (typeof state.showCal === "boolean") setShowCal(state.showCal);
                if (typeof state.showBudget === "boolean") setShowBudget(state.showBudget);
                if (typeof state.showRewards === "boolean") setShowRewards(state.showRewards);
                if (typeof state.showWeather === "boolean") setShowWeather(state.showWeather);
                if (typeof state.showGmail === "boolean") setShowGmail(state.showGmail);
                if (typeof state.showInspector === "boolean") setShowInspector(state.showInspector);
                if (typeof state.showTCDModules === "boolean") setShowTCDModules(state.showTCDModules);
                if (typeof state.showTimetable === "boolean") setShowTimetable(state.showTimetable);

                if (Array.isArray(state.modules)) setModules(state.modules);
                if (Array.isArray(state.timetable)) setTimetable(state.timetable);
                if (state.tcdDegree === null || (state.tcdDegree && typeof state.tcdDegree === "object" && !Array.isArray(state.tcdDegree))) {
                    setTcdDegree(state.tcdDegree);
                }

                if (Array.isArray(state.postits)) setPostits(state.postits);
                if (typeof state.showPostitLibrary === "boolean") setShowPostitLibrary(state.showPostitLibrary);
                if (typeof state.selectedPostitId === "string" || state.selectedPostitId === null) setSelectedPostitId(state.selectedPostitId);

                if (Array.isArray(state.tasks)) setTasks(state.tasks);
                if (Array.isArray(state.timers)) setTimers(state.timers);
                if (Array.isArray(state.widgets)) setWidgets(state.widgets);
                if (Array.isArray(state.events)) setEvents(state.events);
                if (Array.isArray(state.expenses)) setExpenses(state.expenses);
                if (Number.isFinite(Number(state.budget))) setBudgetVal(Number(state.budget));
                if (state.weeklyGoalCategory === "tasks" || state.weeklyGoalCategory === "events" || state.weeklyGoalCategory === "study") {
                    setWeeklyGoalCategory(state.weeklyGoalCategory);
                }
                if (Number.isFinite(Number(state.weeklyGoalTarget))) {
                    setWeeklyGoalTarget(Math.max(1, Math.min(50, Math.round(Number(state.weeklyGoalTarget)))));
                }
                if (Array.isArray(state.adaptiveLog)) setAdaptiveLog(state.adaptiveLog.slice(0, 40));
                if (typeof state.adaptivePausedUntil === "string" || state.adaptivePausedUntil === null) setAdaptivePausedUntil(state.adaptivePausedUntil);

                try {
                    lastPersistedStateJsonRef.current = JSON.stringify(state);
                } catch {
                    lastPersistedStateJsonRef.current = "";
                }
            } catch (e) {
                console.warn("[state-db] load failed:", e?.message || e);
            } finally {
                if (!cancelled) dashboardStateReadyRef.current = true;
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [loadDashboardStateFromDb]);

    useEffect(() => { scrollRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, loading]);
    useEffect(() => {
        if (showPostitLibrary && !selectedPostitId && postits.length) setSelectedPostitId(postits[0].id);
        if (!postits.length && selectedPostitId) setSelectedPostitId(null);
    }, [showPostitLibrary, postits, selectedPostitId]);
    useEffect(() => {
        const timer = setInterval(() => setNowTick(Date.now()), 60000);
        return () => clearInterval(timer);
    }, []);

    const themes = {
        cozy: { bg: "linear-gradient(135deg, #2d1b14 0%, #1a1410 50%, #0d0a07 100%)", accent: "#e17055" },
        focus: { bg: "#0a0a12", accent: "#636e72" }, ocean: { bg: "linear-gradient(135deg, #0c1829 0%, #0a2a3f 40%, #134e5e 100%)", accent: "#00cec9" },
        sunset: { bg: "linear-gradient(135deg, #1a0a2e 0%, #3d1c56 30%, #c0392b 70%, #e67e22 100%)", accent: "#e67e22" },
        forest: { bg: "linear-gradient(135deg, #0a1a0a 0%, #1a2f1a 50%, #0d1f0d 100%)", accent: "#00b894" },
        midnight: { bg: "linear-gradient(135deg, #020111 0%, #0a0a2e 50%, #060620 100%)", accent: "#6c5ce7" },
        minimal: { bg: "#f5f0eb", accent: "#2d3436" },
    };
    const themeMoodMap = {
        focus: "focus",
        cozy: "cozy",
        ocean: "ocean",
        sunset: "sunset",
        forest: "forest",
        midnight: "midnight",
        minimal: "minimal",
    };

    const deadlineCandidates = useMemo(() => {
        const now = new Date(nowTick);

        const eventDeadlines = events.map(ev => {
            if (!DEADLINE_TITLE_RE.test(String(ev.title || ""))) return null;
            const dueAt = parseDateTime(ev.date, ev.time || "23:59");
            if (!dueAt) return null;
            const hoursLeft = (dueAt.getTime() - now.getTime()) / 36e5;
            if (hoursLeft < 0) return null;
            return {
                id: ev.id,
                label: ev.title || "Deadline event",
                dueAt,
                source: "event",
                hoursLeft,
            };
        }).filter(Boolean);

        const moduleDeadlines = modules.map(m => {
            if (!m?.deadline) return null;
            const dueAt = parseLooseDate(String(m.deadline));
            if (!dueAt) return null;
            const hoursLeft = (dueAt.getTime() - now.getTime()) / 36e5;
            if (hoursLeft < 0) return null;
            return {
                id: m.id || m.code || m.name,
                label: `${m.code || "Module"} deadline`,
                dueAt,
                source: "module",
                hoursLeft,
            };
        }).filter(Boolean);

        return [...eventDeadlines, ...moduleDeadlines].sort((a, b) => a.hoursLeft - b.hoursLeft);
    }, [events, modules, nowTick]);

    const adaptiveRuleModel = useMemo(() => evaluateAdaptiveRuleModel({
        deadlineCandidates,
        tasks,
    }), [deadlineCandidates, tasks]);
    const nearestDeadline = adaptiveRuleModel.nearestDeadline || null;
    const adaptivePausedActive = Boolean(adaptivePausedUntil && new Date(adaptivePausedUntil).getTime() > nowTick);
    const deadlineAdaptiveActive = Boolean(!adaptivePausedActive && adaptiveRuleModel.shouldActivateFocus);

    const deadlineTaskView = useMemo(() => {
        if (!deadlineAdaptiveActive || !adaptiveRuleModel.shouldCompressLowPriority) return { list: tasks, hiddenLowCount: 0 };
        let lowVisible = 0;
        let hiddenLowCount = 0;
        const list = tasks.filter(task => {
            const isCompressibleLowPriority = !task.done && !task.isParent && !task.parentId && (task.priority || "medium") === "low";
            if (!isCompressibleLowPriority) return true;
            lowVisible += 1;
            if (lowVisible <= 1) return true;
            hiddenLowCount += 1;
            return false;
        });
        return { list, hiddenLowCount };
    }, [tasks, deadlineAdaptiveActive, adaptiveRuleModel.shouldCompressLowPriority]);

    const minimalLoopPlan = useMemo(() => {
        if (!deadlineAdaptiveActive || !nearestDeadline) return null;
        const focusTasks = tasks
            .filter(task => !task.done && !task.isParent && !task.parentId)
            .sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1));

        const dueLabel = `${nearestDeadline.dueAt.toLocaleDateString([], { month: "short", day: "numeric" })} ${nearestDeadline.dueAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })}`;
        const steps = [
            `Deliver ${nearestDeadline.label} by ${dueLabel}`,
            focusTasks[0] ? `Finish: ${focusTasks[0].text}` : "Finish one high-impact task block",
            focusTasks[1] ? `Polish: ${focusTasks[1].text}` : "Submit with a 30-minute review buffer",
        ];
        return { steps };
    }, [deadlineAdaptiveActive, nearestDeadline, tasks]);

    useEffect(() => {
        if (!deadlineAdaptiveActive || !nearestDeadline) {
            deadlineModeKeyRef.current = "";
            return;
        }
        const triggerKey = `${nearestDeadline.id}:${nearestDeadline.dueAt.toISOString()}:${adaptiveRuleModel.level}`;
        if (deadlineModeKeyRef.current === triggerKey) return;
        deadlineModeKeyRef.current = triggerKey;

        setBg(themes.focus.bg);
        setAccent(themes.focus.accent);
        setAmbient(prev => ({
            ...prev,
            mood: "focus",
            particles: "none",
            glowColor: prev.glowColor === "transparent" ? "#74b9ff" : prev.glowColor,
            glowIntensity: Math.max(prev.glowIntensity || 0, 0.09),
        }));
        setLennyMood("focus");
        pushAdaptiveLog({
            title: "Deadline pressure trigger",
            reason: "Rule model crossed adaptive threshold.",
            evidence: [
                `Rule score: ${adaptiveRuleModel.score}/100 (${adaptiveRuleModel.level})`,
                `Detected: ${formatHoursLeft(nearestDeadline.hoursLeft)}`,
                `Source: ${nearestDeadline.source}`,
                ...adaptiveRuleModel.evidence.slice(0, 2),
            ],
            outcome: "Switched to Deep focus and compressed low-priority tasks.",
        });
        setMsgs(m => [...m, { role: "assistant", text: `Rule-adaptive mode activated (${adaptiveRuleModel.score}/100, ${formatHoursLeft(nearestDeadline.hoursLeft)} left). Switched to Deep focus.` }]);
    }, [deadlineAdaptiveActive, nearestDeadline, pushAdaptiveLog, adaptiveRuleModel.level, adaptiveRuleModel.score, adaptiveRuleModel.evidence]);

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

    const fetchGmailEmailDetail = useCallback(async (emailId, { force = false } = {}) => {
        const id = String(emailId || "").trim();
        if (!id) return null;

        if (!force && gmailDetailById[id]) return gmailDetailById[id];

        setGmailDetailLoading(true);
        setGmailDetailError("");
        try {
            const res = await fetch("/search/gmail-email-detail", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id, forceRefresh: !!force }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data?.error || `Email detail failed (${res.status})`);
            if (!data?.email) throw new Error("Email detail not found");

            setGmailDetailById(prev => ({ ...prev, [id]: data.email }));
            return data.email;
        } catch (e) {
            const message = e?.message || "Failed to load email detail";
            setGmailDetailError(message);
            throw new Error(message);
        } finally {
            setGmailDetailLoading(false);
        }
    }, [gmailDetailById]);

    const openGmailEmail = useCallback((emailId, { force = false } = {}) => {
        const id = String(emailId || "").trim();
        if (!id) return;
        setSelectedGmailEmailId(id);
        fetchGmailEmailDetail(id, { force }).catch(() => { });
    }, [fetchGmailEmailDetail]);

    const fetchGmailEmails = useCallback(async ({ maxEmails = 12, forceRefresh = false } = {}) => {
        setGmailLoading(true);
        setGmailError("");
        try {
            const res = await fetch("/search/gmail-emails", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ maxEmails, forceRefresh: !!forceRefresh }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data?.error || `Email fetch failed (${res.status})`);

            const list = Array.isArray(data.emails) ? data.emails : [];
            setGmailEmails(list);
            setGmailFetchedAt(data.fetchedAt || new Date().toISOString());
            setGmailDetailError("");

            let nextSelected = selectedGmailEmailId;
            if (!nextSelected || !list.some(mail => mail.id === nextSelected)) {
                nextSelected = list[0]?.id || null;
            }
            setSelectedGmailEmailId(nextSelected || null);
            if (nextSelected) {
                fetchGmailEmailDetail(nextSelected, { force: !!forceRefresh }).catch(() => { });
            }

            return {
                count: list.length,
                unread: list.filter(m => m?.unread).length,
            };
        } catch (e) {
            const message = e?.message || "Failed to fetch Gmail inbox";
            setGmailError(message);
            throw new Error(message);
        } finally {
            setGmailLoading(false);
        }
    }, [selectedGmailEmailId, fetchGmailEmailDetail]);

    const generateGmailSampleEmails = useCallback(async () => {
        if (gmailGenerateLoading) return;
        setGmailGenerateLoading(true);
        setGmailError("");
        try {
            const res = await fetch("/search/gmail-generate-sample-emails", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ kinds: ["assignment", "meeting", "bill"] }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data?.error || `Sample generation failed (${res.status})`);

            const sent = Array.isArray(data?.sent) ? data.sent : [];
            setMsgs(m => [...m, {
                role: "assistant",
                text: sent.length > 0
                    ? `Generated ${sent.length} test emails (assignment, meeting, bill).`
                    : "Sample generation completed, but no emails were sent.",
            }]);
            pushAdaptiveLog({
                title: sent.length > 0 ? "Test emails generated" : "Test email generation complete",
                reason: "User requested randomized GLM inbox fixtures.",
                evidence: sent.slice(0, 3).map(item => {
                    const kind = String(item?.kind || "unknown");
                    const subject = String(item?.subject || "").replace(/\s+/g, " ").trim().slice(0, 70);
                    return `${kind}: ${subject || "(no subject)"}`;
                }),
                outcome: `${sent.length} email(s) sent to ${String(data?.to || "configured mailbox")}.`,
            });
            await fetchGmailEmails({ maxEmails: 15, forceRefresh: true });
        } catch (e) {
            const message = e?.message || "Failed to generate test emails";
            setGmailError(message);
            setMsgs(m => [...m, { role: "assistant", text: `Generate tests failed: ${message}` }]);
            pushAdaptiveLog({
                title: "Test email generation failed",
                reason: "GLM sample email generation did not complete.",
                evidence: [`Error: ${message}`],
                outcome: "Inbox fixtures were not created.",
            });
        } finally {
            setGmailGenerateLoading(false);
        }
    }, [gmailGenerateLoading, fetchGmailEmails, pushAdaptiveLog]);

    useEffect(() => {
        if (!showGmail) return;
        if (gmailLoading) return;
        if (gmailEmails.length > 0) return;
        if (gmailError) return;
        fetchGmailEmails({ maxEmails: 12 }).catch(() => { });
    }, [showGmail, gmailLoading, gmailEmails.length, gmailError, fetchGmailEmails]);

    const syncGmailTasks = useCallback(async ({ refreshInbox = true } = {}) => {
        try {
            const res = await fetch("/search/gmail-tasks-sync", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ maxEmails: 12 }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data?.error || `Sync failed (${res.status})`);

            const extracted = Array.isArray(data.tasks) ? data.tasks : [];
            let addedCount = 0;
            let addedTaskAuditRows = [];

            setTasks(prev => {
                const existingText = new Set(prev.map(t => String(t.text || "").toLowerCase().trim()));
                const existingComposite = new Set(
                    prev.map(t => {
                        const textKey = String(t.text || "").toLowerCase().trim();
                        const src = String(t.sourceEmailId || "").trim();
                        return `${src}::${textKey}`;
                    })
                );
                const additions = [];
                for (const item of extracted) {
                    const text = String(item?.text || "").trim();
                    if (!text) continue;
                    const textKey = text.toLowerCase();
                    const sourceEmailId = String(item?.sourceEmailId || "").trim();
                    const compositeKey = `${sourceEmailId}::${textKey}`;
                    if (existingText.has(textKey) || existingComposite.has(compositeKey)) continue;
                    existingText.add(textKey);
                    existingComposite.add(compositeKey);
                    const priority = ["high", "medium", "low"].includes(String(item?.priority || "").toLowerCase()) ? String(item.priority).toLowerCase() : "medium";
                    const nextTask = {
                        id: gid(),
                        text: text.slice(0, TASK_CHAR_LIMIT),
                        priority,
                        done: false,
                        sourceEmailId,
                        priorityScore: Number.isFinite(Number(item?.priorityScore)) ? Number(item.priorityScore) : null,
                        priorityReason: String(item?.priorityReason || "").trim(),
                    };
                    additions.push(nextTask);
                }
                addedCount = additions.length;
                addedTaskAuditRows = additions.map(task => ({
                    text: String(task?.text || ""),
                    priority: String(task?.priority || "medium"),
                    sourceEmailId: String(task?.sourceEmailId || "").trim(),
                }));
                if (!additions.length) return prev;
                return [...additions, ...prev];
            });

            if (refreshInbox) {
                fetchGmailEmails({ maxEmails: 12 }).catch(() => { });
            }

            const stats = {
                scanned: Number(data.emailsScanned || 0),
                extracted: extracted.length,
                added: addedCount,
            };
            pushAdaptiveLog({
                title: stats.added > 0 ? "Inbox tasks added" : "Inbox sync complete",
                reason: "Gmail messages were parsed and prioritized.",
                evidence: [
                    `Emails scanned: ${stats.scanned}`,
                    `Tasks extracted: ${stats.extracted}`,
                    `Tasks added: ${stats.added}`,
                ],
                outcome: stats.added > 0 ? "New tasks were inserted into the task list." : "No new actionable tasks found.",
            });
            if (addedTaskAuditRows.length > 0) {
                pushAdaptiveLog({
                    title: addedTaskAuditRows.length > 1 ? "Emails converted to tasks" : "Email converted to task",
                    reason: "Inspector trace for Gmail → Task conversions.",
                    evidence: addedTaskAuditRows.slice(0, 3).map((row, idx) => {
                        const cleanText = String(row.text || "").replace(/\s+/g, " ").trim().slice(0, 60);
                        const source = row.sourceEmailId || "unknown";
                        return `${idx + 1}. ${cleanText} · ${row.priority} · ${source}`;
                    }),
                    outcome: `${addedTaskAuditRows.length} task(s) added from inbox sync.`,
                });
            }
            return stats;
        } catch (e) {
            const message = e?.message || "Gmail task sync failed";
            pushAdaptiveLog({
                title: "Inbox sync failed",
                reason: "Task extraction from Gmail did not complete.",
                evidence: [`Error: ${message}`],
                outcome: "No task updates were applied.",
            });
            throw new Error(message);
        }
    }, [fetchGmailEmails, pushAdaptiveLog]);

    const convertDroppedGmailEmailToTask = useCallback(async (emailId) => {
        const id = String(emailId || "").trim();
        if (!id || emailDropLoading) return;

        setEmailDropLoading(true);
        setShowTasks(true);
        try {
            const res = await fetch("/search/gmail-email-to-task", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data?.error || `Email-to-task failed (${res.status})`);

            const item = data?.task;
            const emailSubject = String(data?.email?.subject || "").replace(/\s+/g, " ").trim();
            const emailFrom = String(data?.email?.from || "").replace(/\s+/g, " ").trim();
            const modelUsed = String(data?.model || "").trim();
            if (!item || typeof item !== "object") {
                throw new Error("No actionable task found in this email");
            }

            const text = String(item?.text || "").replace(/\s+/g, " ").trim().slice(0, TASK_CHAR_LIMIT);
            if (!text) throw new Error("Task text missing from GLM conversion");

            const sourceEmailId = String(item?.sourceEmailId || id).trim();
            const priority = ["high", "medium", "low"].includes(String(item?.priority || "").toLowerCase())
                ? String(item.priority).toLowerCase()
                : "medium";
            const priorityScore = Number.isFinite(Number(item?.priorityScore)) ? Number(item.priorityScore) : null;
            const priorityReason = String(item?.priorityReason || "").trim();

            let addedTask = null;
            let duplicate = false;
            setTasks(prev => {
                const textKey = text.toLowerCase();
                const compositeKey = `${sourceEmailId}::${textKey}`;
                const existingComposite = new Set(
                    prev.map(t => `${String(t?.sourceEmailId || "").trim()}::${String(t?.text || "").toLowerCase().trim()}`)
                );
                const existingText = new Set(prev.map(t => String(t?.text || "").toLowerCase().trim()));
                if (existingComposite.has(compositeKey) || existingText.has(textKey)) {
                    duplicate = true;
                    return prev;
                }
                addedTask = {
                    id: gid(),
                    text,
                    priority,
                    done: false,
                    sourceEmailId,
                    priorityScore,
                    priorityReason,
                };
                return [addedTask, ...prev];
            });

            if (duplicate || !addedTask) {
                setMsgs(m => [...m, { role: "assistant", text: "That email task already exists in your task list." }]);
                pushAdaptiveLog({
                    title: "Email drop skipped",
                    reason: "Dropped email converted to an existing task.",
                    evidence: [
                        emailSubject ? `Subject: ${emailSubject.slice(0, 80)}` : null,
                        `Email id: ${sourceEmailId || id}`,
                        `Task: ${text}`,
                    ].filter(Boolean),
                    outcome: "No duplicate task added.",
                });
                return;
            }

            setMsgs(m => [...m, { role: "assistant", text: `Task added from email: ${addedTask.text}` }]);
            setLennyMood("productive");
            pushAdaptiveLog({
                title: "Email converted to task",
                reason: "User dropped a Gmail item onto Tasks panel.",
                evidence: [
                    emailSubject ? `Subject: ${emailSubject.slice(0, 80)}` : null,
                    `Priority: ${addedTask.priority}${Number.isFinite(addedTask.priorityScore) ? ` (${addedTask.priorityScore})` : ""}`,
                    `Email id: ${sourceEmailId || id}`,
                    emailFrom ? `From: ${emailFrom.slice(0, 70)}` : null,
                ].filter(Boolean),
                outcome: addedTask.priorityReason
                    ? `${modelUsed ? `${modelUsed} · ` : ""}${addedTask.priorityReason}`
                    : `${modelUsed ? `${modelUsed} · ` : ""}Task inserted at the top of task list.`,
            });
        } catch (e) {
            const message = e?.message || "Failed to convert dropped email to task";
            setMsgs(m => [...m, { role: "assistant", text: `Drop-to-task failed: ${message}` }]);
            pushAdaptiveLog({
                title: "Email drop failed",
                reason: "Email-to-task conversion did not complete.",
                evidence: [`Error: ${message}`],
                outcome: "No task was added.",
            });
        } finally {
            setEmailDropLoading(false);
            setIsGmailDragging(false);
        }
    }, [emailDropLoading, pushAdaptiveLog]);

    const convertDroppedGmailEmailToExpense = useCallback(async (emailId) => {
        const id = String(emailId || "").trim();
        if (!id || emailBudgetDropLoading) return;

        const allowedCategories = new Set(["food", "transport", "entertainment", "shopping", "bills", "health", "other"]);
        const normalizeCategory = (raw) => {
            const value = String(raw || "").toLowerCase().trim();
            return allowedCategories.has(value) ? value : "other";
        };

        setEmailBudgetDropLoading(true);
        setShowBudget(true);
        try {
            const res = await fetch("/search/gmail-email-to-expense", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data?.error || `Email-to-expense failed (${res.status})`);

            const item = data?.expense;
            const emailSubject = String(data?.email?.subject || "").replace(/\s+/g, " ").trim();
            const emailFrom = String(data?.email?.from || "").replace(/\s+/g, " ").trim();
            const modelUsed = String(data?.model || "").trim();
            if (!item || typeof item !== "object") {
                setMsgs(m => [...m, { role: "assistant", text: "That email does not look like a bill/payment with a clear amount." }]);
                pushAdaptiveLog({
                    title: "Email drop skipped",
                    reason: "Dropped email was not classified as budget expense.",
                    evidence: [
                        emailSubject ? `Subject: ${emailSubject.slice(0, 80)}` : null,
                        `Email id: ${id}`,
                    ].filter(Boolean),
                    outcome: "No budget item added.",
                });
                return;
            }

            const description = String(item?.description || data?.email?.subject || "Email expense")
                .replace(/\s+/g, " ")
                .trim()
                .slice(0, EXPENSE_DESC_CHAR_LIMIT);
            const amountRaw = Number(item?.amount);
            const amount = Number.isFinite(amountRaw) ? Math.round(amountRaw * 100) / 100 : NaN;
            const category = normalizeCategory(item?.category);
            const sourceEmailId = String(item?.sourceEmailId || id).trim();
            const reason = String(item?.reason || "").trim();

            if (!description) throw new Error("Expense description missing from GLM conversion");
            if (!Number.isFinite(amount) || amount <= 0) throw new Error("Expense amount missing from GLM conversion");

            let addedExpense = null;
            let duplicate = false;
            setExpenses(prev => {
                const normalizedDescription = description.toLowerCase();
                const amountKey = amount.toFixed(2);
                const compositeKey = `${sourceEmailId}::${normalizedDescription}::${amountKey}`;
                const existingComposite = new Set(
                    prev.map(ex => {
                        const exSource = String(ex?.sourceEmailId || "").trim();
                        const exDesc = String(ex?.description || "").toLowerCase().trim();
                        const exAmount = Number.isFinite(Number(ex?.amount)) ? Number(ex.amount).toFixed(2) : "0.00";
                        return `${exSource}::${exDesc}::${exAmount}`;
                    })
                );
                if (existingComposite.has(compositeKey)) {
                    duplicate = true;
                    return prev;
                }
                addedExpense = {
                    id: gid(),
                    description,
                    amount,
                    category,
                    sourceEmailId,
                };
                return [...prev, addedExpense];
            });

            if (duplicate || !addedExpense) {
                setMsgs(m => [...m, { role: "assistant", text: "That email expense already exists in your budget list." }]);
                pushAdaptiveLog({
                    title: "Email drop skipped",
                    reason: "Dropped email converted to an existing expense item.",
                    evidence: [
                        emailSubject ? `Subject: ${emailSubject.slice(0, 80)}` : null,
                        `Email id: ${sourceEmailId || id}`,
                        `Expense: ${description} (€${amount.toFixed(2)})`,
                    ].filter(Boolean),
                    outcome: "No duplicate expense added.",
                });
                return;
            }

            setMsgs(m => [...m, { role: "assistant", text: `Budget item added from email: ${description} (€${amount.toFixed(2)})` }]);
            setLennyMood("productive");
            pushAdaptiveLog({
                title: "Email converted to budget expense",
                reason: "User dropped a Gmail item onto Budget panel.",
                evidence: [
                    emailSubject ? `Subject: ${emailSubject.slice(0, 80)}` : null,
                    `Amount: €${amount.toFixed(2)}`,
                    `Category: ${category}`,
                    `Email id: ${sourceEmailId || id}`,
                    emailFrom ? `From: ${emailFrom.slice(0, 70)}` : null,
                ].filter(Boolean),
                outcome: reason
                    ? `${modelUsed ? `${modelUsed} · ` : ""}${reason}`
                    : `${modelUsed ? `${modelUsed} · ` : ""}Expense inserted into budget list.`,
            });
        } catch (e) {
            const message = e?.message || "Failed to convert dropped email to budget expense";
            setMsgs(m => [...m, { role: "assistant", text: `Drop-to-budget failed: ${message}` }]);
            pushAdaptiveLog({
                title: "Budget drop failed",
                reason: "Email-to-expense conversion did not complete.",
                evidence: [`Error: ${message}`],
                outcome: "No budget item was added.",
            });
        } finally {
            setEmailBudgetDropLoading(false);
            setIsGmailDragging(false);
        }
    }, [emailBudgetDropLoading, pushAdaptiveLog]);

    useEffect(() => {
        if (!showGmail) return;
        if (gmailLoading) return;
        if (!gmailEmails.length) return;
        if (gmailAutoSyncInFlightRef.current) return;

        const firstId = String(gmailEmails[0]?.id || "none");
        const syncKey = `${firstId}:${gmailEmails.length}:${gmailFetchedAt || ""}`;
        if (gmailAutoSyncKeyRef.current === syncKey) return;

        gmailAutoSyncInFlightRef.current = true;
        syncGmailTasks({ refreshInbox: false })
            .catch(() => { })
            .finally(() => {
                gmailAutoSyncKeyRef.current = syncKey;
                gmailAutoSyncInFlightRef.current = false;
            });
    }, [showGmail, gmailLoading, gmailEmails, gmailFetchedAt, syncGmailTasks]);

    const persistentDashboardState = useMemo(() => ({
        version: 1,
        bg,
        greeting,
        accent,
        ambient,
        lennyMood,
        showTasks,
        showCal,
        showBudget,
        showRewards,
        showWeather,
        showGmail,
        showInspector,
        showTCDModules,
        showTimetable,
        modules,
        timetable,
        tcdDegree,
        postits,
        showPostitLibrary,
        selectedPostitId,
        tasks,
        timers,
        widgets,
        events,
        expenses,
        budget,
        weeklyGoalCategory,
        weeklyGoalTarget,
        adaptiveLog,
        adaptivePausedUntil,
    }), [
        bg,
        greeting,
        accent,
        ambient,
        lennyMood,
        showTasks,
        showCal,
        showBudget,
        showRewards,
        showWeather,
        showGmail,
        showInspector,
        showTCDModules,
        showTimetable,
        modules,
        timetable,
        tcdDegree,
        postits,
        showPostitLibrary,
        selectedPostitId,
        tasks,
        timers,
        widgets,
        events,
        expenses,
        budget,
        weeklyGoalCategory,
        weeklyGoalTarget,
        adaptiveLog,
        adaptivePausedUntil,
    ]);

    const persistentDashboardStateJson = useMemo(() => {
        try {
            return JSON.stringify(persistentDashboardState);
        } catch {
            return "";
        }
    }, [persistentDashboardState]);

    useEffect(() => {
        if (!dashboardStateReadyRef.current) return;
        if (!persistentDashboardStateJson) return;
        if (persistentDashboardStateJson === lastPersistedStateJsonRef.current) return;

        const timer = setTimeout(() => {
            saveDashboardStateToDb(persistentDashboardState)
                .then(() => {
                    lastPersistedStateJsonRef.current = persistentDashboardStateJson;
                })
                .catch((e) => {
                    console.warn("[state-db] save failed:", e?.message || e);
                });
        }, DASHBOARD_STATE_DEBOUNCE_MS);

        return () => clearTimeout(timer);
    }, [persistentDashboardState, persistentDashboardStateJson, saveDashboardStateToDb]);

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
            else if (t === "change_theme" && themes[a.theme]) {
                setBg(themes[a.theme].bg);
                setAccent(themes[a.theme].accent);
                setAmbient(prev => ({ ...prev, mood: themeMoodMap[a.theme] || prev.mood }));
            }
            else if (t === "set_greeting" && a.text) setGreeting(a.text);
            else if (t === "add_widget" && a.widgetType) setWidgets(p => [...p, { id: gid(), type: a.widgetType }]);
            else if (t === "add_event") setEvents(p => [...p, { id: gid(), title: a.title || "Event", date: a.date || new Date().toISOString().split("T")[0], time: a.time || "09:00", duration: Number(a.duration) || 60, color: a.color || "#6c5ce7" }]);
            else if (t === "delete_event" && a.title) setEvents(p => p.filter(e => !String(e.title).toLowerCase().includes(String(a.title).toLowerCase())));
            else if (t === "add_expense") setExpenses(p => [...p, { id: gid(), description: a.description || "Expense", amount: Number(a.amount) || 0, category: a.category || "other" }]);
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

        const wantsGmailSync = (
            (/\bgmail\b/i.test(txt) && /\b(sync|import|task|todo|inbox)\b/i.test(txt)) ||
            (/邮箱|邮件/i.test(txt) && /同步|任务|待办/i.test(txt))
        );
        const wantsGmailList = (
            (/\bgmail\b/i.test(txt) && /\b(show|list|emails?|inbox)\b/i.test(txt)) ||
            (/邮箱|邮件/i.test(txt) && /显示|查看|列表|收件箱/i.test(txt))
        );
        if (wantsGmailSync) {
            try {
                const stats = await syncGmailTasks();
                setShowGmail(true);
                const reply = stats.added > 0
                    ? `Gmail synced. Scanned ${stats.scanned} emails, added ${stats.added} tasks.`
                    : `Gmail synced. Scanned ${stats.scanned} emails, no new tasks to add.`;
                setMsgs(m => [...m, { role: "assistant", text: reply, ac: stats.added }]);
                setLennyMood(stats.added > 0 ? "productive" : "calm");
            } catch (e) {
                setMsgs(m => [...m, { role: "assistant", text: `Gmail sync failed: ${e?.message || "Unknown error"}` }]);
            }
            setLoading(false);
            setTimeout(() => inputRef.current?.focus(), 50);
            return;
        }
        if (wantsGmailList) {
            try {
                const stats = await fetchGmailEmails({ maxEmails: 15 });
                setShowGmail(true);
                const reply = stats.unread > 0
                    ? `Inbox loaded. ${stats.count} emails, ${stats.unread} unread.`
                    : `Inbox loaded. ${stats.count} emails.`;
                setMsgs(m => [...m, { role: "assistant", text: reply }]);
                setLennyMood("productive");
            } catch (e) {
                setMsgs(m => [...m, { role: "assistant", text: `Gmail inbox load failed: ${e?.message || "Unknown error"}` }]);
            }
            setLoading(false);
            setTimeout(() => inputRef.current?.focus(), 50);
            return;
        }

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
        { k: "g", l: "Gmail", s: showGmail, f: setShowGmail, i: "📧" },
        { k: "ai", l: "Inspector", s: showInspector, f: setShowInspector, i: "🧭" },
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
    const unreadEmailCount = gmailEmails.filter(m => m?.unread).length;
    const statCards = [
        { label: "Active tasks", value: activeTasks, helper: activeTasks <= 2 ? "On track" : "Busy week" },
        { label: "Upcoming events", value: upcomingEvents, helper: upcomingEvents > 0 ? "Plan ahead" : "Clear calendar" },
        { label: "Budget used", value: `${budgetProgress}%`, helper: budgetProgress >= 70 ? "Watch spend" : "On track" },
        { label: "Study streak", value: `${studyStreak}d`, helper: studyStreak >= 5 ? "Building rhythm" : "Momentum" },
        { label: activeWeeklyGoal.label, value: `${weeklyGoalProgress}/${weeklyGoalTarget}`, helper: weeklyGoalHelper },
        { label: "Inbox", value: gmailLoading ? "..." : (gmailEmails.length > 0 ? `${gmailEmails.length}` : "—"), helper: unreadEmailCount > 0 ? `${unreadEmailCount} unread` : "All caught up" },
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

    const adaptivePausedLabel = adaptivePausedActive
        ? new Date(adaptivePausedUntil).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })
        : "";
    const adaptiveStatus = adaptivePausedActive
        ? `Adaptive paused · until ${adaptivePausedLabel}`
        : (deadlineAdaptiveActive && nearestDeadline
            ? `Rule ${adaptiveRuleModel.level.toUpperCase()} ${adaptiveRuleModel.score}/100 · ${formatHoursLeft(nearestDeadline.hoursLeft)} left`
            : (adaptiveStatusMap[ambient.mood] || "Planning mode active"));

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
            @keyframes dropSpin{to{transform:rotate(360deg)}}
            @keyframes dropHintPulse{0%,100%{transform:translateY(0);opacity:.88}50%{transform:translateY(-1px);opacity:1}}
            @keyframes dropDotBounce{0%,80%,100%{transform:translateY(0);opacity:.3}40%{transform:translateY(-2px);opacity:1}}
            @keyframes dropSweep{0%{background-position:200% 0}100%{background-position:-200% 0}}
            .anim-item { animation: itemIn 0.25s ease-out; }
            .anim-panel { animation: panelIn 0.2s ease-out; }
            .drop-convert-banner { position: relative; display: flex; align-items: center; gap: 7px; padding: 5px 8px 10px; border-radius: 7px; overflow: hidden; animation: dropHintPulse 1.1s ease-in-out infinite; }
            .drop-convert-spinner { width: 10px; height: 10px; border-radius: 999px; border: 2px solid rgba(255,255,255,0.25); border-top-color: var(--drop-accent,#00cec9); animation: dropSpin .9s linear infinite; flex-shrink: 0; }
            .drop-convert-label { font-size: 8.5px; font-family: 'JetBrains Mono'; letter-spacing: 0.2px; color: var(--drop-accent,#00cec9); }
            .drop-convert-dots { display: inline-flex; gap: 2px; margin-left: 1px; }
            .drop-convert-dots span { width: 3px; height: 3px; border-radius: 999px; background: var(--drop-accent,#00cec9); opacity: .3; animation: dropDotBounce 1s infinite; }
            .drop-convert-dots span:nth-child(2) { animation-delay: .12s; }
            .drop-convert-dots span:nth-child(3) { animation-delay: .24s; }
            .drop-convert-progress { position: absolute; left: 6px; right: 6px; bottom: 4px; height: 2px; border-radius: 999px; background-size: 200% 100%; animation: dropSweep 1.1s linear infinite; opacity: .9; }
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
                <div ref={headerRef} style={{ position: "relative", zIndex: 50, padding: "14px 24px 8px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14 }}>
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
                        {minimalLoopPlan && (
                            <div style={{ marginTop: 8, maxWidth: 560, padding: "8px 10px", borderRadius: 12, background: light ? "rgba(255,255,255,0.62)" : "rgba(255,255,255,0.05)", border: `1px solid ${accent}33`, boxShadow: light ? "0 6px 16px rgba(0,0,0,0.04)" : "0 12px 30px rgba(0,0,0,0.15)" }}>
                                <div style={{ fontSize: 8.5, fontFamily: "'JetBrains Mono'", textTransform: "uppercase", letterSpacing: 1.1, color: accent }}>
                                    ⚡ Today&apos;s minimum loop plan
                                </div>
                                <div style={{ marginTop: 5, display: "grid", gap: 4 }}>
                                    {minimalLoopPlan.steps.map((step, idx) => (
                                        <div key={idx} style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                                            <span style={{ width: 14, height: 14, borderRadius: "50%", flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontFamily: "'JetBrains Mono'", color: accent, border: `1px solid ${accent}66`, marginTop: 1 }}>
                                                {idx + 1}
                                            </span>
                                            <span style={{ fontSize: 10, color: light ? "rgba(45,52,54,0.82)" : "rgba(255,255,255,0.82)", lineHeight: 1.35 }}>
                                                {step}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
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
                {showGmail && <GmailPanel
                    emails={gmailEmails}
                    loading={gmailLoading}
                    error={gmailError}
                    fetchedAt={gmailFetchedAt}
                    onRefresh={() => fetchGmailEmails({ maxEmails: 15, forceRefresh: true }).catch(() => { })}
                    onGenerateSamples={() => generateGmailSampleEmails().catch(() => { })}
                    generatingSamples={gmailGenerateLoading}
                    onOpenEmail={(id) => openGmailEmail(id)}
                    onEmailDragStart={() => setIsGmailDragging(true)}
                    onEmailDragEnd={() => setIsGmailDragging(false)}
                    selectedEmailId={selectedGmailEmailId}
                    selectedEmailDetail={selectedGmailEmailId ? (gmailDetailById[selectedGmailEmailId] || null) : null}
                    detailLoading={gmailDetailLoading}
                    detailError={gmailDetailError}
                    light={light}
                    accent={accent}
                    ambient={ambient}
                    onClose={() => setShowGmail(false)}
                />}
                {showTasks && <TasksPanel
                    tasks={deadlineTaskView.list}
                    onToggle={id => setTasks(t => t.map(tk => tk.id === id ? { ...tk, done: !tk.done } : tk))}
                    onEditTask={(id, v) => setTasks(t => t.map(tk => tk.id === id ? { ...tk, text: v } : tk))}
                    onRequestSplit={t => send(`split the task "${t}" into subtasks`)}
                    onAddTask={manualAddTask}
                    onEmailDropTask={convertDroppedGmailEmailToTask}
                    canAcceptEmailDrop={isGmailDragging && !emailDropLoading && !emailBudgetDropLoading}
                    emailDropLoading={emailDropLoading}
                    accent={accent}
                    light={light}
                    onClose={() => setShowTasks(false)}
                    ambient={ambient}
                    deadlineAdaptive={deadlineAdaptiveActive}
                    compressedLowCount={deadlineTaskView.hiddenLowCount}
                />}
                {showCal && <CalendarPanel events={events} onDeleteEvent={id => setEvents(e => e.filter(ev => ev.id !== id))} onAddEvent={manualAddEvent} accent={accent} light={light} onClose={() => setShowCal(false)} ambient={ambient} />}
                {showBudget && <BudgetPanel
                    expenses={expenses}
                    budget={budget}
                    accent={accent}
                    light={light}
                    onClose={() => setShowBudget(false)}
                    onDeleteExpense={id => setExpenses(e => e.filter(ex => ex.id !== id))}
                    onAddExpense={manualAddExpense}
                    onEmailDropExpense={convertDroppedGmailEmailToExpense}
                    canAcceptEmailDrop={isGmailDragging && !emailDropLoading && !emailBudgetDropLoading}
                    emailDropLoading={emailBudgetDropLoading}
                    ambient={ambient}
                />}
                {showRewards && <RewardsPanel weeklyGoalCategory={weeklyGoalCategory} setWeeklyGoalCategory={setWeeklyGoalCategory} weeklyGoalTarget={weeklyGoalTarget} setWeeklyGoalTarget={setWeeklyGoalTarget} weeklyGoalProgress={weeklyGoalProgress} weeklyGoalLabel={activeWeeklyGoal.label} weeklyGoalHelper={weeklyGoalHelper} weeklyStreak={Math.max(1, Math.ceil(studyStreak / 2))} light={light} ambient={ambient} onClose={() => setShowRewards(false)} accent="#f59e0b" />}
                {showWeather && <WeatherWidget light={light} accent={accent} ambient={ambient} onClose={() => setShowWeather(false)} />}
                {showInspector && <AdaptiveInspectorPanel
                    logs={adaptiveLog}
                    ruleModel={adaptiveRuleModel}
                    light={light}
                    accent={accent}
                    ambient={ambient}
                    onClose={() => setShowInspector(false)}
                    adaptivePausedUntil={adaptivePausedUntil}
                    onPauseAdaptive={pauseAdaptiveForTwoHours}
                    onResumeAdaptive={resumeAdaptiveNow}
                />}
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

                {!postits.length && !timers.length && !widgets.length && !showTasks && !showCal && !showBudget && !showRewards && !showWeather && !showGmail && !showInspector && !showTCDModules && !showTimetable && <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", textAlign: "center", color: txs, userSelect: "none", zIndex: 5 }}>
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
                        {["show my modules", "add module CS3012", "log €8 lunch", "add study timer", "sync gmail tasks", "show gmail emails"].map((prompt) => (
                            <button key={prompt} onClick={() => send(prompt)} disabled={loading} style={{ padding: "5px 8px", borderRadius: 999, border: `1px solid ${light ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.07)"}`, background: light ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.035)", color: txm, fontSize: 9, fontFamily: "'JetBrains Mono'", cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1 }}>
                                {prompt}
                            </button>
                        ))}
                    </div>
                    <div style={{ display: "flex", gap: 5, background: light ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.04)", border: `1px solid ${light ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.08)"}`, borderRadius: 10, padding: "3px 3px 3px 11px", alignItems: "center" }}>
                        <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && send()} placeholder={loading ? "Thinking..." : "Ask about deadlines, money, focus, or Gmail..."} disabled={loading}
                            style={{ flex: 1, background: "none", border: "none", outline: "none", color: tx, fontSize: 11.5, fontFamily: "'DM Sans'", opacity: loading ? 0.5 : 1 }} />
                        <button onClick={() => send()} disabled={loading} style={{ width: 28, height: 28, borderRadius: 7, border: "none", flexShrink: 0, background: loading ? "rgba(128,128,128,0.25)" : `linear-gradient(135deg, ${accent}, ${accent}88)`, cursor: loading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: "#fff", transition: "background 0.5s" }}>↑</button>
                    </div>
                </div>
            </div>
        </div>
    </>;
}
