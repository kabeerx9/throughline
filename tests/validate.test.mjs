import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validate } from "../skills/throughline/scripts/validate.mjs";
import { root } from "./helpers.mjs";

const demo = (name) => JSON.parse(readFileSync(join(root, "examples/rate-limiter", name), "utf8"));
const change = demo("change.json");
const good = () => demo("walkthrough.json");
const errorsOf = (mutate) => {
  const w = good();
  mutate(w);
  return validate(change, w).errors;
};
const has = (errors, re) => assert.ok(errors.some((e) => re.test(e)), "expected " + re + " in\n" + errors.join("\n"));

test("the demo walkthrough is valid with no warnings", () => {
  assert.deepEqual(validate(change, good()), { errors: [], warnings: [] });
});

test("a minimal walkthrough is valid and warns about unexplained source files", () => {
  const { errors, warnings } = validate(change, {
    title: "t",
    overview: { title: "o", explanation: "e" },
    files: [{ path: "main.go", role: "r", explanation: "x" }],
  });
  assert.deepEqual(errors, []);
  assert.ok(warnings.some((w) => w.startsWith("config.go is not explained")));
  assert.ok(!warnings.some((w) => w.includes("_test.go")), "tests may go unexplained");
});

test("rejects unknown keys and missing fields with JSON paths", () => {
  has(errorsOf((w) => (w.overview.summary = "x")), /^walkthrough\.overview\.summary: unknown key/);
  has(errorsOf((w) => (w.files[0].anchors[0].context = 3)), /^files\[0\]\.anchors\[0\]\.context: unknown key/);
  has(errorsOf((w) => delete w.files[1].role), /^files\[1\]\.role: is required/);
  has(errorsOf((w) => (w.title = "")), /^walkthrough\.title: must not be empty/);
  has(errorsOf((w) => (w.files = "nope")), /^walkthrough\.files: must be an array/);
});

test("file paths must exist in change.json and appear once", () => {
  has(errorsOf((w) => (w.files[0].path = "nope.go")), /^files\[0\]\.path: nope\.go is not in change\.json/);
  has(errorsOf((w) => w.files.push({ ...w.files[0] })), /main\.go is explained twice/);
});

test("line references must fall inside the file's hunks", () => {
  has(errorsOf((w) => (w.files[0].anchors[0].endLine = 99)), /^files\[0\]\.anchors\[0\]\.endLine: after line 99 is not in the diff of main\.go; visible after lines: 2-23/);
  has(errorsOf((w) => (w.files[0].anchors[0] = { side: "before", startLine: 1, endLine: 2 })), /startLine: before line 1 is not in the diff/);
  has(errorsOf((w) => (w.files[0].anchors[0].startLine = 20)), /endLine 14 is before startLine 20/);
  has(errorsOf((w) => (w.files[2].notes[0].lines.endLine = 80)), /^files\[2\]\.notes\[0\]\.lines\.endLine: after line 80/);
  has(errorsOf((w) => (w.files[2].notes[0].lines.path = "main.go")), /notes\[0\]\.lines\.path: must be this file \(middleware\.go\)/);
});

test("explanation links must name an anchor in that file", () => {
  has(errorsOf((w) => (w.files[0].explanation += " See [this](#nowhere).")), /^files\[0\]\.explanation: links to #nowhere/);
  has(errorsOf((w) => (w.overview.explanation += " [x](#wrap)")), /^walkthrough\.overview\.explanation: links to #wrap; the overview has no anchors/);
  has(errorsOf((w) => (w.files[0].anchors[1].id = "config")), /config is used twice/);
  has(errorsOf((w) => (w.files[0].anchors[0].id = "Not A Slug")), /must be a lowercase slug/);
});

test("quiz answers must index into options", () => {
  has(errorsOf((w) => (w.overview.quiz[0].correct = 4)), /^walkthrough\.overview\.quiz\[0\]\.correct: 4 is not a valid index into 4 options/);
  has(errorsOf((w) => (w.overview.quiz[0].options = ["only one"])), /options: needs at least 2/);
});

test("learn notes respect their caps", () => {
  has(errorsOf((w) => (w.files[3].notes = [1, 2, 3, 4].map(() => ({ title: "t", body: "b" })))), /^files\[3\]\.notes: has 4 items; max 3/);
  has(errorsOf((w) => (w.files[3].notes[0].code = Array(21).fill("x").join("\n"))), /notes\[0\]\.code: has 21 lines; max 20/);
  has(errorsOf((w) => delete w.files[3].notes[0].code), /notes\[0\]\.vs: needs code/);
  has(errorsOf((w) => (w.overview.notes = [{ title: "t", body: "b", lines: { startLine: 1, endLine: 2 } }])), /overview\.notes\[0\]\.lines\.path: is required for overview notes/);
});

test("diagrams need html and a sane height", () => {
  has(errorsOf((w) => delete w.overview.diagrams[0].html), /diagrams\[0\]\.html: is required/);
  has(errorsOf((w) => (w.overview.diagrams[0].height = 5000)), /height: must be between 160 and 2000/);
});

test("changeId must match the capture", () => {
  has(errorsOf((w) => (w.changeId = "other")), /changeId: is other but change\.json is demo-notes-rate-limit/);
});

test("the minimal example in reference/format.md validates against a real capture", async () => {
  const { capture } = await import("../skills/throughline/scripts/capture.mjs");
  const { repo, write } = await import("./helpers.mjs");
  const dir = repo({ "cart.go": "package cart\n\nfunc Total(items []int) int {\n\tt := 0\n\tfor _, i := range items {\n\t\tt += i\n\t}\n\treturn t\n}\n" });
  write(dir, {
    "cart.go": "package cart\n\n// Total sums item prices in cents and applies a percentage discount.\nfunc Total(items []int, discount int) int {\n\tt := 0\n\tfor _, i := range items {\n\t\tt += i\n\t}\n\tif discount < 0 || discount > 100 {\n\t\tdiscount = 0\n\t}\n\treturn t - t*discount/100\n}\n",
    "cart_test.go": "package cart\n",
  });
  const format = readFileSync(join(root, "skills/throughline/reference/format.md"), "utf8");
  const example = JSON.parse(format.match(/## Minimal example\s+```json\n([\s\S]*?)```/)[1]);
  assert.deepEqual(validate(capture([dir]), example), { errors: [], warnings: [] });
});
