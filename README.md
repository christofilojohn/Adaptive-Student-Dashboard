# Adaptive Dashboard — Netlify + Gemini Flash

LLM-powered dashboard with passphrase protection, powered by Gemini 2.5 Flash.

## Setup

### 1. Generate your passphrase hash

```bash
node generate-hash.mjs "your-secret-passphrase"
```

### 2. Set Netlify environment variables

Go to **Site settings → Environment variables** and add:

| Variable | Value |
|---|---|
| `GEMINI_API_KEY` | Your Google AI Studio API key |
| `PASSPHRASE_HASH` | SHA-256 hash from step 1 |

### 3. Deploy

```bash
# Link to Netlify (first time)
npx netlify-cli link

# Deploy
npx netlify-cli deploy --build --prod
```

Or connect your Git repo to Netlify for auto-deploy.

## Architecture

```
Browser → Passphrase Gate → Dashboard
                ↓ (on chat)
         /api/llm (Netlify Function)
                ↓
     Validates hash → Gemini Flash 2.5 API
```

- API key never leaves the server
- Passphrase is hashed client-side with SHA-256, compared server-side
- No auth tokens stored — passphrase checked per-request
