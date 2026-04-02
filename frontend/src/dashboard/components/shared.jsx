import { useEffect, useMemo, useRef, useState } from "react";
import { useDraggable } from "../drag";
import { getLennyByMood } from "../utils";

export function EditableText({ value, onChange, maxLen, style, multiline }) {
    const [ed, setEd] = useState(false);
    const [dr, setDr] = useState(value);
    const ref = useRef(null);
    useEffect(() => { setDr(value); }, [value]);
    useEffect(() => {
        if (ed && ref.current) {
            ref.current.focus();
            ref.current.select();
        }
    }, [ed]);
    const commit = () => {
        setEd(false);
        const t = dr.trim();
        if (t && t !== value) onChange(t);
        else setDr(value);
    };
    if (!ed) return <div onClick={e => { e.stopPropagation(); setEd(true); }} style={{ cursor: "text", ...style }} data-nodrag>{value}</div>;
    const T = multiline ? "textarea" : "input";
    return <div data-nodrag style={{ position: "relative" }}>
        <T
            ref={ref}
            value={dr}
            onChange={e => { if (e.target.value.length <= maxLen) setDr(e.target.value); }}
            onBlur={commit}
            onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    commit();
                }
                if (e.key === "Escape") {
                    setDr(value);
                    setEd(false);
                }
            }}
            style={{ ...style, border: "none", outline: "none", background: "rgba(255,255,255,0.1)", borderRadius: 4, padding: "2px 4px", width: "100%", resize: "none", fontFamily: "inherit", fontSize: "inherit", color: "inherit", lineHeight: "inherit", ...(multiline ? { minHeight: 55 } : {}) }}
            maxLength={maxLen}
        />
        <span style={{ position: "absolute", bottom: multiline ? 3 : -13, right: 2, fontSize: 8, fontFamily: "'JetBrains Mono'", color: dr.length >= maxLen * 0.9 ? "#e74c3c" : "rgba(128,128,128,0.4)" }}>{dr.length}/{maxLen}</span>
    </div>;
}

export function QuickAdd({ placeholder, onSubmit, light, accent }) {
    const [val, setVal] = useState("");
    const submit = () => {
        const t = val.trim();
        if (t) {
            onSubmit(t);
            setVal("");
        }
    };
    return (
        <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
            <input
                value={val}
                onChange={e => setVal(e.target.value)}
                onKeyDown={e => e.key === "Enter" && submit()}
                placeholder={placeholder}
                data-nodrag
                style={{
                    flex: 1,
                    background: light ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.07)",
                    border: `1px solid ${light ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.10)"}`,
                    borderRadius: 6,
                    padding: "4px 8px",
                    fontSize: 10.5,
                    color: light ? "#2d3436" : "rgba(255,255,255,0.9)",
                    outline: "none",
                    fontFamily: "'DM Sans'",
                }}
            />
            <button onClick={submit} style={{ background: `${accent}22`, border: `1px solid ${accent}44`, borderRadius: 6, padding: "3px 8px", fontSize: 12, cursor: "pointer", color: accent, lineHeight: 1 }}>+</button>
        </div>
    );
}

export function Particles({ type, color }) {
    const count = type === "rain" ? 35 : type === "stars" ? 25 : type === "sparkle" ? 15 : 12;
    const particles = useMemo(() => Array.from({ length: count }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: type === "rain" ? 1 : (1 + Math.random() * 2.5),
        length: type === "rain" ? (8 + Math.random() * 14) : null,
        dur: type === "rain" ? (0.8 + Math.random() * 0.6) : (4 + Math.random() * 8),
        delay: Math.random() * 5,
        opacity: 0.15 + Math.random() * 0.35,
    })), [type, count]);
    const anim = type === "fireflies" ? "ff" : type === "stars" ? "st" : type === "rain" ? "rn" : "sp";
    return (
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 3, overflow: "hidden" }}>
            {particles.map(p => (
                <div key={p.id} style={{
                    position: "absolute",
                    left: `${p.x}%`,
                    top: type === "rain" ? "-2%" : `${p.y}%`,
                    width: type === "rain" ? 1 : p.size,
                    height: type === "rain" ? p.length : p.size,
                    borderRadius: type === "rain" ? 0 : "50%",
                    background: type === "rain" ? `linear-gradient(180deg, transparent, ${color || "#fff"}55)` : (color || "#fff"),
                    opacity: p.opacity,
                    animation: `${anim} ${p.dur}s ${p.delay}s infinite ${type === "sparkle" ? "" : "ease-in-out"}`,
                    ...(type === "sparkle" ? { animationIterationCount: 1, animationFillMode: "forwards", animationDelay: `${p.delay}s` } : {}),
                }} />
            ))}
        </div>
    );
}

