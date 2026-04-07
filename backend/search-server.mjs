#!/usr/bin/env node
/**
 * On-device TCD course search server — two-stage scraper.
 *
 * Strategy A  (automatic — used by /search)
 *   1. Query DuckDuckGo HTML for "TCD {course} modules site:tcd.ie"
 *   2. Decode real tcd.ie URLs from DDG redirect hrefs (uddg= param)
 *   3. Fetch those pages server-side (no CORS)
 *   4. Parse module codes/names/credits from HTML tables, lists, headings
 *   5. Also extract from DDG snippets as fallback
 *
 * Strategy B  (user-supplied URL — used by /tcd-direct)
 *   Fetch exactly the URL given and return parsed modules.
 *   Works great for known pages, e.g.:
 *     https://teaching.scss.tcd.ie/general-information/scss-modules/
 *     https://teaching.scss.tcd.ie/integrated-computer-science/ics-year-3/
 *
 * Endpoints
 *   GET  /health
 *   POST /search       { q, maxPages? }   → { modules, organic, sources, strategy }
 *   POST /tcd-direct   { url }            → { modules, url }
 *   POST /gmail-tasks-sync { maxEmails?, gmailQuery? } → { emailsScanned, tasks, ... }
 *   POST /gmail-emails { maxEmails?, gmailQuery?, forceRefresh? } → { emails, queryUsed, fetchedAt, cacheHit }
 *   POST /gmail-email-detail { id, forceRefresh? } → { email, fetchedAt, cacheHit }
 *   POST /gmail-email-to-task { id } → { task, email, model, fetchedAt }
 *   POST /gmail-email-to-expense { id } → { expense, email, model, fetchedAt }
 *   POST /gmail-test-flow { to?, scenario?, waitMs? } → { pass, matchedTask, tasks, ... }
 *   POST /gmail-generate-sample-emails { to?, kinds? } → { sent, sentCount, ... }
 *   POST /weather-geocode { query, count? } → { results }
 *   POST /weather-current { latitude, longitude, name?, country_code? } → { current, source }
 *   POST /chat-completions { messages, model?, temperature?, max_tokens?, response_format? } → { choices, model, usage? }
 *   POST /dashboard-state-load {} → { state, updatedAt }
 *   POST /dashboard-state-save { state } → { ok, updatedAt, bytes }
 */

