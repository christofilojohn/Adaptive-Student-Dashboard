import { useEffect, useMemo, useRef, useState } from "react";
import { Panel } from "./shared";

const WMO_CODES = {
    0: ["☀️", "Clear sky"], 1: ["🌤️", "Mainly clear"], 2: ["⛅", "Partly cloudy"], 3: ["☁️", "Overcast"],
    45: ["🌫️", "Fog"], 48: ["🌫️", "Icy fog"],
    51: ["🌦️", "Light drizzle"], 53: ["🌦️", "Drizzle"], 55: ["🌦️", "Heavy drizzle"],
    61: ["🌧️", "Light rain"], 63: ["🌧️", "Rain"], 65: ["🌧️", "Heavy rain"],
    71: ["🌨️", "Light snow"], 73: ["🌨️", "Snow"], 75: ["❄️", "Heavy snow"], 77: ["❄️", "Snow grains"],
    80: ["🌦️", "Light showers"], 81: ["🌧️", "Showers"], 82: ["🌧️", "Heavy showers"],
    85: ["🌨️", "Snow showers"], 86: ["❄️", "Heavy snow showers"],
    95: ["⛈️", "Thunderstorm"], 96: ["⛈️", "Thunderstorm"], 99: ["⛈️", "Thunderstorm"],
};

function weatherScene(weather) {
    const isDay = weather?.is_day !== 0;
    const code = Number(weather?.weathercode ?? -1);
    const wind = Number(weather?.wind_speed_10m ?? 0);
    const humidity = Number(weather?.relative_humidity_2m ?? 0);
    const temp = Number(weather?.temperature_2m ?? 0);

    if ([95, 96, 99].includes(code)) {
        return {
            name: "storm",
            sky: isDay ? "linear-gradient(180deg, #1f2937 0%, #273449 40%, #111827 100%)" : "linear-gradient(180deg, #050816 0%, #111827 52%, #1f2937 100%)",
            glow: "#93c5fd",
            accent: "#e5eefc",
            line: "rgba(255,255,255,0.22)",
            particles: "storm",
            haze: "rgba(147,197,253,0.18)",
            label: "Storm front",
        };
    }

    if ([71, 73, 75, 77, 85, 86].includes(code)) {
        return {
            name: "snow",
            sky: isDay ? "linear-gradient(180deg, #c7d2fe 0%, #dbeafe 42%, #eff6ff 100%)" : "linear-gradient(180deg, #1e293b 0%, #334155 46%, #475569 100%)",
            glow: isDay ? "#ffffff" : "#dbeafe",
            accent: isDay ? "#1f2937" : "#f8fafc",
            line: isDay ? "rgba(15,23,42,0.18)" : "rgba(255,255,255,0.2)",
            particles: "snow",
            haze: isDay ? "rgba(255,255,255,0.26)" : "rgba(219,234,254,0.16)",
            label: "Snowfall",
        };
    }

    if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) {
        return {
            name: "rain",
            sky: isDay ? "linear-gradient(180deg, #64748b 0%, #475569 38%, #1e293b 100%)" : "linear-gradient(180deg, #0f172a 0%, #1e293b 48%, #334155 100%)",
            glow: "#7dd3fc",
            accent: "#f8fafc",
            line: "rgba(255,255,255,0.22)",
            particles: "rain",
            haze: "rgba(125,211,252,0.16)",
            label: "Rain moving through",
        };
    }

    if ([45, 48].includes(code) || humidity >= 88) {
        return {
            name: "fog",
            sky: isDay ? "linear-gradient(180deg, #cbd5e1 0%, #d8dee9 45%, #e2e8f0 100%)" : "linear-gradient(180deg, #1f2937 0%, #374151 44%, #4b5563 100%)",
            glow: isDay ? "#f8fafc" : "#d1d5db",
            accent: isDay ? "#334155" : "#f8fafc",
            line: isDay ? "rgba(15,23,42,0.16)" : "rgba(255,255,255,0.18)",
            particles: "mist",
            haze: isDay ? "rgba(255,255,255,0.34)" : "rgba(226,232,240,0.12)",
            label: "Low visibility",
        };
    }

    if ([1, 2, 3].includes(code)) {
        return {
            name: "cloud",
            sky: isDay ? "linear-gradient(180deg, #60a5fa 0%, #93c5fd 42%, #e0f2fe 100%)" : "linear-gradient(180deg, #111827 0%, #1e3a8a 40%, #334155 100%)",
            glow: isDay ? "#fef3c7" : "#bfdbfe",
            accent: isDay ? "#0f172a" : "#f8fafc",
            line: isDay ? "rgba(15,23,42,0.15)" : "rgba(255,255,255,0.18)",
            particles: wind >= 25 ? "wind" : "cloud",
            haze: isDay ? "rgba(255,255,255,0.22)" : "rgba(191,219,254,0.12)",
            label: wind >= 25 ? "Clouds and gusts" : "Cloud cover",
        };
    }

    return {
        name: "clear",
        sky: isDay
            ? (temp >= 22 ? "linear-gradient(180deg, #f59e0b 0%, #fbbf24 35%, #fde68a 100%)" : "linear-gradient(180deg, #38bdf8 0%, #60a5fa 44%, #dbeafe 100%)")
            : "linear-gradient(180deg, #020617 0%, #0f172a 48%, #1d4ed8 100%)",
        glow: isDay ? "#fff7cc" : "#c4b5fd",
        accent: isDay ? "#1f2937" : "#f8fafc",
        line: isDay ? "rgba(15,23,42,0.15)" : "rgba(255,255,255,0.18)",
        particles: isDay ? "clear" : "night",
        haze: isDay ? "rgba(255,247,204,0.24)" : "rgba(196,181,253,0.14)",
        label: isDay ? "Clear conditions" : "Clear night",
    };
}

