import { toLocalDateStr } from "./utils";

const PRIORITY_WEIGHTS = {
    high: 3,
    medium: 2,
    low: 1,
};

const ACADEMIC_HINTS = /\b(study|review|exam|lecture|module|assignment|report|draft|research|read|presentation|slides|deadline)\b/i;

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
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

function rankTask(task, context) {
    const priorityScore = (PRIORITY_WEIGHTS[task.priority] || 1) * 22;
    const overlap = overlapScore(task.text, context.keywordSources);
    const academicBoost = ACADEMIC_HINTS.test(task.text) ? 12 : 0;
    const pressureBoost = context.pressure >= 72 ? (PRIORITY_WEIGHTS[task.priority] || 1) * 8 : 0;
    const eventBoost = overlap > 0 && context.eventsSoon > 0 ? 14 : 0;
    const score = priorityScore + overlap * 10 + academicBoost + pressureBoost + eventBoost;

    let reason = "Highest priority open task";
    if (overlap > 0 && context.closestMatchingEvent) reason = `Aligns with ${context.closestMatchingEvent.title}`;
    else if (academicBoost) reason = "Strong academic signal";
    else if (context.pressure >= 72) reason = "Best pressure-release task";

    return { ...task, score, reason };
}

export function analyzeAdaptiveState({
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
    const focusWindow = buildFocusWindow(currentTime, upcomingEvents);
    const keywordSources = [...eventKeywords, ...moduleKeywords];
    const closestMatchingEvent = futureEvents.find(event => {
        const eventKeywords = buildKeywordSet(event.title);
        return activeTasks.some(task => overlapScore(task.text, [eventKeywords]) > 0);
    }) || null;

    const recommendedTask = activeTasks.length
        ? [...activeTasks]
            .map(task => rankTask(task, { keywordSources, pressure, eventsSoon, closestMatchingEvent }))
            .sort((a, b) => b.score - a.score)[0]
        : null;

    const suggestedMode = buildSuggestedMode({
        pressure,
        budgetProgress,
        activeTasks: activeTasks.length,
        eventsToday: eventsToday.length,
        hour: currentTime.getHours(),
    });

    const pressureLabel = describePressure(pressure);
    const evidence = [
        `${activeTasks.length} active task${activeTasks.length === 1 ? "" : "s"} on the board`,
        `${eventsSoon} event${eventsSoon === 1 ? "" : "s"} within the next 48h`,
        budget > 0 ? `${clamp(budgetProgress, 0, 999)}% of weekly budget used` : "Budget tracking available",
    ];

    const coaching = [
        recommendedTask
            ? `Prioritize "${recommendedTask.text}" because ${recommendedTask.reason.toLowerCase()}.`
            : "Add or reopen a task to generate a next-step recommendation.",
        focusWindow
            ? `Best focus window: ${focusWindow.label} ${focusWindow.reason}.`
            : "Calendar is dense today, so keep the next task intentionally small.",
        budgetProgress >= 85
            ? "Spending is high, so the interface shifts toward a lower-distraction mode."
            : budgetProgress >= 70
                ? "Budget is climbing, so keep an eye on optional spending."
                : "Budget pressure is low enough to keep attention on coursework.",
    ];

    return {
        pressure,
        pressureLabel,
        summary: `${pressureLabel} · ${suggestedMode} mode recommended`,
        suggestedMode,
        suggestedGreeting: buildGreeting({
            pressure,
            eventsSoon,
            budgetProgress,
            focusWindow,
            recommendedTask,
        }),
        recommendedTask,
        focusWindow,
        evidence,
        coaching,
        stats: {
            activeTasks: activeTasks.length,
            completedTasks,
            eventsSoon,
            eventsToday: eventsToday.length,
            budgetProgress,
        },
    };
}
