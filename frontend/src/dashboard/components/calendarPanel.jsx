import { useState } from "react";
import { guessEmoji, toLocalDateStr } from "../utils";
import { Panel } from "./shared";

export function CalendarPanel({ events, onDeleteEvent, onAddEvent, onEditEvent, accent, light, onClose, ambient }) {
    const [view, setView] = useState("week");
    const [showForm, setShowForm] = useState(false);
    const [selectedEvent, setSelectedEvent] = useState(null);
    const [selectedDate, setSelectedDate] = useState(null);
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [formTitle, setFormTitle] = useState("");
    const [formDate, setFormDate] = useState("");
    const [formTime, setFormTime] = useState("09:00");
    const [formDuration, setFormDuration] = useState(60);
    const [formColor, setFormColor] = useState("");
    const today = new Date();
    const txm = light ? "rgba(45,52,54,0.5)" : "rgba(255,255,255,0.45)";
    const tx = light ? "#2d3436" : "#fff";
    const dN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const dNF = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const mN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const week = Array.from({ length: 7 }, (_, i) => { const d = new Date(today); d.setDate(d.getDate() + i); return d; });
    const evFor = d => events.filter(e => e.date === toLocalDateStr(d)).sort((a, b) => (a.time || "").localeCompare(b.time || ""));
    const evColors = ["#6c5ce7", "#00cec9", "#e17055", "#00b894", "#fdcb6e", "#e84393", "#74b9ff", "#a29bfe"];

    const exportICS = () => {
        const escapeICSText = (value = "") => String(value)
            .replace(/\\/g, "\\\\")
            .replace(/\r?\n/g, "\\n")
            .replace(/;/g, "\\;")
            .replace(/,/g, "\\,");
        const formatICSDateTime = (date) => {
            const y = date.getFullYear();
            const m = String(date.getMonth() + 1).padStart(2, "0");
            const d = String(date.getDate()).padStart(2, "0");
            const h = String(date.getHours()).padStart(2, "0");
            const min = String(date.getMinutes()).padStart(2, "0");
            const sec = String(date.getSeconds()).padStart(2, "0");
            return `${y}${m}${d}T${h}${min}${sec}`;
        };

        let ics = "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Dashboard//EN\n";
        events.forEach(e => {
            const [year, month, day] = (e.date || toLocalDateStr(new Date())).split("-").map(Number);
            const [hours, minutes] = (e.time || "09:00").split(":").map(Number);
            const start = new Date(year, (month || 1) - 1, day || 1, hours || 0, minutes || 0, 0);
            const end = new Date(start);
            end.setMinutes(end.getMinutes() + (e.duration || 60));
            ics += `BEGIN:VEVENT\nDTSTART:${formatICSDateTime(start)}\nDTEND:${formatICSDateTime(end)}\nSUMMARY:${escapeICSText(e.title)}\nEND:VEVENT\n`;
        });
        ics += "END:VCALENDAR";
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
        a.download = "calendar.ics";
        a.click();
    };

    const openAddForm = (date = null, time = "09:00") => {
        setSelectedEvent(null);
        setFormTitle("");
        setFormDate(date || toLocalDateStr(today));
        setFormTime(time);
        setFormDuration(60);
        setFormColor(evColors[Math.floor(Math.random() * evColors.length)]);
        setShowForm(true);
    };

    const openEditForm = (ev) => {
        setSelectedEvent(ev);
        setFormTitle(ev.title);
        setFormDate(ev.date);
        setFormTime(ev.time || "09:00");
        setFormDuration(ev.duration || 60);
        setFormColor(ev.color || accent);
        setShowForm(true);
    };

    const submitEvent = () => {
        if (!formTitle.trim()) return;
        if (selectedEvent) onEditEvent(selectedEvent.id, formTitle.trim(), formDate, formTime, formDuration, formColor);
        else onAddEvent(formTitle.trim(), formDate, formTime, formDuration, formColor);
        setShowForm(false);
        setSelectedEvent(null);
        setSelectedDate(null);
    };

    const getMonthDays = () => {
        const year = currentMonth.getFullYear();
        const month = currentMonth.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const daysInMonth = lastDay.getDate();
        const startDayOfWeek = firstDay.getDay();
        const days = [];
        for (let i = 0; i < startDayOfWeek; i++) days.push(null);
        for (let i = 1; i <= daysInMonth; i++) days.push(new Date(year, month, i));
        return days;
    };

    const formatDuration = (mins) => {
        if (mins < 60) return `${mins}m`;
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return m > 0 ? `${h}h ${m}m` : `${h}h`;
    };

    const groupEventsByDate = () => {
        const grouped = {};
        [...events].sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)).forEach(ev => {
            if (!grouped[ev.date]) grouped[ev.date] = [];
            grouped[ev.date].push(ev);
        });
        return grouped;
    };

    const isToday = (d) => d.toDateString() === today.toDateString();
    const isPast = (d) => d < new Date(new Date(today).setHours(0, 0, 0, 0));

    return (
        <Panel x={24} y={485} width={360} title="Calendar" icon="📅" light={light} onClose={onClose} ambient={ambient} accent={accent}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ display: "flex", gap: 4, background: light ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.05)", borderRadius: 6, padding: 2 }}>
                    {["week", "month", "list"].map(v => (
                        <button key={v} onClick={() => setView(v)} style={{ padding: "4px 10px", borderRadius: 5, fontSize: 10, cursor: "pointer", fontFamily: "'JetBrains Mono'", textTransform: "uppercase", letterSpacing: 0.5, background: view === v ? (light ? "#fff" : "rgba(255,255,255,0.15)") : "transparent", border: "none", color: view === v ? accent : txm, boxShadow: view === v ? (light ? "0 1px 3px rgba(0,0,0,0.1)" : "0 1px 3px rgba(0,0,0,0.3)") : "none", transition: "all 0.2s" }}>{v}</button>
                    ))}
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                    <button onClick={() => openAddForm()} style={{ padding: "4px 10px", borderRadius: 6, fontSize: 10, cursor: "pointer", fontFamily: "'JetBrains Mono'", background: `${accent}20`, border: `1px solid ${accent}40`, color: accent, display: "flex", alignItems: "center", gap: 4, transition: "all 0.2s" }}><span>+</span> Event</button>
                    <button onClick={exportICS} style={{ padding: "4px 10px", borderRadius: 6, fontSize: 10, cursor: "pointer", fontFamily: "'JetBrains Mono'", background: "transparent", border: `1px solid ${light ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.1)"}`, color: txm, transition: "all 0.2s" }}>Export</button>
                </div>
            </div>

            {showForm && (
                <div className="anim-panel" style={{ marginBottom: 12, padding: 12, borderRadius: 10, background: light ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.05)", border: `1px solid ${light ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.08)"}` }} data-nodrag>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: tx }}>{selectedEvent ? "Edit Event" : "New Event"}</span>
                        <button onClick={() => setShowForm(false)} style={{ background: "none", border: "none", color: txm, cursor: "pointer", fontSize: 14 }}>×</button>
                    </div>
                    <input value={formTitle} onChange={e => setFormTitle(e.target.value)} placeholder="Event title" onKeyDown={e => e.key === "Enter" && submitEvent()} style={{ width: "100%", background: light ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.2)", border: `1px solid ${light ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.1)"}`, borderRadius: 6, outline: "none", fontSize: 12, color: tx, fontFamily: "'DM Sans'", padding: "6px 10px", marginBottom: 8 }} />
                    <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                        <div style={{ flex: 1 }}>
                            <label style={{ fontSize: 8, color: txm, fontFamily: "'JetBrains Mono'", textTransform: "uppercase", letterSpacing: 0.5 }}>Date</label>
                            <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} style={{ width: "100%", background: light ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.2)", border: `1px solid ${light ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.1)"}`, borderRadius: 6, padding: "5px 8px", fontSize: 10, color: tx, fontFamily: "'JetBrains Mono'", outline: "none", marginTop: 3 }} />
                        </div>
                        <div style={{ width: 80 }}>
                            <label style={{ fontSize: 8, color: txm, fontFamily: "'JetBrains Mono'", textTransform: "uppercase", letterSpacing: 0.5 }}>Time</label>
                            <input type="time" value={formTime} onChange={e => setFormTime(e.target.value)} style={{ width: "100%", background: light ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.2)", border: `1px solid ${light ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.1)"}`, borderRadius: 6, padding: "5px 8px", fontSize: 10, color: tx, fontFamily: "'JetBrains Mono'", outline: "none", marginTop: 3 }} />
                        </div>
                        <div style={{ width: 70 }}>
                            <label style={{ fontSize: 8, color: txm, fontFamily: "'JetBrains Mono'", textTransform: "uppercase", letterSpacing: 0.5 }}>Duration</label>
                            <select value={formDuration} onChange={e => setFormDuration(parseInt(e.target.value))} style={{ width: "100%", background: light ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.2)", border: `1px solid ${light ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.1)"}`, borderRadius: 6, padding: "5px 8px", fontSize: 10, color: tx, fontFamily: "'JetBrains Mono'", outline: "none", marginTop: 3 }}>
                                <option value={15}>15m</option>
                                <option value={30}>30m</option>
                                <option value={60}>1h</option>
                                <option value={90}>1.5h</option>
                                <option value={120}>2h</option>
                                <option value={180}>3h</option>
                                <option value={240}>4h</option>
                            </select>
                        </div>
                    </div>
                    <div style={{ marginBottom: 10 }}>
                        <label style={{ fontSize: 8, color: txm, fontFamily: "'JetBrains Mono'", textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 4 }}>Color</label>
                        <div style={{ display: "flex", gap: 6 }}>
                            {evColors.map(c => (
                                <button key={c} onClick={() => setFormColor(c)} style={{ width: 22, height: 22, borderRadius: "50%", background: c, border: formColor === c ? `2px solid ${light ? "#2d3436" : "#fff"}` : "2px solid transparent", cursor: "pointer", transform: formColor === c ? "scale(1.1)" : "scale(1)", transition: "all 0.2s" }} />
                            ))}
                        </div>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                        {selectedEvent && <button onClick={() => { onDeleteEvent(selectedEvent.id); setShowForm(false); }} style={{ padding: "6px 12px", borderRadius: 6, fontSize: 10, cursor: "pointer", fontFamily: "'JetBrains Mono'", background: "rgba(231, 76, 60, 0.15)", border: "1px solid rgba(231, 76, 60, 0.3)", color: "#e74c3c" }}>Delete</button>}
                        <button onClick={submitEvent} style={{ flex: 1, padding: "6px 12px", borderRadius: 6, fontSize: 10, cursor: "pointer", fontFamily: "'JetBrains Mono'", background: `${accent}25`, border: `1px solid ${accent}50`, color: accent, fontWeight: 600 }}>{selectedEvent ? "Save Changes" : "Add Event"}</button>
                    </div>
                </div>
            )}

            {view === "week" && (
                <div style={{ display: "flex", gap: 4 }}>
                    {week.map((d, i) => {
                        const isTodayDate = isToday(d);
                        const dayEvents = evFor(d);
                        const isPastDate = isPast(d);
                        return (
                            <div key={i} onClick={() => openAddForm(toLocalDateStr(d))} style={{ flex: 1, textAlign: "center", padding: "6px 3px", borderRadius: 8, background: isTodayDate ? `${accent}15` : (light ? "rgba(0,0,0,0.02)" : "rgba(255,255,255,0.03)"), border: isTodayDate ? `1px solid ${accent}40` : `1px solid ${light ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.05)"}`, cursor: "pointer", transition: "all 0.2s", opacity: isPastDate ? 0.6 : 1 }}>
                                <div style={{ fontSize: 8, color: txm, fontFamily: "'JetBrains Mono'", textTransform: "uppercase" }}>{dN[d.getDay()]}</div>
                                <div style={{ fontSize: 16, fontWeight: isTodayDate ? 700 : 500, color: isTodayDate ? accent : tx, margin: "2px 0 6px" }}>{d.getDate()}</div>
                                <div style={{ display: "flex", flexDirection: "column", gap: 2, minHeight: 20 }}>
                                    {dayEvents.slice(0, 3).map((ev, j) => (
                                        <div key={j} onClick={(e) => { e.stopPropagation(); openEditForm(ev); }} style={{ padding: "2px 4px", borderRadius: 3, background: `${ev.color || accent}25`, border: `1px solid ${ev.color || accent}40`, fontSize: 7, color: tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "pointer", transition: "all 0.2s" }} title={`${ev.title} (${ev.time}${ev.duration ? `, ${formatDuration(ev.duration)}` : ""})`}>
                                            {ev.time} {ev.title}
                                        </div>
                                    ))}
                                    {dayEvents.length > 3 && <div style={{ fontSize: 7, color: txm, fontFamily: "'JetBrains Mono'" }}>+{dayEvents.length - 3} more</div>}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {view === "month" && (
                <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                        <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))} style={{ background: "none", border: "none", color: txm, cursor: "pointer", fontSize: 14, padding: "2px 8px", borderRadius: 4, transition: "all 0.2s" }}>‹</button>
                        <span style={{ fontSize: 12, fontWeight: 600, color: tx, fontFamily: "'DM Sans'" }}>{mN[currentMonth.getMonth()]} {currentMonth.getFullYear()}</span>
                        <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))} style={{ background: "none", border: "none", color: txm, cursor: "pointer", fontSize: 14, padding: "2px 8px", borderRadius: 4, transition: "all 0.2s" }}>›</button>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 4 }}>
                        {dN.map(d => <div key={d} style={{ textAlign: "center", fontSize: 8, color: txm, fontFamily: "'JetBrains Mono'", padding: "4px 0" }}>{d}</div>)}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
                        {getMonthDays().map((d, i) => {
                            if (!d) return <div key={i} style={{ aspectRatio: 1 }} />;
                            const isTodayDate = isToday(d);
                            const dayEvents = evFor(d);
                            const isPastDate = isPast(d);
                            return (
                                <div key={i} onClick={() => openAddForm(toLocalDateStr(d))} style={{ aspectRatio: 1, padding: 3, borderRadius: 6, background: isTodayDate ? `${accent}20` : (light ? "rgba(0,0,0,0.02)" : "rgba(255,255,255,0.03)"), border: isTodayDate ? `1px solid ${accent}50` : "1px solid transparent", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", transition: "all 0.2s", opacity: isPastDate ? 0.5 : 1 }}>
                                    <span style={{ fontSize: 10, fontWeight: isTodayDate ? 700 : 400, color: isTodayDate ? accent : tx, marginBottom: 2 }}>{d.getDate()}</span>
                                    <div style={{ display: "flex", gap: 1, flexWrap: "wrap", justifyContent: "center" }}>
                                        {dayEvents.slice(0, 3).map((ev, j) => (
                                            <div key={j} onClick={(e) => { e.stopPropagation(); openEditForm(ev); }} style={{ width: 5, height: 5, borderRadius: "50%", background: ev.color || accent, cursor: "pointer" }} title={ev.title} />
                                        ))}
                                        {dayEvents.length > 3 && <span style={{ fontSize: 6, color: txm }}>+</span>}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {view === "list" && (
                <div style={{ maxHeight: 200, overflowY: "auto" }}>
                    {events.length === 0 && <div style={{ textAlign: "center", padding: "20px 0", color: txm, fontStyle: "italic", fontSize: 12 }}>No events scheduled</div>}
                    {Object.entries(groupEventsByDate()).map(([date, dayEvents]) => {
                        const [y, mo, day] = date.split("-").map(Number);
                        const d = new Date(y, mo - 1, day);
                        const isTodayDate = isToday(d);
                        const isPastDate = d < new Date(new Date().setHours(0, 0, 0, 0));
                        return (
                            <div key={date} style={{ marginBottom: 10 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 0", borderBottom: `1px solid ${light ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.06)"}`, marginBottom: 6 }}>
                                    <span style={{ fontSize: 11, fontWeight: 600, color: isTodayDate ? accent : tx, fontFamily: "'DM Sans'" }}>{isTodayDate ? "Today" : dNF[d.getDay()]}</span>
                                    <span style={{ fontSize: 9, color: txm, fontFamily: "'JetBrains Mono'" }}>{date}</span>
                                    {isPastDate && !isTodayDate && <span style={{ fontSize: 7, color: txm, textTransform: "uppercase", letterSpacing: 0.5 }}>Past</span>}
                                </div>
                                {dayEvents.map(ev => {
                                    const em = guessEmoji(ev.title);
                                    return (
                                        <div key={ev.id} onClick={() => openEditForm(ev)} className="anim-item" style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", marginBottom: 4, borderRadius: 6, background: light ? "rgba(0,0,0,0.02)" : "rgba(255,255,255,0.03)", border: `1px solid ${light ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.04)"}`, cursor: "pointer", transition: "all 0.2s", opacity: isPastDate && !isTodayDate ? 0.6 : 1 }}>
                                            <div style={{ width: 3, height: 28, borderRadius: 2, background: ev.color || accent, flexShrink: 0 }} />
                                            <div style={{ width: 40, textAlign: "center", fontSize: 10, color: txm, fontFamily: "'JetBrains Mono'" }}>{ev.time}</div>
                                            {em && <span style={{ fontSize: 12 }}>{em}</span>}
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: 11, fontWeight: 500, color: tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.title}</div>
                                                {ev.duration && <div style={{ fontSize: 8, color: txm, fontFamily: "'JetBrains Mono'" }}>{formatDuration(ev.duration)}</div>}
                                            </div>
                                            <button onClick={(e) => { e.stopPropagation(); onDeleteEvent(ev.id); }} style={{ background: "none", border: "none", color: txm, cursor: "pointer", fontSize: 14, lineHeight: 1, flexShrink: 0, padding: "2px 6px", borderRadius: 4, transition: "all 0.2s" }}>×</button>
                                        </div>
                                    );
                                })}
                            </div>
                        );
                    })}
                </div>
            )}
        </Panel>
    );
}