import { createServer } from 'http';
import { mkdirSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { DatabaseSync } from 'node:sqlite';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

function loadEnvFallback(envPath) {
    let raw = '';
    try {
        raw = readFileSync(envPath, 'utf8');
    } catch {
        return;
    }
    for (const line of raw.split(/\r?\n/)) {
        if (!line || /^\s*#/.test(line)) continue;
        const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
        if (!match) continue;
        const key = match[1];
        if (process.env[key] !== undefined) continue;
        let value = match[2];
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        } else {
            value = value.replace(/\s+#.*$/, '').trim();
        }
        process.env[key] = value;
    }
}

loadEnvFallback(join(SCRIPT_DIR, '..', '.env'));

const PORT = parseInt(process.env.SEARCH_PORT || '8082', 10);
const UA   = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const HDR  = { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml', 'Accept-Language': 'en-IE,en;q=0.9' };
const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';
const GOOGLE_OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const ZHIPU_CHAT_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
const WEATHER_GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const WEATHER_FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const WEATHER_FALLBACK_URL = 'https://wttr.in';

const GMAIL_DEFAULT_QUERY = process.env.GMAIL_QUERY || 'newer_than:7d -category:promotions -category:social';
const GMAIL_DEFAULT_MAX_RESULTS = Math.max(1, Math.min(parseInt(process.env.GMAIL_MAX_RESULTS || '12', 10), 30));
const GMAIL_LIST_CACHE_TTL_MS = Math.max(10 * 1000, Math.min(parseInt(process.env.GMAIL_LIST_CACHE_TTL_MS || `${2 * 60 * 1000}`, 10) || (2 * 60 * 1000), 24 * 60 * 60 * 1000));
const GMAIL_DETAIL_CACHE_TTL_MS = Math.max(10 * 1000, Math.min(parseInt(process.env.GMAIL_DETAIL_CACHE_TTL_MS || `${10 * 60 * 1000}`, 10) || (10 * 60 * 1000), 24 * 60 * 60 * 1000));
const GMAIL_CACHE_MAX_BYTES = Math.max(8 * 1024, Math.min(parseInt(process.env.GMAIL_CACHE_MAX_BYTES || `${768 * 1024}`, 10) || (768 * 1024), 5 * 1024 * 1024));
const ZHIPU_MODEL = process.env.ZHIPU_MODEL || 'glm-4-flash';
const MAX_BODY_BYTES = Math.max(8192, Math.min(parseInt(process.env.SEARCH_MAX_BODY_BYTES || `${1024 * 1024}`, 10) || (1024 * 1024), 5 * 1024 * 1024));
const DASHBOARD_STATE_MAX_BYTES = Math.max(4096, Math.min(parseInt(process.env.DASHBOARD_STATE_MAX_BYTES || `${512 * 1024}`, 10) || (512 * 1024), 5 * 1024 * 1024));
const DASHBOARD_DB_DIR = process.env.DASHBOARD_DB_DIR || join(SCRIPT_DIR, '..', 'data');
const DASHBOARD_DB_PATH = process.env.DASHBOARD_DB_PATH || join(DASHBOARD_DB_DIR, 'dashboard.sqlite');

function initDashboardDb() {
    mkdirSync(DASHBOARD_DB_DIR, { recursive: true });
    const db = new DatabaseSync(DASHBOARD_DB_PATH);
    db.exec(`
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
        CREATE TABLE IF NOT EXISTS app_state (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            state_json TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS gmail_cache (
            cache_key TEXT PRIMARY KEY,
            payload_json TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            expires_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_gmail_cache_expires_at ON gmail_cache (expires_at);
    `);
    return db;
}

const dashboardDb = initDashboardDb();
const selectDashboardStateStmt = dashboardDb.prepare('SELECT state_json, updated_at FROM app_state WHERE id = 1');
const upsertDashboardStateStmt = dashboardDb.prepare(`
    INSERT INTO app_state (id, state_json, updated_at)
    VALUES (1, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
        state_json = excluded.state_json,
        updated_at = excluded.updated_at
`);
const selectGmailCacheStmt = dashboardDb.prepare('SELECT payload_json, updated_at, expires_at FROM gmail_cache WHERE cache_key = ?');
const upsertGmailCacheStmt = dashboardDb.prepare(`
    INSERT INTO gmail_cache (cache_key, payload_json, updated_at, expires_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(cache_key) DO UPDATE SET
        payload_json = excluded.payload_json,
        updated_at = excluded.updated_at,
        expires_at = excluded.expires_at
`);
const deleteGmailCacheStmt = dashboardDb.prepare('DELETE FROM gmail_cache WHERE cache_key = ?');
const deleteExpiredGmailCacheStmt = dashboardDb.prepare('DELETE FROM gmail_cache WHERE expires_at <= ?');
const deleteGmailListCacheStmt = dashboardDb.prepare(`DELETE FROM gmail_cache WHERE cache_key LIKE 'gmail:list:%'`);

function pruneExpiredGmailCache(nowMs = Date.now()) {
    try { deleteExpiredGmailCacheStmt.run(nowMs); } catch { /* ignore cache cleanup errors */ }
}

function readGmailCache(cacheKey, nowMs = Date.now()) {
    if (!cacheKey) return null;
    const row = selectGmailCacheStmt.get(cacheKey);
    if (!row) return null;
    const expiresAt = Number(row.expires_at || 0);
    if (!Number.isFinite(expiresAt) || expiresAt <= nowMs) {
        try { deleteGmailCacheStmt.run(cacheKey); } catch { /* ignore */ }
        return null;
    }
    const parsed = safeJson(row.payload_json);
    if (!parsed || typeof parsed !== 'object') {
        try { deleteGmailCacheStmt.run(cacheKey); } catch { /* ignore */ }
        return null;
    }
    return {
        payload: parsed,
        updatedAt: row.updated_at || new Date(nowMs).toISOString(),
        expiresAt,
    };
}

function writeGmailCache(cacheKey, payload, ttlMs, nowMs = Date.now()) {
    if (!cacheKey || !payload || typeof payload !== 'object') return;
    const ttl = Math.max(1000, Number(ttlMs) || 0);
    if (!ttl) return;
    let payloadJson = '';
    try {
        payloadJson = JSON.stringify(payload);
    } catch {
        return;
    }
    if (Buffer.byteLength(payloadJson, 'utf8') > GMAIL_CACHE_MAX_BYTES) return;
    const updatedAt = new Date(nowMs).toISOString();
    const expiresAt = nowMs + ttl;
    upsertGmailCacheStmt.run(cacheKey, payloadJson, updatedAt, expiresAt);
}

function invalidateGmailListCache() {
    try { deleteGmailListCacheStmt.run(); } catch { /* ignore cache invalidation errors */ }
}

// ── HTML helpers ──────────────────────────────────────────────────────────────

const stripTags = s =>
    s .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;/g, "'")
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
      .replace(/&#8211;/g, '–').replace(/&#8212;/g, '—').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
      .replace(/\s+/g, ' ').trim();

const removeElements = (html, ...tags) =>
    tags.reduce((h, t) => h.replace(new RegExp(`<${t}[\\s\\S]*?<\\/${t}>`, 'gi'), ''), html);

const decodeBase64UrlUtf8 = (value) => {
    if (!value || typeof value !== 'string') return '';
    const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
    try { return Buffer.from(padded, 'base64').toString('utf8'); } catch { return ''; }
};

const safeJson = (text) => {
    if (!text || typeof text !== 'string') return null;
    try { return JSON.parse(text); } catch { return null; }
};

function extractJsonObject(text) {
    if (!text || typeof text !== 'string') return null;
    const direct = safeJson(text.trim());
    if (direct) return direct;
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return safeJson(match[0]);
}

// ── Module extraction ─────────────────────────────────────────────────────────

// TCD module codes — all formats observed:
//   Undergrad (short):  2-4 letters + 4 digits       CS3012, ST2001, EE3110
//   Undergrad (long):   2-4 letters + 5 digits       CSU33021, CSU11001
//   Postgrad:           2 letters + digit + 2 letters + digit   CS7CS3, CS7IS4
const CODE_RE  = /\b([A-Z]{2,4}\d{4,5}|[A-Z]{2}\d[A-Z]{2}\d)\b/g;
const ECTS_RE  = /(\d+)\s*(?:ECTS|credit)/i;
const SEM_MAP  = [
    // "Semester 1 & 2" / "Semester 1 and 2" must come BEFORE individual semester tests
    ['yearlong',   /full\s*year|year[- ]long|both\s*semesters?|semester[s]?\s*1\s*(?:&|and)\s*2/i],
    ['michaelmas', /michaelmas|semester\s*1\b|mt\b/i],
    ['hilary',     /hilary|semester\s*2\b|ht\b/i],
    ['trinity',    /trinity\s*term|semester\s*3\b|tt\b/i],
];

function detectSemester(text) {
    for (const [sem, re] of SEM_MAP) if (re.test(text)) return sem;
    return 'michaelmas';
}

/**
 * Extract module objects from a plain-text block.
 * `seen` is a Set<string> used to deduplicate codes across multiple calls.
 */
function extractFromText(text, seen = new Set()) {
    const mods = [];
    CODE_RE.lastIndex = 0;
    let m;
    while ((m = CODE_RE.exec(text)) !== null) {
        const code = m[1];
        if (seen.has(code)) continue;
        seen.add(code);

        const idx  = m.index;
        const ctx  = text.slice(idx, idx + 100);
        const surr = text.slice(Math.max(0, idx - 150), idx + 150);

        const credits = ctx.match(ECTS_RE)?.[1];
        const sem     = detectSemester(surr);

        // Name: text immediately after the code until punctuation / end
        const afterRaw = ctx.slice(code.length).replace(/^\s*[-–:]\s*/, '').trim();
        const name     = afterRaw.split(/[,\n;:(]/)[0].trim().slice(0, 70);

        if (name.length > 2) {
            mods.push({ code, name, credits: credits ? parseInt(credits) : 5, semester: sem, moduleType: 'lecture' });
        }
    }
    return mods;
}

// ── TCD-specific HTML parser ──────────────────────────────────────────────────

/**
 * Scan the page for module codes and extract name + ECTS + semester from
 * the surrounding text. Only script/style are stripped so no structural
 * content (including WordPress <header> card wrappers) is lost.
 */
function parseTCDHtml(html) {
    // Remove only non-content elements
    const clean = removeElements(html, 'script', 'style');

    // Build section map from headings: detect core / elective boundaries
    const sections = [];
    for (const hm of clean.matchAll(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi)) {
        const text = stripTags(hm[1]).toLowerCase();
        if (/core|required|compulsory/.test(text))       sections.push({ pos: hm.index, cat: 'core' });
        else if (/elective|optional|choice/.test(text))  sections.push({ pos: hm.index, cat: 'elective' });
    }
    sections.sort((a, b) => a.pos - b.pos);

    const getCategoryAt = pos => {
        let cat = null;
        for (const s of sections) { if (s.pos <= pos) cat = s.cat; else break; }
        return cat;
    };

    const seen = new Set();
    const mods = [];

    CODE_RE.lastIndex = 0;
    let m;
    while ((m = CODE_RE.exec(clean)) !== null) {
        const code = m[1];
        if (seen.has(code)) continue;
        seen.add(code);

        const pos = m.index;

        // Strip tags from a window around the match to get readable text
        const nearText = stripTags(clean.slice(pos, pos + 500));
        const prevText = stripTags(clean.slice(Math.max(0, pos - 300), pos));

        // Name: text immediately after the code, past any dash/en-dash
        const afterCode = nearText.slice(code.length).replace(/^\s*[-–]\s*/, '').trim();
        const name = afterCode.split(/[\n\r,;(]/)[0].trim().slice(0, 70);
        if (name.length < 3) continue;

        // ECTS — look in the 300 chars of text after the code
        const credits = nearText.slice(0, 300).match(ECTS_RE)?.[1];

        // Semester — prefer text after (where the (Semester N, X ECTS) line lives),
        // fall back to text before
        const semAfter = detectSemester(nearText.slice(0, 400));
        const semBefore = detectSemester(prevText);
        const sem = semAfter !== 'michaelmas' ? semAfter : semBefore;

        const category = getCategoryAt(pos); // 'core' | 'elective' | null

        mods.push({ code, name, credits: credits ? parseInt(credits) : 5, semester: sem, moduleType: 'lecture', category });
    }

    return mods;
}


// ── Page fetch ────────────────────────────────────────────────────────────────

async function fetchPage(url, ms = 10000) {
    const res = await fetch(url, { headers: HDR, redirect: 'follow', signal: AbortSignal.timeout(ms) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
}

async function fetchJson(url, options = {}, timeoutMs = 10000) {
    const res = await fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
    const text = await res.text();
    const data = safeJson(text);
    if (!res.ok) {
        const detail = data?.error_description || data?.error?.message || data?.error || text.slice(0, 300) || `HTTP ${res.status}`;
        throw new Error(detail);
    }
    return data ?? {};
}

function normalizeWeatherSuggestion(row) {
    const latitude = Number(row?.latitude ?? row?.lat);
    const longitude = Number(row?.longitude ?? row?.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    const id = String(row?.id || `${latitude.toFixed(4)},${longitude.toFixed(4)}`);
    const name = String(row?.name || row?.display_name || '').trim();
    if (!name) return null;
    return {
        id,
        name,
        latitude,
        longitude,
        country_code: String(row?.country_code || '').trim().toUpperCase() || undefined,
        country: String(row?.country || '').trim() || undefined,
        admin1: String(row?.admin1 || '').trim() || undefined,
    };
}

async function weatherGeocode({ query, count } = {}) {
    const q = String(query || '').trim();
    if (!q) throw new Error('query required');
    const maxCount = Math.max(1, Math.min(parseInt(count || '5', 10) || 5, 10));

    try {
        const openMeteo = await fetchJson(
            `${WEATHER_GEOCODE_URL}?name=${encodeURIComponent(q)}&count=${maxCount}&language=en&format=json`,
            { headers: { 'User-Agent': UA, Accept: 'application/json' } },
            12000
        );
        const results = Array.isArray(openMeteo?.results)
            ? openMeteo.results.map(normalizeWeatherSuggestion).filter(Boolean)
            : [];
        if (results.length > 0) return { results };
    } catch {
        // fallback below
    }

    const nominatim = await fetchJson(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=${maxCount}&q=${encodeURIComponent(q)}`,
        { headers: { 'User-Agent': UA, Accept: 'application/json' } },
        12000
    );
    const results = (Array.isArray(nominatim) ? nominatim : [])
        .map(row => {
            const display = String(row?.display_name || '').trim();
            const parts = display.split(',').map(s => s.trim()).filter(Boolean);
            return normalizeWeatherSuggestion({
                id: row?.place_id,
                name: parts[0] || display,
                latitude: row?.lat,
                longitude: row?.lon,
                country: parts.length ? parts[parts.length - 1] : '',
                country_code: row?.address?.country_code || '',
                admin1: parts.length > 2 ? parts[1] : '',
            });
        })
        .filter(Boolean);
    return { results };
}

function mapWttrCodeToWmo(code) {
    const table = {
        113: 0, 116: 2, 119: 3, 122: 3, 143: 45, 176: 51, 179: 71, 182: 51, 185: 51,
        200: 95, 227: 71, 230: 75, 248: 45, 260: 45, 263: 51, 266: 53, 281: 51, 284: 51,
        293: 61, 296: 61, 299: 63, 302: 63, 305: 65, 308: 65, 311: 63, 314: 65, 317: 71,
        320: 71, 323: 71, 326: 73, 329: 75, 332: 75, 335: 75, 338: 75, 350: 45, 353: 80,
        356: 81, 359: 82, 362: 71, 365: 73, 368: 85, 371: 86, 374: 71, 377: 75, 386: 95,
        389: 99, 392: 95, 395: 99,
    };
    const n = parseInt(code || '0', 10);
    return table[n] ?? 3;
}

async function weatherCurrent({ latitude, longitude, name, country_code } = {}) {
    const lat = Number(latitude);
    const lon = Number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error('latitude and longitude required');

    try {
        const wx = await fetchJson(
            `${WEATHER_FORECAST_URL}?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,weathercode,wind_speed_10m,relative_humidity_2m,is_day&wind_speed_unit=kmh`,
            { headers: { 'User-Agent': UA, Accept: 'application/json' } },
            12000
        );
        const current = wx?.current || null;
        if (!current) throw new Error('weather payload missing current');
        return {
            source: 'open-meteo',
            current: {
                ...current,
                name: String(name || '').trim() || undefined,
                country_code: String(country_code || '').trim().toUpperCase() || undefined,
            },
        };
    } catch {
        // fallback to wttr.in for high-latency or blocked open-meteo regions
    }

    const wttr = await fetchJson(
        `${WEATHER_FALLBACK_URL}/${lat},${lon}?format=j1`,
        { headers: { 'User-Agent': UA, Accept: 'application/json' } },
        12000
    );
    const current = Array.isArray(wttr?.current_condition) ? wttr.current_condition[0] : null;
    if (!current) throw new Error('weather service unavailable');
    const weathercode = mapWttrCodeToWmo(current.weatherCode);
    const temperature = Number(current.temp_C);
    const apparent = Number(current.FeelsLikeC);
    const humidity = Number(current.humidity);
    const wind = Number(current.windspeedKmph);
    return {
        source: 'wttr',
        current: {
            temperature_2m: Number.isFinite(temperature) ? temperature : 0,
            apparent_temperature: Number.isFinite(apparent) ? apparent : 0,
            weathercode,
            wind_speed_10m: Number.isFinite(wind) ? wind : 0,
            relative_humidity_2m: Number.isFinite(humidity) ? humidity : 0,
            is_day: 1,
            name: String(name || '').trim() || undefined,
            country_code: String(country_code || '').trim().toUpperCase() || undefined,
        },
    };
}

async function getGmailAccessToken() {
    if (process.env.GMAIL_ACCESS_TOKEN) return process.env.GMAIL_ACCESS_TOKEN;

    const clientId = process.env.GMAIL_CLIENT_ID;
    const clientSecret = process.env.GMAIL_CLIENT_SECRET;
    const refreshToken = process.env.GMAIL_REFRESH_TOKEN;
    if (!clientId || !clientSecret || !refreshToken) {
        throw new Error('missing Gmail auth env vars: set GMAIL_ACCESS_TOKEN OR GMAIL_CLIENT_ID/GMAIL_CLIENT_SECRET/GMAIL_REFRESH_TOKEN');
    }

    const body = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
    });

    const tokenData = await fetchJson(GOOGLE_OAUTH_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
    }, 10000);

    if (!tokenData.access_token) throw new Error('failed to acquire Gmail access token');
    return tokenData.access_token;
}

async function gmailApi(path, accessToken) {
    return fetchJson(`${GMAIL_API_BASE}${path}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
    }, 12000);
}

async function fetchGmailMessageBestEffort(id, accessToken, { withFormat = false } = {}) {
    const encodedId = encodeURIComponent(String(id || ''));
    try {
        const msg = await gmailApi(`/messages/${encodedId}?format=full`, accessToken);
        return withFormat ? { msg, format: 'full' } : msg;
    } catch (e) {
        const msg = String(e?.message || '');
        const fullNotAllowed = /metadata scope.*format.*full/i.test(msg);
        if (!fullNotAllowed) throw e;
        const metaMsg = await gmailApi(
            `/messages/${encodedId}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Subject&metadataHeaders=Date`,
            accessToken
        );
        return withFormat ? { msg: metaMsg, format: 'metadata' } : metaMsg;
    }
}

function encodeBase64UrlUtf8(text) {
    return Buffer.from(String(text || ''), 'utf8')
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
}

function getHeader(headers, targetName) {
    const lower = String(targetName || '').toLowerCase();
    const item = (headers || []).find(h => String(h.name || '').toLowerCase() === lower);
    return item?.value || '';
}

function flattenParts(part, list = []) {
    if (!part) return list;
    list.push(part);
    if (Array.isArray(part.parts)) part.parts.forEach(p => flattenParts(p, list));
    return list;
}

function decodePartBody(part) {
    if (!part?.body?.data) return '';
    return decodeBase64UrlUtf8(part.body.data).trim();
}

function extractMessageBodies(payload) {
    if (!payload) return { text: '', html: '' };
    const parts = flattenParts(payload);

    const plainPart = parts.find(p => String(p.mimeType || '').toLowerCase().startsWith('text/plain') && p?.body?.data);
    const htmlPart = parts.find(p => String(p.mimeType || '').toLowerCase().startsWith('text/html') && p?.body?.data);

    const plainText = decodePartBody(plainPart);
    const htmlRaw = decodePartBody(htmlPart) || (
        String(payload?.mimeType || '').toLowerCase().startsWith('text/html') ? decodePartBody(payload) : ''
    );

    let text = plainText;
    if (!text && htmlRaw) text = stripTags(htmlRaw).trim();
    if (!text && payload?.body?.data) text = stripTags(decodeBase64UrlUtf8(payload.body.data)).trim();

    return { text, html: htmlRaw };
}

function extractMessageBody(payload) {
    return extractMessageBodies(payload).text;
}

function mapGmailMessage(msg, { bodyLimit = 3000, includeHtml = false, htmlLimit = 60000 } = {}) {
    const payload = msg?.payload || {};
    const headers = payload.headers || [];
    const bodies = extractMessageBodies(payload);
    const bodyText = bodies.text;
    const bodyHtml = bodies.html;
    const labelIds = Array.isArray(msg?.labelIds) ? msg.labelIds : [];
    const clippedBody = Number.isFinite(bodyLimit) ? bodyText.slice(0, Math.max(0, bodyLimit)) : bodyText;
    const clippedHtml = Number.isFinite(htmlLimit) ? bodyHtml.slice(0, Math.max(0, htmlLimit)) : bodyHtml;
    const normalizedSnippet = String(msg?.snippet || '').trim() || String(clippedBody || '').slice(0, 220);

    return {
        id: msg?.id,
        threadId: msg?.threadId,
        from: getHeader(headers, 'from'),
        to: getHeader(headers, 'to'),
        cc: getHeader(headers, 'cc'),
        subject: getHeader(headers, 'subject') || '(no subject)',
        date: getHeader(headers, 'date'),
        receivedAt: msg?.internalDate ? new Date(Number(msg.internalDate)).toISOString() : null,
        labelIds,
        unread: labelIds.includes('UNREAD'),
        snippet: normalizedSnippet,
        body: clippedBody,
        gmailWebUrl: msg?.threadId ? `https://mail.google.com/mail/u/0/#inbox/${msg.threadId}` : '',
        ...(includeHtml ? { bodyHtml: clippedHtml } : {}),
    };
}

async function fetchRecentGmailMessages({ maxResults = GMAIL_DEFAULT_MAX_RESULTS, query = GMAIL_DEFAULT_QUERY, forceRefresh = false } = {}) {
    const max = Math.max(1, Math.min(parseInt(maxResults || GMAIL_DEFAULT_MAX_RESULTS, 10), 30));
    const normalizedQuery = String(query || '').trim();
    const cacheKey = `gmail:list:${max}:${normalizedQuery}`;
    const nowMs = Date.now();

    if (!forceRefresh) {
        pruneExpiredGmailCache(nowMs);
        const cached = readGmailCache(cacheKey, nowMs);
        if (cached && Array.isArray(cached.payload?.emails)) {
            return {
                emails: cached.payload.emails,
                cacheHit: true,
                cacheUpdatedAt: cached.updatedAt,
            };
        }
    }

    const accessToken = await getGmailAccessToken();
    let list;
    try {
        const path = normalizedQuery
            ? `/messages?maxResults=${max}&q=${encodeURIComponent(normalizedQuery)}`
            : `/messages?maxResults=${max}`;
        list = await gmailApi(path, accessToken);
    } catch (e) {
        const msg = String(e?.message || '');
        const queryNotAllowed = /metadata scope.*q.*parameter/i.test(msg);
        if (!normalizedQuery || !queryNotAllowed) throw e;
        // Some token/scope combinations reject the q parameter. Fall back to recent messages.
        list = await gmailApi('/messages?maxResults=30', accessToken);
    }
    const refs = Array.isArray(list.messages) ? list.messages : [];

    if (refs.length === 0) {
        const fetchedAt = new Date().toISOString();
        writeGmailCache(cacheKey, { emails: [] }, GMAIL_LIST_CACHE_TTL_MS, Date.now());
        return {
            emails: [],
            cacheHit: false,
            cacheUpdatedAt: fetchedAt,
        };
    }

    const details = await Promise.all(refs.map(ref => fetchGmailMessageBestEffort(ref.id, accessToken)));
    const emails = details.map(msg => mapGmailMessage(msg, { bodyLimit: 3000 }));
    const fetchedAt = new Date().toISOString();
    writeGmailCache(cacheKey, { emails }, GMAIL_LIST_CACHE_TTL_MS, Date.now());
    return {
        emails,
        cacheHit: false,
        cacheUpdatedAt: fetchedAt,
    };
}

async function gmailEmailsList({ maxEmails, gmailQuery, forceRefresh = false } = {}) {
    const fetched = await fetchRecentGmailMessages({
        maxResults: maxEmails || GMAIL_DEFAULT_MAX_RESULTS,
        query: gmailQuery || GMAIL_DEFAULT_QUERY,
        forceRefresh,
    });
    const emails = Array.isArray(fetched?.emails) ? fetched.emails : [];

    return {
        emails: emails.map(mail => ({
            id: mail.id,
            threadId: mail.threadId,
            from: mail.from,
            subject: mail.subject,
            date: mail.date,
            receivedAt: mail.receivedAt,
            snippet: mail.snippet,
            unread: Boolean(mail.unread),
        })),
        queryUsed: gmailQuery || GMAIL_DEFAULT_QUERY,
        cacheHit: Boolean(fetched?.cacheHit),
        cacheUpdatedAt: fetched?.cacheUpdatedAt || null,
        fetchedAt: new Date().toISOString(),
    };
}

async function gmailEmailDetail({ id, forceRefresh = false } = {}) {
    const messageId = String(id || '').trim();
    if (!messageId) throw new Error('id required');

    const cacheKey = `gmail:detail:${messageId}`;
    const nowMs = Date.now();
    if (!forceRefresh) {
        pruneExpiredGmailCache(nowMs);
        const cached = readGmailCache(cacheKey, nowMs);
        if (cached && cached.payload?.email && typeof cached.payload.email === 'object') {
            return {
                email: cached.payload.email,
                cacheHit: true,
                cacheUpdatedAt: cached.updatedAt,
                fetchedAt: new Date().toISOString(),
            };
        }
    }

    const accessToken = await getGmailAccessToken();
    const { msg, format } = await fetchGmailMessageBestEffort(messageId, accessToken, { withFormat: true });
    const email = mapGmailMessage(msg, { bodyLimit: 12000, includeHtml: true, htmlLimit: 120000 });
    const hasContent = Boolean(String(email.body || '').trim()) || Boolean(String(email.bodyHtml || '').trim()) || Boolean(String(email.snippet || '').trim());
    if (format === 'metadata' && !hasContent) {
        email.contentLimited = true;
        email.contentLimitedReason = 'Gmail returned metadata-only fields for this token; message body is unavailable.';
    }
    writeGmailCache(cacheKey, { email }, GMAIL_DETAIL_CACHE_TTL_MS, Date.now());

    return {
        email,
        cacheHit: false,
        cacheUpdatedAt: new Date().toISOString(),
        fetchedAt: new Date().toISOString(),
    };
}

function fallbackSingleEmailTask(email) {
    const sourceEmailId = String(email?.id || '').trim();
    const heuristicText = buildTaskTextHeuristic(email);
    if (!heuristicText) return null;
    const lookup = new Map([[sourceEmailId, email]]);
    const fb = taskPriorityFallback({ text: heuristicText, sourceEmailId }, lookup);
    return {
        text: heuristicText.slice(0, 120),
        sourceEmailId,
        priority: fb.priority,
        priorityScore: fb.score,
        priorityReason: fb.reason,
    };
}

async function extractSingleTaskWithZhipu(email) {
    const sourceEmailId = String(email?.id || '').trim();
    if (!sourceEmailId) return null;

    const apiKey = process.env.ZHIPU_API_KEY;
    if (!apiKey) return fallbackSingleEmailTask(email);

    const system = `You convert one email into at most one actionable task for the mailbox owner.
Return JSON only, no markdown.
Schema:
{
  "task": {
    "text":"short concrete task",
    "priority":"high|medium|low",
    "score":0,
    "reason":"short reason"
  }
}
If no user action is needed, return {"task": null}.
Rules:
- Task text must be imperative and specific.
- Keep task text <= 120 characters.
- Keep reason <= 16 words.
- Priority rubric:
  - high (75-100): urgent, security/payment risk, deadline <=48h.
  - medium (45-74): important but not immediate.
  - low (0-44): optional or deferrable.`;

    const user = `Email:
id: ${sourceEmailId}
from: ${email?.from || ''}
subject: ${email?.subject || ''}
date: ${email?.receivedAt || email?.date || ''}
snippet: ${(email?.snippet || '').slice(0, 280)}
body: ${(email?.body || '').slice(0, 1200)}`;

    let data;
    try {
        data = await fetchJson(ZHIPU_CHAT_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: ZHIPU_MODEL,
                temperature: 0.1,
                messages: [
                    { role: 'system', content: system },
                    { role: 'user', content: user },
                ],
            }),
        }, 35000);
    } catch {
        return fallbackSingleEmailTask(email);
    }

    const content = data?.choices?.[0]?.message?.content || '';
    const parsed = extractJsonObject(content);
    const candidate = parsed?.task && typeof parsed.task === 'object' ? parsed.task : null;

    if (!candidate) return fallbackSingleEmailTask(email);

    const text = String(candidate?.text || '').replace(/\s+/g, ' ').trim();
    if (!text) return fallbackSingleEmailTask(email);

    const score = normalizeScore(candidate?.score, 50);
    const priority = normalizePriority(candidate?.priority, priorityByScore(score));
    const reason = String(candidate?.reason || '').replace(/\s+/g, ' ').trim();

    return {
        text: text.slice(0, 120),
        sourceEmailId,
        priority,
        priorityScore: score,
        priorityReason: reason || 'Priority inferred from urgency and impact signals.',
    };
}

async function gmailEmailToTask({ id } = {}) {
    const detail = await gmailEmailDetail({ id });
    const email = detail?.email || null;
    if (!email?.id) throw new Error('email not found');

    const task = await extractSingleTaskWithZhipu(email);
    return {
        task,
        email: {
            id: email.id,
            from: email.from,
            subject: email.subject,
            date: email.date,
            receivedAt: email.receivedAt,
            snippet: email.snippet,
        },
        model: ZHIPU_MODEL,
        fetchedAt: new Date().toISOString(),
    };
}

function parseAmountString(raw) {
    const value = String(raw || '').trim();
    if (!value) return null;
    let normalized = value.replace(/\s/g, '');
    const comma = normalized.lastIndexOf(',');
    const dot = normalized.lastIndexOf('.');
    if (comma >= 0 && dot >= 0) {
        // If comma appears after dot, treat comma as decimal separator (1.234,56).
        if (comma > dot) {
            normalized = normalized.replace(/\./g, '').replace(',', '.');
        } else {
            normalized = normalized.replace(/,/g, '');
        }
    } else if (comma >= 0) {
        // If trailing comma digits look like decimals, convert to dot.
        normalized = /,\d{1,2}$/.test(normalized)
            ? normalized.replace(',', '.')
            : normalized.replace(/,/g, '');
    }
    const n = Number(normalized);
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.round(n * 100) / 100;
}

function extractAmountsFromText(text) {
    const src = String(text || '');
    const patterns = [
        /(?:€|eur|euro|usd|\$|gbp|£)\s*([0-9][0-9.,]{0,14})/gi,
        /([0-9][0-9.,]{0,14})\s*(?:€|eur|euro|usd|gbp)\b/gi,
    ];
    const out = [];
    for (const re of patterns) {
        for (const match of src.matchAll(re)) {
            const parsed = parseAmountString(match?.[1] || '');
            if (parsed != null) out.push(parsed);
        }
    }
    return out;
}

function normalizeExpenseCategory(category, fallback = 'other') {
    const raw = String(category || '').toLowerCase().trim();
    if (!raw) return fallback;
    if (['food', 'transport', 'entertainment', 'shopping', 'bills', 'health', 'other'].includes(raw)) return raw;
    if (/\b(bill|invoice|utility|subscription|rent|fee|payment|tax|insurance)\b/.test(raw)) return 'bills';
    if (/\b(food|meal|lunch|dinner|coffee|restaurant|grocery)\b/.test(raw)) return 'food';
    if (/\b(transport|uber|taxi|bus|train|flight|fuel|parking)\b/.test(raw)) return 'transport';
    if (/\b(movie|game|music|netflix|spotify|entertainment)\b/.test(raw)) return 'entertainment';
    if (/\b(shop|shopping|store|amazon|purchase|order)\b/.test(raw)) return 'shopping';
    if (/\b(health|medical|pharmacy|doctor|hospital|dentist)\b/.test(raw)) return 'health';
    return fallback;
}

function inferExpenseCategoryFromText(text) {
    const haystack = String(text || '').toLowerCase();
    if (/\b(electricity|water|gas|utility|internet|broadband|invoice|bill|payment|subscription|renewal|statement|rent|tuition|fee|tax|insurance)\b/.test(haystack)) return 'bills';
    if (/\b(coffee|lunch|dinner|meal|restaurant|cafe|food|grocery)\b/.test(haystack)) return 'food';
    if (/\b(uber|taxi|bus|train|transport|metro|flight|fuel|parking)\b/.test(haystack)) return 'transport';
    if (/\b(cinema|movie|concert|game|music|streaming|entertainment)\b/.test(haystack)) return 'entertainment';
    if (/\b(order|purchase|shopping|store|amazon|receipt)\b/.test(haystack)) return 'shopping';
    if (/\b(pharmacy|medical|doctor|hospital|health|clinic)\b/.test(haystack)) return 'health';
    return 'other';
}

function extractSenderName(from) {
    const source = String(from || '').trim();
    if (!source) return '';
    const bracketIdx = source.indexOf('<');
    if (bracketIdx > 0) return source.slice(0, bracketIdx).replace(/["']/g, '').trim();
    const atIdx = source.indexOf('@');
    if (atIdx > 0) return source.slice(0, atIdx).trim();
    return source;
}

function normalizeExpenseDescription(subject, from) {
    const cleanedSubject = String(subject || '')
        .replace(/\s+/g, ' ')
        .replace(/^\s*(payment reminder|payment due|invoice|bill|receipt|statement)\s*[:\-]\s*/i, '')
        .trim();
    if (cleanedSubject) return cleanedSubject.slice(0, 120);
    const sender = extractSenderName(from);
    return (sender ? `Payment to ${sender}` : 'Email expense').slice(0, 120);
}

function fallbackSingleEmailExpense(email) {
    const sourceEmailId = String(email?.id || '').trim();
    if (!sourceEmailId) return null;
    const haystack = `${email?.subject || ''} ${email?.snippet || ''} ${email?.body || ''}`;
    const billSignals = /\b(bill|invoice|payment|due|subscription|renewal|statement|utility|rent|tuition|fee|tax|insurance|charged|charge)\b/i;
    const amounts = extractAmountsFromText(haystack);
    if (!billSignals.test(haystack) || amounts.length === 0) return null;

    return {
        description: normalizeExpenseDescription(email?.subject, email?.from),
        amount: amounts[0],
        category: inferExpenseCategoryFromText(haystack),
        sourceEmailId,
        reason: 'Fallback parser found bill/payment language with a numeric amount.',
    };
}

async function extractSingleExpenseWithZhipu(email) {
    const sourceEmailId = String(email?.id || '').trim();
    if (!sourceEmailId) return null;

    const apiKey = process.env.ZHIPU_API_KEY;
    if (!apiKey) return fallbackSingleEmailExpense(email);

    const system = `You classify a single email as budget expense or not.
Return JSON only, no markdown.
Schema:
{
  "expense": {
    "description":"short label for expense item",
    "amount":0,
    "category":"food|transport|entertainment|shopping|bills|health|other",
    "confidence":0,
    "reason":"short reason"
  }
}
If the email is not a real expense/bill/payment for the mailbox owner, return {"expense": null}.
Rules:
- Require a numeric amount > 0 for expense.
- Prefer category "bills" for invoices/utilities/subscriptions.
- Keep description <= 120 chars.
- Keep reason <= 16 words.`;

    const user = `Email:
id: ${sourceEmailId}
from: ${email?.from || ''}
subject: ${email?.subject || ''}
date: ${email?.receivedAt || email?.date || ''}
snippet: ${(email?.snippet || '').slice(0, 360)}
body: ${(email?.body || '').slice(0, 1500)}`;

    let data;
    try {
        data = await fetchJson(ZHIPU_CHAT_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: ZHIPU_MODEL,
                temperature: 0.1,
                messages: [
                    { role: 'system', content: system },
                    { role: 'user', content: user },
                ],
            }),
        }, 35000);
    } catch {
        return fallbackSingleEmailExpense(email);
    }

    const content = data?.choices?.[0]?.message?.content || '';
    const parsed = extractJsonObject(content);
    if (!parsed || typeof parsed !== 'object' || !Object.prototype.hasOwnProperty.call(parsed, 'expense')) {
        return fallbackSingleEmailExpense(email);
    }
    if (parsed.expense == null) return null;
    if (typeof parsed.expense !== 'object') return fallbackSingleEmailExpense(email);

    const candidate = parsed.expense;
    const amount = Number(candidate?.amount);
    const safeAmount = Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : null;
    if (safeAmount == null) return fallbackSingleEmailExpense(email);

    const description = normalizeExpenseDescription(candidate?.description || email?.subject || '', email?.from);
    const category = normalizeExpenseCategory(candidate?.category, inferExpenseCategoryFromText(`${email?.subject || ''} ${email?.snippet || ''} ${email?.body || ''}`));
    const reason = String(candidate?.reason || '').replace(/\s+/g, ' ').trim();
    const confidence = normalizeScore(candidate?.confidence, 70);

    return {
        description,
        amount: safeAmount,
        category,
        sourceEmailId,
        reason: reason || 'Detected invoice/payment intent with amount in message content.',
        confidence,
    };
}

async function gmailEmailToExpense({ id } = {}) {
    const detail = await gmailEmailDetail({ id });
    const email = detail?.email || null;
    if (!email?.id) throw new Error('email not found');

    const expense = await extractSingleExpenseWithZhipu(email);
    return {
        expense,
        email: {
            id: email.id,
            from: email.from,
            subject: email.subject,
            date: email.date,
            receivedAt: email.receivedAt,
            snippet: email.snippet,
        },
        model: ZHIPU_MODEL,
        fetchedAt: new Date().toISOString(),
    };
}

function buildTaskTextHeuristic(mail) {
    const subject = String(mail?.subject || '').replace(/\s+/g, ' ').trim();
    if (!subject) return '';
    const context = `${subject} ${mail?.snippet || ''} ${mail?.body || ''}`;
    const normalized = subject.replace(/^\[[^\]]+\]\s*/g, '').trim();

    if (/\b(deadline|due|assignment|submit|exam|report|project|homework)\b/i.test(context)) {
        return `Complete: ${normalized}`.slice(0, 120);
    }
    if (/\b(verify|security|alert|account|password|sign[- ]?in|locked)\b/i.test(context)) {
        return `Review account/security email: ${normalized}`.slice(0, 120);
    }
    if (/\b(meeting|appointment|interview|call|zoom)\b/i.test(context)) {
        return `Prepare for: ${normalized}`.slice(0, 120);
    }
    if (/\b(payment|invoice|bill|renew|subscription|card)\b/i.test(context)) {
        return `Check payment action: ${normalized}`.slice(0, 120);
    }
    return '';
}

function extractTasksHeuristic(emails) {
    const items = Array.isArray(emails) ? emails : [];
    const seen = new Set();
    const tasks = [];

    for (const mail of items) {
        const text = buildTaskTextHeuristic(mail);
        if (!text) continue;
        const key = text.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        tasks.push({
            text,
            sourceEmailId: String(mail?.id || ''),
        });
        if (tasks.length >= 12) break;
    }
    return tasks;
}

async function extractTasksWithZhipu(emails) {
    const apiKey = process.env.ZHIPU_API_KEY;
    if (!apiKey) return extractTasksHeuristic(emails);
    if (!Array.isArray(emails) || emails.length === 0) return [];

    const condensed = emails.slice(0, 12).map((mail, idx) => (
        `[EMAIL ${idx + 1}]
id: ${mail.id}
from: ${mail.from || ''}
subject: ${mail.subject || ''}
date: ${mail.receivedAt || mail.date || ''}
snippet: ${(mail.snippet || '').slice(0, 240)}
body: ${(mail.body || '').slice(0, 700)}`
    )).join('\n\n');

    const system = `You extract actionable TODO items from emails.
Return JSON only, no markdown.
Schema:
{
  "tasks":[
    {
      "text":"short concrete task",
      "sourceEmailId":"email id"
    }
  ]
}
Rules:
- Only include actionable tasks for the mailbox owner.
- Ignore newsletters, ads, and FYI-only messages.
- Keep text concise and specific.
- Output at most 12 tasks.
- Deduplicate similar tasks.`;

    const user = `Extract actionable tasks from these emails:\n\n${condensed}`;

    let data;
    try {
        data = await fetchJson(ZHIPU_CHAT_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: ZHIPU_MODEL,
                temperature: 0.2,
                messages: [
                    { role: 'system', content: system },
                    { role: 'user', content: user },
                ],
            }),
        }, 35000);
    } catch {
        return extractTasksHeuristic(emails);
    }

    const content = data?.choices?.[0]?.message?.content || '';
    const parsed = extractJsonObject(content);
    const tasksRaw = Array.isArray(parsed?.tasks) ? parsed.tasks : [];

    const seen = new Set();
    const tasks = [];
    for (const t of tasksRaw) {
        const text = String(t?.text || '').replace(/\s+/g, ' ').trim();
        if (!text) continue;
        const key = text.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        tasks.push({
            text: text.slice(0, 120),
            sourceEmailId: String(t?.sourceEmailId || ''),
        });
        if (tasks.length >= 12) break;
    }
    return tasks.length ? tasks : extractTasksHeuristic(emails);
}

