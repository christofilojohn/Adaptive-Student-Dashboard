import { TASK_CHAR_LIMIT } from "../constants";
import { guessEmoji } from "../utils";
import { EditableText, Panel, QuickAdd } from "./shared";

export function TasksPanel({ tasks, onToggle, onEditTask, onRequestSplit, onAddTask, accent, light, onClose, ambient }) {
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
                                <div onClick={() => onToggle(tk.id)} style={{ width: 14, height: 14, borderRadius: tk.parentId ? 7 : 4, flexShrink: 0, marginTop: 2, cursor: "pointer", border: `2px solid ${tk.done ? txm : (prioC[tk.priority] || "#f39c12")}`, background: tk.done ? (light ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.08)") : "transparent", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, marginLeft: tk.parentId ? 14 : 0, transition: "all 0.2s" }}>{tk.done && "✓"}</div>
                            )}
                            <div style={{ flex: 1, opacity: tk.done ? 0.5 : 1, display: "flex", alignItems: "center", gap: 4, transition: "opacity 0.3s" }}>
                                {em && <span style={{ fontSize: 11, flexShrink: 0 }}>{em}</span>}
                                <EditableText value={tk.text} onChange={v => onEditTask(tk.id, v)} maxLen={TASK_CHAR_LIMIT} style={{ fontSize: tk.isParent ? 12 : (tk.parentId ? 11 : 12), fontWeight: tk.isParent ? 600 : 400, color: light ? "#2d3436" : "rgba(255,255,255,0.85)", textDecoration: tk.done ? "line-through" : "none", flex: 1 }} />
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
