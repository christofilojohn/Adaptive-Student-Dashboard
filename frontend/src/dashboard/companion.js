const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));

const MOOD_SCORES = {
    proud: { sentiment: 0.95, energy: 0.82, warmth: 0.76 },
    happy: { sentiment: 0.82, energy: 0.68, warmth: 0.78 },
    energetic: { sentiment: 0.78, energy: 0.9, warmth: 0.62 },
    playful: { sentiment: 0.74, energy: 0.86, warmth: 0.7 },
    cozy: { sentiment: 0.64, energy: 0.42, warmth: 0.92 },
    calm: { sentiment: 0.58, energy: 0.3, warmth: 0.8 },
    focus: { sentiment: 0.44, energy: 0.66, warmth: 0.54 },
    productive: { sentiment: 0.6, energy: 0.72, warmth: 0.58 },
    creative: { sentiment: 0.68, energy: 0.7, warmth: 0.72 },
    curious: { sentiment: 0.42, energy: 0.56, warmth: 0.58 },
    dreamy: { sentiment: 0.5, energy: 0.32, warmth: 0.7 },
    chill: { sentiment: 0.46, energy: 0.28, warmth: 0.68 },
    sleepy: { sentiment: 0.1, energy: 0.12, warmth: 0.56 },
    stressed: { sentiment: -0.72, energy: 0.74, warmth: 0.48 },
    sad: { sentiment: -0.76, energy: 0.18, warmth: 0.84 },
    intense: { sentiment: -0.08, energy: 0.88, warmth: 0.32 },
    mysterious: { sentiment: 0.04, energy: 0.34, warmth: 0.36 },
    romantic: { sentiment: 0.56, energy: 0.48, warmth: 0.94 },
    ocean: { sentiment: 0.48, energy: 0.5, warmth: 0.62 },
    nature: { sentiment: 0.54, energy: 0.38, warmth: 0.76 },
    sunset: { sentiment: 0.66, energy: 0.76, warmth: 0.66 },
    neutral: { sentiment: 0, energy: 0.42, warmth: 0.58 },
};

const COMPANION_THEMES = {
    proud: { aura: "#f6c453", accent: "#f59e0b", haze: "rgba(245,158,11,0.22)" },
    happy: { aura: "#5fe3b1", accent: "#22c55e", haze: "rgba(34,197,94,0.2)" },
    energetic: { aura: "#ff8f5a", accent: "#f97316", haze: "rgba(249,115,22,0.22)" },
    playful: { aura: "#ff91cf", accent: "#ec4899", haze: "rgba(236,72,153,0.2)" },
    cozy: { aura: "#ffb38b", accent: "#ea580c", haze: "rgba(234,88,12,0.2)" },
    calm: { aura: "#8ad3d8", accent: "#14b8a6", haze: "rgba(20,184,166,0.18)" },
    focus: { aura: "#9eb3ff", accent: "#6366f1", haze: "rgba(99,102,241,0.18)" },
    productive: { aura: "#7dd3fc", accent: "#0ea5e9", haze: "rgba(14,165,233,0.18)" },
    creative: { aura: "#d8a4ff", accent: "#a855f7", haze: "rgba(168,85,247,0.18)" },
    curious: { aura: "#7ee7c9", accent: "#10b981", haze: "rgba(16,185,129,0.18)" },
    dreamy: { aura: "#c4b5fd", accent: "#8b5cf6", haze: "rgba(139,92,246,0.18)" },
    chill: { aura: "#93c5fd", accent: "#3b82f6", haze: "rgba(59,130,246,0.18)" },
    sleepy: { aura: "#a5b4fc", accent: "#64748b", haze: "rgba(100,116,139,0.18)" },
    stressed: { aura: "#fca5a5", accent: "#ef4444", haze: "rgba(239,68,68,0.18)" },
    sad: { aura: "#cbd5e1", accent: "#64748b", haze: "rgba(100,116,139,0.18)" },
    intense: { aura: "#fb7185", accent: "#e11d48", haze: "rgba(225,29,72,0.2)" },
    mysterious: { aura: "#818cf8", accent: "#6366f1", haze: "rgba(99,102,241,0.18)" },
    romantic: { aura: "#f9a8d4", accent: "#db2777", haze: "rgba(219,39,119,0.18)" },
    ocean: { aura: "#67e8f9", accent: "#06b6d4", haze: "rgba(6,182,212,0.18)" },
    nature: { aura: "#86efac", accent: "#22c55e", haze: "rgba(34,197,94,0.18)" },
    sunset: { aura: "#fdba74", accent: "#f97316", haze: "rgba(249,115,22,0.18)" },
    neutral: { aura: "#94a3b8", accent: "#64748b", haze: "rgba(100,116,139,0.18)" },
};

const COMPANION_COPY = {
    thinking: [
        "Reading the room and lining up the next helpful move.",
        "Thinking it through so the next response feels smoother.",
    ],
    celebrate: [
        "That moved the whole week forward.",
        "Nice one. Progress like that changes the mood fast.",
    ],
    comfort: [
        "We can keep this gentle. One small next step is enough.",
        "You do not need to solve everything at once. We can steady the board first.",
    ],
    focus: [
        "Focus is live. I will keep the noise down and the momentum up.",
        "Locked in with you. Let us turn this into a cleaner run.",
    ],
    planning: [
        "This is shaping into a workable plan.",
        "The board is starting to tell a clearer story.",
    ],
    support: [
        "There is a lot open right now. I can help make it feel lighter.",
        "Busy board, but still manageable. We can reduce the pressure step by step.",
    ],
    curiosity: [
        "There is a pattern here worth exploring.",
        "I am picking up a few interesting signals from how you are working.",
    ],
    idle: [
        "I am here when you want to reshape the day again.",
        "Quiet moment. We can ease back in whenever you are ready.",
    ],
};

