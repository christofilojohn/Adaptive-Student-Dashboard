#!/usr/bin/env node
// Usage: node generate-hash.mjs "your-passphrase"
// Then set PASSPHRASE_HASH in Netlify env vars to the output

const phrase = process.argv[2];
if (!phrase) { console.error("Usage: node generate-hash.mjs \"your-passphrase\""); process.exit(1); }

const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(phrase));
const hash = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
console.log(`\nPassphrase: "${phrase}"`);
console.log(`SHA-256:    ${hash}`);
console.log(`\nSet this in Netlify → Site settings → Environment variables:`);
console.log(`  PASSPHRASE_HASH = ${hash}`);
console.log(`  GEMINI_API_KEY  = (your Google AI Studio key)\n`);
