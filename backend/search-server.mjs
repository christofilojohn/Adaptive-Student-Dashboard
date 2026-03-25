#!/usr/bin/env node
/**
 * Lightweight on-device web search server.
 * Scrapes DuckDuckGo HTML results server-side — no API key, no external SDK.
 * Requires Node.js 18+ (built-in fetch).
 *
 * Endpoints:
 *   GET  /health  → 200 "ok"
 *   POST /search  → { q: "...", num?: 10 }  →  { organic: [{title, snippet}] }
 *
 * Bound to 127.0.0.1 only — not exposed directly to the network.
 * Proxied by Vite (/search) in dev and by Nginx (/search) in production.
 */

import { createServer } from 'http';

const PORT = parseInt(process.env.SEARCH_PORT || '8082', 10);
const DDG_ENDPOINT = 'https://html.duckduckgo.com/html/';

const stripTags = s =>
    s.replace(/<[^>]+>/g, '')
     .replace(/&amp;/g,  '&')
     .replace(/&quot;/g, '"')
     .replace(/&#x27;/g, "'")
     .replace(/&lt;/g,   '<')
     .replace(/&gt;/g,   '>')
     .replace(/\s+/g,    ' ')
     .trim();

async function ddgSearch(query, maxResults = 10) {
    const params = new URLSearchParams({ q: query, kl: 'ie-en' });
    const res = await fetch(`${DDG_ENDPOINT}?${params}`, {
        headers: {
            'User-Agent':      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept':          'text/html,application/xhtml+xml',
            'Accept-Language': 'en-IE,en;q=0.9',
        },
        redirect: 'follow',
    });
    if (!res.ok) throw new Error(`DuckDuckGo returned ${res.status}`);
    const html = await res.text();
    return parseDDGHtml(html, maxResults);
}

function parseDDGHtml(html, maxResults) {
    const titleRe   = /<a\s[^>]*class="result__a"[^>]*>([\s\S]*?)<\/a>/g;
    const snippetRe = /<a\s[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;

    const titles   = [...html.matchAll(titleRe)]  .map(m => stripTags(m[1]));
    const snippets = [...html.matchAll(snippetRe)].map(m => stripTags(m[1]));

    const results = [];
    for (let i = 0; i < Math.min(titles.length, snippets.length, maxResults); i++) {
        if (titles[i] && snippets[i]) results.push({ title: titles[i], snippet: snippets[i] });
    }
    return { organic: results };
}

// ── HTTP server ──────────────────────────────────────────────────────────────

const server = createServer(async (req, res) => {
    // Health check (used by start.sh and supervisord)
    if (req.method === 'GET' && req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('ok');
        return;
    }

    if (req.method !== 'POST' || req.url !== '/search') {
        res.writeHead(404);
        res.end();
        return;
    }

    // Read body (max 2 KB)
    let raw = '';
    req.on('data', chunk => {
        raw += chunk;
        if (raw.length > 2048) req.destroy();
    });
    req.on('end', async () => {
        let body;
        try { body = JSON.parse(raw || '{}'); }
        catch { res.writeHead(400); res.end(); return; }

        try {
            const result = await ddgSearch(body.q || '', body.num || 10);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
        } catch (e) {
            console.error('[search] fetch error:', e.message);
            res.writeHead(502, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message, organic: [] }));
        }
    });
});

server.listen(PORT, '127.0.0.1', () => {
    console.log(`[search] Listening on 127.0.0.1:${PORT}`);
});
