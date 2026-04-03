import { toLocalDateStr } from "./utils";

const PRIORITY_WEIGHTS = {
    high: 3,
    medium: 2,
    low: 1,
};

const ACADEMIC_HINTS = /\b(study|review|exam|lecture|module|assignment|report|draft|research|read|presentation|slides|deadline)\b/i;
const QUICK_WIN_LIMIT = 42;
const LONG_TASK_LIMIT = 70;

const DEFAULT_MODEL = {
    version: 1,
    weights: {
        bias: 0.12,
        priorityHigh: 0.9,
        priorityMedium: 0.45,
        academic: 0.72,
        eventOverlap: 0.68,
        moduleOverlap: 0.44,
        quickWin: 0.26,
        longTaskPenalty: -0.18,
        pressure: 0.24,
        budgetPressure: -0.1,
    },
    stats: {
        feedbackCount: 0,
        recommendationWins: 0,
        recommendationMisses: 0,
        sprintStarts: 0,
    },
};

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function sigmoid(value) {
    return 1 / (1 + Math.exp(-value));
}

function round(value, precision = 3) {
    const factor = 10 ** precision;
    return Math.round(value * factor) / factor;
}

export function createInitialAdaptiveModel() {
    return JSON.parse(JSON.stringify(DEFAULT_MODEL));
}

export function normalizeAdaptiveModel(rawModel) {
    const model = rawModel && typeof rawModel === "object" ? rawModel : {};
    return {
        ...DEFAULT_MODEL,
        ...model,
        weights: { ...DEFAULT_MODEL.weights, ...(model.weights || {}) },
        stats: { ...DEFAULT_MODEL.stats, ...(model.stats || {}) },
    };
}

function parseLocalDate(dateStr, time = "09:00") {
    const [year, month, day] = String(dateStr || toLocalDateStr(new Date())).split("-").map(Number);
    const [hours, minutes] = String(time || "09:00").split(":").map(Number);
    return new Date(year, (month || 1) - 1, day || 1, hours || 0, minutes || 0, 0, 0);
}

function minutesBetween(start, end) {
    return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}

function formatTime(date) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function buildKeywordSet(text) {
    return new Set(
        String(text || "")
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, " ")
            .split(/\s+/)
            .filter(token => token.length >= 4),
    );
}

function overlapScore(taskText, sources) {
    const taskKeywords = buildKeywordSet(taskText);
    let score = 0;

    for (const source of sources) {
        for (const token of taskKeywords) {
            if (source.has(token)) score += 1;
        }
    }

    return score;
}

function describePressure(pressure) {
    if (pressure >= 72) return "High pressure";
    if (pressure >= 42) return "Medium pressure";
    return "Low pressure";
}

function describeModelReadiness(feedbackCount) {
    if (feedbackCount >= 10) return "Personalized";
    if (feedbackCount >= 4) return "Learning your patterns";
    return "Warm-up mode";
}

function buildSuggestedMode({ pressure, budgetProgress, activeTasks, eventsToday, hour }) {
    if (pressure >= 72 || activeTasks >= 5 || eventsToday >= 3) return "focus";
    if (budgetProgress >= 85) return "minimal";
    if (hour >= 19) return "cozy";
    if (hour <= 11 && pressure < 50) return "ocean";
    return "focus";
}

function buildGreeting({ pressure, eventsSoon, budgetProgress, focusWindow, recommendedTask }) {
    if (pressure >= 72) {
        return recommendedTask
            ? `High-pressure day: clear "${recommendedTask.text}" first.`
            : "High-pressure day: protect one focused block first.";
    }
    if (budgetProgress >= 85) return "Keep the week light and low-distraction.";
    if (eventsSoon >= 2) return focusWindow ? `Plan around ${focusWindow.label.toLowerCase()}.` : "Schedule is filling up, so front-load the important work.";
    if (recommendedTask) return `Good moment to move "${recommendedTask.text}" forward.`;
    return "Plan your week, not just your tasks.";
}

