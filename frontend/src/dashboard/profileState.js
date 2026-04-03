import { createInitialCompanionState } from "./companion";
import { DEFAULT_AMBIENT, LLM_CONFIG } from "./constants";
import { toLocalDateStr } from "./utils";

export function createInitialAssistantMessage() {
    return {
        role: "assistant",
        text: `Ready! (${LLM_CONFIG.mode === "local" ? "local LLM" : "API"})\n\n• "make it cozy"\n• "check off documentation"\n• "meeting this friday 2pm"\n• "I spent €12 on lunch"\n• "focus mode"`,
    };
}

export function createDefaultDashboardState() {
    const today = new Date();
    const tomorrow = new Date(today);
    const yesterday = new Date(today);
    const twoDaysAgo = new Date(today);

    tomorrow.setDate(today.getDate() + 1);
    yesterday.setDate(today.getDate() - 1);
    twoDaysAgo.setDate(today.getDate() - 2);

    return {
        bg: "linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 50%, #16213e 100%)",
        greeting: "Plan your week, not just your tasks.",
        accent: "#00cec9",
        ambient: { ...DEFAULT_AMBIENT },
        showTasks: true,
        showCal: true,
        showBudget: true,
        showRewards: true,
        showWeather: true,
        showAdaptive: true,
        showTCDModules: false,
        showTimetable: false,
        autoAdapt: true,
        modules: [],
        timetable: [],
        tcdDegree: null,
        postits: [],
        tasks: [
            { id: "t1", text: "Finish adaptive apps UI polish 🎨", priority: "high", done: false },
            { id: "t2", text: "Review CS deadline list 📚", priority: "medium", done: false },
            { id: "t3", text: "Plan study blocks for the week 🗓️", priority: "low", done: false },
        ],
        timers: [],
        widgets: [],
        events: [
            { id: "e1", title: "Lecture block 📚", date: toLocalDateStr(today), time: "10:00", duration: 60, color: "#6c5ce7" },
            { id: "e2", title: "Team checkpoint 👥", date: toLocalDateStr(tomorrow), time: "15:00", duration: 45, color: "#00cec9" },
        ],
        expenses: [
            { id: "x1", description: "Coffee ☕", amount: 4.5, category: "food", date: toLocalDateStr(today) },
            { id: "x2", description: "Bus fare 🚍", amount: 20, category: "transport", date: toLocalDateStr(yesterday) },
            { id: "x3", description: "Library lunch 🥪", amount: 8.9, category: "food", date: toLocalDateStr(twoDaysAgo) },
        ],
        budget: 500,
        weeklyGoalCategory: "tasks",
        weeklyGoalTarget: 5,
        lennyMood: "neutral",
        companion: createInitialCompanionState(),
        msgs: [createInitialAssistantMessage()],
    };
}

export function normalizeDashboardState(rawState = {}) {
    const defaults = createDefaultDashboardState();
    const state = rawState && typeof rawState === "object" ? rawState : {};

    return {
        ...defaults,
        ...state,
        ambient: { ...DEFAULT_AMBIENT, ...(state.ambient || {}) },
        modules: Array.isArray(state.modules) ? state.modules : defaults.modules,
        timetable: Array.isArray(state.timetable) ? state.timetable : defaults.timetable,
        postits: Array.isArray(state.postits) ? state.postits : defaults.postits,
        tasks: Array.isArray(state.tasks) ? state.tasks : defaults.tasks,
        timers: Array.isArray(state.timers) ? state.timers : defaults.timers,
        widgets: Array.isArray(state.widgets) ? state.widgets : defaults.widgets,
        events: Array.isArray(state.events) ? state.events : defaults.events,
        expenses: Array.isArray(state.expenses) ? state.expenses : defaults.expenses,
        companion: { ...createInitialCompanionState(), ...(state.companion || {}) },
        msgs: Array.isArray(state.msgs) && state.msgs.length ? state.msgs : defaults.msgs,
    };
}

export function getNextGeneratedIdStart(state) {
    const collections = [
        state.modules,
        state.timetable,
        state.postits,
        state.tasks,
        state.timers,
        state.widgets,
        state.events,
        state.expenses,
    ];

    let maxId = 299;
    for (const items of collections) {
        for (const item of Array.isArray(items) ? items : []) {
            const match = /^i(\d+)$/.exec(String(item?.id || ""));
            if (match) maxId = Math.max(maxId, Number(match[1]));
        }
    }

    return maxId + 1;
}