function WeatherMotion({ scene }) {
    const cloudRows = useMemo(
        () => Array.from({ length: 4 }, (_, index) => ({
            id: index,
            top: 12 + index * 14,
            left: -10 - index * 12,
            scale: 0.8 + index * 0.12,
            opacity: 0.14 + index * 0.05,
            duration: 18 + index * 4,
        })),
        [],
    );

    const drops = useMemo(
        () => Array.from({ length: scene.particles === "storm" ? 22 : scene.particles === "rain" ? 16 : scene.particles === "snow" ? 18 : scene.particles === "mist" ? 8 : scene.particles === "wind" ? 10 : 6 }, (_, index) => ({
            id: index,
            left: (index * 11) % 100,
            delay: (index % 7) * 0.28,
            duration: 1.5 + (index % 5) * 0.18,
            size: 2 + (index % 3),
            opacity: 0.18 + (index % 4) * 0.1,
        })),
        [scene.particles],
    );

    return (
        <>
            <style>{`
                @keyframes weatherDrift { 0% { transform: translateX(-8%); } 100% { transform: translateX(12%); } }
                @keyframes weatherRain { 0% { transform: translate3d(0,-18px,0); opacity: 0; } 18% { opacity: .7; } 100% { transform: translate3d(-10px,110px,0); opacity: 0; } }
                @keyframes weatherSnow { 0% { transform: translate3d(0,-10px,0); opacity: 0; } 20% { opacity: .9; } 100% { transform: translate3d(12px,106px,0); opacity: 0; } }
                @keyframes weatherMist { 0%,100% { transform: translateX(-8px); opacity: .16; } 50% { transform: translateX(10px); opacity: .3; } }
                @keyframes weatherPulse { 0%,100% { transform: scale(1); opacity: .55; } 50% { transform: scale(1.08); opacity: .82; } }
                @keyframes weatherFlash { 0%, 88%, 100% { opacity: 0; } 90% { opacity: .95; } 92% { opacity: .25; } 94% { opacity: .85; } }
            `}</style>

            {(scene.particles === "cloud" || scene.particles === "wind") && cloudRows.map((cloud) => (
                <div
                    key={cloud.id}
                    style={{
                        position: "absolute",
                        top: `${cloud.top}%`,
                        left: `${cloud.left}%`,
                        width: 84,
                        height: 22,
                        borderRadius: 999,
                        background: "rgba(255,255,255,0.22)",
                        filter: "blur(6px)",
                        transform: `scale(${cloud.scale})`,
                        opacity: cloud.opacity,
                        animation: `weatherDrift ${cloud.duration}s linear infinite alternate`,
                    }}
                />
            ))}

            {(scene.particles === "rain" || scene.particles === "storm") && drops.map((drop) => (
                <div
                    key={drop.id}
                    style={{
                        position: "absolute",
                        top: -18,
                        left: `${drop.left}%`,
                        width: 1.3,
                        height: 16 + drop.size * 2,
                        borderRadius: 999,
                        background: "linear-gradient(180deg, rgba(255,255,255,0), rgba(255,255,255,0.8))",
                        opacity: drop.opacity,
                        animation: `weatherRain ${drop.duration}s ${drop.delay}s linear infinite`,
                    }}
                />
            ))}

            {scene.particles === "snow" && drops.map((flake) => (
                <div
                    key={flake.id}
                    style={{
                        position: "absolute",
                        top: -10,
                        left: `${flake.left}%`,
                        width: flake.size,
                        height: flake.size,
                        borderRadius: "50%",
                        background: "rgba(255,255,255,0.95)",
                        boxShadow: "0 0 8px rgba(255,255,255,0.35)",
                        opacity: flake.opacity,
                        animation: `weatherSnow ${flake.duration + 1.2}s ${flake.delay}s linear infinite`,
                    }}
                />
            ))}

            {scene.particles === "mist" && [0, 1, 2].map((band) => (
                <div
                    key={band}
                    style={{
                        position: "absolute",
                        left: -18,
                        right: -18,
                        top: `${28 + band * 18}%`,
                        height: 20,
                        borderRadius: 999,
                        background: "rgba(255,255,255,0.22)",
                        filter: "blur(10px)",
                        animation: `weatherMist ${6 + band * 1.8}s ease-in-out infinite`,
                    }}
                />
            ))}

            {(scene.particles === "clear" || scene.particles === "night") && (
                <div
                    style={{
                        position: "absolute",
                        top: 10,
                        right: 14,
                        width: 52,
                        height: 52,
                        borderRadius: "50%",
                        background: scene.particles === "night" ? "rgba(248,250,252,0.76)" : "rgba(255,247,204,0.88)",
                        boxShadow: `0 0 24px ${scene.glow}`,
                        animation: "weatherPulse 4.4s ease-in-out infinite",
                    }}
                />
            )}

            {scene.particles === "storm" && (
                <div
                    style={{
                        position: "absolute",
                        inset: 0,
                        background: "linear-gradient(135deg, rgba(255,255,255,0.9), rgba(255,255,255,0))",
                        opacity: 0,
                        mixBlendMode: "screen",
                        animation: "weatherFlash 7s linear infinite",
                    }}
                />
            )}
        </>
    );
}

