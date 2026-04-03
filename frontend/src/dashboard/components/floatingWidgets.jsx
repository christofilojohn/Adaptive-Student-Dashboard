import { useEffect, useRef, useState } from "react";
import { POSTIT_CHAR_LIMIT } from "../constants";
import { useDraggable } from "../drag";
import { guessEmoji } from "../utils";
import { EditableText } from "./shared";

const FLOATING_WIDGET_TOP = 210;

export function PostIt({ id, content, color, initialX, initialY, onRemove, onEdit }) {
    const { pos, onMouseDown, dragRef } = useDraggable(initialX, initialY);
    const rot = useRef((-3 + Math.random() * 6).toFixed(1));
    const em = guessEmoji(content);
    return (
        <div ref={dragRef} className="panel-shell" onMouseDown={onMouseDown} style={{ position: "absolute", left: pos.x, top: pos.y, width: 175, minHeight: 95, background: color || "#fef68a", borderRadius: 3, padding: "24px 12px 12px", cursor: "grab", transform: `rotate(${rot.current}deg)`, zIndex: 12, boxShadow: "2px 4px 18px rgba(0,0,0,0.22), inset 0 -2px 4px rgba(0,0,0,0.05)", userSelect: "none", animation: `noteIn_${id} 0.35s cubic-bezier(0.34,1.56,0.64,1)` }}>
            <style>{`@keyframes noteIn_${id}{from{opacity:0;transform:rotate(${rot.current}deg) scale(0.7)}to{opacity:1;transform:rotate(${rot.current}deg) scale(1)}}`}</style>
            <button onClick={e => { e.stopPropagation(); onRemove(id); }} style={{ position: "absolute", top: 3, right: 6, background: "none", border: "none", color: "rgba(0,0,0,0.2)", cursor: "pointer", fontSize: 15, lineHeight: 1 }}>×</button>
            {em && <span style={{ position: "absolute", top: 4, left: 8, fontSize: 13 }}>{em}</span>}
            <EditableText value={content} onChange={v => onEdit(id, v)} maxLen={POSTIT_CHAR_LIMIT} multiline style={{ fontFamily: "'Caveat', cursive", fontSize: 16, color: "#111111", lineHeight: 1.4 }} />
        </div>
    );
}

export function TimerWidget({ id, minutes, label, onRemove, light }) {
    const [left, setLeft] = useState(minutes * 60);
    const [run, setRun] = useState(true);
    const { pos, onMouseDown, dragRef } = useDraggable(420 + Math.random() * 150, FLOATING_WIDGET_TOP + Math.random() * 70);
    useEffect(() => { if (!run || left <= 0) return; const t = setInterval(() => setLeft(s => Math.max(0, s - 1)), 1000); return () => clearInterval(t); }, [run, left]);
    const done = left <= 0;
    const pct = 1 - left / (minutes * 60);
    const c = light ? { bg: "rgba(255,255,255,0.65)", bd: "rgba(0,0,0,0.08)", tx: "#2d3436", txm: "rgba(45,52,54,0.4)" } : { bg: "rgba(255,255,255,0.04)", bd: "rgba(255,255,255,0.08)", tx: "#fff", txm: "rgba(255,255,255,0.4)" };
    return <div ref={dragRef} onMouseDown={onMouseDown} style={{ position: "absolute", left: pos.x, top: pos.y, minWidth: 150, background: done ? "rgba(231,76,60,0.12)" : c.bg, backdropFilter: "blur(16px)", border: `1px solid ${done ? "rgba(231,76,60,0.35)" : c.bd}`, borderRadius: 14, padding: "12px 16px", cursor: "grab", zIndex: 12, boxShadow: "0 6px 24px rgba(0,0,0,0.18)", userSelect: "none", animation: "panelIn 0.3s ease-out" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: 2, color: c.txm, fontFamily: "'JetBrains Mono'" }}>⏱ {label}</span>
            <button onClick={e => { e.stopPropagation(); onRemove(id); }} style={{ background: "none", border: "none", color: "rgba(128,128,128,0.4)", cursor: "pointer", fontSize: 13, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ fontSize: 30, fontWeight: 700, fontFamily: "'JetBrains Mono'", color: done ? "#e74c3c" : c.tx, textAlign: "center", opacity: (!run && !done) ? 0.6 : 1 }}>
            {done ? "DONE!" : `${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}`}
        </div>
        <div style={{ height: 2, background: "rgba(128,128,128,0.12)", borderRadius: 2, marginTop: 6, overflow: "hidden" }}>
            <div style={{ width: `${pct * 100}%`, height: "100%", background: done ? "#e74c3c" : "linear-gradient(90deg,#00b894,#00cec9)", transition: "width 1s linear" }} />
        </div>
        {!done && <button onClick={e => { e.stopPropagation(); setRun(r => !r); }} style={{ marginTop: 6, background: "rgba(128,128,128,0.08)", border: "1px solid rgba(128,128,128,0.12)", borderRadius: 7, color: c.tx, padding: "3px 10px", cursor: "pointer", fontSize: 10, width: "100%", fontFamily: "'JetBrains Mono'" }}>{run ? "Pause" : "Resume"}</button>}
    </div>;
}