function buildFocusWindow(now, events) {
    const endOfDay = new Date(now);
    endOfDay.setHours(22, 0, 0, 0);
    const futureToday = events
        .filter(event => toLocalDateStr(parseLocalDate(event.date, event.time)) === toLocalDateStr(now))
        .map(event => ({ ...event, startsAt: parseLocalDate(event.date, event.time), endsAt: new Date(parseLocalDate(event.date, event.time).getTime() + (Number(event.duration) || 60) * 60000) }))
        .filter(event => event.endsAt > now)
        .sort((a, b) => a.startsAt - b.startsAt);

    let cursor = new Date(now);
    let bestGap = 0;
    let bestWindow = null;

    for (const event of futureToday) {
        const gap = minutesBetween(cursor, event.startsAt);
        if (gap > bestGap) {
            bestGap = gap;
            bestWindow = {
                start: new Date(cursor),
                end: new Date(event.startsAt),
                label: `${formatTime(cursor)}-${formatTime(event.startsAt)}`,
                reason: `before ${event.title}`,
            };
        }
        if (event.endsAt > cursor) cursor = new Date(event.endsAt);
    }

    const finalGap = minutesBetween(cursor, endOfDay);
    if (finalGap > bestGap) {
        bestGap = finalGap;
        bestWindow = {
            start: new Date(cursor),
            end: new Date(endOfDay),
            label: `${formatTime(cursor)}-${formatTime(endOfDay)}`,
            reason: futureToday.length ? "after the last event" : "calendar is open",
        };
    }

    if (!bestWindow || bestGap < 45) return null;
    return { ...bestWindow, minutes: bestGap };
}

function buildAdaptiveContext({
    tasks,
    events,
    expenses,
    budget,
    modules,
    now = Date.now(),
}) {
    const currentTime = new Date(now);
    const today = toLocalDateStr(currentTime);
    const activeTasks = tasks.filter(task => !task.done && !task.isParent);
    const completedTasks = tasks.filter(task => task.done).length;
    const upcomingEvents = events
        .map(event => ({ ...event, startsAt: parseLocalDate(event.date, event.time) }))
        .filter(event => event.startsAt >= new Date(currentTime.getFullYear(), currentTime.getMonth(), currentTime.getDate()))
        .sort((a, b) => a.startsAt - b.startsAt);
    const futureEvents = upcomingEvents.filter(event => event.startsAt >= currentTime);
    const eventsToday = upcomingEvents.filter(event => event.date === today);
    const eventsSoon = futureEvents.filter(event => minutesBetween(currentTime, event.startsAt) <= 48 * 60).length;
    const spend = expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
    const budgetProgress = budget > 0 ? Math.round((spend / budget) * 100) : 0;
    const highPriorityTasks = activeTasks.filter(task => task.priority === "high").length;
    const pressure = clamp(
        activeTasks.length * 9 + highPriorityTasks * 13 + eventsSoon * 12 + Math.max(budgetProgress - 60, 0),
        0,
        100,
    );

    const eventKeywords = futureEvents.slice(0, 5).map(event => buildKeywordSet(event.title));
    const moduleKeywords = modules.slice(0, 6).map(module => buildKeywordSet(`${module.code} ${module.name}`));

    return {
        currentTime,
        activeTasks,
        completedTasks,
        upcomingEvents,
        futureEvents,
        eventsToday,
        eventsSoon,
        budgetProgress,
        pressure,
        eventKeywords,
        moduleKeywords,
        focusWindow: buildFocusWindow(currentTime, upcomingEvents),
    };
}

function buildTaskFeatures(task, context) {
    const eventOverlapRaw = overlapScore(task.text, context.eventKeywords);
    const moduleOverlapRaw = overlapScore(task.text, context.moduleKeywords);
    return {
        bias: 1,
        priorityHigh: task.priority === "high" ? 1 : 0,
        priorityMedium: task.priority === "medium" ? 1 : 0,
        academic: ACADEMIC_HINTS.test(task.text) ? 1 : 0,
        eventOverlap: clamp(eventOverlapRaw / 2, 0, 1),
        moduleOverlap: clamp(moduleOverlapRaw / 2, 0, 1),
        quickWin: task.text.length <= QUICK_WIN_LIMIT ? 1 : 0,
        longTaskPenalty: task.text.length >= LONG_TASK_LIMIT ? 1 : 0,
        pressure: context.pressure / 100,
        budgetPressure: context.budgetProgress >= 85 ? 1 : 0,
    };
}

