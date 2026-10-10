# walkthrough.json

`show.mjs` validates the file strictly: unknown keys are errors, and every error names its JSON path. Text fields are Markdown: paragraphs, lists, `code`, **bold**, *italics*, `[label](https://…)` and `[label](#anchor-id)`. Raw HTML is not rendered.

## Shape

```jsonc
{
  "title": "Per-client rate limiting",              // the page title
  "changeId": "a1b2c3d4e5f6",                       // optional; must equal change.json "id"
  "overview": {                                     // shown when no file is selected
    "title": "Every client gets a token bucket",     // a sentence that states the idea
    "explanation": "What changed, why, how the parts connect. 2-4 short paragraphs.",
    "diagrams": [Diagram],                          // optional, 1-6
    "decisions": [{ "title": "…", "choice": "…", "alternatives": "…", "tradeoff": "…" }], // optional, 1-12
    "remember": "One line worth keeping.",          // optional, max 300 chars
    "quiz": [{ "prompt": "…", "options": ["…", "…"], "correct": 1, "answer": "Why." }],  // optional, 1-12; correct is zero-based
    "notes": [Note]                                 // optional, max 3; lines need a path here
  },
  "files": [                                        // flow order; each changed path at most once
    {
      "path": "ratelimit/limiter.go",               // exactly as in change.json (bundles have a repo prefix)
      "role": "The bucket: lazy refill under one mutex",   // its job in the flow, not its filename
      "explanation": "1-2 short paragraphs: the file's job and key decision. Link ranges like [the refill](#refill).",
      "anchors": [{ "id": "refill", "side": "after", "startLine": 41, "endLine": 43, "note": "Refill by elapsed time" }],
      "tour": [{ "lines": { "start": 31, "end": 33 }, "title": "One lock per call", "text": "What this block does and why." }],
      "diagram": Diagram,                           // optional
      "remember": "…",                              // optional
      "notes": [Note],                              // optional, max 3
      "isTest": false                               // optional; overrides capture's test heuristic
    }
  ]
}
```

**Anchor:** `{ id?, side?, startLine, endLine, note? }`.
- `side` is `"after"` (the default; for `+` and context rows) or `"before"` (for `-` rows).
- `startLine` and `endLine` must both be rows printed by `--show`.
- `id` is a lowercase slug. Explanations may only link ids of their own file's anchors; the overview has no anchors.
- Each anchor is also listed under the explanation as a line link, labelled with its `note`.

**Tour:** the code walkthrough of one file, as `[{ lines: { start, end, side? }, title?, text }]`, at most 40 steps.
- **Who gets one.** Every non-test source file gets a tour that covers every meaningful changed hunk. Tests, docs and config get no tour, only their one-line explanation.
- **What a step explains.** Each step is one block of the diff, usually 3-25 lines. Explain what it does and why it is written this way: the control flow, edge cases and failure modes, and what breaks if it changes. 2-5 sentences. Don't narrate syntax line by line; idioms belong in Learn notes.
- **Rules.** Steps follow the diff in order and must not overlap. `start` and `end` must be rows printed by `--show`, and `side` defaults to `"after"`. The validator warns about changed hunks no step covers.
- **Where it renders.** The tour appears as numbered steps under the explanation, which becomes the file's short summary. The reader walks the steps with `n`/`p`.

**Note (Learn):** `{ title, body, code?, lang?, vs?, vsLang?, lines? }`.
- `body` is 1-3 sentences.
- `code` is the idiom in the language being learned; `vs` is the same task in a language the reader knows. Each is at most 20 lines, and `vs` requires `code`.
- `lang` and `vsLang` label the two samples (e.g. "Go", "TypeScript").
- `lines` is `{ path?, side?, startLine, endLine }` in this file's diff.
- Write a note only for a concept from the profile's `learning` list that appears in the diff. Don't repeat a concept already noted, and skip anything basic.

**Diagram:** `{ html, script?, caption?, height? }`. See the rules below.

Files you leave out appear last under "Not explained". The validator warns about unexplained non-test files.

## Minimal example

