import { Panel } from "./shared";

const MODE_LABELS = {
    focus: "Deep focus",
    cozy: "Cozy study",
    ocean: "Fresh start",
    minimal: "Low distraction",
};

export function AdaptivePanel({
    analysis,
    autoAdapt,
    onToggleAutoAdapt,
    onApplySuggestedMode,
    onStartSprint,
    accent,
    light,
    ambient,
    onClose,
}) {
    const tx = light ? "#2d3436" : "#fff";
    const txm = light ? "rgba(45,52,54,0.5)" : "rgba(255,255,255,0.45)";
    const pressureTone = analysis.pressure >= 72 ? "#ef4444" : analysis.pressure >= 42 ? "#f59e0b" : "#10b981";
    const suggestedModeLabel = MODE_LABELS[analysis.suggestedMode] || "Adaptive mode";

    return (
        <Panel x={885} y={320} width={320} title="Adaptive Coach" icon="🧠" light={light} onClose={onClose} ambient={ambient} accent={accent}>
            <div style={{ display: "grid", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                    <div>
                        <div style={{ fontFamily: "'JetBrains Mono'", fontSize: 9, letterSpacing: 1.3, textTransform: "uppercase", color: txm }}>Live analysis</div>
                        <div style={{ marginTop: 5, fontSize: 20, fontWeight: 700, color: tx }}>{analysis.pressureLabel}</div>
                        <div style={{ marginTop: 3, fontSize: 10, color: txm, lineHeight: 1.45 }}>{analysis.summary}</div>
                    </div>
                    <div style={{ minWidth: 68, padding: "8px 10px", borderRadius: 14, background: `${pressureTone}18`, border: `1px solid ${pressureTone}40`, textAlign: "center" }}>
                        <div style={{ fontFamily: "'JetBrains Mono'", fontSize: 8, letterSpacing: 1.2, textTransform: "uppercase", color: pressureTone }}>Pressure</div>
                        <div style={{ marginTop: 4, fontSize: 18, fontWeight: 700, color: pressureTone, fontFamily: "'JetBrains Mono'" }}>{analysis.pressure}</div>
                    </div>
                </div>

                <div style={{ padding: "10px 12px", borderRadius: 14, background: light ? "rgba(255,255,255,0.72)" : "rgba(255,255,255,0.04)", border: `1px solid ${accent}24` }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                        <div>
                            <div style={{ fontFamily: "'JetBrains Mono'", fontSize: 8.5, letterSpacing: 1.2, textTransform: "uppercase", color: accent }}>Suggested mode</div>
                            <div style={{ marginTop: 4, fontSize: 15, fontWeight: 700, color: tx }}>{suggestedModeLabel}</div>
                        </div>
                        <button onClick={onApplySuggestedMode} style={{ padding: "6px 10px", borderRadius: 999, border: `1px solid ${accent}55`, background: `${accent}18`, color: accent, cursor: "pointer", fontFamily: "'JetBrains Mono'", fontSize: 9 }}>
                            Apply
                        </button>
                    </div>
                    <div style={{ marginTop: 8, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                        <div style={{ fontSize: 10, color: txm }}>Auto-adapt uses workload, calendar, budget, and time of day.</div>
                        <button onClick={onToggleAutoAdapt} style={{ padding: "5px 9px", borderRadius: 999, border: `1px solid ${autoAdapt ? `${accent}55` : "rgba(148,163,184,0.28)"}`, background: autoAdapt ? `${accent}18` : "transparent", color: autoAdapt ? accent : txm, cursor: "pointer", fontFamily: "'JetBrains Mono'", fontSize: 8.5 }}>
                            {autoAdapt ? "Auto on" : "Auto off"}
                        </button>
                    </div>
                </div>

                <div style={{ padding: "10px 12px", borderRadius: 14, background: light ? "rgba(0,0,0,0.02)" : "rgba(255,255,255,0.035)", border: `1px solid ${light ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.06)"}` }}>
                    <div style={{ fontFamily: "'JetBrains Mono'", fontSize: 8.5, letterSpacing: 1.2, textTransform: "uppercase", color: txm }}>Recommended next task</div>
                    <div style={{ marginTop: 6, fontSize: 13, fontWeight: 700, color: tx }}>
                        {analysis.recommendedTask ? analysis.recommendedTask.text : "No active task to prioritize yet"}
                    </div>
                    <div style={{ marginTop: 4, fontSize: 10, color: txm, lineHeight: 1.45 }}>
                        {analysis.recommendedTask ? analysis.recommendedTask.reason : "Add a task and the panel will rank the best next step."}
                    </div>
                    <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                        <button onClick={onStartSprint} style={{ padding: "6px 10px", borderRadius: 999, border: `1px solid ${accent}40`, background: `${accent}18`, color: accent, cursor: "pointer", fontFamily: "'JetBrains Mono'", fontSize: 9 }}>
                            Start sprint
                        </button>
                        {analysis.focusWindow && <span style={{ padding: "6px 10px", borderRadius: 999, border: `1px solid ${light ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.08)"}`, color: txm, fontFamily: "'JetBrains Mono'", fontSize: 8.5 }}>
                            {analysis.focusWindow.label} {analysis.focusWindow.reason}
                        </span>}
                    </div>
                </div>

                <div style={{ display: "grid", gap: 8 }}>
                    <div>
                        <div style={{ fontFamily: "'JetBrains Mono'", fontSize: 8.5, letterSpacing: 1.2, textTransform: "uppercase", color: txm, marginBottom: 6 }}>Signals</div>
                        <div style={{ display: "grid", gap: 6 }}>
                            {analysis.evidence.map((item) => (
                                <div key={item} style={{ padding: "7px 9px", borderRadius: 10, background: light ? "rgba(255,255,255,0.65)" : "rgba(255,255,255,0.035)", border: `1px solid ${light ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.05)"}`, fontSize: 10, color: tx }}>
                                    {item}
                                </div>
                            ))}
                        </div>
                    </div>
                    <div>
                        <div style={{ fontFamily: "'JetBrains Mono'", fontSize: 8.5, letterSpacing: 1.2, textTransform: "uppercase", color: txm, marginBottom: 6 }}>Why it adapted</div>
                        <div style={{ display: "grid", gap: 6 }}>
                            {analysis.coaching.map((item) => (
                                <div key={item} style={{ fontSize: 10, color: txm, lineHeight: 1.45 }}>
                                    {item}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </Panel>
    );
}
