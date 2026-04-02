#!/usr/bin/env node
/**
 * Adaptive Dashboard backend.
 *
 * Endpoints
 *   GET    /health
 *   GET    /api/health
 *   GET    /api/profiles
 *   GET    /api/session
 *   POST   /api/login      { name }
 *   POST   /api/logout
 *   PUT    /api/profile    { state }
 *   DELETE /api/profile
 *   POST   /search         { q }
 *   POST   /tcd-direct     { url }
 */

import { createServer } from "http";
import { randomUUID } from "crypto";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { mkdir, readFile, unlink, writeFile } from "fs/promises";

const PORT = parseInt(process.env.SEARCH_PORT || "8082", 10);
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const HDR = { "User-Agent": UA, Accept: "text/html,application/xhtml+xml", "Accept-Language": "en-IE,en;q=0.9" };
const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_STORE = { profiles: {}, sessions: {} };

let storeFilePromise;
let storeCache;
let writeQueue = Promise.resolve();

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

async function resolveStoreFile() {
    if (storeFilePromise) return storeFilePromise;

    storeFilePromise = (async () => {
        const requestedDir = process.env.DASHBOARD_DATA_DIR || join(MODULE_DIR, "data");
        const fallbackDir = join(tmpdir(), "adaptive-dashboard-data");

        for (const dir of [requestedDir, fallbackDir]) {
            try {
                await mkdir(dir, { recursive: true });
                const probe = join(dir, ".write-probe");
                await writeFile(probe, "ok");
                await unlink(probe);
                return join(dir, "store.json");
            } catch {
                // Try the next candidate.
            }
        }

        throw new Error("Could not initialize a writable data directory");
    })();

    return storeFilePromise;
}

async function persistStore() {
    const file = await resolveStoreFile();
    await writeFile(file, JSON.stringify(storeCache, null, 2));
}

async function loadStore() {
    if (storeCache) return storeCache;

    const file = await resolveStoreFile();
    try {
        const raw = await readFile(file, "utf8");
        const parsed = JSON.parse(raw);
        storeCache = {
            profiles: parsed?.profiles && typeof parsed.profiles === "object" ? parsed.profiles : {},
            sessions: parsed?.sessions && typeof parsed.sessions === "object" ? parsed.sessions : {},
        };
    } catch (error) {
        if (error.code !== "ENOENT") {
            console.warn("[backend] Failed to read store, starting fresh:", error.message);
        }
        storeCache = clone(DEFAULT_STORE);
        await persistStore();
    }

    return storeCache;
}

async function withStore(mutator) {
    const run = writeQueue.then(async () => {
        const store = await loadStore();
        const result = await mutator(store);
        await persistStore();
        return result;
    });
    writeQueue = run.catch(() => {});
    return run;
}

function normalizeProfileId(name) {
    return String(name || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 48);
}

function sortProfiles(profiles) {
    return profiles.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
}

function getBearerToken(req) {
    const auth = req.headers.authorization || "";
    const match = /^Bearer\s+(.+)$/i.exec(auth);
    return match?.[1] || null;
}

function getSessionRecord(store, req) {
    const token = getBearerToken(req);
    if (!token) return null;

    const session = store.sessions[token];
    if (!session) return null;

    const profile = store.profiles[session.profileId];
    if (!profile) return null;

    return {
        token,
        session,
        profile,
    };
}

function buildSessionPayload(token, profile, session) {
    return {
        session: {
            token,
            profileId: profile.id,
            createdAt: session?.createdAt || profile.createdAt,
        },
        profile: {
            id: profile.id,
            displayName: profile.displayName,
            createdAt: profile.createdAt,
            updatedAt: profile.updatedAt,
        },
        state: clone(profile.state || {}),
    };
}

async function listProfiles() {
    const store = await loadStore();
    const profiles = Object.values(store.profiles).map((profile) => ({
        id: profile.id,
        displayName: profile.displayName,
        createdAt: profile.createdAt,
        updatedAt: profile.updatedAt,
    }));
    return { profiles: sortProfiles(profiles) };
}

async function login(name) {
    const displayName = String(name || "").trim().slice(0, 48);
    const profileId = normalizeProfileId(displayName);
    if (!profileId) throw new Error("Profile name required");

    return withStore((store) => {
        const now = new Date().toISOString();
        const existing = store.profiles[profileId];
        const profile = existing || {
            id: profileId,
            displayName,
            createdAt: now,
            updatedAt: now,
            state: {},
        };

        profile.displayName = displayName;
        profile.updatedAt = now;
        store.profiles[profileId] = profile;

        const token = randomUUID();
        store.sessions[token] = {
            profileId,
            createdAt: now,
            updatedAt: now,
        };

        return buildSessionPayload(token, profile, store.sessions[token]);
    });
}

async function restoreSession(req) {
    return withStore((store) => {
        const record = getSessionRecord(store, req);
        if (!record) return null;

        record.session.updatedAt = new Date().toISOString();
        return buildSessionPayload(record.token, record.profile, record.session);
    });
}

