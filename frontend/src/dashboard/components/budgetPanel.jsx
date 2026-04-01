import { useState } from "react";
import { guessEmoji, toLocalDateStr } from "../utils";
import { Panel } from "./shared";

export function BudgetPanel({ expenses, budget, accent, light, onClose, onDeleteExpense, onAddExpense, ambient }) {
    const [showForm, setShowForm] = useState(false);
    const [showInsights, setShowInsights] = useState(false);
    const [desc, setDesc] = useState("");
    const [amt, setAmt] = useState("");
    const [cat, setCat] = useState("other");
    const [error, setError] = useState("");
    const [expenseDate, setExpenseDate] = useState(() => toLocalDateStr(new Date()));
    const [insightsPeriod, setInsightsPeriod] = useState("weekly");
    const [chartType, setChartType] = useState("histogram");
    const txm = light ? "rgba(45,52,54,0.5)" : "rgba(255,255,255,0.45)";
    const tx = light ? "#2d3436" : "#fff";
    const total = expenses.reduce((s, e) => s + e.amount, 0);
    const pct = budget > 0 ? Math.min(total / budget, 1) : 0;
    const remaining = budget - total;
    const catI = { food: "🍽️", transport: "🚗", entertainment: "🎬", shopping: "🛍️", bills: "📄", health: "💊", other: "📦" };
    const catC = { food: "#e17055", transport: "#0984e3", entertainment: "#6c5ce7", shopping: "#fdcb6e", bills: "#636e72", health: "#00b894", other: "#b2bec3" };
    const catT = {};
    expenses.forEach(e => { catT[e.category] = (catT[e.category] || 0) + e.amount; });
    const submit = () => {
        setError("");
        const descTrimmed = desc.trim();
        const amtNum = parseFloat(amt);
        if (!descTrimmed) return setError("Add a description");
        if (!amt || isNaN(amtNum)) return setError("Enter an amount");
        if (amtNum <= 0) return setError("Amount must be > 0");
        onAddExpense(descTrimmed, amtNum, cat, expenseDate);
        setDesc("");
        setAmt("");
        setExpenseDate(toLocalDateStr(new Date()));
        setError("");
        setShowForm(false);
    };

    const now = new Date();
    const today = new Date();
    const parseLocalDate = (dateStr) => {
        if (!dateStr) return new Date();
        const datePart = typeof dateStr === "string" ? dateStr.split("T")[0] : dateStr;
        const [year, month, day] = datePart.split("-").map(Number);
        return new Date(year, month - 1, day);
    };
    const startOfWeek = new Date(now); startOfWeek.setDate(now.getDate() - now.getDay()); startOfWeek.setHours(0, 0, 0, 0);
    const startOfLastWeek = new Date(startOfWeek); startOfLastWeek.setDate(startOfWeek.getDate() - 7);
    const endOfToday = new Date(today); endOfToday.setHours(23, 59, 59, 999);
    const thisWeekExpenses = expenses.filter(e => { const d = parseLocalDate(e.date); return d >= startOfWeek && d <= endOfToday; });
    const lastWeekExpenses = expenses.filter(e => { const d = parseLocalDate(e.date); return d >= startOfLastWeek && d < startOfWeek; });
    const thisWeekTotal = thisWeekExpenses.reduce((s, e) => s + e.amount, 0);
    const lastWeekTotal = lastWeekExpenses.reduce((s, e) => s + e.amount, 0);
    const weeklyChange = lastWeekTotal > 0 ? ((thisWeekTotal - lastWeekTotal) / lastWeekTotal * 100) : 0;
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(startOfMonth.getFullYear(), startOfMonth.getMonth() - 1, 1);
    const thisMonthExpenses = expenses.filter(e => { const d = parseLocalDate(e.date); return d >= startOfMonth && d <= endOfToday; });
    const lastMonthExpenses = expenses.filter(e => { const d = parseLocalDate(e.date); return d >= startOfLastMonth && d < startOfMonth; });
    const thisMonthTotal = thisMonthExpenses.reduce((s, e) => s + e.amount, 0);
    const lastMonthTotal = lastMonthExpenses.reduce((s, e) => s + e.amount, 0);
    const monthlyChange = lastMonthTotal > 0 ? ((thisMonthTotal - lastMonthTotal) / lastMonthTotal * 100) : 0;
    const periodExpenses = insightsPeriod === "weekly" ? thisWeekExpenses : thisMonthExpenses;
    const periodTotal = insightsPeriod === "weekly" ? thisWeekTotal : thisMonthTotal;
    const periodLabel = insightsPeriod === "weekly" ? "week" : "month";
    const periodCatT = {};
    periodExpenses.forEach(e => { periodCatT[e.category] = (periodCatT[e.category] || 0) + e.amount; });
    const sortedCats = Object.entries(periodCatT).sort((a, b) => b[1] - a[1]);
    const topCategory = sortedCats[0];
    const chartData = [];
    if (insightsPeriod === "weekly") {
        for (let i = 6; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(now.getDate() - i);
            d.setHours(0, 0, 0, 0);
            const dayTotal = expenses.filter(e => parseLocalDate(e.date).toDateString() === d.toDateString()).reduce((s, e) => s + e.amount, 0);
            chartData.push({ label: d.toLocaleDateString("en", { weekday: "narrow" }), amount: dayTotal, date: d });
        }
    } else {
        const startDate = new Date(now);
        startDate.setDate(1);
        for (let i = 0; i < 31; i++) {
            const d = new Date(startDate);
            d.setDate(startDate.getDate() + i);
            if (d.getMonth() !== startOfMonth.getMonth()) break;
            const dayTotal = expenses.filter(e => parseLocalDate(e.date).toDateString() === d.toDateString()).reduce((s, e) => s + e.amount, 0);
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
                    <div style={{ marginTop: 3, fontSize: 8.5, color: pct >= 0.9 ? "#e74c3c" : pct >= 0.7 ? "#f59e0b" : "#34d399", fontFamily: "'JetBrains Mono'" }}>{pct >= 0.9 ? "Over limit" : pct >= 0.7 ? "Watch spend" : "On track"}</div>
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
                    const dateStr = exDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                    const isToday = exDate.toDateString() === today.toDateString();
                    return (
                        <div key={ex.id} style={{ display: "flex", alignItems: "center", gap: 5, padding: "2px 0", borderBottom: `1px solid ${light ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.03)"}` }}>
                            <span style={{ fontSize: 9 }}>{catI[ex.category]}</span>
                            <span style={{ flex: 1, fontSize: 10, color: tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ex.description} {em && <span style={{ fontSize: 9 }}>{em}</span>}</span>
                            <span style={{ fontSize: 8, color: txm, fontFamily: "'JetBrains Mono'" }}>{isToday ? "Today" : dateStr}</span>
                            <span style={{ fontSize: 9, fontFamily: "'JetBrains Mono'", color: txm, flexShrink: 0 }}>€{ex.amount.toFixed(2)}</span>
                            <button onClick={() => onDeleteExpense(ex.id)} style={{ background: "none", border: "none", color: txm, cursor: "pointer", fontSize: 9, lineHeight: 1, padding: 0 }}>×</button>
                        </div>
                    );
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
                <div style={{ marginBottom: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                        <span style={{ fontSize: 9, color: txm, fontFamily: "'JetBrains Mono'" }}>This {periodLabel}</span>
                        <span style={{ fontSize: 9, fontFamily: "'JetBrains Mono'", color: (insightsPeriod === "weekly" ? weeklyChange : monthlyChange) > 0 ? "#e74c3c" : (insightsPeriod === "weekly" ? weeklyChange : monthlyChange) < 0 ? "#00b894" : txm }}>
                            {(insightsPeriod === "weekly" ? weeklyChange : monthlyChange) > 0 ? "↑" : (insightsPeriod === "weekly" ? weeklyChange : monthlyChange) < 0 ? "↓" : "→"} {(insightsPeriod === "weekly" ? lastWeekTotal : lastMonthTotal) > 0 ? Math.abs(insightsPeriod === "weekly" ? weeklyChange : monthlyChange).toFixed(0) + "%" : "New"} {(insightsPeriod === "weekly" ? lastWeekTotal : lastMonthTotal) > 0 ? "vs last " + periodLabel : "data"}
                        </span>
                    </div>
                    {chartType === "histogram" ? (
                        <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 38, padding: "4px 0", overflowX: "auto", overflowY: "hidden", minHeight: 50 }}>
                            {chartData.map((d, i) => (
                                <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, minWidth: 28, flex: "0 0 auto" }}>
                                    <div style={{ width: 22, height: `${Math.max((d.amount / maxChartAmount) * 20, 2)}px`, background: d.amount > 0 && d.amount === maxChartAmount ? accent : light ? "rgba(0,0,0,0.2)" : "rgba(255,255,255,0.3)", borderRadius: 2, transition: "all 0.3s" }} />
                                    <span style={{ fontSize: 7, color: txm, whiteSpace: "nowrap" }}>{d.label}</span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div style={{ width: "100%", height: 45, position: "relative", marginBottom: 4, overflowX: "auto" }}>
                            <svg width="100%" height="45" viewBox={`0 0 ${Math.max(chartData.length - 1, 1) * 25} 45`} preserveAspectRatio="none" style={{ minWidth: "100%", overflow: "visible" }}>
                                <line x1="0" y1="38" x2={Math.max(chartData.length - 1, 1) * 25} y2="38" stroke={light ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.08)"} strokeWidth="0.5" />
                                <polyline points={chartData.map((d, i) => `${i * 25},${38 - (d.amount / maxChartAmount) * 32}`).join(" ")} fill="none" stroke={accent} strokeWidth="1" />
                                {chartData.map((d, i) => <circle key={i} cx={i * 25} cy={38 - (d.amount / maxChartAmount) * 32} r="1.5" fill={accent} />)}
                                {chartData.map((d, i) => <text key={`label-${i}`} x={i * 25} y="42" textAnchor="middle" fontSize="6" fill={txm}>{d.label}</text>)}
                            </svg>
                        </div>
                    )}
                </div>
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
                <div style={{ padding: "6px 8px", borderRadius: 5, background: pct >= 0.9 ? "rgba(231,76,60,0.1)" : pct >= 0.7 ? "rgba(245,158,11,0.1)" : "rgba(0,184,148,0.1)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 12 }}>{pct >= 0.9 ? "⚠️" : pct >= 0.7 ? "⚡" : "✅"}</span>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 9, color: tx, fontWeight: 600 }}>{pct >= 0.9 ? "Over budget limit" : pct >= 0.7 ? "Approaching limit" : "On track"}</div>
                            <div style={{ fontSize: 8, color: txm }}>{pct >= 0.9 ? "Consider reducing expenses" : pct >= 0.7 ? `${remaining.toFixed(0)}€ remaining` : "Keep up the good work!"}</div>
                        </div>
                    </div>
                </div>
            </div>}
        </Panel>
    );
}
