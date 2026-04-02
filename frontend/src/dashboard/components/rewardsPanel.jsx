import { Panel } from "./shared";

export function RewardsPanel({ weeklyGoalCategory, setWeeklyGoalCategory, weeklyGoalTarget, setWeeklyGoalTarget, weeklyGoalProgress, weeklyGoalLabel, weeklyGoalHelper, weeklyStreak, light, onClose, ambient }) {
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
                <select value={weeklyGoalCategory} onChange={e => setWeeklyGoalCategory(e.target.value)} style={{ flex: 1, background: light ? "rgba(0,0,0,0.02)" : "rgba(255,255,255,0.05)", border: `1px solid ${light ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.08)"}`, borderRadius: 6, fontSize: 9, color: tx, outline: "none", padding: "4px 6px", colorScheme: light ? "light" : "dark" }}>
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