function normalizePriority(priority, fallback = 'medium') {
    const normalized = String(priority || '').toLowerCase();
    if (normalized === 'high' || normalized === 'medium' || normalized === 'low') return normalized;
    return fallback;
}

function normalizeScore(value, fallback = 50) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(0, Math.min(100, Math.round(n)));
}

function priorityByScore(score) {
    if (score >= 75) return 'high';
    if (score >= 45) return 'medium';
    return 'low';
}

function taskPriorityFallback(task, emailLookup) {
    const mail = emailLookup.get(String(task?.sourceEmailId || '')) || {};
    const haystack = `${task?.text || ''} ${mail.subject || ''} ${mail.snippet || ''}`.toLowerCase();
    const highRe = /\b(urgent|asap|immediately|security|verify|suspend|locked|deadline|due|overdue|final notice|payment failed)\b/;
    const soonRe = /\b(today|tomorrow|within 24|within 48|24h|48h)\b/;

    if (highRe.test(haystack) || soonRe.test(haystack)) return { priority: 'high', score: 82, reason: 'Urgent/security or near-term deadline language detected.' };
    return { priority: 'medium', score: 55, reason: 'No clear urgency language; defaulting to medium priority.' };
}

async function scoreTaskPrioritiesWithZhipu(tasks, emails) {
    const apiKey = process.env.ZHIPU_API_KEY;
    if (!Array.isArray(tasks) || tasks.length === 0) return [];

    const emailLookup = new Map((emails || []).map(mail => [String(mail.id || ''), mail]));
    if (!apiKey) {
        return tasks.map(task => {
            const fb = taskPriorityFallback(task, emailLookup);
            return {
                ...task,
                priority: fb.priority,
                priorityScore: fb.score,
                priorityReason: fb.reason,
            };
        });
    }

    const payload = tasks.slice(0, 12).map((task, idx) => {
        const mail = emailLookup.get(String(task.sourceEmailId || '')) || {};
        return `[TASK ${idx + 1}]
text: ${task.text}
sourceEmailId: ${task.sourceEmailId || ''}
emailSubject: ${(mail.subject || '').slice(0, 200)}
emailDate: ${mail.receivedAt || mail.date || ''}
emailSnippet: ${(mail.snippet || '').slice(0, 260)}
emailBody: ${(mail.body || '').slice(0, 420)}`;
    }).join('\n\n');

    const system = `You are a strict prioritization engine for student inbox tasks.
Return JSON only, no markdown.
Schema:
{
  "priorities":[
    {
      "text":"task text",
      "sourceEmailId":"email id",
      "priority":"high|medium|low",
      "score":0,
      "reason":"short reason"
    }
  ]
}
Scoring rubric:
- HIGH (75-100): deadlines <= 48h, security/account lock risk, payment failure, exam/submission urgency.
- MEDIUM (45-74): actionable and important, but not immediate.
- LOW (0-44): optional, informational, or deferrable.
Rules:
- Keep reason concise (max 16 words).
- Evaluate each provided task exactly once.
- Use only high|medium|low labels.`;

    const user = `Score priority for each task below:\n\n${payload}`;

    let data;
    try {
        data = await fetchJson(ZHIPU_CHAT_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: ZHIPU_MODEL,
                temperature: 0.1,
                messages: [
                    { role: 'system', content: system },
                    { role: 'user', content: user },
                ],
            }),
        }, 35000);
    } catch {
        return tasks.map(task => {
            const fb = taskPriorityFallback(task, emailLookup);
            return {
                ...task,
                priority: fb.priority,
                priorityScore: fb.score,
                priorityReason: fb.reason,
            };
        });
    }

    const content = data?.choices?.[0]?.message?.content || '';
    const parsed = extractJsonObject(content);
    const rows = Array.isArray(parsed?.priorities) ? parsed.priorities : [];

    const keyed = new Map();
    for (const row of rows) {
        const text = String(row?.text || '').replace(/\s+/g, ' ').trim();
        const sourceEmailId = String(row?.sourceEmailId || '').trim();
        if (!text) continue;
        const score = normalizeScore(row?.score, 50);
        const priority = normalizePriority(row?.priority, priorityByScore(score));
        const reason = String(row?.reason || '').replace(/\s+/g, ' ').trim();
        keyed.set(`${sourceEmailId}::${text.toLowerCase()}`, {
            priority,
            priorityScore: score,
            priorityReason: reason || 'Priority inferred from urgency and impact signals.',
        });
    }

    return tasks.map(task => {
        const key = `${String(task?.sourceEmailId || '')}::${String(task?.text || '').toLowerCase()}`;
        const ranked = keyed.get(key);
        if (ranked) return { ...task, ...ranked };

        const fb = taskPriorityFallback(task, emailLookup);
        return {
            ...task,
            priority: fb.priority,
            priorityScore: fb.score,
            priorityReason: fb.reason,
        };
    });
}

