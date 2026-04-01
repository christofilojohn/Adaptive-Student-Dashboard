import { useEffect, useRef, useState } from "react";
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
            `https://api.open-meteo.com/v1/forecast?latitude=${selected.latitude}&longitude=${selected.longitude}&current=temperature_2m,apparent_temperature,weathercode,wind_speed_10m,relative_humidity_2m&wind_speed_unit=kmh`,
            { signal: ctrl.signal },
        ).then(r => { if (!r.ok) throw new Error(`Weather API error: ${r.status}`); return r.json(); }).then(wx => {
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

    return (
        <Panel x={645} y={590} width={210} title="Weather" icon="🌤️" onClose={onClose} ambient={ambient} light={light} accent={accent}>
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                <div style={{ position: "relative" }} data-nodrag>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                        {editing ? (
                            <input
                                ref={inputRef}
                                value={query}
                                onChange={e => setQuery(e.target.value)}
                                onBlur={() => setTimeout(() => { setSuggestions([]); setEditing(false); }, 150)}
                                onKeyDown={e => {
                                    if (e.key === "Escape") { setQuery(weather?.name ?? query); setSuggestions([]); setEditing(false); }
                                    if (e.key === "Enter" && suggestions.length) pickSuggestion(suggestions[0]);
                                }}
                                autoFocus
                                style={{ fontFamily: "'JetBrains Mono'", fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: accent, background: "transparent", border: "none", borderBottom: `1px solid ${accent}55`, outline: "none", width: "100%", paddingBottom: 2 }}
                            />
                        ) : (
                            <button onClick={() => { setEditing(true); setTimeout(() => inputRef.current?.select(), 10); }} style={{ fontFamily: "'JetBrains Mono'", fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: accent, background: "none", border: "none", cursor: "text", padding: 0, textAlign: "left" }}>
                                {weather?.name ?? query}
                            </button>
                        )}
                        {weather && <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 8, color: txm, letterSpacing: 1, flexShrink: 0 }}>{weather.country_code?.toUpperCase()}</span>}
                    </div>
                    {suggestions.length > 0 && (
                        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 999, marginTop: 4, background: panelBg, border: `1px solid ${borderCol}`, borderRadius: 8, overflow: "hidden", boxShadow: "0 8px 24px rgba(0,0,0,0.25)" }}>
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

                {fetching && <div style={{ fontSize: 11, color: txm, fontFamily: "'JetBrains Mono'" }}>Fetching…</div>}
                {err && <div style={{ fontSize: 11, color: "#e17055" }}>{err}</div>}

                {weather && !fetching && <>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <span style={{ fontSize: 34, lineHeight: 1 }}>{icon}</span>
                        <div>
                            <div style={{ fontSize: 28, fontWeight: 700, color: tx, lineHeight: 1, fontFamily: "'JetBrains Mono'" }}>{Math.round(weather.temperature_2m)}°</div>
                            <div style={{ fontSize: 9.5, color: txm, marginTop: 3 }}>Feels like {Math.round(weather.apparent_temperature)}°</div>
                        </div>
                    </div>
                    <div style={{ fontSize: 11, color: tx }}>{desc}</div>
                    <div style={{ display: "flex", gap: 12 }}>
                        <span style={{ fontSize: 9, fontFamily: "'JetBrains Mono'", color: txm }}>💧 {weather.relative_humidity_2m}%</span>
                        <span style={{ fontSize: 9, fontFamily: "'JetBrains Mono'", color: txm }}>💨 {Math.round(weather.wind_speed_10m)} km/h</span>
                    </div>
                </>}

                <div style={{ fontSize: 7.5, color: txm, fontFamily: "'JetBrains Mono'", letterSpacing: 0.5, opacity: 0.7 }}>
                    Tap city to search · Open-Meteo
                </div>
            </div>
        </Panel>
    );
}
