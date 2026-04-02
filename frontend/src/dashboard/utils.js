const HAS_EMOJI = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u;
const EMOJI_MAP = [
    [/\b(meet|call|zoom|standup|sync|huddle)\b/i, "📞"],
    [/\b(lunch|dinner|eat|food|restaurant|cook|recipe|breakfast)\b/i, "🍽️"],
    [/\b(coffee|cafe|latte|espresso)\b/i, "☕"],
    [/\b(gym|exercise|workout|run|jog|fitness|yoga|swim)\b/i, "💪"],
    [/\b(doctor|dentist|hospital|health|medical|checkup|appointment)\b/i, "🏥"],
    [/\b(deploy|ship|release|launch|production|hotfix)\b/i, "🚀"],
    [/\b(bug|fix|debug|error|crash)\b/i, "🐛"],
    [/\b(code|develop|program|build|implement|refactor)\b/i, "💻"],
    [/\b(design|sketch|figma|ui|ux|wireframe|prototype)\b/i, "🎨"],
    [/\b(write|draft|blog|article|essay|report|document)\b/i, "✍️"],
    [/\b(review|feedback|check|audit|inspect|proofread)\b/i, "🔍"],
    [/\b(email|mail|inbox|send|reply|message)\b/i, "📧"],
    [/\b(buy|shop|order|purchase|store|grocery|groceries)\b/i, "🛒"],
    [/\b(travel|flight|trip|hotel|vacation|airport|train)\b/i, "✈️"],
    [/\b(learn|study|course|class|read|book|research)\b/i, "📚"],
    [/\b(money|pay|bill|invoice|budget|tax|salary|bank)\b/i, "💰"],
    [/\b(clean|organize|tidy|laundry|vacuum|wash)\b/i, "🧹"],
    [/\b(birthday|party|celebrate|cake|gift|anniversary)\b/i, "🎂"],
    [/\b(plan|strategy|roadmap|brainstorm|think)\b/i, "🧠"],
    [/\b(present|slides|deck|powerpoint|keynote|pitch)\b/i, "📊"],
    [/\b(test|qa|quality|spec|validate)\b/i, "🧪"],
    [/\b(team|hire|interview|onboard|people|hr)\b/i, "👥"],
    [/\b(urgent|asap|critical|emergency|deadline)\b/i, "🔴"],
    [/\b(car|drive|garage|mechanic|oil|tire)\b/i, "🚗"],
    [/\b(pet|dog|cat|vet|walk)\b/i, "🐾"],
    [/\b(music|song|playlist|concert|guitar|piano)\b/i, "🎵"],
    [/\b(movie|film|watch|netflix|cinema|show)\b/i, "🎬"],
    [/\b(game|play|gaming)\b/i, "🎮"],
    [/\b(photo|picture|camera|shoot)\b/i, "📸"],
    [/\b(plant|garden|water|flower)\b/i, "🌱"],
    [/\b(sleep|rest|nap|relax|chill)\b/i, "😴"],
    [/\b(idea|creative|brainstorm|inspiration)\b/i, "💡"],
];

const LENNY_MOODS = [
    { id: "cozy", face: "( ˘ ω ˘ )", label: "cozy" },
    { id: "focus", face: "( •̀ᴗ•́ )", label: "locked in" },
    { id: "productive", face: "( •̀ᴗ•́ )و", label: "on it" },
    { id: "energetic", face: "( ᗒ ᗨᗕ )", label: "hyped!" },
    { id: "happy", face: "( ◠‿◠ )", label: "happy" },
    { id: "calm", face: "( ◡ ‿ ◡ )", label: "at peace" },
    { id: "creative", face: "( ☆ ᗜ ☆ )", label: "inspired" },
    { id: "dreamy", face: "( ᵕ ꈊ ᵕ )", label: "dreamy" },
    { id: "sleepy", face: "( ᴗ_ᴗ。)", label: "zzz" },
    { id: "chill", face: "( ‾́ ◡ ‾́ )", label: "vibing" },
    { id: "mysterious", face: "( ¬‿¬ )", label: "hmm..." },
    { id: "intense", face: "( ⊙ᗜ⊙ )", label: "intense" },
    { id: "romantic", face: "( ♡ ᴗ ♡ )", label: "lovely" },
    { id: "sad", face: "( ◞‸◟ )", label: "aw" },
    { id: "stressed", face: "( ⊙﹏⊙ )", label: "eep" },
    { id: "proud", face: "( ˙▿˙ )b", label: "nailed it" },
    { id: "curious", face: "( ᐛ )", label: "curious" },
    { id: "playful", face: "( ˙ᗜ˙ )", label: "wheee" },
    { id: "ocean", face: "( ≧ᗜ≦ )~", label: "wave~" },
    { id: "nature", face: "( ᵔ ᵕ ᵔ )", label: "nature" },
    { id: "sunset", face: "( ◠ ꈊ ◠ )", label: "golden" },
    { id: "neutral", face: "( ˘ ᵕ ˘ )", label: "chillin" },
];

