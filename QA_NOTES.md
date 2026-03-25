# QA Notes — Adaptive Student Dashboard

Branch: `qa/testing-and-fixes`
Date: 2026-03-24

---

## Approach

Manual code audit of `frontend/src/App.jsx` covering: input validation, LLM response
handling, state management, edge cases, and memory safety. Fixes applied where the
change was small, safe, and self-contained. Larger issues are documented below for
follow-up PRs or sprint planning.

---

## Fixes Applied in This Branch

| # | Issue | Location | Fix |
|---|-------|----------|-----|
| 1 | `console.log` of raw/parsed LLM output left in production | `callLLM()` L171-173 | Removed both logs |
| 2 | `manualAddTask` accepted empty string tasks | `manualAddTask()` L947 | Added `if (!text.trim()) return` guard |
| 3 | Budget form accepted negative/zero expense amounts | `BudgetPanel.submit()` L638 | Added `parseFloat(amt) <= 0` check |
| 4 | `add_timer` action with 0 minutes created an instant-done timer | `exec()` L990 | Guard: `if (mins > 0)` before creating timer |
| 5 | Unknown LLM action types silently ignored | `exec()` L1010 | Added `console.warn` for unrecognised types |

---

## Known Issues — Not Fixed Here (Needs Separate PRs)

### High Priority

**H1 — No state persistence across page refresh**
All tasks, events, expenses, post-its and settings are held in React state only.
Every refresh resets to hardcoded defaults.
_Fix_: `localStorage` persistence via `useEffect` on each state slice, or an
`IndexedDB`-backed store for larger payloads.

**H2 — LLM requests have no timeout**
If `llama-server` hangs, `fetchLLM()` waits forever. The loading spinner never
resolves and the input is locked.
_Fix_: `Promise.race([fetchLLM(...), new Promise((_, r) => setTimeout(() => r(new Error("Timeout")), 30_000))])`

**H3 — Substring task matching is ambiguous**
`complete_task` and `delete_task` use `.includes()` — "fix" matches "fix bug", "fix
test", "quick fix". First match wins silently.
_Fix_: Prefer exact match; fall back to substring only when one match exists; otherwise
ask the user to clarify.

### Medium Priority

**M1 — JSON parsing fallback is greedy**
`parseResponse()` uses `/\{[\s\S]*\}/` as a fallback regex. If the LLM wraps the JSON
in a sentence that contains a second `{`, the regex captures the wrong block.
_Fix_: Walk the string character-by-character to find the first balanced `{}` block.

**M2 — `callAmbientLLM` fires on every manual widget action**
`manualAddTask` and `manualAddEvent` each fire `callAmbientLLM` unconditionally,
meaning 2 LLM requests per user interaction when `llama-server` is already busy with
the main chat call. On slow hardware this queues up and causes noticeable lag.
_Fix_: Debounce ambient calls; skip if a main call is already in flight.

**M3 — `useDraggable` leaks event listeners if component unmounts during drag**
`mousemove`/`mouseup` are added to `window` but only removed inside the `mouseup`
handler. If a widget is closed (e.g. via × button) mid-drag, listeners persist.
_Fix_: Track active listeners in a `useRef` and clean up in a `useEffect` cleanup.

**M4 — Weather widget has no fetch timeout**
Both `useEffect` blocks in `WeatherWidget` can hang indefinitely if Open-Meteo is
slow. No timeout is set.
_Fix_: Wrap each fetch in `Promise.race` with a 10-second timeout.

**M5 — Post-it / EditableText paste at char limit silently drops content**
`onChange` truncates via `maxLength` but pasting a large block of text at the limit
fails without any user-visible message.
_Fix_: `onPaste` handler that checks remaining capacity and shows a brief warning.

### Low Priority

**L1 — Calendar allows events in the past without warning**
No date validation in the manual event form or in the LLM `add_event` handler.
_Fix_: Warn (not block) when date < today.

**L2 — Budget `set_budget` via LLM accepts 0 or negative values**
`exec()` does `Number(a.amount) || 0` — a value of 0 is falsy so it falls through to
0, disabling the budget bar.
_Fix_: `if (Number(a.amount) > 0) setBudgetVal(...)`.

**L3 — `manualAddEvent` has no title validation**
Empty string title is accepted and renders as a blank calendar entry.
_Fix_: Add `if (!title.trim()) return` guard (same pattern as `manualAddTask`).

**L4 — Calendar date defaults silently when field is empty**
`submitEvent()` defaults to today with no warning when the date field is blank.
_Fix_: Either require the field or show "Defaulting to today" hint text.

---

## Testing Checklist (Manual)

Use this before merging any future feature PR:

- [ ] Add a task via the input form → appears in task list
- [ ] Add a task via LLM ("add a task: ...") → appears
- [ ] Mark a task done via checkbox and via LLM ("check off X")
- [ ] Add an event via form and via LLM → appears on calendar
- [ ] Add an expense with a negative amount → should be rejected
- [ ] Add an expense via form → budget bar updates
- [ ] Drag every panel type into the header area → should be blocked
- [ ] Drag a panel, close it, reopen → appears at default position (expected)
- [ ] Type in weather city → suggestions appear → pick one → weather loads
- [ ] Send a message while LLM is loading → second send should be blocked
- [ ] Change theme via LLM ("make it cozy") → background and accent update
- [ ] Add a post-it via LLM → appears, is draggable, editable
- [ ] Add a timer via LLM with 0 minutes → should not create a timer
- [ ] Refresh the page → note that all data resets (known issue H1)
- [ ] Kill llama-server mid-request → error message appears in chat (not a hang)

---

## Ideas for Future Improvements

- **LocalStorage persistence** (H1 above) — highest user-visible impact
- **Export to PDF/CSV** — tasks + expenses for end-of-week review
- **Recurring events** — weekly lectures, etc.
- **Multi-city weather** — pin more than one location
- **Offline detection** — show a banner when the LLM server is unreachable rather
  than waiting for a timeout
- **Keyboard shortcut to focus chat** — e.g. `/` to jump to input
