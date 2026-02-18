// Netlify serverless function — proxies requests to Gemini Flash
// Env vars needed:
//   GEMINI_API_KEY     — your Google AI Studio key
//   PASSPHRASE_HASH   — SHA-256 hex of your passphrase
//   GEMINI_MODEL       — (optional) defaults to gemini-2.0-flash

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

        const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        const geminiBody = {
            system_instruction: {
                parts: [{ text: systemPrompt }]
            },
            contents: [
                { role: "user", parts: [{ text: userMsg }] }
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

        if (data.error) {
            console.error("Gemini API error:", JSON.stringify(data.error));
            return json({ error: data.error.message || "Gemini API error" }, 502);
        }

        // Extract text — thinking models may have thought parts before the real output
        let text = "{}";
        const parts = data?.candidates?.[0]?.content?.parts;
        if (parts && parts.length > 0) {
            for (let i = parts.length - 1; i >= 0; i--) {
                if (parts[i].text) {
                    text = parts[i].text;
                    break;
                }
            }
        }

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