async function gmailTasksSync({ maxEmails, gmailQuery } = {}) {
    const fetched = await fetchRecentGmailMessages({
        maxResults: maxEmails || GMAIL_DEFAULT_MAX_RESULTS,
        query: gmailQuery || GMAIL_DEFAULT_QUERY,
    });
    const emails = Array.isArray(fetched?.emails) ? fetched.emails : [];

    const extracted = await extractTasksWithZhipu(emails);
    const tasks = await scoreTaskPrioritiesWithZhipu(extracted, emails);
    return {
        emailsScanned: emails.length,
        tasks,
        queryUsed: gmailQuery || GMAIL_DEFAULT_QUERY,
        cacheHit: Boolean(fetched?.cacheHit),
        cacheUpdatedAt: fetched?.cacheUpdatedAt || null,
        model: ZHIPU_MODEL,
        fetchedAt: new Date().toISOString(),
    };
}

function buildPriorityTestScenario(scenario = 'high') {
    const normalized = String(scenario || 'high').toLowerCase();
    if (normalized === 'low') {
        return {
            scenario: 'low',
            expectedPriority: 'low',
            subjectTail: 'Optional reading list for later',
            body: 'Optional: read these references next month if you have time. No deadline this week.',
        };
    }
    if (normalized === 'medium') {
        return {
            scenario: 'medium',
            expectedPriority: 'medium',
            subjectTail: 'Prepare draft for next week check-in',
            body: 'Please prepare a short draft for next week check-in. Useful but not urgent today.',
        };
    }
    return {
        scenario: 'high',
        expectedPriority: 'high',
        subjectTail: 'URGENT assignment due tomorrow 17:00',
        body: 'Urgent: submit your assignment by tomorrow 17:00. Missing this deadline may reduce your grade.',
    };
}

