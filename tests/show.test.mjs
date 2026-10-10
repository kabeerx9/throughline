import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { render } from "../skills/throughline/scripts/show.mjs";
import { root, run, tempDir } from "./helpers.mjs";

const viewer = readFileSync(join(root, "skills/throughline/viewer/viewer.html"), "utf8");
const demo = join(root, "examples/rate-limiter");
const data = {
  change: JSON.parse(readFileSync(join(demo, "change.json"), "utf8")),
  walkthrough: JSON.parse(readFileSync(join(demo, "walkthrough.json"), "utf8")),
  profile: { knows: ["TypeScript"], learning: ["Go"] },
};
// XML namespace identifiers are names, not requests.
const NAMESPACES = ["http://www.w3.org/2000/svg", "http://www.w3.org/1999/xhtml", "http://www.w3.org/1998/Math/MathML", "http://www.w3.org/1999/xlink"];
export function externalUrls(html) {
  let text = html;
  for (const ns of NAMESPACES) text = text.split(ns).join("");
  return [...text.matchAll(/\b(?:https?:)?\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)+[^\s"'<>)]*/gi)].map((m) => m[0]);
}

test("the built viewer is one self-contained file", () => {
  assert.ok(viewer.length < 400_000, `viewer is ${viewer.length} bytes`);
  assert.deepEqual(externalUrls(viewer), []);
  assert.doesNotMatch(viewer, /<script[^>]+src=/i);
  assert.doesNotMatch(viewer, /<link[^>]+rel="?stylesheet/i);
  assert.doesNotMatch(viewer, /@import/);
});

test("render embeds the data safely and sets the title", () => {
  const evil = structuredClone(data);
  evil.walkthrough.files[0].explanation = "</script><script>alert(1)</script> $& $1";
  evil.walkthrough.title = "A <b>title</b> & more";
  const html = render(evil, viewer);
  assert.equal((html.match(/<\/script>/g) || []).length, (viewer.match(/<\/script>/g) || []).length, "no extra script closers");
  const json = html.match(/<script type="application\/json" id="throughline-data">([\s\S]*?)<\/script>/)[1];
  const parsed = JSON.parse(json);
  assert.equal(parsed.walkthrough.files[0].explanation, "</script><script>alert(1)</script> $& $1");
  assert.deepEqual(parsed.profile, data.profile);
  assert.match(html, /<title>A &lt;b&gt;title&lt;\/b&gt; &amp; more · Throughline<\/title>/);
  assert.deepEqual(externalUrls(html.replace(json, "")), []);
});

test("only vscode:// links leave the page", () => {
  const html = render(data, viewer);
  assert.deepEqual(externalUrls(html), [], "demo data has no web URLs");
  assert.match(viewer, /vscode:\/\/file/);
});

test("show.mjs validates, writes throughline.html and skips opening", () => {
  const dir = tempDir();
  cpSync(join(demo, "change.json"), join(dir, "change.json"));
  cpSync(join(demo, "walkthrough.json"), join(dir, "walkthrough.json"));
  const env = { ...process.env, THROUGHLINE_CONFIG_DIR: tempDir() };
  const ok = run("show.mjs", [dir, "--no-open"], { env });
  assert.equal(ok.code, 0, ok.stdout + ok.stderr);
  assert.equal(ok.stdout.trim(), join(dir, "throughline.html"));
  assert.ok(readFileSync(join(dir, "throughline.html"), "utf8").includes('"changeId":"demo-notes-rate-limit"'));

  const w = JSON.parse(readFileSync(join(dir, "walkthrough.json"), "utf8"));
  w.overview.quiz[0].correct = 9;
  writeFileSync(join(dir, "walkthrough.json"), JSON.stringify(w));
  const bad = run("show.mjs", [dir, "--no-open"], { env });
  assert.equal(bad.code, 1);
  assert.match(bad.stdout, /error: walkthrough\.overview\.quiz\[0\]\.correct/);
});

test("show.mjs reports a missing walkthrough", () => {
  const dir = tempDir();
  cpSync(join(demo, "change.json"), join(dir, "change.json"));
  const r = run("show.mjs", [dir, "--no-open"]);
  assert.equal(r.code, 2);
  assert.match(r.stderr, /walkthrough\.json: missing/);
  assert.equal(existsSync(join(dir, "throughline.html")), false);
});

function hue(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d < 0.08) return { h: 0, s: 0 };
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: d / (1 - Math.abs(max + min - 1) || 1) };
}
test("no purple in the viewer or the demo diagrams", () => {
  for (const [name, text] of [["viewer", viewer], ["demo", readFileSync(join(demo, "walkthrough.json"), "utf8")]]) {
    assert.doesNotMatch(text, /\b(purple|violet|magenta|lavender|indigo|orchid|plum|fuchsia)\b/i, name);
    const purples = [...new Set(text.match(/#[0-9a-f]{6}\b/gi))].filter((c) => {
      const { h, s } = hue(c);
      return s > 0.12 && h >= 255 && h <= 335;
    });
    assert.deepEqual(purples, [], name);
  }
});
