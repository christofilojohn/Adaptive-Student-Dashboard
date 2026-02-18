// Netlify serverless function — proxies requests to Gemini Flash 2.5
// Env vars needed:
//   GEMINI_API_KEY     — your Google AI Studio key
//   PASSPHRASE_HASH   — SHA-256 hex of your passphrase

export default async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("", { status: 204, headers: corsHeaders() });
    }
    if (req.method !== "POST") {
        return json({ error: "POST only" }, 405);
    }

    try {
        const body = await req.json();
        const { passphraseHash, systemPrompt, userMsg, maxTokens = 500 } = body;

        // Validate passphrase
        const expected = process.env.PASSPHRASE_HASH;
        if (!expected || passphraseHash !== expected) {
            return json({ error: "Invalid passphrase" }, 403);
        }

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return json({ error: "GEMINI_API_KEY not configured" }, 500);
        }

        // Call Gemini Flash 2.5 (gemini-2.5-flash-preview-05-20)
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;

        const geminiBody = {
            contents: [
                { role: "user", parts: [{ text: `${systemPrompt}\n\nUser message: ${userMsg}` }] }
            ],
            generationConfig: {
                temperature: 0.3,
                maxOutputTokens: maxTokens,
                responseMimeType: "application/json",
            },
        };

        const r = await fetch(geminiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(geminiBody),
        });

        const data = await r.json();

        // Extract text from Gemini response
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";

        return json({ content: text });
    } catch (e) {
        console.error("LLM proxy error:", e);
        return json({ error: e.message }, 500);
    }
};

function json(obj, status = 200) {
    return new Response(JSON.stringify(obj), {
        status,
        headers: { "Content-Type": "application/json", ...corsHeaders() },
    });
}

function corsHeaders() {
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
    };
}

export const config = { path: "/api/llm" };