function normalizeCategorizedKinds(kinds) {
    const raw = Array.isArray(kinds)
        ? kinds
        : (typeof kinds === 'string' ? kinds.split(/[,\s]+/) : []);
    const out = [];
    const allow = new Set(['assignment', 'meeting', 'bill']);
    for (const item of raw) {
        let key = String(item || '').trim().toLowerCase();
        if (!key) continue;
        if (key === 'billing' || key === 'invoice') key = 'bill';
        if (!allow.has(key)) continue;
        if (!out.includes(key)) out.push(key);
    }
    if (out.length > 0) return out;
    return ['assignment', 'meeting', 'bill'];
}

function normalizeTestEmailKind(rawKind, fallback = 'assignment') {
    const normalized = String(rawKind || '').trim().toLowerCase();
    if (normalized === 'meeting') return 'meeting';
    if (normalized === 'bill' || normalized === 'billing' || normalized === 'invoice') return 'bill';
    if (normalized === 'assignment' || normalized === 'homework' || normalized === 'coursework') return 'assignment';
    return fallback;
}

function normalizeExpectedPriority(value, fallback = 'medium') {
    const normalized = String(value || '').toLowerCase().trim();
    if (normalized === 'high' || normalized === 'medium' || normalized === 'low') return normalized;
    return fallback;
}