const MOOD_RULES = [
    { mood: "proud", pattern: /\b(done|finished|completed|check off|nailed|shipped|deployed|crushed)\b/i, actionBoost: ["complete_task"] },
    { mood: "stressed", pattern: /\b(stress|anxious|worried|panic|overwhelm|deadline|urgent|asap|behind)\b/i },
    { mood: "sad", pattern: /\b(sad|upset|bad day|terrible|awful|depressed|lonely|miss|lost)\b/i },
    { mood: "energetic", pattern: /\b(excited|hyped|amazing|awesome|fantastic|pumped|let'?s go|fire|hell yeah|insane)\b/i },
    { mood: "happy", pattern: /\b(happy|great|wonderful|love it|perfect|yay|nice|good news|celebrate)\b/i },
    { mood: "romantic", pattern: /\b(love|date|anniversary|valentine|romantic|heart|wedding|partner)\b/i },
    { mood: "cozy", pattern: /\b(cozy|cosy|warm|comfort|snug|blanket|candle|tea|fireplace|hygge|homey)\b/i },
    { mood: "focus", pattern: /\b(focus|concentrate|deep work|grind|lock in|study|exam|pomodoro|timer)\b/i, actionBoost: ["add_timer"] },
    { mood: "creative", pattern: /\b(creat|design|art|sketch|paint|draw|brainstorm|inspir|imagin|idea|write|draft|blog)\b/i },
    { mood: "sleepy", pattern: /\b(sleep|tired|exhaust|nap|rest|bedtime|late night|insomnia|zzz)\b/i },
    { mood: "chill", pattern: /\b(chill|relax|laid back|vibe|mellow|easy|no rush|take it easy|wind down)\b/i },
    { mood: "curious", pattern: /\b(wonder|curious|what if|how does|why|interest|explore|discover|learn)\b/i },
    { mood: "playful", pattern: /\b(fun|play|game|silly|goofy|party|joke|lol|haha|😂|🎉)\b/i },
    { mood: "intense", pattern: /\b(intense|serious|critical|important|power|determined|no excuses|push)\b/i },
    { mood: "mysterious", pattern: /\b(mysteri|dark|midnight|shadow|secret|enigma|noir|spooky)\b/i },
    { mood: "ocean", pattern: /\b(ocean|sea|water|wave|beach|surf|coast|marine|island)\b/i },
    { mood: "nature", pattern: /\b(forest|nature|green|earth|garden|tree|plant|hike|mountain|outdoor)\b/i },
    { mood: "sunset", pattern: /\b(sunset|sunrise|golden|dusk|twilight|dawn|horizon|sky)\b/i },
    { mood: "dreamy", pattern: /\b(dream|whimsical|fantasy|magic|wonder|fairy|starry|wish)\b/i },
    { mood: "calm", pattern: /\b(calm|serene|peaceful|tranquil|zen|meditat|mindful|breathe|quiet)\b/i },
    { mood: "productive", pattern: /\b(productive|efficient|organize|plan|schedule|manage|priorit|todo|task)\b/i, actionBoost: ["add_task", "split_task"] },
];

export const toLocalDateStr = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
};

export function guessEmoji(text) {
    if (!text || HAS_EMOJI.test(text)) return "";
    for (const [re, em] of EMOJI_MAP) {
        if (re.test(text)) return em;
    }
    return "";
}

export function buildDateContext() {
    const now = new Date();
    const iso = (d) => toLocalDateStr(d);
    const dn = (d) => ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][d.getDay()];
    const ad = (d, n) => {
        const r = new Date(d);
        r.setDate(r.getDate() + n);
        return r;
    };
    const dow = now.getDay();
    const names = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    const tw = {};
    const nw = {};
    for (let i = 0; i < 7; i++) {
        const du = (i - dow + 7) % 7;
        tw[names[i]] = iso(ad(now, du === 0 && i !== dow ? 7 : du));
        nw[names[i]] = iso(ad(now, du + 7));
    }
    return `DATE REFERENCE:\nToday: ${iso(now)} (${dn(now)})\nTomorrow: ${iso(ad(now, 1))} (${dn(ad(now, 1))})\nThis week: ${names.map(n => `this ${n}=${tw[n]}`).join(", ")}\nNext week: ${names.map(n => `next ${n}=${nw[n]}`).join(", ")}\nUse these exact dates for "tomorrow", "this wednesday", "next friday", etc.`;
}

export function inferMood(userText, actions) {
    const text = (userText || "").toLowerCase();
    const actionTypes = (actions || []).map(a => a.type);
    let best = null;
    let bestScore = 0;

    for (const rule of MOOD_RULES) {
        let score = 0;
        if (text.match(rule.pattern)) score += 2;
        if (rule.actionBoost && rule.actionBoost.some(a => actionTypes.includes(a))) score += 1.5;
        if (score > bestScore) {
            bestScore = score;
            best = rule.mood;
        }
    }

    for (const a of (actions || [])) {
        if (a.type === "change_theme") {
            const themeMap = { cozy: "cozy", focus: "focus", ocean: "ocean", sunset: "sunset", forest: "nature", midnight: "mysterious", minimal: "calm" };
            if (themeMap[a.theme]) return themeMap[a.theme];
        }
    }

    return best || null;
}

export function getLennyByMood(moodId) {
    return LENNY_MOODS.find(m => m.id === moodId) || LENNY_MOODS[LENNY_MOODS.length - 1];
}
