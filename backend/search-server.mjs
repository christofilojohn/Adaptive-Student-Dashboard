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
 */

import { createServer } from 'http';

const PORT = parseInt(process.env.SEARCH_PORT || '8082', 10);
const UA   = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const HDR  = { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml', 'Accept-Language': 'en-IE,en;q=0.9' };

// ── HTML helpers ──────────────────────────────────────────────────────────────

const stripTags = s =>
    s .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;/g, "'")
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
      .replace(/&#8211;/g, '–').replace(/&#8212;/g, '—').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
      .replace(/\s+/g, ' ').trim();

const removeElements = (html, ...tags) =>
    tags.reduce((h, t) => h.replace(new RegExp(`<${t}[\\s\\S]*?<\\/${t}>`, 'gi'), ''), html);

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

        mods.push({ code, name, credits: credits ? parseInt(credits) : 5, semester: sem, moduleType: 'lecture' });
    }

    return mods;
}


// ── Page fetch ────────────────────────────────────────────────────────────────

async function fetchPage(url, ms = 10000) {
    const res = await fetch(url, { headers: HDR, redirect: 'follow', signal: AbortSignal.timeout(ms) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
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

/**
 * Fetch a user-supplied URL directly and parse modules from it.
 */
async function directFetch(url) {
    const html = await fetchPage(url);
    return { modules: parseTCDHtml(html), url };
}

// ── HTTP server ───────────────────────────────────────────────────────────────

function readBody(req) {
    return new Promise((resolve, reject) => {
        let raw = '';
        req.on('data', c => { raw += c; if (raw.length > 8192) req.destroy(); });
        req.on('end',  () => { try { resolve(JSON.parse(raw || '{}')); } catch { reject(new Error('bad json')); } });
        req.on('error', reject);
    });
}

function send(res, status, data) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
}

const server = createServer(async (req, res) => {
    if (req.method === 'GET' && (req.url === '/health' || req.url === '/search/health')) {
        res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('ok'); return;
    }
    if (req.method !== 'POST') { res.writeHead(405); res.end(); return; }

    let body;
    try { body = await readBody(req); }
    catch { res.writeHead(400); res.end(); return; }

    try {
        if (req.url === '/search') {
            if (!body.q) { send(res, 400, { error: 'q required' }); return; }
            send(res, 200, await tcdSearch(body.q, body.maxPages || 4));

        } else if (req.url === '/tcd-direct' || req.url === '/search/tcd-direct') {
            if (!body.url) { send(res, 400, { error: 'url required' }); return; }
            send(res, 200, await directFetch(body.url));

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
});
