import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { DragBoundsCtx, HeaderLockCtx, WidgetRegistryCtx } from "./dashboard/drag";
import { DEFAULT_AMBIENT, LLM_CONFIG, MODULE_COLORS, POSTIT_CHAR_LIMIT } from "./dashboard/constants";
import { callAmbientLLM, callLLM } from "./dashboard/llm";
import { analyzeAdaptiveState, reinforceAdaptiveModel } from "./dashboard/adaptive";
import { deriveCompanionView, evolveCompanionState } from "./dashboard/companion";
import { inferMood, toLocalDateStr } from "./dashboard/utils";
import { clearProfile, clearStoredSessionToken, fetchProfiles, loginProfile, logoutProfile, restoreSession, saveProfileState } from "./dashboard/profileApi";
import { createDefaultDashboardState, getNextGeneratedIdStart, normalizeDashboardState } from "./dashboard/profileState";
import { AdaptivePanel } from "./dashboard/components/adaptivePanel";
import { BudgetPanel } from "./dashboard/components/budgetPanel";
import { CalendarPanel } from "./dashboard/components/calendarPanel";
import { PostIt, TimerWidget, ClockWidget, QuoteWidget } from "./dashboard/components/floatingWidgets";
import { RewardsPanel } from "./dashboard/components/rewardsPanel";
import { EditableText, LennyBuddy, Particles, TypingDots } from "./dashboard/components/shared";
import { TasksPanel } from "./dashboard/components/tasksPanel";
import { TCDModulesPanel } from "./dashboard/components/tcdModulesPanel";
import { TimetablePanel } from "./dashboard/components/timetablePanel";
import { WeatherWidget } from "./dashboard/components/weatherWidget";
export default function App() {
    const initialState = useMemo(() => createDefaultDashboardState(), []);
    const [bg, setBg] = useState(initialState.bg);
    const [greeting, setGreeting] = useState(initialState.greeting);
    const [accent, setAccent] = useState(initialState.accent);
    const [ambient, setAmbient] = useState(initialState.ambient);
    const [showTasks, setShowTasks] = useState(initialState.showTasks), [showCal, setShowCal] = useState(initialState.showCal), [showBudget, setShowBudget] = useState(initialState.showBudget), [showRewards, setShowRewards] = useState(initialState.showRewards), [showWeather, setShowWeather] = useState(initialState.showWeather);
    const [showAdaptive, setShowAdaptive] = useState(initialState.showAdaptive);
    const [showTCDModules, setShowTCDModules] = useState(initialState.showTCDModules), [showTimetable, setShowTimetable] = useState(initialState.showTimetable);
    const [autoAdapt, setAutoAdapt] = useState(initialState.autoAdapt);
    const [modules, setModules] = useState(initialState.modules);
    const [timetable, setTimetable] = useState(initialState.timetable);
    const [tcdDegree, setTcdDegree] = useState(initialState.tcdDegree);
    const [postits, setPostits] = useState(initialState.postits);
    const [showPostitLibrary, setShowPostitLibrary] = useState(false);
    const [selectedPostitId, setSelectedPostitId] = useState(null);
    const [tasks, setTasks] = useState(initialState.tasks);
    const [timers, setTimers] = useState(initialState.timers), [widgets, setWidgets] = useState(initialState.widgets);
    const [events, setEvents] = useState(initialState.events);
    const [expenses, setExpenses] = useState(initialState.expenses);
    const [budget, setBudgetVal] = useState(initialState.budget);
    const [weeklyGoalCategory, setWeeklyGoalCategory] = useState(initialState.weeklyGoalCategory);
    const [weeklyGoalTarget, setWeeklyGoalTarget] = useState(initialState.weeklyGoalTarget);
    const [adaptiveModel, setAdaptiveModel] = useState(initialState.adaptiveModel);
    const [input, setInput] = useState(""), [loading, setLoading] = useState(false);
    const [lennyMood, setLennyMood] = useState(initialState.lennyMood);
    const [companion, setCompanion] = useState(initialState.companion);
    const [msgs, setMsgs] = useState(initialState.msgs);
    const [session, setSession] = useState(null);
    const [profileMeta, setProfileMeta] = useState(null);
    const [profileOptions, setProfileOptions] = useState([]);
    const [profileStatus, setProfileStatus] = useState("booting");
    const [authMessage, setAuthMessage] = useState("");
    const [profileNameInput, setProfileNameInput] = useState("");

    const scrollRef = useRef(null), inputRef = useRef(null), idRef = useRef(300), ambientTimerRef = useRef(null);
    const lastAutoModeRef = useRef(null);
    const widgetRegistry = useRef(new Map());
    const canvasRef = useRef(null);
    const headerRef = useRef(null);
    const [canvasBounds, setCanvasBounds] = useState({ width: 0, height: 0 });
    const [headerLockY, setHeaderLockY] = useState(180);
    useEffect(() => {
        if (!canvasRef.current) return;
        setCanvasBounds({ width: canvasRef.current.clientWidth, height: canvasRef.current.clientHeight });
        const ro = new ResizeObserver(entries => setCanvasBounds({ width: entries[0].contentRect.width, height: entries[0].contentRect.height }));
        ro.observe(canvasRef.current);
        return () => {
            ro.disconnect();
            window.removeEventListener("resize", measureHeaderLock);
        };
    }, []);
    useEffect(() => {
        if (!headerRef.current || !canvasRef.current) return;
        const measureHeaderLock = () => {
            if (!headerRef.current || !canvasRef.current) return;
            const headerRect = headerRef.current.getBoundingClientRect();
            const canvasRect = canvasRef.current.getBoundingClientRect();
            const canvasRelativeBottom = headerRect.bottom - canvasRect.top;
            setHeaderLockY(Math.ceil(canvasRelativeBottom) + 40);
        };

        measureHeaderLock();
        const ro = new ResizeObserver(() => measureHeaderLock());
        ro.observe(headerRef.current);
        ro.observe(canvasRef.current);
        window.addEventListener("resize", measureHeaderLock);
        return () => ro.disconnect();
    }, []);
    const [companionNow, setCompanionNow] = useState(Date.now());
    useEffect(() => {
        const t = setInterval(() => setCompanionNow(Date.now()), 15000);
        return () => clearInterval(t);
    }, []);
    const gid = () => `i${idRef.current++}`;
    useEffect(() => { scrollRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, loading]);
    useEffect(() => {
        if (showPostitLibrary && !selectedPostitId && postits.length) setSelectedPostitId(postits[0].id);
        if (!postits.length && selectedPostitId) setSelectedPostitId(null);
    }, [showPostitLibrary, postits, selectedPostitId]);

    const applyProfileState = useCallback((rawState) => {
        const next = normalizeDashboardState(rawState);

        setBg(next.bg);
        setGreeting(next.greeting);
        setAccent(next.accent);
        setAmbient(next.ambient);
        setShowTasks(next.showTasks);
        setShowCal(next.showCal);
        setShowBudget(next.showBudget);
        setShowRewards(next.showRewards);
        setShowWeather(next.showWeather);
        setShowAdaptive(next.showAdaptive);
        setShowTCDModules(next.showTCDModules);
        setShowTimetable(next.showTimetable);
        setAutoAdapt(next.autoAdapt);
        setModules(next.modules);
        setTimetable(next.timetable);
        setTcdDegree(next.tcdDegree);
        setPostits(next.postits);
        setShowPostitLibrary(false);
        setSelectedPostitId(null);
        setTasks(next.tasks);
        setTimers(next.timers);
        setWidgets(next.widgets);
        setEvents(next.events);
        setExpenses(next.expenses);
        setBudgetVal(next.budget);
        setWeeklyGoalCategory(next.weeklyGoalCategory);
        setWeeklyGoalTarget(next.weeklyGoalTarget);
        setAdaptiveModel(next.adaptiveModel);
        setInput("");
        setLoading(false);
        setLennyMood(next.lennyMood);
        setCompanion(next.companion);
        setMsgs(next.msgs);
        idRef.current = getNextGeneratedIdStart(next);
    }, []);

    const buildProfileState = useCallback(() => ({
        bg,
        greeting,
        accent,
        ambient,
        showTasks,
        showCal,
        showBudget,
        showRewards,
        showWeather,
        showAdaptive,
        showTCDModules,
        showTimetable,
        autoAdapt,
        modules,
        timetable,
        tcdDegree,
        postits,
        tasks,
        timers,
        widgets,
        events,
        expenses,
        budget,
        weeklyGoalCategory,
        weeklyGoalTarget,
        adaptiveModel,
        lennyMood,
        companion,
        msgs,
    }), [accent, adaptiveModel, ambient, autoAdapt, bg, budget, companion, events, expenses, greeting, lennyMood, modules, msgs, postits, showAdaptive, showBudget, showCal, showRewards, showTCDModules, showTasks, showTimetable, showWeather, tasks, tcdDegree, timetable, timers, weeklyGoalCategory, weeklyGoalTarget, widgets]);

    const loadProfileDirectory = useCallback(async () => {
        try {
            const data = await fetchProfiles();
            setProfileOptions(data.profiles || []);
        } catch (error) {
            console.warn("[profiles] failed to load directory", error);
        }
    }, []);

    const resetProfileShell = useCallback((message = "") => {
        clearStoredSessionToken();
        applyProfileState(createDefaultDashboardState());
        setSession(null);
        setProfileMeta(null);
        setProfileStatus("logged_out");
        setProfileNameInput("");
        setAuthMessage(message);
    }, [applyProfileState]);

    useEffect(() => {
        loadProfileDirectory();
    }, [loadProfileDirectory]);

    useEffect(() => {
        let cancelled = false;

        (async () => {
            try {
                const payload = await restoreSession();
                if (cancelled) return;

                if (!payload) {
                    setProfileStatus("logged_out");
                    return;
                }

                applyProfileState(payload.state);
                setSession(payload.session);
                setProfileMeta(payload.profile);
                setProfileNameInput(payload.profile.displayName);
                setProfileStatus("ready");
                setAuthMessage("");
            } catch (error) {
                if (!cancelled) {
                    if (error && /unauthorized|401/i.test(error.message)) {
                        resetProfileShell("Saved session expired. Sign in again.");
                    } else {
                        setProfileStatus("logged_out");
                        setAuthMessage("Could not reach the server. Please try again.");
                    }
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [applyProfileState, resetProfileShell]);

    useEffect(() => {
        if (profileStatus !== "ready" || !session) return;

        const timer = setTimeout(async () => {
            try {
                const payload = await saveProfileState(buildProfileState(), session.token);
                setProfileMeta(payload.profile);
                setAuthMessage(current => current.startsWith("Profile sync failed") ? "" : current);
            } catch (error) {
                if (/unauthorized/i.test(error.message)) {
                    resetProfileShell("Session expired. Sign in again.");
                    return;
                }
                setAuthMessage(`Profile sync failed: ${error.message}`);
            }
        }, 350);

        return () => clearTimeout(timer);
    }, [buildProfileState, profileStatus, resetProfileShell, session]);

    const themes = useMemo(() => ({
        cozy: {
            bg: "linear-gradient(135deg, #2d1b14 0%, #1a1410 50%, #0d0a07 100%)",
            accent: "#e17055",
            mood: "cozy",
            ambient: { glowColor: "#ffb38b", glowIntensity: 0.24, grainOpacity: 0.04, panelBlur: 22, panelOpacity: 0.07, borderWarmth: 0.8, particles: "fireflies" },
        },
        focus: {
            bg: "#0a0a12",
            accent: "#6366f1",
            mood: "focus",
            ambient: { glowColor: "#9eb3ff", glowIntensity: 0.16, grainOpacity: 0.018, panelBlur: 18, panelOpacity: 0.045, borderWarmth: 0.12, particles: "stars" },
        },
        ocean: {
            bg: "linear-gradient(135deg, #0c1829 0%, #0a2a3f 40%, #134e5e 100%)",
            accent: "#00cec9",
            mood: "ocean",
            ambient: { glowColor: "#67e8f9", glowIntensity: 0.18, grainOpacity: 0.025, panelBlur: 20, panelOpacity: 0.05, borderWarmth: 0.2, particles: "sparkle" },
        },
        sunset: {
            bg: "linear-gradient(135deg, #1a0a2e 0%, #3d1c56 30%, #c0392b 70%, #e67e22 100%)",
            accent: "#e67e22",
            mood: "sunset",
            ambient: { glowColor: "#fdba74", glowIntensity: 0.22, grainOpacity: 0.03, panelBlur: 22, panelOpacity: 0.055, borderWarmth: 0.58, particles: "sparkle" },
        },
        forest: {
            bg: "linear-gradient(135deg, #0a1a0a 0%, #1a2f1a 50%, #0d1f0d 100%)",
            accent: "#00b894",
            mood: "nature",
            ambient: { glowColor: "#86efac", glowIntensity: 0.18, grainOpacity: 0.03, panelBlur: 20, panelOpacity: 0.05, borderWarmth: 0.34, particles: "fireflies" },
        },
        midnight: {
            bg: "linear-gradient(135deg, #020111 0%, #0a0a2e 50%, #060620 100%)",
            accent: "#6c5ce7",
            mood: "mysterious",
            ambient: { glowColor: "#818cf8", glowIntensity: 0.12, grainOpacity: 0.02, panelBlur: 20, panelOpacity: 0.045, borderWarmth: 0.14, particles: "stars" },
        },
        minimal: {
            bg: "#f5f0eb",
            accent: "#2d3436",
            mood: "calm",
            ambient: { glowColor: "#cbd5e1", glowIntensity: 0.08, grainOpacity: 0.012, panelBlur: 16, panelOpacity: 0.025, borderWarmth: 0.08, particles: "none" },
        },
    }), []);

    const noteCompanion = useCallback((event) => {
        setCompanion(prev => evolveCompanionState(prev, event));
    }, []);

    const setMoodWithCompanion = useCallback((mood, reason) => {
        if (!mood) return;
        setLennyMood(mood);
    }, []);

    const applyThemePreset = useCallback((themeKey, options = {}) => {
        const preset = themes[themeKey];
        if (!preset) return;

        setBg(preset.bg);
        setAccent(preset.accent);
        setAmbient(prev => ({
            ...prev,
            ...preset.ambient,
            mood: preset.mood,
        }));

        if (options.greetingText) setGreeting(options.greetingText);
        if (preset.mood) {
            setMoodWithCompanion(preset.mood, options.reason || "adaptive_theme");
            if (options.noteCompanion !== false) noteCompanion({ type: "ambient_shift", mood: preset.mood });
        }
    }, [noteCompanion, setMoodWithCompanion, themes]);

    const startAdaptiveSprint = useCallback((sprintTask) => {
        const taskText = sprintTask?.text || "";
        const label = taskText ? `Focus: ${taskText}` : "Adaptive sprint";
        setTimers(current => [...current, { id: gid(), minutes: 45, label: label.length > 32 ? `${label.slice(0, 29)}...` : label }]);
        if (sprintTask) {
            setAdaptiveModel(prev => reinforceAdaptiveModel({
                adaptiveModel: prev,
                tasks,
                events,
                expenses,
                budget,
                modules,
                sprintTask,
                now: companionNow,
            }));
        }
        noteCompanion({ type: "timer_started", userText: taskText || "Adaptive sprint", mood: "focus" });
        setMoodWithCompanion("focus", "timer_started");
    }, [budget, companionNow, events, expenses, modules, noteCompanion, setMoodWithCompanion, tasks]);

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
        if (inferred) setMoodWithCompanion(inferred, "task_added");
        noteCompanion({ type: "task_added", userText: text, mood: inferred || companion.llmMood });
        callAmbientLLM(`User added task: "${text}". Emotional weight?`).then(r => {
            const safe = (r.actions || []).filter(a => a.type === "adjust_ambient");
            if (safe.length) exec(safe);
        });
    };
    const manualAddEvent = (title, date, time, duration = 60, color) => {
        setEvents(p => [...p, { id: gid(), title, date, time, duration, color }]);
        const inferred = inferMood(title, [{ type: "add_event" }]);
        if (inferred) setMoodWithCompanion(inferred, "planning");
        noteCompanion({ type: "planning", userText: title, mood: inferred || companion.llmMood });
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
        noteCompanion({ type: "planning", userText: desc, mood: "productive" });
    };

    const exec = (actions) => {
        if (!Array.isArray(actions)) return;
        for (const a of actions) {
            const t = a.type;
            if (t === "change_bg" && a.color) setBg(a.color);
            else if (t === "add_postit") {
                setPostits(p => [...p, { id: gid(), content: a.content || "Note", color: a.color || "#fef68a", x: Number(a.x) || 80 + Math.random() * 900, y: Number(a.y) || 40 + Math.random() * 800 }]);
                noteCompanion({ type: "note_added", userText: a.content || "Note", mood: "creative" });
            }
            else if (t === "add_task") {
                setTasks(p => [...p, { id: gid(), text: a.text || "New task", priority: a.priority || "medium", done: false }]);
                noteCompanion({ type: "task_added", userText: a.text || "New task", mood: "productive" });
            }
            else if (t === "complete_task" && a.text) {
                const matchedTasks = tasks.filter(tk => !tk.done && !tk.isParent && String(tk.text).toLowerCase().includes(String(a.text).toLowerCase()));
                if (matchedTasks.length === 1) {
                    setAdaptiveModel(prev => reinforceAdaptiveModel({
                        adaptiveModel: prev,
                        tasks,
                        events,
                        expenses,
                        budget,
                        modules,
                        completedTask: matchedTasks[0],
                        recommendedTask: adaptiveInsights?.recommendedTask,
                        now: companionNow,
                    }));
                }
                setTasks(p => p.map(tk => !tk.done && !tk.isParent && String(tk.text).toLowerCase().includes(String(a.text).toLowerCase()) ? { ...tk, done: true } : tk));
                noteCompanion({ type: "task_completed", userText: a.text, mood: "proud" });
                setMoodWithCompanion("proud", "task_completed");
            }
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
                noteCompanion({ type: "planning", userText: a.text, mood: "productive" });
            }
            else if (t === "add_timer") {
                const mins = Number(a.minutes);
                if (mins > 0) {
                    setTimers(p => [...p, { id: gid(), minutes: mins, label: a.label || "Timer" }]);
                    noteCompanion({ type: "timer_started", userText: a.label || "Timer", mood: "focus" });
                    setMoodWithCompanion("focus", "timer_started");
                } else console.warn("[exec] add_timer skipped: invalid minutes:", a.minutes);
            }
            else if (t === "change_theme" && themes[a.theme]) {
                setAutoAdapt(false);
                applyThemePreset(a.theme, { reason: "manual_theme" });
            }
            else if (t === "set_greeting" && a.text) setGreeting(a.text);
            else if (t === "add_widget" && a.widgetType) setWidgets(p => [...p, { id: gid(), type: a.widgetType }]);
            else if (t === "add_event") {
                setEvents(p => [...p, { id: gid(), title: a.title || "Event", date: a.date || toLocalDateStr(new Date()), time: a.time || "09:00", duration: Number(a.duration) || 60, color: a.color || "#6c5ce7" }]);
                noteCompanion({ type: "planning", userText: a.title || "Event", mood: "productive" });
            }
            else if (t === "delete_event" && a.title) setEvents(p => p.filter(e => !String(e.title).toLowerCase().includes(String(a.title).toLowerCase())));
            else if (t === "add_expense") {
                setExpenses(p => [...p, { id: gid(), description: a.description || "Expense", amount: Number(a.amount) || 0, category: a.category || "other", date: a.date || toLocalDateStr(new Date()) }]);
                noteCompanion({ type: "planning", userText: a.description || "Expense", mood: "productive" });
            }
            else if (t === "add_note") {
                noteCompanion({ type: "note_added", userText: a.content || "Quick note", mood: "creative" });
                setPostits(p => {
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
            }
            else if (t === "set_budget") setBudgetVal(Number(a.amount) || 0);
            else if (t === "adjust_ambient") {
                setAmbient(prev => ({
                    ...prev, glowColor: a.glowColor || prev.glowColor,
                    glowIntensity: a.glowIntensity != null ? Math.min(0.35, Math.max(0, Number(a.glowIntensity))) : prev.glowIntensity,
                    grainOpacity: a.grainOpacity != null ? Math.min(0.08, Math.max(0, Number(a.grainOpacity))) : prev.grainOpacity,
                    borderWarmth: a.borderWarmth != null ? Math.min(1, Math.max(0, Number(a.borderWarmth))) : prev.borderWarmth,
                    particles: a.particles || prev.particles, mood: a.mood || prev.mood,
                }));
                noteCompanion({ type: "ambient_shift", mood: a.mood || ambient.mood });
                // Also try to sync lenny from LLM mood if it maps to something
                if (a.mood) { const lm = inferMood(a.mood, []); if (lm) setMoodWithCompanion(lm, "ambient_shift"); }
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
        noteCompanion({ type: "user_message", userText: txt, mood: inferMood(txt, []) || lennyMood });
        setLoading(true);

        try {
            const r = await callLLM(txt, snap());
            if (r.reply) {
                exec(r.actions);
                setMsgs(m => [...m, { role: "assistant", text: r.reply, ac: r.actions.length }]);
                noteCompanion({ type: "assistant_reply", reply: r.reply, mood: inferMood(txt, r.actions) || ambient.mood });
                // Client-side mood inference — no extra LLM call needed
                const inferred = inferMood(txt, r.actions);
                if (inferred) {
                    setMoodWithCompanion(inferred, "assistant_reply");
                    if (inferred === "stressed" || inferred === "sad") noteCompanion({ type: "support_needed", userText: txt, mood: inferred });
                }
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
        { k: "a", l: "Adaptive", s: showAdaptive, f: setShowAdaptive, i: "🧠" },
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
    const adaptiveInsights = useMemo(() => analyzeAdaptiveState({
        tasks,
        events,
        expenses,
        budget,
        modules,
        adaptiveModel,
        now: companionNow,
    }), [adaptiveModel, budget, companionNow, events, expenses, modules, tasks]);
    const statCards = [
        { label: "Pressure", value: adaptiveInsights.pressureLabel, helper: adaptiveInsights.suggestedMode === "minimal" ? "Reduce noise" : "Adaptive signal" },
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
    const profileUpdatedLabel = profileMeta?.updatedAt ? new Date(profileMeta.updatedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "Saving...";

    const safeAmbientGlowColor = (ambient.glowColor && ambient.glowColor !== "transparent") ? ambient.glowColor : "#ffffff";
    const ambientBg = ambient.glowIntensity > 0 ? `radial-gradient(ellipse at 30% 40%, ${safeAmbientGlowColor}${Math.round(ambient.glowIntensity * 255).toString(16).padStart(2, "0")} 0%, transparent 70%)` : "none";
    const adaptiveStatus = autoAdapt ? adaptiveInsights.summary : "Manual mode pinned";
    const companionView = useMemo(() => deriveCompanionView({
        companion,
        baseMood: lennyMood,
        ambientMood: ambient.mood,
        activeTasks,
        completedTasks,
        timers: timers.length,
        postits: postits.length,
        upcomingEvents,
        budgetProgress,
        loading,
        now: companionNow,
    }), [activeTasks, ambient.mood, budgetProgress, companion, companionNow, completedTasks, lennyMood, loading, postits.length, timers.length, upcomingEvents]);

    useEffect(() => {
        if (!autoAdapt) {
            lastAutoModeRef.current = null;
            return;
        }
        if (!adaptiveInsights?.suggestedMode || lastAutoModeRef.current === adaptiveInsights.suggestedMode) return;

        applyThemePreset(adaptiveInsights.suggestedMode, {
            greetingText: adaptiveInsights.suggestedGreeting,
            reason: "auto_adapt",
        });
        lastAutoModeRef.current = adaptiveInsights.suggestedMode;
    }, [adaptiveInsights, applyThemePreset, autoAdapt]);

    const noteColors = ["#fef68a", "#ffd6a5", "#caffbf", "#bde0fe", "#e9d5ff"];
    const getNextPostitPosition = (count) => ({
        x: 1025 + (count % 4) * 26,
        y: Math.max(headerLockY + 40, 245) + (count % 4) * 22
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
        noteCompanion({ type: "note_added", userText: "New sticky note", mood: "creative" });
    };
    const updatePostit = (id, updates) => setPostits(pp => pp.map(n => n.id === id ? { ...n, ...updates } : n));
    const updatePostitContent = (id, value) => updatePostit(id, { content: value });
    const toggleTask = (id) => {
        const target = tasks.find(tk => tk.id === id);
        if (!target) return;
        const nextDone = !target.done;
        if (nextDone && !target.isParent) {
            setAdaptiveModel(prev => reinforceAdaptiveModel({
                adaptiveModel: prev,
                tasks,
                events,
                expenses,
                budget,
                modules,
                completedTask: target,
                recommendedTask: adaptiveInsights?.recommendedTask,
                now: companionNow,
            }));
        }
        noteCompanion({ type: nextDone ? "task_completed" : "planning", userText: target.text, mood: nextDone ? "proud" : "productive" });
        if (nextDone) setMoodWithCompanion("proud", "task_completed");
        setTasks(t => t.map(tk => tk.id === id ? { ...tk, done: nextDone } : tk));
    };
    const deletePostit = (id) => {
        setPostits(pp => pp.filter(n => n.id !== id));
        setSelectedPostitId(cur => cur === id ? null : cur);
    };

    const handleLogin = async (nameOverride) => {
        const nextName = String(nameOverride ?? profileNameInput).trim();
        if (!nextName) {
            setAuthMessage("Enter a profile name first.");
            return;
        }

        setProfileStatus("booting");
        try {
            const payload = await loginProfile(nextName);
            applyProfileState(payload.state);
            setSession(payload.session);
            setProfileMeta(payload.profile);
            setProfileNameInput(payload.profile.displayName);
            setProfileStatus("ready");
            setAuthMessage("");
            await loadProfileDirectory();
        } catch (error) {
            setProfileStatus("logged_out");
            setAuthMessage(error.message);
        }
    };

    const handleLogout = async () => {
        try {
            await logoutProfile(session?.token);
        } catch (error) {
            console.warn("[profiles] logout failed", error);
        }
        resetProfileShell("");
        loadProfileDirectory();
    };

    const handleClearProfile = async () => {
        if (!session || !window.confirm(`Clear the profile "${profileMeta?.displayName || "this profile"}"? This removes its saved dashboard data.`)) return;

        try {
            await clearProfile(session.token);
            resetProfileShell("Profile cleared.");
            loadProfileDirectory();
        } catch (error) {
            setAuthMessage(`Couldn't clear profile: ${error.message}`);
        }
    };

    const authBusy = profileStatus === "booting";
    const visibleProfiles = profileOptions.slice(0, 6);

    if (profileStatus !== "ready" || !session) {
        return <>
            <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,300;0,400;0,500;0,700;1,400&family=JetBrains+Mono:wght@200;400;600;700&display=swap" rel="stylesheet" />
            <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: bg, color: tx, fontFamily: "'DM Sans', sans-serif" }}>
                <div style={{ width: "min(520px, 100%)", padding: 28, borderRadius: 28, background: light ? "rgba(255,255,255,0.82)" : "rgba(8,10,20,0.72)", border: `1px solid ${pBd}`, boxShadow: "0 24px 80px rgba(0,0,0,0.28)", backdropFilter: "blur(18px)" }}>
                    <div style={{ fontFamily: "'JetBrains Mono'", fontSize: 10, letterSpacing: 1.8, textTransform: "uppercase", color: accent }}>Adaptive Dashboard</div>
                    <h1 style={{ margin: "10px 0 8px", fontSize: 30, fontWeight: 500, lineHeight: 1.05 }}>Sign in with a profile name</h1>
                    <div style={{ fontSize: 13, lineHeight: 1.6, color: light ? "rgba(45,52,54,0.7)" : "rgba(255,255,255,0.68)" }}>
                        Keep things simple for now: type a name to create or reopen a profile. No password yet, but each profile keeps its own saved dashboard state.
                    </div>

                    <form onSubmit={e => { e.preventDefault(); handleLogin(); }} style={{ display: "grid", gap: 12, marginTop: 22 }}>
                        <input
                            value={profileNameInput}
                            onChange={e => {
                                setProfileNameInput(e.target.value);
                                if (authMessage) setAuthMessage("");
                            }}
                            placeholder="e.g. Chris"
                            disabled={authBusy}
                            style={{ width: "100%", padding: "14px 16px", borderRadius: 16, border: `1px solid ${pBd}`, background: light ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.05)", color: tx, outline: "none", fontSize: 15 }}
                        />
                        <button type="submit" disabled={authBusy} style={{ padding: "13px 16px", borderRadius: 16, border: "none", background: `linear-gradient(135deg, ${accent}, ${accent}aa)`, color: "#fff", fontSize: 14, fontWeight: 600, cursor: authBusy ? "wait" : "pointer", opacity: authBusy ? 0.7 : 1 }}>
                            {authBusy ? "Opening profile..." : "Create or log in"}
                        </button>
                    </form>

                    {authMessage && <div style={{ marginTop: 12, padding: "11px 13px", borderRadius: 14, border: `1px solid ${accent}33`, background: light ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.04)", color: tx, fontSize: 12.5 }}>{authMessage}</div>}

                    <div style={{ marginTop: 20 }}>
                        <div style={{ fontFamily: "'JetBrains Mono'", fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: txm }}>Existing profiles</div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                            {visibleProfiles.length ? visibleProfiles.map(profile => (
                                <button key={profile.id} onClick={() => handleLogin(profile.displayName)} disabled={authBusy} style={{ padding: "8px 12px", borderRadius: 999, border: `1px solid ${pBd}`, background: light ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.05)", color: tx, cursor: authBusy ? "wait" : "pointer", fontFamily: "'JetBrains Mono'", fontSize: 10 }}>
                                    {profile.displayName}
                                </button>
                            )) : <div style={{ marginTop: 4, fontSize: 12.5, color: txm }}>No profiles yet. Your first login creates one automatically.</div>}
                        </div>
                    </div>
                </div>
            </div>
        </>;
    }

    return <WidgetRegistryCtx.Provider value={widgetRegistry}>
        <DragBoundsCtx.Provider value={canvasBounds}>
        <>
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
            @keyframes lennyFloat{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-6px) scale(1.02)}}
            .anim-item { animation: itemIn 0.25s ease-out; }
            .anim-panel { animation: panelIn 0.2s ease-out; }
            .panel-shell:hover { transform: translateY(-2px); box-shadow: 0 14px 36px rgba(0,0,0,0.22), 0 0 24px rgba(255,255,255,0.04) !important; }
        `}</style>

        <div style={{ width: "100vw", height: "100vh", overflow: "hidden", display: "flex", background: bg, fontFamily: "'DM Sans',sans-serif", color: tx, transition: "background 1.2s ease, color 0.8s" }}>
            <div ref={canvasRef} style={{ flex: 1, position: "relative", overflow: "hidden" }}>

                {/* Ambient layers */}
                <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 1, background: ambientBg, transition: "background 2.5s" }} />
                <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 2, opacity: ambient.grainOpacity, backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E")`, backgroundRepeat: "repeat", backgroundSize: "128px", transition: "opacity 2s" }} />

                {ambient.particles !== "none" && <Particles type={ambient.particles} color={ambient.glowColor !== "transparent" ? ambient.glowColor : accent} />}
                <LennyBuddy mood={companionView.mood} glowColor={ambient.glowColor !== "transparent" ? ambient.glowColor : accent} light={light} loading={loading} companion={companionView} />

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
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
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
                                <span style={{ fontSize: 10.5, color: txm, lineHeight: 1.45 }}>
                                    {adaptiveInsights.recommendedTask ? `Next best move: ${adaptiveInsights.recommendedTask.text}` : "Adaptive recommendations update as the dashboard changes."}
                                </span>
                            </div>
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
                        <div style={{ maxWidth: 320, padding: "10px 12px", borderRadius: 16, background: light ? "rgba(255,255,255,0.62)" : "rgba(255,255,255,0.045)", border: `1px solid ${pBd}`, boxShadow: light ? "0 8px 18px rgba(0,0,0,0.04)" : "0 12px 28px rgba(0,0,0,0.16)" }}>
                            <div style={{ fontFamily: "'JetBrains Mono'", fontSize: 8.5, letterSpacing: 1.5, textTransform: "uppercase", color: accent }}>Profile</div>
                            <div style={{ marginTop: 5, fontSize: 15, fontWeight: 700, color: tx }}>{profileMeta?.displayName}</div>
                            <div style={{ marginTop: 4, fontSize: 10.5, color: txm, lineHeight: 1.45 }}>Last saved {profileUpdatedLabel}</div>
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end", marginTop: 10 }}>
                                <button onClick={handleLogout} style={{ padding: "6px 10px", borderRadius: 999, border: `1px solid ${pBd}`, background: light ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.035)", color: txm, cursor: "pointer", fontFamily: "'JetBrains Mono'", fontSize: 9.5 }}>Log out</button>
                                <button onClick={handleClearProfile} style={{ padding: "6px 10px", borderRadius: 999, border: `1px solid rgba(255,107,107,0.35)`, background: "rgba(255,107,107,0.12)", color: light ? "#c0392b" : "#ffb3b3", cursor: "pointer", fontFamily: "'JetBrains Mono'", fontSize: 9.5 }}>Clear profile</button>
                            </div>
                        </div>
                        {authMessage && <div style={{ maxWidth: 320, padding: "8px 10px", borderRadius: 14, background: light ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.05)", border: `1px solid ${accent}2e`, color: tx, fontSize: 10.5, lineHeight: 1.4 }}>{authMessage}</div>}
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "flex-end" }}>
                            <button onClick={() => setShowPostitLibrary(true)} style={{ padding: "5px 10px", borderRadius: 999, fontSize: 9.5, cursor: "pointer", fontFamily: "'JetBrains Mono'", background: showPostitLibrary ? `${accent}24` : (light ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.04)"), border: `1px solid ${showPostitLibrary ? `${accent}50` : pBd}`, color: showPostitLibrary ? accent : txm, display: "flex", alignItems: "center", gap: 4, transition: "all 0.2s" }}><span style={{ fontSize: 10 }}>📝</span> Post-its</button>
                            {togs.map(t => <button key={t.k} onClick={() => t.f(v => !v)} style={{ padding: "5px 10px", borderRadius: 999, fontSize: 9.5, cursor: "pointer", fontFamily: "'JetBrains Mono'", background: t.s ? `${accent}20` : (light ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.04)"), border: `1px solid ${t.s ? `${accent}40` : pBd}`, color: t.s ? accent : txm, display: "flex", alignItems: "center", gap: 4, transition: "all 0.2s" }}><span style={{ fontSize: 10 }}>{t.i}</span> {t.l}</button>)}
                        </div>
                        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", justifyContent: "flex-end", maxWidth: 260 }}>
                            {quickThemes.map((themeOption) => {
                                const isActiveTheme = bg === themes[themeOption.key].bg && accent === themes[themeOption.key].accent;
                                return (
                                    <button
                                        key={themeOption.key}
                                        onClick={() => {
                                            setAutoAdapt(false);
                                            applyThemePreset(themeOption.key, { reason: "manual_theme" });
                                        }}
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
                        <div style={{ fontSize: 9.5, color: txm, fontFamily: "'JetBrains Mono'", textAlign: "right", maxWidth: 320 }}>
                            {autoAdapt ? `Auto-adapt is on: ${adaptiveInsights.suggestedMode} mode is currently recommended.` : "Manual mode is pinned. Re-enable auto-adapt from the Adaptive panel."}
                        </div>
                    </div>
                </div>

                <HeaderLockCtx.Provider value={headerLockY}>
                {showTasks && <TasksPanel tasks={tasks} recommendedTaskId={adaptiveInsights.recommendedTask?.id} recommendedTaskReason={adaptiveInsights.recommendedTask?.reason} onToggle={toggleTask} onEditTask={(id, v) => setTasks(t => t.map(tk => tk.id === id ? { ...tk, text: v } : tk))} onRequestSplit={t => send(`split the task "${t}" into subtasks`)} onAddTask={manualAddTask} accent={accent} light={light} onClose={() => setShowTasks(false)} ambient={ambient} />}
                {showCal && <CalendarPanel events={events} onDeleteEvent={id => setEvents(e => e.filter(ev => ev.id !== id))} onAddEvent={manualAddEvent} onEditEvent={manualEditEvent} accent={accent} light={light} onClose={() => setShowCal(false)} ambient={ambient} />}
                {showBudget && <BudgetPanel expenses={expenses} budget={budget} accent={accent} light={light} onClose={() => setShowBudget(false)} onDeleteExpense={id => setExpenses(e => e.filter(ex => ex.id !== id))} onAddExpense={manualAddExpense} ambient={ambient} />}
                {showRewards && <RewardsPanel weeklyGoalCategory={weeklyGoalCategory} setWeeklyGoalCategory={setWeeklyGoalCategory} weeklyGoalTarget={weeklyGoalTarget} setWeeklyGoalTarget={setWeeklyGoalTarget} weeklyGoalProgress={weeklyGoalProgress} weeklyGoalLabel={activeWeeklyGoal.label} weeklyGoalHelper={weeklyGoalHelper} weeklyStreak={Math.max(1, Math.ceil(studyStreak / 2))} light={light} ambient={ambient} onClose={() => setShowRewards(false)} accent="#f59e0b" />}
                {showWeather && <WeatherWidget light={light} accent={accent} ambient={ambient} onClose={() => setShowWeather(false)} />}
                {showAdaptive && <AdaptivePanel analysis={adaptiveInsights} autoAdapt={autoAdapt} onToggleAutoAdapt={() => setAutoAdapt(value => !value)} onApplySuggestedMode={() => {
                    setAutoAdapt(false);
                    applyThemePreset(adaptiveInsights.suggestedMode, { greetingText: adaptiveInsights.suggestedGreeting, reason: "manual_adaptive_mode" });
                }} onStartSprint={() => startAdaptiveSprint(adaptiveInsights.recommendedTask)} accent={accent} light={light} ambient={ambient} onClose={() => setShowAdaptive(false)} />}
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
                                    <EditableText value={selectedPostit.content} onChange={v => updatePostitContent(selectedPostit.id, v)} maxLen={POSTIT_CHAR_LIMIT} multiline style={{ fontFamily: "'Caveat', cursive", fontSize: 28, lineHeight: 1.25, color: "#111111", flex: 1 }} />
                                </div>
                            </> : <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: txm, fontSize: 12 }}>Select a sticky note or click + to create one.</div>}
                        </div>
                    </div>
                </div>}

                {postits.map(p => <PostIt key={p.id} id={p.id} content={p.content} color={p.color} initialX={p.x} initialY={p.y} onRemove={id => setPostits(pp => pp.filter(n => n.id !== id))} onEdit={updatePostitContent} />)}
                {timers.map(t => <TimerWidget key={t.id} id={t.id} minutes={t.minutes} label={t.label} onRemove={id => setTimers(tt => tt.filter(n => n.id !== id))} light={light} />)}
                {widgets.map(w => w.type === "clock" ? <ClockWidget key={w.id} id={w.id} onRemove={id => setWidgets(ww => ww.filter(n => n.id !== id))} light={light} /> : w.type === "quote" ? <QuoteWidget key={w.id} id={w.id} onRemove={id => setWidgets(ww => ww.filter(n => n.id !== id))} light={light} /> : null)}

                {!postits.length && !timers.length && !widgets.length && !showTasks && !showCal && !showBudget && !showRewards && !showWeather && !showAdaptive && !showTCDModules && !showTimetable && <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", textAlign: "center", color: txs, userSelect: "none", zIndex: 5 }}>
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
        </>
        </DragBoundsCtx.Provider>
    </WidgetRegistryCtx.Provider>;
}
// ═══════════════════════════════════════════════════
// APP WRAPPER
// ═══════════════════════════════════════════════════
// export default function App() {
//     return <Dashboard />;
// }