function toBodyLines(value) {
    const lines = Array.isArray(value) ? value : String(value || '').split(/\r?\n/);
    const cleaned = lines
        .map(line => String(line || '').replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .slice(0, 16);
    return cleaned.length ? cleaned : ['Hello,', 'Please review this reminder and take action.', 'Thank you.'];
}

function randomChoice(items) {
    const arr = Array.isArray(items) ? items : [];
    if (!arr.length) return '';
    return arr[Math.floor(Math.random() * arr.length)];
}

function randomAmount(min, max) {
    const safeMin = Number.isFinite(min) ? min : 12;
    const safeMax = Number.isFinite(max) ? max : 120;
    const raw = safeMin + Math.random() * Math.max(0.01, safeMax - safeMin);
    return (Math.round(raw * 100) / 100).toFixed(2);
}

function buildFallbackRandomCategorizedEmail(kind = 'assignment') {
    const normalized = normalizeTestEmailKind(kind);
    if (normalized === 'meeting') {
        const topics = ['project sync', 'design review', 'sprint planning', 'risk check-in', 'research update'];
        const rooms = ['Room 2.12', 'Lab 3A', 'Meeting Pod B', 'Library Group Room', 'Seminar Room 5'];
        const times = ['09:30', '10:00', '11:30', '14:00', '16:30'];
        const topic = randomChoice(topics);
        const room = randomChoice(rooms);
        const time = randomChoice(times);
        return {
            kind: 'meeting',
            expectedPriority: 'medium',
            subject: `Reminder: ${topic} meeting tomorrow at ${time}`,
            bodyLines: [
                'Hi,',
                `A reminder that the ${topic} meeting is scheduled for tomorrow at ${time} in ${room}.`,
                'Please bring your updates, blockers, and next steps.',
                'Reply to confirm attendance.',
                'Best regards,',
                'Course Team',
            ],
        };
    }
    if (normalized === 'bill') {
        const vendors = ['Campus Utilities', 'City Broadband', 'Student Residence Office', 'Cloud Storage Service', 'Phone Provider'];
        const billNames = ['electricity bill', 'internet invoice', 'residence fee statement', 'subscription renewal', 'phone bill'];
        const dueTimes = ['17:00', '18:00', '20:00', '12:00'];
        const vendor = randomChoice(vendors);
        const billName = randomChoice(billNames);
        const amount = randomAmount(18, 140);
        const dueTime = randomChoice(dueTimes);
        return {
            kind: 'bill',
            expectedPriority: 'high',
            subject: `Payment reminder: ${billName} due Friday at ${dueTime}`,
            bodyLines: [
                'Hello,',
                `Your ${billName} of EUR ${amount} is due this Friday at ${dueTime}.`,
                'Please complete payment before the deadline to avoid additional fees.',
                `Thanks,`,
                vendor,
            ],
        };
    }
    const modules = ['COMP3030', 'CS3012', 'CS7DS2', 'MAU22C00', 'ST2001'];
    const deliverables = ['milestone report', 'final write-up', 'code submission', 'project brief', 'analysis report'];
    const times = ['15:00', '17:00', '18:30', '23:00'];
    const moduleCode = randomChoice(modules);
    const deliverable = randomChoice(deliverables);
    const dueTime = randomChoice(times);
    return {
        kind: 'assignment',
        expectedPriority: 'high',
        subject: `Assignment deadline tomorrow at ${dueTime}`,
        bodyLines: [
            'Hi,',
            `This is a reminder to submit your ${moduleCode} ${deliverable} by tomorrow at ${dueTime}.`,
            'Please include all required files and references in your submission.',
            'Late submissions may incur a grade penalty.',
            'Regards,',
            'Module Coordinator',
        ],
    };
}

async function generateRandomSampleEmailsWithZhipu(kinds) {
    const selectedKinds = normalizeCategorizedKinds(kinds);
    const apiKey = process.env.ZHIPU_API_KEY;
    if (!apiKey) {
        return selectedKinds.map(kind => buildFallbackRandomCategorizedEmail(kind));
    }

    const nonce = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const system = `Generate realistic test emails for inbox/task automation QA.
Return JSON only, no markdown.
Schema:
{
  "emails":[
    {
      "kind":"assignment|meeting|bill",
      "subject":"email subject line",
      "bodyLines":["line 1","line 2","line 3"],
      "expectedPriority":"high|medium|low"
    }
  ]
}
Rules:
- Create exactly one email for each requested kind.
- Keep emails realistic and concise (5-8 body lines each).
- Include concrete details (time, amount, module code, room, deadline).
- No markers, no IDs, no test tags, no prefixes like "Adaptive".
- Subjects must differ across emails.
- expectedPriority: bill/urgent deadlines usually high; meetings often medium unless urgent.`;

    const user = `Requested kinds: ${selectedKinds.join(', ')}
Locale timezone hint: Europe/Dublin
Randomization nonce: ${nonce}
Current timestamp: ${new Date().toISOString()}`;

    let data;
    try {
        data = await fetchJson(ZHIPU_CHAT_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: ZHIPU_MODEL,
                temperature: 0.95,
                messages: [
                    { role: 'system', content: system },
                    { role: 'user', content: user },
                ],
            }),
        }, 35000);
    } catch {
        return selectedKinds.map(kind => buildFallbackRandomCategorizedEmail(kind));
    }

    const content = data?.choices?.[0]?.message?.content || '';
    const parsed = extractJsonObject(content);
    const rows = Array.isArray(parsed?.emails) ? parsed.emails : [];
    const byKind = new Map();
    for (const row of rows) {
        const kind = normalizeTestEmailKind(row?.kind, '');
        if (!kind || byKind.has(kind)) continue;
        const subject = String(row?.subject || '').replace(/\s+/g, ' ').trim().slice(0, 180);
        if (!subject) continue;
        byKind.set(kind, {
            kind,
            subject,
            bodyLines: toBodyLines(row?.bodyLines),
            expectedPriority: normalizeExpectedPriority(row?.expectedPriority, kind === 'meeting' ? 'medium' : 'high'),
        });
    }

    return selectedKinds.map(kind => byKind.get(kind) || buildFallbackRandomCategorizedEmail(kind));
}

