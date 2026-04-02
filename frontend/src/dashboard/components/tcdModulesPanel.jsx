import { useState } from "react";
import { MODULE_COLORS, TCD_SEMESTERS, TCD_SEMESTER_COLORS } from "../constants";
import { Panel } from "./shared";

async function searchTCDCourse(courseName) {
    const res = await fetch("/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: courseName }),
    });
    if (!res.ok) throw new Error(`Search server returned ${res.status} — is it running?`);
    return res.json();
}

async function searchTCDDirect(url) {
    const res = await fetch("/search/tcd-direct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
    });
    if (!res.ok) throw new Error(`Search server returned ${res.status}`);
    return res.json();
}

export function TCDModulesPanel({ modules, tcdDegree, onSetDegree, onAddModule, onRemoveModule, accent, light, onClose, ambient }) {
    const [searching, setSearching] = useState(false);
    const [searchStep, setSearchStep] = useState("");
    const [searchQuery, setSearchQuery] = useState(tcdDegree?.name || "");
    const [urlResults, setUrlResults] = useState(null);
    const [moduleResults, setModuleResults] = useState(null);
    const [directUrl, setDirectUrl] = useState("");
    const [showDirectMode, setShowDirectMode] = useState(false);
    const [warnAcked, setWarnAcked] = useState(() => sessionStorage.getItem("tcd_search_acked") === "1");
    const [showWarn, setShowWarn] = useState(false);
    const [pendingAction, setPendingAction] = useState(null);
    const [addForm, setAddForm] = useState(false);
    const [formCode, setFormCode] = useState("");
    const [formName, setFormName] = useState("");
    const [formCredits, setFormCredits] = useState("5");
    const [formSemester, setFormSemester] = useState("michaelmas");
    const [formType, setFormType] = useState("lecture");

    const txm = light ? "rgba(45,52,54,0.5)" : "rgba(255,255,255,0.45)";
    const tx = light ? "#2d3436" : "#fff";
    const bd = light ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.08)";
    const totalCredits = modules.reduce((s, m) => s + (m.credits || 5), 0);
    const semGroups = {};
    modules.forEach(m => {
        const semester = m.semester || "michaelmas";
        if (!semGroups[semester]) semGroups[semester] = [];
        semGroups[semester].push(m);
    });

    const runSearch = async () => {
        if (!searchQuery.trim()) return;
        setShowWarn(false);
        setSearching(true);
        setSearchStep("Searching portal…");
        setModuleResults(null);
        try {
            const data = await searchTCDCourse(searchQuery);
            setUrlResults({ urls: data.urls || [], query: searchQuery });
            onSetDegree({ name: searchQuery, college: "Trinity College Dublin" });
        } catch (err) {
            setUrlResults({ urls: [], query: searchQuery, error: err.message });
        }
        setSearching(false);
        setSearchStep("");
    };

    const runFetchUrl = async (url) => {
        setSearching(true);
        setSearchStep("Fetching page…");
        setUrlResults(null);
        try {
            const data = await searchTCDDirect(url);
            setModuleResults({ parsed: data.modules || [], url });
        } catch (err) {
            setModuleResults({ parsed: [], url, error: err.message });
        }
        setSearching(false);
        setSearchStep("");
    };

    const runDirect = async () => {
        if (!directUrl.trim()) return;
        setShowWarn(false);
        setSearching(true);
        setSearchStep("Fetching page…");
        try {
            const data = await searchTCDDirect(directUrl.trim());
            setModuleResults({ parsed: data.modules || [], url: directUrl.trim() });
        } catch (err) {
            setModuleResults({ parsed: [], url: directUrl.trim(), error: err.message });
        }
        setSearching(false);
        setSearchStep("");
    };

    const handleSearchClick = () => {
        if (!searchQuery.trim()) return;
        if (warnAcked) {
            runSearch();
            return;
        }
        setPendingAction("search");
        setShowWarn(true);
    };

    const handleDirectClick = () => {
        if (!directUrl.trim()) return;
        if (warnAcked) {
            runDirect();
            return;
        }
        setPendingAction("direct");
        setShowWarn(true);
    };

    const confirmSearch = () => {
        sessionStorage.setItem("tcd_search_acked", "1");
        setWarnAcked(true);
        const action = pendingAction;
        setPendingAction(null);
        if (action === "direct") runDirect();
        else runSearch();
    };

    const addManual = () => {
        if (!formCode.trim() || !formName.trim()) return;
        onAddModule({
            id: `m${Date.now()}`,
            code: formCode.trim().toUpperCase(),
            name: formName.trim(),
            credits: parseInt(formCredits) || 5,
            semester: formSemester,
            moduleType: formType,
            color: MODULE_COLORS[modules.length % MODULE_COLORS.length],
        });
        setFormCode("");
        setFormName("");
        setFormCredits("5");
        setAddForm(false);
    };

    const importAll = () => {
        (moduleResults?.parsed || []).forEach((m, i) => onAddModule({
            ...m,
            id: `m${Date.now()}${i}`,
            color: MODULE_COLORS[(modules.length + i) % MODULE_COLORS.length],
        }));
        setModuleResults(null);
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
    const inStyle = (extra) => ({
        background: "transparent",
        border: `1px solid ${bd}`,
        borderRadius: 4,
        padding: "2px 6px",
        fontSize: 10,
        color: tx,
        outline: "none",
        fontFamily: "'DM Sans'",
        ...extra,
    });

    return (
        <Panel x={650} y={320} width={380} title={`TCD Modules · ${modules.length} registered · ${totalCredits} ECTS`} icon="🎓" light={light} onClose={onClose} ambient={ambient} accent={accent}>
            <div style={{ marginBottom: 8, padding: "8px 10px", borderRadius: 8, background: light ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.04)", border: `1px solid ${bd}` }}>
                {tcdDegree && <div style={{ fontSize: 8, fontFamily: "'JetBrains Mono'", color: accent, marginBottom: 5, letterSpacing: 1 }}>🎓 {tcdDegree.college} · {tcdDegree.name}</div>}
                {!showDirectMode ? (
                    <>
                        <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSearchClick()} placeholder="Search SCSS programmes…" data-nodrag style={{ flex: 1, background: "transparent", border: "none", outline: "none", fontSize: 11, color: tx, fontFamily: "'DM Sans'", minWidth: 120 }} />
                            <button onClick={handleSearchClick} disabled={searching} style={{ padding: "3px 9px", borderRadius: 5, fontSize: 9, cursor: "pointer", fontFamily: "'JetBrains Mono'", background: `${accent}22`, border: `1px solid ${accent}44`, color: accent, opacity: searching ? 0.6 : 1 }}>
                                {searching ? searchStep || "…" : "Search"}
                            </button>
                        </div>
                        <div style={{ marginTop: 4, fontSize: 8, color: txm, fontFamily: "'JetBrains Mono'" }}>
                            Searches the SCSS teaching portal · <button onClick={() => setShowDirectMode(true)} style={{ fontSize: 8, background: "none", border: "none", cursor: "pointer", color: accent, fontFamily: "'JetBrains Mono'", textDecoration: "underline", padding: 0 }}>paste URL for any other course →</button>
                        </div>
                    </>
                ) : (
                    <>
                        <div style={{ fontSize: 8, color: txm, fontFamily: "'JetBrains Mono'", marginBottom: 4 }}>Paste a module listing page URL from any TCD department</div>
                        <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                            <input value={directUrl} onChange={e => setDirectUrl(e.target.value)} onKeyDown={e => e.key === "Enter" && handleDirectClick()} placeholder="https://…" data-nodrag style={{ flex: 1, background: "transparent", border: `1px solid ${bd}`, borderRadius: 4, outline: "none", fontSize: 9, color: tx, fontFamily: "'DM Sans'", padding: "3px 6px" }} />
                            <button onClick={handleDirectClick} disabled={searching} style={{ padding: "3px 9px", borderRadius: 5, fontSize: 9, cursor: "pointer", fontFamily: "'JetBrains Mono'", background: `${accent}22`, border: `1px solid ${accent}44`, color: accent, opacity: searching ? 0.6 : 1 }}>
                                {searching ? searchStep || "…" : "Fetch"}
                            </button>
                        </div>
                        <div style={{ marginTop: 4, fontSize: 8, color: txm, fontFamily: "'JetBrains Mono'" }}>
                            e.g. <span style={{ cursor: "pointer", color: accent, textDecoration: "underline" }} onClick={() => setDirectUrl("https://teaching.scss.tcd.ie/general-information/scss-modules/")}>scss-modules</span>
                            {" · "}<button onClick={() => setShowDirectMode(false)} style={{ fontSize: 8, background: "none", border: "none", cursor: "pointer", color: txm, fontFamily: "'JetBrains Mono'", textDecoration: "underline", padding: 0 }}>back to search</button>
                        </div>
                    </>
                )}
            </div>

            {showWarn && (
                <div className="anim-panel" style={{ marginBottom: 10, padding: "10px 12px", borderRadius: 8, background: light ? "rgba(253,203,110,0.15)" : "rgba(253,203,110,0.1)", border: "1px solid rgba(253,203,110,0.4)" }} data-nodrag>
                    <div style={{ fontSize: 10, fontWeight: 600, color: "#e67e22", marginBottom: 4, fontFamily: "'JetBrains Mono'" }}>⚠ External search</div>
                    <div style={{ fontSize: 10, color: tx, lineHeight: 1.5, marginBottom: 8 }}>
                        {pendingAction === "direct"
                            ? <>Fetching <strong>{directUrl.slice(0, 50)}{directUrl.length > 50 ? "…" : ""}</strong> will contact that server directly.</>
                            : <>Searching will fetch the <strong>SCSS teaching portal sitemap</strong> from teaching.scss.tcd.ie.</>
                        }
                        {" "}This is the <em>only</em> part of this dashboard that uses an internet connection — everything else runs on-device.
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={confirmSearch} style={{ flex: 1, padding: "4px", borderRadius: 5, fontSize: 9, cursor: "pointer", background: `${accent}22`, border: `1px solid ${accent}55`, color: accent, fontFamily: "'JetBrains Mono'" }}>Proceed</button>
                        <button onClick={() => { setShowWarn(false); setPendingAction(null); }} style={{ padding: "4px 10px", borderRadius: 5, fontSize: 9, cursor: "pointer", background: "transparent", border: `1px solid ${bd}`, color: txm, fontFamily: "'JetBrains Mono'" }}>Cancel</button>
                    </div>
                </div>
            )}

            {urlResults && (
                <div className="anim-panel" style={{ marginBottom: 10, padding: 8, borderRadius: 8, background: light ? "rgba(0,0,0,0.02)" : "rgba(255,255,255,0.03)", border: `1px solid ${accent}33` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <span style={{ fontSize: 9, fontFamily: "'JetBrains Mono'", color: accent }}>
                            {urlResults.urls.length > 0 ? `${urlResults.urls.length} pages found — pick the right one` : "No TCD pages found"}
                        </span>
                        <button onClick={() => setUrlResults(null)} style={{ padding: "2px 6px", borderRadius: 4, fontSize: 8, cursor: "pointer", background: "transparent", border: `1px solid ${bd}`, color: txm, fontFamily: "'JetBrains Mono'" }}>×</button>
                    </div>
                    {urlResults.error && <div style={{ fontSize: 9, color: "#e74c3c", marginBottom: 4 }}>{urlResults.error}</div>}
                    {urlResults.urls.length === 0 && !urlResults.error && (
                        <div style={{ fontSize: 10, color: txm, lineHeight: 1.5 }}>
                            No match in the SCSS portal. For other TCD courses (Philosophy, Law, Business, etc.) find your department&apos;s module listing page and use <span style={{ color: accent, cursor: "pointer", textDecoration: "underline" }} onClick={() => { setUrlResults(null); setShowDirectMode(true); }}>paste URL</span>.
                        </div>
                    )}
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {urlResults.urls.map((r, i) => (
                            <div key={i} style={{ padding: "5px 7px", borderRadius: 6, background: light ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.04)", border: `1px solid ${bd}` }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 6 }}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 10, color: tx, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title}</div>
                                        <div style={{ fontSize: 8, color: txm, fontFamily: "'JetBrains Mono'", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 1 }}>{r.url.replace(/^https?:\/\//, "")}</div>
                                    </div>
                                    <button onClick={() => runFetchUrl(r.url)} style={{ flexShrink: 0, padding: "3px 8px", borderRadius: 4, fontSize: 9, cursor: "pointer", background: `${accent}22`, border: `1px solid ${accent}44`, color: accent, fontFamily: "'JetBrains Mono'" }}>
                                        Load →
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {moduleResults?.error && <div style={{ marginBottom: 8, padding: "6px 8px", borderRadius: 6, background: "rgba(231,76,60,0.08)", border: "1px solid rgba(231,76,60,0.2)", fontSize: 10, color: "#e74c3c" }}>Failed: {moduleResults.error}</div>}
            {moduleResults && !moduleResults.error && (() => {
                const coreMods = moduleResults.parsed.filter(m => m.category === "core");
                const electiveMods = moduleResults.parsed.filter(m => m.category === "elective");
                const uncategorised = moduleResults.parsed.filter(m => !m.category);
                const addGroup = (group, offset = 0) => group.forEach((m, i) => onAddModule({
                    ...m,
                    id: `m${Date.now()}${offset + i}`,
                    color: MODULE_COLORS[(modules.length + offset + i) % MODULE_COLORS.length],
                }));
                const ModRow = ({ m, globalIdx }) => (
                    <div style={{ display: "flex", gap: 5, alignItems: "center", padding: "2px 0" }}>
                        <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 9, fontWeight: 600, color: TCD_SEMESTER_COLORS[m.semester] || accent, minWidth: 60 }}>{m.code}</span>
                        <span style={{ flex: 1, fontSize: 10, color: tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</span>
                        <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 8, color: txm }}>{m.credits}cr</span>
                        <button onClick={() => onAddModule({ ...m, id: `m${Date.now()}${globalIdx}`, color: MODULE_COLORS[(modules.length + globalIdx) % MODULE_COLORS.length] })} style={{ padding: "1px 6px", borderRadius: 3, fontSize: 9, cursor: "pointer", background: `${accent}22`, border: `1px solid ${accent}44`, color: accent, lineHeight: 1 }}>+</button>
                    </div>
                );
                const SectionHeader = ({ label, count, onAddAll }) => (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6, marginBottom: 2 }}>
                        <span style={{ fontSize: 8, fontFamily: "'JetBrains Mono'", letterSpacing: 1, textTransform: "uppercase", color: label === "Core" ? accent : txm }}>{label} · {count}</span>
                        {onAddAll && <button onClick={onAddAll} style={{ padding: "1px 7px", borderRadius: 3, fontSize: 8, cursor: "pointer", background: `${accent}22`, border: `1px solid ${accent}44`, color: accent, fontFamily: "'JetBrains Mono'" }}>Add all {label.toLowerCase()}</button>}
                    </div>
                );
                return (
                    <div className="anim-panel" style={{ marginBottom: 10, padding: 8, borderRadius: 8, background: light ? "rgba(0,0,0,0.02)" : "rgba(255,255,255,0.03)", border: `1px solid ${accent}33` }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                            <span style={{ fontSize: 9, fontFamily: "'JetBrains Mono'", color: accent }}>
                                {moduleResults.parsed.length > 0 ? `${moduleResults.parsed.length} modules` : "No modules found"}
                                {coreMods.length > 0 && <span style={{ color: txm }}> · {coreMods.length} core</span>}
                            </span>
                            <div style={{ display: "flex", gap: 4 }}>
                                {moduleResults.parsed.length > 0 && <button onClick={importAll} style={{ padding: "2px 7px", borderRadius: 4, fontSize: 8, cursor: "pointer", background: `${accent}22`, border: `1px solid ${accent}44`, color: accent, fontFamily: "'JetBrains Mono'" }}>All</button>}
                                <button onClick={() => setModuleResults(null)} style={{ padding: "2px 6px", borderRadius: 4, fontSize: 8, cursor: "pointer", background: "transparent", border: `1px solid ${bd}`, color: txm, fontFamily: "'JetBrains Mono'" }}>×</button>
                            </div>
                        </div>
                        <div style={{ fontSize: 8, color: txm, fontFamily: "'JetBrains Mono'", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            ✓ {moduleResults.url.replace(/^https?:\/\//, "")}
                        </div>
                        {moduleResults.parsed.length === 0 && <div style={{ fontSize: 10, color: txm, fontStyle: "italic" }}>No module codes found on this page.</div>}
                        <div style={{ maxHeight: 180, overflowY: "auto" }}>
                            {coreMods.length > 0 && <><SectionHeader label="Core" count={coreMods.length} onAddAll={() => { addGroup(coreMods); setModuleResults(null); }} />{coreMods.map((m, i) => <ModRow key={m.code} m={m} globalIdx={i} />)}</>}
                            {electiveMods.length > 0 && <><SectionHeader label="Electives" count={electiveMods.length} onAddAll={() => { addGroup(electiveMods, coreMods.length); setModuleResults(null); }} />{electiveMods.map((m, i) => <ModRow key={m.code} m={m} globalIdx={coreMods.length + i} />)}</>}
                            {uncategorised.length > 0 && <>{(coreMods.length + electiveMods.length > 0) && <SectionHeader label="Other" count={uncategorised.length} onAddAll={null} />}{uncategorised.map((m, i) => <ModRow key={m.code} m={m} globalIdx={coreMods.length + electiveMods.length + i} />)}</>}
                        </div>
                    </div>
                );
            })()}

            {modules.length === 0 && !urlResults && !moduleResults && !showWarn && <div style={{ fontSize: 11, color: txm, fontStyle: "italic", textAlign: "center", padding: "10px 0" }}>Search your TCD course above or add modules manually</div>}
            {["michaelmas", "hilary", "trinity", "yearlong"].filter(semester => semGroups[semester]?.length > 0).map(semester => (
                <div key={semester} style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 8, fontFamily: "'JetBrains Mono'", letterSpacing: 1.5, textTransform: "uppercase", color: TCD_SEMESTER_COLORS[semester], marginBottom: 4 }}>{TCD_SEMESTERS[semester]}</div>
                    {semGroups[semester].map(m => (
                        <div key={m.id} className="anim-item" style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 0", borderBottom: `1px solid ${bd}` }}>
                            <div style={{ width: 3, height: 30, borderRadius: 2, background: m.color || TCD_SEMESTER_COLORS[semester], flexShrink: 0 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                                    <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 9, fontWeight: 600, color: m.color || accent, flexShrink: 0 }}>{m.code}</span>
                                    <span style={{ fontSize: 10, color: tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</span>
                                </div>
                                <div style={{ display: "flex", gap: 5, marginTop: 1 }}>
                                    <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 8, color: txm }}>{m.credits} ECTS</span>
                                    <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 8, color: txm }}>· {m.moduleType || "lecture"}</span>
                                    {m.deadline && <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 8, color: "#e74c3c" }}>⚡ {m.deadline}</span>}
                                </div>
                            </div>
                            <button onClick={() => onRemoveModule(m.id)} style={{ fontSize: 12, background: "none", border: "none", cursor: "pointer", color: txm, opacity: 0.4, padding: "0 2px", flexShrink: 0 }}>×</button>
                        </div>
                    ))}
                </div>
            ))}

            {addForm ? (
                <div className="anim-panel" style={{ padding: 8, borderRadius: 8, background: light ? "rgba(0,0,0,0.02)" : "rgba(255,255,255,0.03)", border: `1px solid ${bd}` }} data-nodrag>
                    <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
                        <input value={formCode} onChange={e => setFormCode(e.target.value)} placeholder="Code (CS3012)" data-nodrag style={inStyle({ width: 90, fontFamily: "'JetBrains Mono'", fontSize: 9 })} />
                        <input value={formName} onChange={e => setFormName(e.target.value)} placeholder="Module name" data-nodrag style={inStyle({ flex: 1 })} />
                    </div>
                    <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
                        <input value={formCredits} onChange={e => setFormCredits(e.target.value)} placeholder="ECTS" data-nodrag style={inStyle({ width: 50, fontFamily: "'JetBrains Mono'", fontSize: 9 })} />
                        <select value={formSemester} onChange={e => setFormSemester(e.target.value)} data-nodrag style={{ ...selStyle, flex: 1 }}>
                            <option value="michaelmas">Michaelmas</option>
                            <option value="hilary">Hilary</option>
                            <option value="trinity">Trinity Term</option>
                            <option value="yearlong">Year-Long</option>
                        </select>
                        <select value={formType} onChange={e => setFormType(e.target.value)} data-nodrag style={{ ...selStyle, flex: 1 }}>
                            <option value="lecture">Lecture</option>
                            <option value="tutorial">Tutorial</option>
                            <option value="lab">Lab</option>
                            <option value="seminar">Seminar</option>
                        </select>
                    </div>
                    <div style={{ display: "flex", gap: 4 }}>
                        <button onClick={addManual} style={{ flex: 1, padding: "3px", borderRadius: 4, fontSize: 9, cursor: "pointer", background: `${accent}22`, border: `1px solid ${accent}44`, color: accent, fontFamily: "'JetBrains Mono'" }}>Add module</button>
                        <button onClick={() => setAddForm(false)} style={{ padding: "3px 9px", borderRadius: 4, fontSize: 9, cursor: "pointer", background: "transparent", border: `1px solid ${bd}`, color: txm, fontFamily: "'JetBrains Mono'" }}>Cancel</button>
                    </div>
                </div>
            ) : (
                <button onClick={() => setAddForm(true)} style={{ marginTop: 4, width: "100%", padding: "5px", borderRadius: 6, fontSize: 9, cursor: "pointer", background: "transparent", border: `1px dashed ${bd}`, color: txm, fontFamily: "'JetBrains Mono'" }}>+ Add module manually</button>
            )}
        </Panel>
    );
}