function dotProduct(weights, features) {
    let total = 0;
    for (const [key, value] of Object.entries(features)) total += (weights[key] || 0) * value;
    return total;
}

function buildReason(task, context, learnedScore, probability) {
    const eventOverlap = overlapScore(task.text, context.eventKeywords);
    const moduleOverlap = overlapScore(task.text, context.moduleKeywords);
    const personalized = probability >= 0.64 && context.model.stats.feedbackCount >= 3;

    if (eventOverlap > 0) return personalized ? "Matches your schedule and learned study pattern" : "Aligns with an upcoming event";
    if (moduleOverlap > 0) return personalized ? "Looks like coursework you tend to act on first" : "Strong module/coursework match";
    if (task.priority === "high" && personalized) return "High priority and reinforced by your recent completions";
    if (task.priority === "high") return "Highest priority open task";
    if (ACADEMIC_HINTS.test(task.text) && learnedScore >= 0.4) return "Academic task with a strong model signal";
    if (ACADEMIC_HINTS.test(task.text)) return "Strong academic signal";
    if (context.pressure >= 72) return "Best pressure-release task";
    return personalized ? "Model predicts this is your most likely next win" : "Best next move from the current board";
}

function rankTask(task, context) {
    const heuristicPriority = (PRIORITY_WEIGHTS[task.priority] || 1) * 22;
    const eventOverlap = overlapScore(task.text, context.eventKeywords);
    const moduleOverlap = overlapScore(task.text, context.moduleKeywords);
    const academicBoost = ACADEMIC_HINTS.test(task.text) ? 12 : 0;
    const pressureBoost = context.pressure >= 72 ? (PRIORITY_WEIGHTS[task.priority] || 1) * 8 : 0;
    const eventBoost = eventOverlap > 0 && context.eventsSoon > 0 ? 14 : 0;
    const heuristicScore = heuristicPriority + eventOverlap * 10 + moduleOverlap * 6 + academicBoost + pressureBoost + eventBoost;

    const features = buildTaskFeatures(task, context);
    const learnedScore = dotProduct(context.model.weights, features);
    const probability = sigmoid(learnedScore);
    const score = heuristicScore + learnedScore * 14;

    return {
        ...task,
        score,
        heuristicScore,
        learnedScore,
        probability,
        features,
        reason: buildReason(task, context, learnedScore, probability),
    };
}

function nudgedWeights(weights, features, direction, rate) {
    const next = { ...weights };
    for (const [key, value] of Object.entries(features)) {
        next[key] = round((next[key] || 0) + direction * rate * value, 4);
    }
    return next;
}

function applyFeedback(model, positiveTask, negativeTask, context, feedbackType) {
    const normalized = normalizeAdaptiveModel(model);
    const feedbackCount = normalized.stats.feedbackCount;
    const baseRate = 0.22 / Math.sqrt(feedbackCount + 1);
    const positiveRate = feedbackType === "sprint_start" ? baseRate * 0.55 : baseRate;
    const negativeRate = feedbackType === "missed_recommendation" ? baseRate * 0.5 : baseRate * 0.35;

    let weights = { ...normalized.weights };

    if (positiveTask) {
        weights = nudgedWeights(weights, buildTaskFeatures(positiveTask, context), 1, positiveRate);
    }

    if (negativeTask) {
        weights = nudgedWeights(weights, buildTaskFeatures(negativeTask, context), -1, negativeRate);
    }

    return {
        ...normalized,
        weights,
        stats: {
            ...normalized.stats,
            feedbackCount: normalized.stats.feedbackCount + 1,
            sprintStarts: normalized.stats.sprintStarts + (feedbackType === "sprint_start" ? 1 : 0),
            recommendationWins: normalized.stats.recommendationWins + (feedbackType === "recommendation_win" ? 1 : 0),
            recommendationMisses: normalized.stats.recommendationMisses + (feedbackType === "missed_recommendation" ? 1 : 0),
        },
    };
}