async function resolveGmailTestRecipient(to, accessToken) {
    const explicit = String(to || process.env.GMAIL_TEST_TO || '').trim();
    if (explicit) return explicit;
    try {
        const profile = await fetchJson(`${GMAIL_API_BASE}/profile`, {
            headers: { Authorization: `Bearer ${accessToken}` },
        }, 12000);
        const selfEmail = String(profile?.emailAddress || '').trim();
        if (selfEmail) return selfEmail;
    } catch {
        // ignore profile lookup failure, we'll throw below
    }
    throw new Error('missing recipient: pass "to" or set GMAIL_TEST_TO in .env');
}

async function sendPlainTextGmail({ accessToken, to, subject, bodyLines }) {
    const lines = Array.isArray(bodyLines) ? bodyLines : [String(bodyLines || '')];
    const rfc822 = [
        `To: ${to}`,
        `Subject: ${subject}`,
        'Content-Type: text/plain; charset="UTF-8"',
        'MIME-Version: 1.0',
        '',
        ...lines,
    ].join('\r\n');
    try {
        return await fetchJson(`${GMAIL_API_BASE}/messages/send`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ raw: encodeBase64UrlUtf8(rfc822) }),
        }, 12000);
    } catch (e) {
        const msg = String(e?.message || '');
        if (/insufficient authentication scopes|insufficient permissions|permission/i.test(msg)) {
            throw new Error('Gmail token lacks send permission. Re-authorize with scope https://www.googleapis.com/auth/gmail.send (or gmail.modify).');
        }
        throw e;
    }
}

async function sendGmailPriorityTestMail({ to, scenario }) {
    const accessToken = await getGmailAccessToken();
    const target = await resolveGmailTestRecipient(to, accessToken);

    const cfg = buildPriorityTestScenario(scenario);
    const subject = cfg.subjectTail;

    const sent = await sendPlainTextGmail({
        accessToken,
        to: target,
        subject,
        bodyLines: [
            `${cfg.body}`,
        ],
    });
    invalidateGmailListCache();

    return {
        to: target,
        subject,
        expectedPriority: cfg.expectedPriority,
        scenario: cfg.scenario,
        messageId: sent?.id || '',
        threadId: sent?.threadId || '',
    };
}

async function gmailGenerateSampleEmails({ to, kinds } = {}) {
    const accessToken = await getGmailAccessToken();
    const target = await resolveGmailTestRecipient(to, accessToken);
    const generated = await generateRandomSampleEmailsWithZhipu(kinds);
    const sent = [];

    for (const cfg of generated) {
        const subject = cfg.subject;
        const message = await sendPlainTextGmail({
            accessToken,
            to: target,
            subject,
            bodyLines: cfg.bodyLines,
        });

        sent.push({
            to: target,
            kind: cfg.kind,
            subject,
            expectedPriority: cfg.expectedPriority,
            messageId: message?.id || '',
            threadId: message?.threadId || '',
        });
    }
    invalidateGmailListCache();

    return {
        to: target,
        sentCount: sent.length,
        sent,
        fetchedAt: new Date().toISOString(),
    };
}

async function gmailPriorityTestFlow({ to, scenario, waitMs } = {}) {
    const sent = await sendGmailPriorityTestMail({ to, scenario });
    const pauseMs = Math.max(1000, Math.min(15000, parseInt(waitMs || '2500', 10) || 2500));
    if (pauseMs > 0) await new Promise(resolve => setTimeout(resolve, pauseMs));

    const query = `newer_than:2d subject:"${sent.subject}"`;
    const fetched = await fetchRecentGmailMessages({ maxResults: 8, query, forceRefresh: true });
    const emails = Array.isArray(fetched?.emails) ? fetched.emails : [];
    const sync = await gmailTasksSync({ maxEmails: 8, gmailQuery: query });

    const exactEmail = emails.find(mail => String(mail.subject || '').trim() === String(sent.subject || '').trim()) || emails[0] || null;
    let matchedTask = null;
    if (exactEmail) {
        matchedTask = (sync.tasks || []).find(t => String(t.sourceEmailId || '') === String(exactEmail.id || '')) || null;
    }
    if (!matchedTask) matchedTask = (sync.tasks || [])[0] || null;

    const pass = {
        taskDetected: Boolean(matchedTask),
        priorityDetected: Boolean(matchedTask?.priority),
        priorityMatch: Boolean(matchedTask?.priority && matchedTask.priority === sent.expectedPriority),
    };

    return {
        sent,
        test: {
            scenario: sent.scenario,
            expectedPriority: sent.expectedPriority,
            queryUsed: query,
            waitMs: pauseMs,
        },
        emailsFound: emails.length,
        tasksDetected: Array.isArray(sync.tasks) ? sync.tasks.length : 0,
        matchedTask,
        pass,
        tasks: sync.tasks || [],
        model: ZHIPU_MODEL,
        fetchedAt: new Date().toISOString(),
    };
}

// ── Main search flows ─────────────────────────────────────────────────────────

// ── Known TCD teaching portals ────────────────────────────────────────────────
// Each entry: { sitemap, base } — sitemap lists all programme pages for that portal.
const TCD_PORTALS = [
    { sitemap: 'https://teaching.scss.tcd.ie/wp-sitemap-posts-page-1.xml', base: 'https://teaching.scss.tcd.ie' },
];

// Pages that are not programme/module listings — skip from search results
const SKIP_RE = /lab-opening|scheduled-lab|loginpress|noticeboard|quick-links|appeals|contact-info|lab-oreilly|lab-trinity|scheduled-lecture|scss-lab|student-area|technical-and-software|elective-module-sample|study-abroad|ugpc|student-support|noticeboard/i;

function slugToTitle(url, base) {
    const path = url.replace(base, '').replace(/^\/|\/$/g, '');
    return path.split('/').pop()
        .replace(/-/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase())
        .replace(/\bM Sc\b/gi, 'M.Sc.')
        .replace(/\bPg\b/g, 'PG');
}

/**
 * Search TCD teaching portals via their sitemaps.
 * Scores pages by how many query words match the URL slug.
 */