export function createInitialCompanionState() {
    return {
        sentiment: 0,
        energy: 0.46,
        warmth: 0.62,
        trust: 0.54,
        llmMood: "neutral",
        lastUserMood: "neutral",
        lastAssistantReply: "",
        lastUserText: "",
        lastInteractionAt: Date.now(),
        interactionCount: 0,
        supportMoments: 0,
        wins: 0,
        focusMoments: 0,
        noteMoments: 0,
        lastWinAt: 0,
        lastFocusAt: 0,
        lastNoteAt: 0,
        lastEvent: "welcome",
    };
}

function moodSnapshot(moodId) {
    return MOOD_SCORES[moodId] || MOOD_SCORES.neutral;
}

function copyFor(key, index) {
    const entries = COMPANION_COPY[key] || COMPANION_COPY.planning;
    return entries[index % entries.length];
}

export function evolveCompanionState(prev, event) {
    const next = {
        ...prev,
        lastInteractionAt: Date.now(),
        interactionCount: prev.interactionCount + 1,
        lastEvent: event.type,
    };

    if (event.userText) next.lastUserText = event.userText;
    if (event.reply) next.lastAssistantReply = event.reply;

    const moodId = event.mood || event.llmMood;
    if (moodId) {
        const snap = moodSnapshot(moodId);
        next.llmMood = event.mood ? moodId : next.llmMood;
        next.lastUserMood = moodId;
        next.sentiment = clamp(next.sentiment * 0.45 + snap.sentiment * 0.55, -1, 1);
        next.energy = clamp(next.energy * 0.4 + snap.energy * 0.6);
        next.warmth = clamp(next.warmth * 0.45 + snap.warmth * 0.55);
    }

    switch (event.type) {
        case "user_message":
            next.trust = clamp(next.trust + 0.02);
            break;
        case "assistant_reply":
            next.trust = clamp(next.trust + 0.03);
            break;
        case "task_completed":
            next.wins += 1;
            next.lastWinAt = Date.now();
            next.sentiment = clamp(next.sentiment + 0.22, -1, 1);
            next.energy = clamp(next.energy + 0.12);
            next.warmth = clamp(next.warmth + 0.05);
            break;
        case "task_added":
            next.energy = clamp(next.energy + 0.04);
            break;
        case "timer_started":
            next.focusMoments += 1;
            next.lastFocusAt = Date.now();
            next.energy = clamp(next.energy + 0.08);
            next.trust = clamp(next.trust + 0.02);
            break;
        case "note_added":
            next.noteMoments += 1;
            next.lastNoteAt = Date.now();
            next.warmth = clamp(next.warmth + 0.04);
            break;
        case "support_needed":
            next.supportMoments += 1;
            next.trust = clamp(next.trust + 0.04);
            next.warmth = clamp(next.warmth + 0.08);
            break;
        case "ambient_shift":
            next.warmth = clamp(next.warmth + 0.03);
            break;
        default:
            break;
    }

    return next;
}

export function deriveCompanionView({
    companion,
    baseMood,
    ambientMood,
    activeTasks,
    completedTasks,
    timers,
    postits,
    upcomingEvents,
    budgetProgress,
    loading,
    now,
}) {
    const idleMs = now - companion.lastInteractionAt;
    const pressure = activeTasks >= 5 || budgetProgress >= 80 || upcomingEvents >= 5;
    const focusWindowMs = 30 * 60 * 1000;
    const celebrateWindowMs = 10 * 60 * 1000;
    const noteWindowMs = 20 * 60 * 1000;
    const focused = timers > 0 || (companion.lastFocusAt && now - companion.lastFocusAt < focusWindowMs);
    const celebratory = companion.lastEvent === "task_completed" || (companion.lastWinAt && now - companion.lastWinAt < celebrateWindowMs);
    const supportive = companion.sentiment < -0.2 || pressure;
    const curious = companion.lastEvent === "note_added" || (companion.lastNoteAt && now - companion.lastNoteAt < noteWindowMs) || postits >= 3;

    let mode = "planning";
    if (loading) mode = "thinking";
    else if (celebratory) mode = "celebrate";
    else if (supportive) mode = "comfort";
    else if (focused) mode = "focus";
    else if (curious) mode = "curiosity";
    else if (idleMs > 90000) mode = "idle";

    const mood = companion.llmMood || baseMood || ambientMood || "neutral";
    const theme = COMPANION_THEMES[mood] || COMPANION_THEMES.neutral;
    const presence = clamp(0.56 + companion.energy * 0.24 + companion.trust * 0.2 + Math.min(companion.interactionCount, 14) * 0.012);
    const comfort = clamp(0.4 + companion.warmth * 0.4 + (supportive ? 0.12 : 0));
    const sparkle = clamp(0.24 + companion.energy * 0.3 + (celebratory ? 0.16 : 0));
    const copyIndex = companion.wins + companion.focusMoments + companion.noteMoments + companion.interactionCount;

    const titleMap = {
        thinking: "Adapting",
        celebrate: "Cheering you on",
        comfort: "Soft support",
        focus: "Focus anchor",
        curiosity: "Pattern watcher",
        planning: "Study companion",
        idle: "Quiet standby",
    };

    return {
        mood,
        mode,
        theme,
        title: titleMap[mode] || "Study companion",
        status: loading ? "reading sentiment + actions" : `${Math.round(companion.trust * 100)}% in sync`,
        message: copyFor(mode, copyIndex),
        metrics: [
            `${Math.round(presence * 100)}% presence`,
            `${Math.round(comfort * 100)}% warmth`,
            `${Math.round(sparkle * 100)}% energy`,
        ],
        presence,
        comfort,
        sparkle,
    };
}