export function analyzeAdaptiveState({
    tasks,
    events,
    expenses,
    budget,
    modules,
    adaptiveModel,
    now = Date.now(),
}) {
    const model = normalizeAdaptiveModel(adaptiveModel);
    const context = {
        ...buildAdaptiveContext({ tasks, events, expenses, budget, modules, now }),
        model,
    };

    const rankedTasks = context.activeTasks.length
        ? [...context.activeTasks]
            .map(task => rankTask(task, context))
            .sort((a, b) => b.score - a.score)
        : [];

    const recommendedTask = rankedTasks[0] || null;
    const suggestedMode = buildSuggestedMode({
        pressure: context.pressure,
        budgetProgress: context.budgetProgress,
        activeTasks: context.activeTasks.length,
        eventsToday: context.eventsToday.length,
        hour: context.currentTime.getHours(),
    });

    const pressureLabel = describePressure(context.pressure);
    const feedbackCount = model.stats.feedbackCount;
    const margin = rankedTasks.length > 1 ? Math.max(0, rankedTasks[0].score - rankedTasks[1].score) : (rankedTasks[0]?.score || 0);
    const modelConfidence = clamp(0.48 + feedbackCount * 0.035 + Math.min(margin, 18) * 0.01, 0.52, 0.96);
    const modelStatus = describeModelReadiness(feedbackCount);

    const evidence = [
        `${context.activeTasks.length} active task${context.activeTasks.length === 1 ? "" : "s"} on the board`,
        `${context.eventsSoon} event${context.eventsSoon === 1 ? "" : "s"} within the next 48h`,
        budget > 0 ? `${clamp(context.budgetProgress, 0, 999)}% of weekly budget used` : "Budget tracking available",
    ];

    const coaching = [
        recommendedTask
            ? `Prioritize "${recommendedTask.text}" because ${recommendedTask.reason.toLowerCase()}.`
            : "Add or reopen a task to generate a next-step recommendation.",
        context.focusWindow
            ? `Best focus window: ${context.focusWindow.label} ${context.focusWindow.reason}.`
            : "Calendar is dense today, so keep the next task intentionally small.",
        feedbackCount >= 3
            ? `Learner is using ${feedbackCount} recent signal${feedbackCount === 1 ? "" : "s"} from your completions and sprints.`
            : "Learner starts with academic priors and quickly tunes itself after a few completions.",
    ];

    return {
        pressure: context.pressure,
        pressureLabel,
        summary: `${pressureLabel} · ${suggestedMode} mode recommended`,
        suggestedMode,
        suggestedGreeting: buildGreeting({
            pressure: context.pressure,
            eventsSoon: context.eventsSoon,
            budgetProgress: context.budgetProgress,
            focusWindow: context.focusWindow,
            recommendedTask,
        }),
        recommendedTask,
        rankedTasks,
        focusWindow: context.focusWindow,
        evidence,
        coaching,
        modelStatus,
        modelConfidence,
        modelConfidenceLabel: `${Math.round(modelConfidence * 100)}% confidence`,
        modelSummary: feedbackCount >= 3
            ? `${modelStatus} from ${feedbackCount} interaction${feedbackCount === 1 ? "" : "s"}`
            : "Bootstrapped from study-task priors",
        stats: {
            activeTasks: context.activeTasks.length,
            completedTasks: context.completedTasks,
            eventsSoon: context.eventsSoon,
            eventsToday: context.eventsToday.length,
            budgetProgress: context.budgetProgress,
            feedbackCount,
            recommendationWins: model.stats.recommendationWins,
            recommendationMisses: model.stats.recommendationMisses,
            sprintStarts: model.stats.sprintStarts,
        },
    };
}

export function reinforceAdaptiveModel({
    adaptiveModel,
    tasks,
    events,
    expenses,
    budget,
    modules,
    completedTask,
    recommendedTask,
    sprintTask,
    now = Date.now(),
}) {
    const model = normalizeAdaptiveModel(adaptiveModel);
    const context = buildAdaptiveContext({ tasks, events, expenses, budget, modules, now });

    if (completedTask) {
        if (recommendedTask && recommendedTask.id !== completedTask.id) {
            return applyFeedback(model, completedTask, recommendedTask, context, "missed_recommendation");
        }
        return applyFeedback(model, completedTask, null, context, "recommendation_win");
    }

    if (sprintTask) {
        return applyFeedback(model, sprintTask, null, context, "sprint_start");
    }

    return model;
}