async function tcdSearch(courseName) {
    const words = courseName.toLowerCase().split(/\s+/).filter(w => w.length > 1);

    const results = await Promise.allSettled(
        TCD_PORTALS.map(async ({ sitemap, base }) => {
            const xml = await fetchPage(sitemap, 8000);
            const urls = [...xml.matchAll(/<loc>(https[^<]+)<\/loc>/g)].map(m => m[1])
                .filter(u => u !== base + '/' && !SKIP_RE.test(u));

            return urls.map(url => {
                const slug = url.replace(base, '').replace(/\//g, ' ').replace(/-/g, ' ').toLowerCase();
                const score = words.filter(w => slug.includes(w)).length;
                return { url, title: slugToTitle(url, base), snippet: slug.trim(), score };
            }).filter(r => r.score > 0);
        })
    );

    const matches = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
    matches.sort((a, b) => b.score - a.score);

    // Deduplicate
    const seen = new Set();
    const urls = [];
    for (const r of matches) {
        if (seen.has(r.url)) continue;
        seen.add(r.url);
        urls.push({ url: r.url, title: r.title, snippet: r.snippet });
    }

    return { urls: urls.slice(0, 8) };
}

// Only allow https:// requests to tcd.ie domains to prevent SSRF.
const ALLOWED_HOST = /^(?:[\w-]+\.)*tcd\.ie$/i;

/**
 * Fetch a user-supplied URL directly and parse modules from it.
 * Rejects any URL that is not an https://…tcd.ie address.
 */
async function directFetch(url) {
    let parsed;
    try { parsed = new URL(url); } catch { throw new Error('invalid url'); }
    if (parsed.protocol !== 'https:' || !ALLOWED_HOST.test(parsed.hostname)) {
        throw new Error('URL must be an https://tcd.ie domain');
    }
    const html = await fetchPage(url);
    return { modules: parseTCDHtml(html), url };
}

function dashboardStateLoad() {
    const row = selectDashboardStateStmt.get();
    if (!row) return { state: null, updatedAt: null };
    const parsed = safeJson(row.state_json);
    return {
        state: (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : null,
        updatedAt: row.updated_at || null,
    };
}

function dashboardStateSave(state) {
    if (!state || typeof state !== 'object' || Array.isArray(state)) {
        throw new Error('state object required');
    }
    let stateJson = '';
    try {
        stateJson = JSON.stringify(state);
    } catch {
        throw new Error('state must be JSON serializable');
    }
    const bytes = Buffer.byteLength(stateJson, 'utf8');
    if (bytes > DASHBOARD_STATE_MAX_BYTES) {
        throw new Error(`state payload too large (${bytes} > ${DASHBOARD_STATE_MAX_BYTES})`);
    }

    const updatedAt = new Date().toISOString();
    upsertDashboardStateStmt.run(stateJson, updatedAt);
    return { ok: true, updatedAt, bytes };
}

function clampNumber(value, min, max, fallback) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.min(max, Math.max(min, numeric));
}

function sanitizeChatMessages(messages) {
    const safeMessages = Array.isArray(messages) ? messages : [];
    const allowedRoles = new Set(['system', 'user', 'assistant']);
    return safeMessages
        .filter(item => item && typeof item === 'object')
        .map(item => {
            const roleRaw = String(item.role || 'user').toLowerCase();
            const role = allowedRoles.has(roleRaw) ? roleRaw : 'user';
            const content = String(item.content || '').slice(0, 20000);
            return { role, content };
        })
        .filter(item => item.content.trim().length > 0);
}

async function zhipuChatCompletionsProxy({
    messages,
    model,
    temperature,
    max_tokens,
    response_format,
} = {}) {
    const apiKey = String(process.env.ZHIPU_API_KEY || '').trim();
    if (!apiKey) {
        throw new Error('missing ZHIPU_API_KEY');
    }

    const normalizedMessages = sanitizeChatMessages(messages);
    if (!normalizedMessages.length) {
        throw new Error('messages required');
    }

    const selectedModel = String(model || process.env.ZHIPU_MODEL || 'glm-4-flash').trim() || 'glm-4-flash';
    const payload = {
        model: selectedModel,
        messages: normalizedMessages,
        temperature: clampNumber(temperature, 0, 1.5, 0.3),
        max_tokens: Math.round(clampNumber(max_tokens, 64, 2000, 500)),
    };
    if (response_format && response_format.type === 'json_object') {
        payload.response_format = { type: 'json_object' };
    }

    const data = await fetchJson(ZHIPU_CHAT_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
    }, 45000);

    const content = String(data?.choices?.[0]?.message?.content || '').trim();
    if (!content) {
        throw new Error('empty model response');
    }

    return {
        model: data?.model || selectedModel,
        choices: Array.isArray(data?.choices) && data.choices.length > 0
            ? data.choices
            : [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
        usage: data?.usage || null,
    };
}

// ── HTTP server ───────────────────────────────────────────────────────────────

function readBody(req) {
    return new Promise((resolve, reject) => {
        let done = false;
        const fail = (err) => {
            if (done) return;
            done = true;
            reject(err);
        };
        let raw = '';
        req.on('data', c => {
            if (done) return;
            raw += c;
            if (raw.length > MAX_BODY_BYTES) {
                fail(new Error('payload too large'));
                req.destroy();
            }
        });
        req.on('end', () => {
            if (done) return;
            try {
                done = true;
                resolve(JSON.parse(raw || '{}'));
            } catch {
                fail(new Error('bad json'));
            }
        });
        req.on('error', fail);
    });
}

function send(res, status, data) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
}

function parseBooleanFlag(value) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    const text = String(value || '').trim().toLowerCase();
    if (!text) return false;
    return text === '1' || text === 'true' || text === 'yes' || text === 'on';
}

const server = createServer(async (req, res) => {
    if (req.method === 'GET' && (req.url === '/health' || req.url === '/search/health')) {
        res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('ok'); return;
    }
    if (req.method !== 'POST') { res.writeHead(405); res.end(); return; }

    let body;
    try { body = await readBody(req); }
    catch (e) {
        if (String(e?.message || '') === 'payload too large') {
            send(res, 413, { error: 'payload too large' });
        } else {
            send(res, 400, { error: 'bad json' });
        }
        return;
    }

    try {
        if (req.url === '/search') {
            if (!body.q) { send(res, 400, { error: 'q required' }); return; }
            send(res, 200, await tcdSearch(body.q));

        } else if (req.url === '/tcd-direct' || req.url === '/search/tcd-direct') {
            if (!body.url) { send(res, 400, { error: 'url required' }); return; }
            send(res, 200, await directFetch(body.url));

        } else if (req.url === '/gmail-tasks-sync' || req.url === '/search/gmail-tasks-sync') {
            send(res, 200, await gmailTasksSync({
                maxEmails: body.maxEmails,
                gmailQuery: body.gmailQuery,
            }));

        } else if (req.url === '/gmail-emails' || req.url === '/search/gmail-emails') {
            send(res, 200, await gmailEmailsList({
                maxEmails: body.maxEmails,
                gmailQuery: body.gmailQuery,
                forceRefresh: parseBooleanFlag(body.forceRefresh) || parseBooleanFlag(body.refresh) || parseBooleanFlag(body.noCache),
            }));

        } else if (req.url === '/gmail-email-detail' || req.url === '/search/gmail-email-detail') {
            send(res, 200, await gmailEmailDetail({
                id: body.id,
                forceRefresh: parseBooleanFlag(body.forceRefresh) || parseBooleanFlag(body.refresh) || parseBooleanFlag(body.noCache),
            }));

        } else if (req.url === '/gmail-email-to-task' || req.url === '/search/gmail-email-to-task') {
            send(res, 200, await gmailEmailToTask({
                id: body.id,
            }));

        } else if (req.url === '/gmail-email-to-expense' || req.url === '/search/gmail-email-to-expense') {
            send(res, 200, await gmailEmailToExpense({
                id: body.id,
            }));

        } else if (req.url === '/gmail-test-flow' || req.url === '/search/gmail-test-flow') {
            send(res, 200, await gmailPriorityTestFlow({
                to: body.to,
                scenario: body.scenario,
                waitMs: body.waitMs,
            }));

        } else if (req.url === '/gmail-generate-sample-emails' || req.url === '/search/gmail-generate-sample-emails') {
            send(res, 200, await gmailGenerateSampleEmails({
                to: body.to,
                kinds: body.kinds || body.types || body.categories,
            }));

        } else if (req.url === '/weather-geocode' || req.url === '/search/weather-geocode') {
            send(res, 200, await weatherGeocode({
                query: body.query || body.q || body.name,
                count: body.count || body.limit,
            }));

        } else if (req.url === '/weather-current' || req.url === '/search/weather-current') {
            send(res, 200, await weatherCurrent({
                latitude: body.latitude,
                longitude: body.longitude,
                name: body.name,
                country_code: body.country_code || body.countryCode,
            }));

        } else if (req.url === '/chat-completions' || req.url === '/search/chat-completions') {
            send(res, 200, await zhipuChatCompletionsProxy({
                messages: body.messages,
                model: body.model,
                temperature: body.temperature,
                max_tokens: body.max_tokens,
                response_format: body.response_format,
            }));

        } else if (req.url === '/dashboard-state-load' || req.url === '/search/dashboard-state-load') {
            send(res, 200, dashboardStateLoad());

        } else if (req.url === '/dashboard-state-save' || req.url === '/search/dashboard-state-save') {
            send(res, 200, dashboardStateSave(body.state));

        } else {
            res.writeHead(404); res.end();
        }
    } catch (e) {
        console.error('[search] error:', e.message);
        send(res, 502, { error: e.message, modules: [], organic: [] });
    }
});

server.listen(PORT, '127.0.0.1', () => {
    console.log(`[search] Listening on 127.0.0.1:${PORT}`);
    console.log(`[search] Dashboard DB: ${DASHBOARD_DB_PATH}`);
});