async function logout(req) {
    return withStore((store) => {
        const token = getBearerToken(req);
        if (token) delete store.sessions[token];
        return { ok: true };
    });
}

async function saveProfile(req, state) {
    return withStore((store) => {
        const record = getSessionRecord(store, req);
        if (!record) throw new Error("Unauthorized");

        const now = new Date().toISOString();
        record.profile.state = clone(state || {});
        record.profile.updatedAt = now;
        record.session.updatedAt = now;

        return buildSessionPayload(record.token, record.profile, record.session);
    });
}

async function deleteProfile(req) {
    return withStore((store) => {
        const record = getSessionRecord(store, req);
        if (!record) throw new Error("Unauthorized");

        delete store.profiles[record.profile.id];
        for (const [token, session] of Object.entries(store.sessions)) {
            if (session.profileId === record.profile.id) delete store.sessions[token];
        }

        return { ok: true };
    });
}

// ── HTML helpers ──────────────────────────────────────────────────────────────

const stripTags = (s) =>
    s.replace(/<[^>]+>/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#x27;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&nbsp;/g, " ")
        .replace(/&#8211;/g, "–")
        .replace(/&#8212;/g, "—")
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
        .replace(/\s+/g, " ")
        .trim();

const removeElements = (html, ...tags) =>
    tags.reduce((result, tag) => result.replace(new RegExp(`<${tag}[\\s\\S]*?<\\/${tag}>`, "gi"), ""), html);

// ── Module extraction ─────────────────────────────────────────────────────────

const CODE_RE = /\b([A-Z]{2,4}\d{4,5}|[A-Z]{2}\d[A-Z]{2}\d)\b/g;
const ECTS_RE = /(\d+)\s*(?:ECTS|credit)/i;
const SEM_MAP = [
    ["yearlong", /full\s*year|year[- ]long|both\s*semesters?|semester[s]?\s*1\s*(?:&|and)\s*2/i],
    ["michaelmas", /michaelmas|semester\s*1\b|mt\b/i],
    ["hilary", /hilary|semester\s*2\b|ht\b/i],
    ["trinity", /trinity\s*term|semester\s*3\b|tt\b/i],
];

function detectSemester(text) {
    for (const [semester, pattern] of SEM_MAP) {
        if (pattern.test(text)) return semester;
    }
    return "michaelmas";
}

function parseTCDHtml(html) {
    const clean = removeElements(html, "script", "style");

    const sections = [];
    for (const match of clean.matchAll(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi)) {
        const text = stripTags(match[1]).toLowerCase();
        if (/core|required|compulsory/.test(text)) sections.push({ pos: match.index, cat: "core" });
        else if (/elective|optional|choice/.test(text)) sections.push({ pos: match.index, cat: "elective" });
    }
    sections.sort((a, b) => a.pos - b.pos);

    const getCategoryAt = (pos) => {
        let category = null;
        for (const section of sections) {
            if (section.pos <= pos) category = section.cat;
            else break;
        }
        return category;
    };

    const seen = new Set();
    const modules = [];

    CODE_RE.lastIndex = 0;
    let match;
    while ((match = CODE_RE.exec(clean)) !== null) {
        const code = match[1];
        if (seen.has(code)) continue;
        seen.add(code);

        const pos = match.index;
        const nearText = stripTags(clean.slice(pos, pos + 500));
        const prevText = stripTags(clean.slice(Math.max(0, pos - 300), pos));
        const afterCode = nearText.slice(code.length).replace(/^\s*[-–]\s*/, "").trim();
        const name = afterCode.split(/[\n\r,;(]/)[0].trim().slice(0, 70);
        if (name.length < 3) continue;

        const credits = nearText.slice(0, 300).match(ECTS_RE)?.[1];
        const semesterAfter = detectSemester(nearText.slice(0, 400));
        const semesterBefore = detectSemester(prevText);
        const semester = semesterAfter !== "michaelmas" ? semesterAfter : semesterBefore;

        modules.push({
            code,
            name,
            credits: credits ? parseInt(credits, 10) : 5,
            semester,
            moduleType: "lecture",
            category: getCategoryAt(pos),
        });
    }

    return modules;
}

// ── Page fetch ────────────────────────────────────────────────────────────────

async function fetchPage(url, ms = 10000) {
    const res = await fetch(url, { headers: HDR, redirect: "follow", signal: AbortSignal.timeout(ms) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
}

// ── Known TCD teaching portals ────────────────────────────────────────────────

const TCD_PORTALS = [
    { sitemap: "https://teaching.scss.tcd.ie/wp-sitemap-posts-page-1.xml", base: "https://teaching.scss.tcd.ie" },
];

const SKIP_RE = /lab-opening|scheduled-lab|loginpress|noticeboard|quick-links|appeals|contact-info|lab-oreilly|lab-trinity|scheduled-lecture|scss-lab|student-area|technical-and-software|elective-module-sample|study-abroad|ugpc|student-support|noticeboard/i;

function slugToTitle(url, base) {
    const path = url.replace(base, "").replace(/^\/|\/$/g, "");
    return path
        .split("/")
        .pop()
        .replace(/-/g, " ")
        .replace(/\b\w/g, (char) => char.toUpperCase())
        .replace(/\bM Sc\b/gi, "M.Sc.")
        .replace(/\bPg\b/g, "PG");
}

async function tcdSearch(courseName) {
    const words = courseName.toLowerCase().split(/\s+/).filter((word) => word.length > 1);

    const results = await Promise.allSettled(
        TCD_PORTALS.map(async ({ sitemap, base }) => {
            const xml = await fetchPage(sitemap, 8000);
            const urls = [...xml.matchAll(/<loc>(https[^<]+)<\/loc>/g)]
                .map((match) => match[1])
                .filter((url) => url !== `${base}/` && !SKIP_RE.test(url));

            return urls
                .map((url) => {
                    const slug = url.replace(base, "").replace(/\//g, " ").replace(/-/g, " ").toLowerCase();
                    const score = words.filter((word) => slug.includes(word)).length;
                    return { url, title: slugToTitle(url, base), snippet: slug.trim(), score };
                })
                .filter((result) => result.score > 0);
        }),
    );

    const matches = results.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
    matches.sort((a, b) => b.score - a.score);

    const seen = new Set();
    const urls = [];
    for (const result of matches) {
        if (seen.has(result.url)) continue;
        seen.add(result.url);
        urls.push({ url: result.url, title: result.title, snippet: result.snippet });
    }

    return { urls: urls.slice(0, 8) };
}

const ALLOWED_HOST = /^(?:[\w-]+\.)*tcd\.ie$/i;

async function directFetch(url) {
    let parsed;
    try {
        parsed = new URL(url);
    } catch {
        throw new Error("invalid url");
    }

    if (parsed.protocol !== "https:" || !ALLOWED_HOST.test(parsed.hostname)) {
        throw new Error("URL must be an https://tcd.ie domain");
    }

    const html = await fetchPage(url);
    return { modules: parseTCDHtml(html), url };
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

function readBody(req) {
    return new Promise((resolve, reject) => {
        let raw = "";
        req.on("data", (chunk) => {
            raw += chunk;
            if (raw.length > 10 * 1024 * 1024) req.destroy();
        });
        req.on("end", () => {
            try {
                resolve(JSON.parse(raw || "{}"));
            } catch {
                reject(new Error("bad json"));
            }
        });
        req.on("error", reject);
    });
}

function send(res, status, data) {
    res.writeHead(status, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(data));
}

function sendText(res, status, text) {
    res.writeHead(status, {
        "Content-Type": "text/plain",
        "Cache-Control": "no-store",
    });
    res.end(text);
}

function unauthorized(res) {
    send(res, 401, { error: "Unauthorized" });
}

const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    const path = url.pathname;

    if (req.method === "GET" && (path === "/health" || path === "/search/health" || path === "/api/health")) {
        sendText(res, 200, "ok");
        return;
    }

    try {
        if (req.method === "GET" && path === "/api/profiles") {
            send(res, 200, await listProfiles());
            return;
        }

        if (req.method === "GET" && path === "/api/session") {
            const payload = await restoreSession(req);
            if (!payload) {
                unauthorized(res);
                return;
            }
            send(res, 200, payload);
            return;
        }

        if (req.method === "POST" && path === "/api/login") {
            const body = await readBody(req);
            send(res, 200, await login(body.name));
            return;
        }

        if (req.method === "POST" && path === "/api/logout") {
            send(res, 200, await logout(req));
            return;
        }

        if (req.method === "PUT" && path === "/api/profile") {
            const body = await readBody(req);
            if (!body.state || typeof body.state !== "object") {
                send(res, 400, { error: "state object required" });
                return;
            }
            send(res, 200, await saveProfile(req, body.state));
            return;
        }

        if (req.method === "DELETE" && path === "/api/profile") {
            send(res, 200, await deleteProfile(req));
            return;
        }

        if (req.method === "POST" && path === "/search") {
            const body = await readBody(req);
            if (!body.q) {
                send(res, 400, { error: "q required" });
                return;
            }
            send(res, 200, await tcdSearch(body.q));
            return;
        }

        if (req.method === "POST" && (path === "/tcd-direct" || path === "/search/tcd-direct")) {
            const body = await readBody(req);
            if (!body.url) {
                send(res, 400, { error: "url required" });
                return;
            }
            send(res, 200, await directFetch(body.url));
            return;
        }

        res.writeHead(404);
        res.end();
    } catch (error) {
        if (error.message === "Unauthorized") {
            unauthorized(res);
            return;
        }
        if (error.message === "Profile name required") {
            send(res, 400, { error: error.message });
            return;
        }
        if (error.message === "bad json") {
            send(res, 400, { error: "Invalid JSON body" });
            return;
        }

        console.error("[backend] error:", error.message);
        send(res, 502, { error: error.message, modules: [], organic: [] });
    }
});

server.listen(PORT, "127.0.0.1", async () => {
    const file = await resolveStoreFile();
    console.log(`[backend] Listening on 127.0.0.1:${PORT}`);
    console.log(`[backend] Persisting profiles in ${file}`);
});