export function ClockWidget({ id, onRemove, light }) {
    const [now, setNow] = useState(new Date());
    const { pos, onMouseDown, dragRef } = useDraggable(450 + Math.random() * 100, FLOATING_WIDGET_TOP + 70 + Math.random() * 70);
    useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
    const c = light ? { bg: "rgba(255,255,255,0.65)", bd: "rgba(0,0,0,0.08)", tx: "#2d3436", txm: "rgba(45,52,54,0.3)" } : { bg: "rgba(255,255,255,0.04)", bd: "rgba(255,255,255,0.08)", tx: "#fff", txm: "rgba(255,255,255,0.3)" };
    return <div ref={dragRef} onMouseDown={onMouseDown} style={{ position: "absolute", left: pos.x, top: pos.y, background: c.bg, backdropFilter: "blur(20px)", border: `1px solid ${c.bd}`, borderRadius: 18, padding: "16px 24px", cursor: "grab", userSelect: "none", zIndex: 12, boxShadow: "0 6px 24px rgba(0,0,0,0.15)" }}>
        <button onClick={e => { e.stopPropagation(); onRemove(id); }} style={{ position: "absolute", top: 5, right: 9, background: "none", border: "none", color: "rgba(128,128,128,0.3)", cursor: "pointer", fontSize: 13, lineHeight: 1 }}>×</button>
        <div style={{ fontFamily: "'JetBrains Mono'", fontSize: 34, fontWeight: 200, color: c.tx, letterSpacing: 3 }}>{now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}</div>
        <div style={{ fontFamily: "'DM Sans'", fontSize: 10, color: c.txm, textAlign: "center", marginTop: 2 }}>{now.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" })}</div>
    </div>;
}

export function QuoteWidget({ id, onRemove, light }) {
    const qs = [{ t: "The only way to do great work is to love what you do.", a: "Jobs" }, { t: "What stands in the way becomes the way.", a: "Aurelius" }, { t: "Simplicity is the ultimate sophistication.", a: "Da Vinci" }, { t: "Everything you can imagine is real.", a: "Picasso" }];
    const q = useRef(qs[Math.floor(Math.random() * qs.length)]);
    const { pos, onMouseDown, dragRef } = useDraggable(400 + Math.random() * 200, FLOATING_WIDGET_TOP + 150 + Math.random() * 70);
    const c = light ? { bg: "rgba(255,255,255,0.65)", bd: "rgba(0,0,0,0.06)", tx: "rgba(45,52,54,0.8)", txm: "rgba(45,52,54,0.3)" } : { bg: "rgba(255,255,255,0.03)", bd: "rgba(255,255,255,0.06)", tx: "rgba(255,255,255,0.8)", txm: "rgba(255,255,255,0.3)" };
    return <div ref={dragRef} onMouseDown={onMouseDown} style={{ position: "absolute", left: pos.x, top: pos.y, maxWidth: 250, background: c.bg, backdropFilter: "blur(20px)", border: `1px solid ${c.bd}`, borderRadius: 14, padding: "18px 20px", cursor: "grab", userSelect: "none", zIndex: 12, boxShadow: "0 6px 24px rgba(0,0,0,0.15)" }}>
        <button onClick={e => { e.stopPropagation(); onRemove(id); }} style={{ position: "absolute", top: 5, right: 9, background: "none", border: "none", color: "rgba(128,128,128,0.25)", cursor: "pointer", fontSize: 13, lineHeight: 1 }}>×</button>
        <div style={{ fontFamily: "'Caveat', cursive", fontSize: 17, color: c.tx, lineHeight: 1.5, fontStyle: "italic" }}>"{q.current.t}"</div>
        <div style={{ fontFamily: "'DM Sans'", fontSize: 10, color: c.txm, marginTop: 5, textAlign: "right" }}>— {q.current.a}</div>
    </div>;
}