export function LennyBuddy({ mood, glowColor, light, loading, companion }) {
    const [transitioning, setTransitioning] = useState(false);
    const [blink, setBlink] = useState(false);
    const entry = getLennyByMood(mood);

    useEffect(() => {
        const doBlink = () => {
            setBlink(true);
            setTimeout(() => setBlink(false), 150);
        };
        const interval = setInterval(doBlink, 2500 + Math.random() * 3500);
        return () => clearInterval(interval);
    }, []);

    const currentFaceRef = useRef(entry.face);
    useEffect(() => {
        if (entry.face !== currentFaceRef.current) {
            setTransitioning(true);
            currentFaceRef.current = entry.face;
            const t = setTimeout(() => setTransitioning(false), 400);
            return () => clearTimeout(t);
        }
    }, [entry.face]);

    const txc = light ? "rgba(45,52,54,0.7)" : "rgba(255,255,255,0.7)";
    const subtleColor = (glowColor && glowColor !== "transparent") ? glowColor : txc;
    const auraColor = companion?.theme?.aura || subtleColor;
    const accentColor = companion?.theme?.accent || subtleColor;
    const hazeColor = companion?.theme?.haze || `${subtleColor}18`;
    const shellBg = light ? "rgba(255,255,255,0.78)" : "rgba(11,16,28,0.68)";
    const shellBorder = light ? "rgba(45,52,54,0.1)" : "rgba(255,255,255,0.1)";
    const messageBg = light ? "rgba(255,255,255,0.74)" : "rgba(7,10,20,0.82)";
    const copyColor = light ? "rgba(45,52,54,0.8)" : "rgba(255,255,255,0.82)";
    const metaColor = light ? "rgba(45,52,54,0.5)" : "rgba(255,255,255,0.45)";
    const auraBlur = 36 + (companion?.sparkle || 0.4) * 40;
    const bob = loading ? "lennyThink 0.65s ease-in-out infinite" : "lennyFloat 5s ease-in-out infinite";
    const ringScale = 1 + (companion?.presence || 0.5) * 0.08;

    return (
        <div style={{ position: "absolute", bottom: 18, left: 18, zIndex: 60, display: "flex", alignItems: "flex-end", gap: 14, userSelect: "none", pointerEvents: "none", width: "min(500px, 44vw)", maxWidth: "calc(100vw - 36px)" }}>
            <div style={{ position: "relative", minWidth: 158, padding: "18px 18px 16px", borderRadius: 28, background: `linear-gradient(145deg, ${shellBg}, ${hazeColor})`, border: `1px solid ${shellBorder}`, boxShadow: `0 20px 48px rgba(0,0,0,0.24), 0 0 0 1px ${accentColor}14, inset 0 1px 0 rgba(255,255,255,0.08)`, overflow: "hidden", backdropFilter: "blur(20px)" }}>
                <div style={{ position: "absolute", inset: "auto auto -22px -12px", width: 116, height: 116, borderRadius: "50%", background: auraColor, opacity: 0.14 + (companion?.sparkle || 0.3) * 0.22, filter: `blur(${auraBlur}px)` }} />
                <div style={{ position: "absolute", inset: 12, borderRadius: 20, border: `1px solid ${accentColor}22`, opacity: 0.9 }} />
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12, position: "relative" }}>
                    <div>
                        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: 1.8, textTransform: "uppercase", color: metaColor }}>
                            {companion?.title || "Study companion"}
                        </div>
                        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8, letterSpacing: 1.2, color: accentColor, marginTop: 4 }}>
                            {loading ? "processing" : companion?.status || entry.label}
                        </div>
                    </div>
                    <div style={{ width: 42, height: 42, borderRadius: "50%", border: `1px solid ${accentColor}33`, background: `${accentColor}16`, display: "grid", placeItems: "center", transform: `scale(${ringScale})`, transition: "transform 0.5s ease" }}>
                        <div style={{ width: 22, height: 22, borderRadius: "50%", background: auraColor, opacity: 0.85, filter: "blur(0.5px)", boxShadow: `0 0 18px ${auraColor}66` }} />
                    </div>
                </div>
                <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 116, animation: bob, filter: `drop-shadow(0 0 ${mood !== "neutral" ? "20px" : "8px"} ${auraColor}55)`, transition: "filter 2s ease" }}>
                    <div style={{ position: "absolute", width: 104, height: 104, borderRadius: "50%", border: `1px solid ${accentColor}22`, transform: `scale(${0.94 + (companion?.comfort || 0.4) * 0.12})` }} />
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "clamp(2.2rem, 4vw, 3.3rem)", lineHeight: 1, color: auraColor, opacity: blink ? 0.22 : 0.96, transition: "opacity 0.1s, color 2s", whiteSpace: "nowrap", transform: transitioning ? "scale(0.86)" : "scale(1)", transitionProperty: "transform, opacity, color", transitionDuration: "0.3s, 0.1s, 2s" }}>
                        {entry.face}
                    </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12, position: "relative" }}>
                    {(companion?.metrics || [entry.label]).map((metric) => (
                        <span key={metric} style={{ padding: "5px 8px", borderRadius: 999, background: light ? "rgba(45,52,54,0.05)" : "rgba(255,255,255,0.06)", border: `1px solid ${accentColor}18`, color: metaColor, fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, letterSpacing: 0.5 }}>
                            {metric}
                        </span>
                    ))}
                </div>
            </div>
            <div style={{ maxWidth: 270, padding: "14px 16px", borderRadius: 22, background: messageBg, border: `1px solid ${shellBorder}`, boxShadow: "0 16px 40px rgba(0,0,0,0.18)", backdropFilter: "blur(20px)", marginBottom: 8 }}>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, letterSpacing: 1.6, textTransform: "uppercase", color: accentColor, marginBottom: 8 }}>
                    {loading ? "thinking..." : entry.label}
                </div>
                <div style={{ fontSize: 13, lineHeight: 1.5, color: copyColor }}>
                    {companion?.message || "I am here to keep the dashboard feeling calm and responsive."}
                </div>
            </div>
        </div>
    );
}