export function WeatherWidget({ light, accent, ambient, onClose }) {
    const [query, setQuery] = useState("Dublin");
    const [editing, setEditing] = useState(false);
    const [suggestions, setSuggestions] = useState([]);
    const [selected, setSelected] = useState(null);
    const [weather, setWeather] = useState(null);
    const [fetching, setFetching] = useState(false);
    const [err, setErr] = useState(null);
    const inputRef = useRef(null);
    const tx = light ? "#2d3436" : "#fff";
    const txm = light ? "rgba(45,52,54,0.5)" : "rgba(255,255,255,0.45)";
    const panelBg = light ? "rgba(255,255,255,0.92)" : "rgba(15,15,28,0.92)";
    const borderCol = light ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.08)";

    useEffect(() => {
        if (!editing || !query.trim()) {
            setSuggestions([]);
            return;
        }
        const ctrl = new AbortController();
        const t = setTimeout(async () => {
            try {
                const geo = await fetch(
                    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query.trim())}&count=5&language=en&format=json`,
                    { signal: ctrl.signal },
                ).then(r => r.json());
                setSuggestions(geo.results ?? []);
            } catch {
            }
        }, 350);
        return () => {
            clearTimeout(t);
            ctrl.abort();
        };
    }, [query, editing]);

    useEffect(() => {
        if (!selected) return;
        const ctrl = new AbortController();
        setFetching(true);
        setErr(null);
        fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${selected.latitude}&longitude=${selected.longitude}&current=temperature_2m,apparent_temperature,weathercode,wind_speed_10m,relative_humidity_2m,is_day&wind_speed_unit=kmh`,
            { signal: ctrl.signal },
        ).then(r => {
            if (!r.ok) throw new Error(`Weather API error: ${r.status}`);
            return r.json();
        }).then(wx => {
            setWeather({ ...wx.current, name: selected.name, country_code: selected.country_code });
            setFetching(false);
        }).catch(e => {
            if (e.name !== "AbortError") {
                setErr("Couldn't reach weather service");
                setFetching(false);
            }
        });
        return () => ctrl.abort();
    }, [selected]);

    useEffect(() => {
        setSelected({ latitude: 53.3331, longitude: -6.2489, name: "Dublin", country_code: "IE" });
    }, []);

    function pickSuggestion(s) {
        setSelected(s);
        setQuery(s.name);
        setSuggestions([]);
        setEditing(false);
    }

    const [icon, desc] = weather ? (WMO_CODES[weather.weathercode] ?? ["🌡️", "Unknown"]) : ["🌡️", "—"];
    const scene = useMemo(() => weatherScene(weather), [weather]);
    const toneText = scene.accent;

    return (
        <Panel x={645} y={590} width={248} title="Weather" icon="🌤️" onClose={onClose} ambient={ambient} light={light} accent={accent}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div
                    style={{
                        position: "relative",
                        minHeight: 178,
                        borderRadius: 18,
                        overflow: "hidden",
                        background: scene.sky,
                        border: `1px solid ${scene.line}`,
                        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -18px 40px rgba(0,0,0,0.14), 0 12px 26px rgba(0,0,0,0.18)`,
                    }}
                >
                    <div style={{ position: "absolute", inset: 0, background: `radial-gradient(circle at 20% 18%, ${scene.haze} 0%, transparent 45%)` }} />
                    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0))" }} />
                    <WeatherMotion scene={scene} />

                    <div style={{ position: "relative", zIndex: 2, display: "flex", flexDirection: "column", gap: 10, padding: "14px 14px 12px", color: toneText }}>
                        <div style={{ position: "relative" }} data-nodrag>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                                {editing ? (
                                    <input
                                        ref={inputRef}
                                        value={query}
                                        onChange={e => setQuery(e.target.value)}
                                        onBlur={() => setTimeout(() => { setSuggestions([]); setEditing(false); }, 150)}
                                        onKeyDown={e => {
                                            if (e.key === "Escape") {
                                                setQuery(weather?.name ?? query);
                                                setSuggestions([]);
                                                setEditing(false);
                                            }
                                            if (e.key === "Enter" && suggestions.length) pickSuggestion(suggestions[0]);
                                        }}
                                        autoFocus
                                        style={{ fontFamily: "'JetBrains Mono'", fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: toneText, background: "transparent", border: "none", borderBottom: `1px solid ${scene.line}`, outline: "none", width: "100%", paddingBottom: 2 }}
                                    />
                                ) : (
                                    <button onClick={() => { setEditing(true); setTimeout(() => inputRef.current?.select(), 10); }} style={{ fontFamily: "'JetBrains Mono'", fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: toneText, background: "none", border: "none", cursor: "text", padding: 0, textAlign: "left" }}>
                                        {weather?.name ?? query}
                                    </button>
                                )}
                                {weather && <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 8, color: `${toneText}cc`, letterSpacing: 1, flexShrink: 0 }}>{weather.country_code?.toUpperCase()}</span>}
                            </div>
                            {suggestions.length > 0 && (
                                <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 999, marginTop: 6, background: panelBg, border: `1px solid ${borderCol}`, borderRadius: 10, overflow: "hidden", boxShadow: "0 8px 24px rgba(0,0,0,0.25)" }}>
                                    {suggestions.map(s => (
                                        <button key={s.id} onMouseDown={() => pickSuggestion(s)} style={{ display: "block", width: "100%", textAlign: "left", padding: "7px 10px", background: "none", border: "none", cursor: "pointer", borderBottom: `1px solid ${borderCol}` }} onMouseEnter={e => e.currentTarget.style.background = `${accent}18`} onMouseLeave={e => e.currentTarget.style.background = "none"}>
                                            <div style={{ fontSize: 11, color: tx, fontWeight: 500 }}>{s.name}</div>
                                            <div style={{ fontSize: 9, color: txm, fontFamily: "'JetBrains Mono'", marginTop: 1 }}>
                                                {[s.admin1, s.country].filter(Boolean).join(", ")}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {fetching && <div style={{ fontSize: 11, color: `${toneText}cc`, fontFamily: "'JetBrains Mono'" }}>Fetching live sky…</div>}
                        {err && <div style={{ fontSize: 11, color: "#fee2e2" }}>{err}</div>}

                        {weather && !fetching && (
                            <>
                                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                                    <div>
                                        <div style={{ fontFamily: "'JetBrains Mono'", fontSize: 8, letterSpacing: 1.3, textTransform: "uppercase", opacity: 0.88 }}>{scene.label}</div>
                                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
                                            <span style={{ fontSize: 38, lineHeight: 1, filter: "drop-shadow(0 4px 10px rgba(0,0,0,0.18))" }}>{icon}</span>
                                            <div>
                                                <div style={{ fontSize: 32, fontWeight: 700, lineHeight: 1, fontFamily: "'JetBrains Mono'" }}>{Math.round(weather.temperature_2m)}°</div>
                                                <div style={{ fontSize: 10, marginTop: 3, opacity: 0.84 }}>Feels like {Math.round(weather.apparent_temperature)}°</div>
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ minWidth: 70, padding: "8px 10px", borderRadius: 14, background: "rgba(255,255,255,0.12)", backdropFilter: "blur(10px)", border: `1px solid ${scene.line}` }}>
                                        <div style={{ fontFamily: "'JetBrains Mono'", fontSize: 7.5, letterSpacing: 1.2, textTransform: "uppercase", opacity: 0.8 }}>Condition</div>
                                        <div style={{ marginTop: 4, fontSize: 11, lineHeight: 1.35 }}>{desc}</div>
                                    </div>
                                </div>

                                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 2 }}>
                                    <div style={{ padding: "8px 9px", borderRadius: 12, background: "rgba(255,255,255,0.12)", backdropFilter: "blur(10px)", border: `1px solid ${scene.line}` }}>
                                        <div style={{ fontFamily: "'JetBrains Mono'", fontSize: 7.5, letterSpacing: 1, textTransform: "uppercase", opacity: 0.78 }}>Humidity</div>
                                        <div style={{ marginTop: 5, fontSize: 13, fontWeight: 700 }}>{weather.relative_humidity_2m}%</div>
                                    </div>
                                    <div style={{ padding: "8px 9px", borderRadius: 12, background: "rgba(255,255,255,0.12)", backdropFilter: "blur(10px)", border: `1px solid ${scene.line}` }}>
                                        <div style={{ fontFamily: "'JetBrains Mono'", fontSize: 7.5, letterSpacing: 1, textTransform: "uppercase", opacity: 0.78 }}>Wind</div>
                                        <div style={{ marginTop: 5, fontSize: 13, fontWeight: 700 }}>{Math.round(weather.wind_speed_10m)}</div>
                                        <div style={{ fontSize: 8.5, opacity: 0.74 }}>km/h</div>
                                    </div>
                                    <div style={{ padding: "8px 9px", borderRadius: 12, background: "rgba(255,255,255,0.12)", backdropFilter: "blur(10px)", border: `1px solid ${scene.line}` }}>
                                        <div style={{ fontFamily: "'JetBrains Mono'", fontSize: 7.5, letterSpacing: 1, textTransform: "uppercase", opacity: 0.78 }}>Light</div>
                                        <div style={{ marginTop: 5, fontSize: 13, fontWeight: 700 }}>{weather.is_day ? "Day" : "Night"}</div>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>

                <div style={{ fontSize: 8, color: txm, fontFamily: "'JetBrains Mono'", letterSpacing: 0.5, opacity: 0.76 }}>
                    Live background adapts to current conditions · Open-Meteo
                </div>
            </div>
        </Panel>
    );
}
