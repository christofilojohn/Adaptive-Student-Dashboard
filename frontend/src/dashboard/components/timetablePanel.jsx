import { useState } from "react";
import { TIMETABLE_HOURS, WEEK_DAYS, WEEK_DAY_LABELS } from "../constants";
import { Panel } from "./shared";

export function TimetablePanel({ modules, timetable, onAddSlot, onRemoveSlot, accent, light, onClose, ambient }) {
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

    const usedHourNums = timetable.flatMap(s => [parseInt(s.startTime), parseInt(s.endTime || s.startTime)]);
    const minH = usedHourNums.length ? Math.max(8, Math.min(...usedHourNums)) : 9;
    const maxH = usedHourNums.length ? Math.min(20, Math.max(...usedHourNums)) : 18;
    const displayHours = TIMETABLE_HOURS.filter(h => {
        const n = parseInt(h);
        return n >= minH && n <= maxH;
    });

    const getSlots = (day, hour) => timetable.filter(s => s.day === day && s.startTime === hour);

    const addSlot = () => {
        if (!formModule) return;
        onAddSlot({ id: `s${Date.now()}`, moduleCode: formModule, day: formDay, startTime: formStart, endTime: formEnd, slotType: formType, room: formRoom });
        setAddForm(false);
        setFormRoom("");
    };

    const selStyle = {
        background: light ? "rgba(255,255,255,0.8)" : "rgba(30,30,50,0.8)",
        border: `1px solid ${bd}`,
        borderRadius: 4,
        padding: "2px 4px",
        fontSize: 9,
        color: tx,
        outline: "none",
        colorScheme: light ? "light" : "dark",
    };

    return (
        <Panel x={24} y={500} width={520} title="Timetable" icon="📆" light={light} onClose={onClose} ambient={ambient} accent={accent}>
            {timetable.length === 0 && !addForm && <div style={{ fontSize: 11, color: txm, fontStyle: "italic", textAlign: "center", padding: "8px 0 4px" }}>No classes yet — add a slot below</div>}
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
                            <option value="lecture">Lecture</option>
                            <option value="tutorial">Tutorial</option>
                            <option value="lab">Lab</option>
                            <option value="seminar">Seminar</option>
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