export function Panel({ children, x, y, width, title, icon, onClose, ambient, light, accent = "#8b5cf6" }) {
    const { pos, onMouseDown, dragRef } = useDraggable(x, y);
    const txm = light ? "rgba(45,52,54,0.5)" : "rgba(255,255,255,0.45)";
    const bw = ambient.borderWarmth || 0;
    const borderCol = light ? `rgba(${Math.round(80 + bw * 80)},${Math.round(60 + bw * 40)},50,0.1)` : `rgba(${Math.round(255 * (0.3 + bw * 0.3))},${Math.round(255 * (0.25 + bw * 0.15))},${Math.round(255 * 0.2)},${0.06 + bw * 0.06})`;
    const panelBg = light ? `rgba(255,255,255,${0.65 + (ambient.panelOpacity || 0.03) * 3})` : `rgba(255,255,255,${ambient.panelOpacity || 0.03})`;
    const safeGlow = (ambient.glowColor && ambient.glowColor !== "transparent") ? ambient.glowColor : "#ffffff";
    const reflectCol = ambient.glowIntensity > 0 ? `${safeGlow}08` : "transparent";
    const accentGlow = `${accent}14`;
    const accentBorder = `${accent}30`;
    const headerTint = light ? `${accent}10` : `${accent}12`;

    return (
        <div ref={dragRef} className="panel-shell" onMouseDown={onMouseDown} style={{ position: "absolute", left: pos.x, top: pos.y, width, background: `linear-gradient(135deg, ${panelBg}, ${reflectCol})`, backdropFilter: `blur(${ambient.panelBlur || 20}px)`, border: `1px solid ${borderCol}`, borderTop: `1px solid ${accentBorder}`, borderRadius: 14, cursor: "grab", zIndex: 15, boxShadow: `0 8px 32px rgba(0,0,0,0.18), 0 0 0 1px ${accentGlow}, inset 0 1px 0 ${light ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.04)"}`, userSelect: "none", overflow: "hidden", transition: "border-color 1.5s, background 1.5s, box-shadow 1.5s, transform 0.2s ease", animation: "panelIn 0.3s ease-out" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 13px 7px", borderBottom: `1px solid ${borderCol}`, background: `linear-gradient(90deg, ${headerTint}, transparent)` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 12 }}>{icon}</span>
                    <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 9, textTransform: "uppercase", letterSpacing: 2, color: txm }}>{title}</span>
                </div>
                {onClose && <button onClick={e => { e.stopPropagation(); onClose(); }} style={{ background: "none", border: "none", color: txm, cursor: "pointer", fontSize: 13, lineHeight: 1, padding: 0 }}>×</button>}
            </div>
            <div style={{ padding: "9px 13px 13px", cursor: "default" }} onMouseDown={e => e.stopPropagation()}>{children}</div>
        </div>
    );
}

export function TypingDots() {
    return <div style={{ display: "flex", gap: 3, padding: "8px 12px", alignSelf: "flex-start" }}>{[0, 1, 2].map(i => <div key={i} style={{ width: 5, height: 5, borderRadius: "50%", background: "rgba(255,255,255,0.3)", animation: `bk 1.2s ${i * .15}s infinite ease-in-out` }} />)}</div>;
}