```json
{
  "title": "Clamp discounts",
  "overview": {
    "title": "Bad discounts now mean no discount",
    "explanation": "`Total` takes a percentage and clamps anything outside 0-100 to zero, so a bad caller can't produce a negative price.",
    "quiz": [{ "prompt": "Total([100], 150)?", "options": ["0", "100", "-50"], "correct": 1, "answer": "150 is out of range, so the discount becomes 0." }]
  },
  "files": [
    {
      "path": "cart.go",
      "role": "Clamp, then discount",
      "explanation": "The [guard](#clamp) runs before the arithmetic, so the subtraction never sees a bad value.",
      "anchors": [{ "id": "clamp", "startLine": 9, "endLine": 11, "note": "Clamp out-of-range discounts" }],
      "tour": [
        { "lines": { "start": 3, "end": 4 }, "title": "A new parameter", "text": "Every caller must now pass a discount; the compiler finds the ones that don't." },
        { "lines": { "start": 9, "end": 12 }, "title": "Clamp, then subtract", "text": "Out-of-range values become 0 instead of an error, so a bad caller silently gets full price. Integer division truncates, so 10% of 155 cents is 15." }
      ]
    },
    { "path": "cart_test.go", "role": "Proof", "explanation": "One case: 150 cents at 10% is 135." }
  ]
}
```

## Diagrams

Add a diagram only when something moves: a request path, a state machine, ordering, a race, a before/after comparison.

**How it renders.** `html` is a fragment of hand-made inline SVG and plain HTML controls; `script` is small vanilla JavaScript. Both run in an iframe with `sandbox="allow-scripts"`, which means:
- no network, storage or parent access;
- no external assets and no frameworks;
- inline event attributes (`onclick=`) don't run, so wire events in `script`.

**Helpers.** The iframe includes the visual-lessons styles and the `Viz` helper:
- `Viz.seg(el, fn)` wires a `.seg` toggle: `<div class="seg" role="group" aria-label="…"><button data-v="a" aria-pressed="true">A</button><button data-v="b" aria-pressed="false">B</button></div>` calls `fn("a")` or `fn("b")`.
- `Viz.reduced` is `true` when the reader prefers reduced motion. Skip the animation then, and show the final state.
- Markup: `<figure class="viz">`, with controls in `<div class="viz-top">`, a `.seg`, and a `<button class="play">▶ Play</button>`. Use `<p class="viz-caption">` for captions and `<div class="cards">` of `<div class="card ok|bad"><h4>…</h4><p>…</p></div>` for outcomes.

**Rules.**
- **One variable per toggle:** under vs over the limit, burst 10 vs burst 3, with vs without the lock.
- **The resting state is complete.** Play only animates the same mechanism.
- **Readable at about 600px wide.** Use `viewBox` widths around 600, SVG text of 13-18 units, short labels and real arrowheads.
- **Repeat each outcome as HTML** (`.cards` with `aria-live="polite"`) so phones can read it.
- **Calm, light palette:**

  | Role | Colour |
  | --- | --- |
  | Ink | `#1a1a1a` |
  | Muted | `#4d4d4d` |
  | Teal accent | `#0f4c5c` on `#e9f0f2` |
  | OK | `#2d6a4f` on `#e3f1e8` |
  | Bad | `#a8322b` on `#f8e1de` |
  | Neutral | `#f4f4f2`, border `#cfcfc9` |

- **No purple anywhere.**
- **Drive it with the change's real numbers or logic**, and label simplified models as simplified.

```html
<figure class="viz">
  <div class="viz-top">
    <div class="seg" role="group" aria-label="Load"><button data-v="under" aria-pressed="true">Under the limit</button><button data-v="over" aria-pressed="false">Over the limit</button></div>
  </div>
  <svg viewBox="0 0 600 120" role="img" aria-label="Request outcome"><text id="out" x="300" y="60" text-anchor="middle" font-size="16">200 OK</text></svg>
  <div class="cards" aria-live="polite"></div>
</figure>
```

```js
Viz.seg(document.querySelector(".seg"), (v) => {
  document.getElementById("out").textContent = v === "over" ? "429 · Retry-After: 1" : "200 OK";
});
```
