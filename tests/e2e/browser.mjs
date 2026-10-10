// End-to-end, like a fresh user: copy the installed skill somewhere new, capture a
// two-repo change, write a walkthrough, render it, and drive the page in Chrome.
//   node tests/e2e/browser.mjs [--readme]   (--readme also refreshes docs/*.png from the demo)
// Uses the locally installed Google Chrome (playwright-core, channel "chrome").
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { git, repo, root, tempDir, write } from "../helpers.mjs";

const out = join(root, "tests/e2e/out");
mkdirSync(out, { recursive: true });
const checks = [];
const check = async (name, fn) => {
  await fn();
  checks.push(name);
  console.log("ok  " + name);
};

// 1. Install: a plain copy of skills/throughline, as `npx skills add` would make.
const home = tempDir("throughline-e2e-");
const skill = join(home, "skills/throughline");
cpSync(join(root, "skills/throughline"), skill, { recursive: true });
const node = (script, args, opts = {}) =>
  execFileSync(process.execPath, [join(skill, "scripts", script), ...args], { encoding: "utf8", ...opts });
const env = { ...process.env, THROUGHLINE_CONFIG_DIR: join(home, "config") };
node("profile.mjs", ["--knows", "TypeScript", "--learning", "Go"], { env });

// 2. A change across two repos: a Go API and a TypeScript web client.
const api = repo({ "cart.go": "package cart\n\nfunc Total(items []int) int {\n\tt := 0\n\tfor _, i := range items {\n\t\tt += i\n\t}\n\treturn t\n}\n" }, "api");
const web = repo({ "src/cart.ts": "export const total = (xs: number[]) => xs.reduce((a, b) => a + b, 0);\n", "README.md": "# web\n" }, "web");
write(api, {
  "cart.go": "package cart\n\n// Total sums item prices in cents and applies a percentage discount.\nfunc Total(items []int, discount int) int {\n\tt := 0\n\tfor _, i := range items {\n\t\tt += i\n\t}\n\tif discount < 0 || discount > 100 {\n\t\tdiscount = 0\n\t}\n\treturn t - t*discount/100\n}\n",
  "cart_test.go": "package cart\n\nimport \"testing\"\n\nfunc TestTotal(t *testing.T) {\n\tif Total([]int{100, 50}, 10) != 135 {\n\t\tt.Fatal(\"want 135\")\n\t}\n}\n",
});
write(web, {
  "src/cart.ts": "export const total = (xs: number[], discount = 0) => {\n  const sum = xs.reduce((a, b) => a + b, 0);\n  return sum - Math.floor((sum * discount) / 100);\n};\n",
  "src/__tests__/cart.test.ts": "import { total } from '../cart';\ntest('discount', () => expect(total([100, 50], 10)).toBe(135));\n",
  "README.md": "# web\n\nTotals now take a discount.\n",
});
const stdout = node("capture.mjs", [api, web]);
const dir = stdout.trim().split("\n").at(-1).replace(/^wrote /, "").replace(/\/change\.json$/, "");
assert.ok(dir.startsWith(realpathSync(api) + "/.git/throughline/"), "bundle goes to the first repo's .git");
const change = JSON.parse(readFileSync(join(dir, "change.json"), "utf8"));
const flowPaths = ["api/cart.go", "web/src/cart.ts", "api/cart_test.go"];

// 3. The agent's part: a small walkthrough with every feature.
const diagram = {
  html: '<figure class="viz"><div class="viz-top"><div class="seg" role="group" aria-label="Discount"><button data-v="10" aria-pressed="true">10%</button><button data-v="150" aria-pressed="false">150%</button></div><button class="play" type="button">▶ Play</button></div><svg viewBox="0 0 600 120" role="img" aria-label="Total"><rect x="10" y="20" width="580" height="60" rx="8" fill="#e9f0f2" stroke="#0f4c5c"/><text id="out" x="300" y="57" text-anchor="middle" font-size="18">150 → 135</text></svg><p class="viz-caption" id="cap" aria-live="polite">Applied.</p></figure>',
  script: 'Viz.seg(document.querySelector(".seg"), function (v) { document.getElementById("out").textContent = v === "10" ? "150 → 135" : "150 → 150 (clamped to 0%)"; document.getElementById("cap").textContent = v === "10" ? "Applied." : "Out of range: no discount."; });',
  caption: "Out-of-range discounts are clamped to zero.",
};
const walkthrough = {
  title: "Discounts on cart totals",
  changeId: change.id,
  overview: {
    title: "Both totals take a discount, and bad discounts mean none",
    explanation: "The Go API and the web client both gain a `discount` percentage.\n\n- The API **clamps** out-of-range values to zero.\n- The client floors the discount, matching integer division for positive totals.",
    diagrams: [diagram],
    decisions: [{ title: "Clamp, don't reject", choice: "Out-of-range discounts become zero.", tradeoff: "A bad caller silently gets no discount." }],
    remember: "Integer cents and integer percentages keep both sides in agreement.",
    quiz: [
      { prompt: "Total([]int{100, 50}, 150)?", options: ["0", "150", "-75"], correct: 1, answer: "150 is out of range, so the discount becomes 0." },
      { prompt: "Which side rounds with Math.floor?", options: ["Go", "TypeScript"], correct: 1, answer: "The client floors; Go's integer division truncates." },
    ],
  },
  files: [
    {
      path: "api/cart.go",
      role: "API: clamp, then discount",
      explanation: "The [guard](#clamp) turns any discount outside 0–100 into zero. Then [the return](#apply) subtracts the discount in integer cents.",
      anchors: [
        { id: "clamp", startLine: 9, endLine: 11, note: "Clamp bad discounts" },
        { id: "apply", startLine: 12, endLine: 12, note: "Integer discount" },
      ],
      remember: "Go integer division truncates toward zero.",
      tour: [
        { lines: { start: 3, end: 4 }, title: "A new parameter", text: "Every caller must pass a discount now." },
        { lines: { start: 9, end: 12 }, title: "Clamp, then subtract", text: "Out-of-range becomes 0; see [the guard](#clamp)." },
      ],
      notes: [{ title: "Integer division", body: "Go's / on ints truncates; TypeScript numbers are floats, so the client floors explicitly.", code: "t*discount/100", lang: "Go", vs: "Math.floor((sum * discount) / 100)", vsLang: "TypeScript", lines: { startLine: 12, endLine: 12 } }],
    },
    { path: "web/src/cart.ts", role: "Client: the same arithmetic", explanation: "Defaults to no discount so old callers keep working.", anchors: [{ startLine: 1, endLine: 4 }], tour: [{ lines: { start: 1, end: 4 }, text: "Floors the discount so it matches Go for positive totals." }] },
    { path: "api/cart_test.go", role: "Proof", explanation: "One case: 150 cents at 10% is 135." },
  ],
};
writeFileSync(join(dir, "walkthrough.json"), JSON.stringify(walkthrough, null, 2));
const shown = node("show.mjs", [dir, "--no-open"], { env }).trim().split("\n");
assert.deepEqual(shown.slice(0, -1), ['warning: web/README.md is not explained (it will appear under "Not explained")']);
const html = shown.at(-1);
assert.equal(html, join(dir, "throughline.html"));

// 4. The browser.
const browser = await chromium.launch({ channel: "chrome" });
const errors = [];
async function open(width, height, context) {
  const page = await (context || (await browser.newContext({ viewport: { width, height } }))).newPage();
  page.on("pageerror", (e) => errors.push(`${width}px: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`${width}px console: ${m.text()}`));
  await page.goto("file://" + html);
  await page.waitForSelector(".reader");
  return page;
}
// Scroll first and let Chrome paint before clicking: right after a scroll, hit-testing
// around the out-of-process diagram iframe can still use the old layout.
async function settledClick(locator) {
  await locator.scrollIntoViewIfNeeded();
  await locator.page().evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await locator.page().waitForTimeout(100);
  await locator.click();
}
const noHorizontalScroll = async (page) =>
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), "horizontal page scroll");

const desktop = await browser.newContext({ viewport: { width: 1512, height: 860 } });
let page = await open(1512, 860, desktop);

await check("totals, per-repo breakdown and file order", async () => {
  const t = change.files.reduce((a, f) => [a[0] + f.additions, a[1] + f.deletions], [0, 0]);
  assert.equal(await page.locator(".review-size h1").innerText(), `${change.files.length} files · +${t[0]} −${t[1]}`);
  assert.equal(await page.locator(".repo-breakdown li").count(), 2);
  const order = await page.locator(".diff-file").evaluateAll((els) => els.map((e) => e.dataset.path));
  assert.deepEqual(order.slice(0, 3), flowPaths);
  assert.deepEqual(order.slice(3).sort(), ["web/README.md", "web/src/__tests__/cart.test.ts"]);
  assert.equal(await page.locator(".unexplained-heading").innerText(), "Not explained");
  assert.equal(await page.locator(".diff-file .tag").count(), 2, "test tags");
});

await check("expand all and collapse all", async () => {
  await page.getByRole("button", { name: "Expand all" }).click();
  assert.equal(await page.locator(".full-diff").count(), change.files.length);
  await page.getByRole("button", { name: "Collapse all" }).click();
  assert.equal(await page.locator(".full-diff").count(), 0);
});

await check("both panes scroll with the wheel", async () => {
  await page.getByRole("button", { name: "Expand all" }).click();
  for (const pane of [".code-pane", ".lesson-pane"]) {
    const box = await page.locator(pane).boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + 200);
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(300);
    assert.ok((await page.locator(pane).evaluate((e) => e.scrollTop)) > 0, pane + " did not scroll");
  }
  await page.getByRole("button", { name: "Collapse all" }).click();
  await page.locator(".code-pane").evaluate((e) => e.scrollTo(0, 0));
  // Over a diagram the wheel must still scroll the explanation (native chaining),
  // and must not swallow the next click in the page.
  const lesson = page.locator(".lesson-pane");
  await lesson.evaluate((e) => e.scrollTo(0, 0));
  const frame = await page.locator(".lesson-diagram iframe").first().boundingBox();
  await page.mouse.move(frame.x + 80, frame.y + 30);
  await page.mouse.wheel(0, 150);
  await page.waitForTimeout(300);
  assert.ok((await lesson.evaluate((e) => e.scrollTop)) > 0, "wheel over the diagram scrolls the pane");
});

await check("diagram iframe is sandboxed and its toggle works", async () => {
  const frameEl = page.locator(".lesson-diagram iframe").first();
  assert.equal(await frameEl.getAttribute("sandbox"), "allow-scripts");
  const frame = page.frameLocator(".lesson-diagram iframe").first();
  assert.equal(await frame.locator("#out").textContent(), "150 → 135");
  await frame.getByRole("button", { name: "150%" }).click();
  assert.equal(await frame.locator("#out").textContent(), "150 → 150 (clamped to 0%)");
  assert.equal(await frame.getByRole("button", { name: "150%" }).getAttribute("aria-pressed"), "true");
  await frame.getByRole("button", { name: "▶ Play" }).click();
  const f = page.frames().find((x) => x !== page.mainFrame());
  assert.equal(await f.evaluate(() => { try { return String(parent.document.title); } catch { return "blocked"; } }), "blocked");
  assert.equal(await f.evaluate(() => { try { return String(localStorage.length); } catch { return "blocked"; } }), "blocked");
  assert.ok((await frameEl.evaluate((e) => e.getBoundingClientRect().height)) > 150, "frame sized to content");
});

await check("quiz grades after committing", async () => {
  const quiz = page.locator(".quiz");
  await settledClick(quiz.locator("fieldset").nth(0).locator("label").nth(1));
  await settledClick(quiz.locator("fieldset").nth(1).locator("label").nth(0));
  await settledClick(quiz.getByRole("button", { name: "Check answers" }));
  assert.equal(await page.locator(".quiz-result").innerText(), "1 of 2 correct. Revisit the files behind the missed answers.");
  assert.equal(await page.locator(".quiz-feedback.wrong").count(), 1);
});

await check("selecting a file switches the right pane; Esc returns", async () => {
  await page.locator('.diff-file[data-path="api/cart.go"] .file-header').click();
  assert.equal(await page.locator(".lesson-content h1").innerText(), "API: clamp, then discount");
  assert.equal(await page.locator('.diff-file[data-path="api/cart.go"] .full-diff').count(), 1);
  await page.keyboard.press("Escape");
  assert.equal(await page.locator(".lesson-content h1").innerText(), walkthrough.overview.title);
});

await check("line references highlight and scroll the diff", async () => {
  await page.keyboard.press("j");
  await page.getByRole("link", { name: "guard", exact: true }).hover();
  assert.equal(await page.locator(".code-line.highlighted").count(), 3, "hover highlights L9–11");
  await page.getByRole("link", { name: "the return" }).click();
  await page.waitForTimeout(500);
  const lit = page.locator(".code-line.highlighted");
  assert.equal(await lit.count(), 1);
  assert.equal(await lit.getAttribute("data-new"), "12");
  assert.ok(await lit.isVisible());
  assert.ok((await page.locator(".code-line.mentioned").count()) >= 4, "gutter marks for mentioned ranges");
  const href = await page.locator('.diff-file[data-path="api/cart.go"] .file-actions a').getAttribute("href");
  assert.equal(href, `vscode://file${realpathSync(api)}/cart.go:9`);
});

await check("code tour: numbered steps, gutter marks and n/p walking", async () => {
  // still on api/cart.go from the previous check
  assert.deepEqual(await page.locator(".tour-step .tour-title").allInnerTexts(), ["A new parameter", "Clamp, then subtract"]);
  assert.equal(await page.locator(".tour-count").innerText(), "2 steps");
  const marks = page.locator('.diff-file[data-path="api/cart.go"] .step-mark');
  assert.deepEqual(await marks.allInnerTexts(), ["1", "2"]);
  assert.equal(await marks.nth(1).evaluate((e) => e.parentElement.dataset.new), "9");
  await page.keyboard.press("n");
  await page.waitForTimeout(300);
  assert.equal(await page.locator(".tour-count").innerText(), "Step 1 of 2");
  assert.deepEqual(await page.locator(".code-line.highlighted").evaluateAll((els) => els.map((e) => e.dataset.new)), ["3", "4"]);
  await page.keyboard.press("n");
  await page.waitForTimeout(300);
  assert.deepEqual(await page.locator(".code-line.highlighted").evaluateAll((els) => els.map((e) => e.dataset.new)), ["9", "10", "11", "12"]);
  assert.ok(await page.locator(".code-line.highlighted").first().isVisible());
  assert.equal(await page.locator(".tour-step.active .tour-num").innerText(), "2");
  assert.ok(await page.locator('.step-mark.active').count() === 1);
  await page.keyboard.press("n"); // at the end: stays
  assert.equal(await page.locator(".tour-count").innerText(), "Step 2 of 2");
  await page.keyboard.press("p");
  assert.equal(await page.locator(".tour-count").innerText(), "Step 1 of 2");
  await page.locator(".tour-step").nth(1).hover();
  assert.equal(await page.locator(".code-line.highlighted").count(), 4, "hover previews a step");
  assert.ok(await page.getByRole("button", { name: "Previous step" }).isDisabled(), "no step before the first");
  await settledClick(page.getByRole("button", { name: "Next step" }));
  assert.equal(await page.locator(".tour-count").innerText(), "Step 2 of 2");
});

await check("text size: A−/A+, -/= keys, bounds and persistence", async () => {
  const size = () => page.locator(".lesson-content").evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
  const frameHeight = () => page.locator(".lesson-diagram iframe").first().evaluate((e) => e.getBoundingClientRect().height);
  assert.equal(await size(), 16, "default is one step below the old 18px");
  await page.keyboard.press("=");
  assert.equal(await size(), 17.5);
  await page.getByRole("button", { name: "Larger text" }).click();
  assert.equal(await size(), 19);
  assert.ok(await page.getByRole("button", { name: "Larger text" }).isDisabled());
  await page.keyboard.press("=");
  assert.equal(await size(), 19, "upper bound");
  const h1 = await page.locator(".lesson-content h1").evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
  assert.ok(Math.abs(h1 - 19 * 1.6) < 0.5, "headings scale with the text");
  await page.reload();
  await page.waitForSelector(".reader");
  assert.equal(await size(), 19, "remembered");
  const before = await frameHeight();
  for (let i = 0; i < 4; i++) await page.keyboard.press("-");
  assert.equal(await size(), 14.5, "lower bound");
  assert.ok(await page.getByRole("button", { name: "Smaller text" }).isDisabled());
  assert.ok(Math.abs((await frameHeight()) - before) < 2, "diagrams are not rescaled");
  await page.getByRole("button", { name: "Larger text" }).click();
  assert.equal(await size(), 16);
  await page.locator('.diff-file[data-path="api/cart.go"] .file-header').click();
});

await check("learn notes show the language being learned beside the known one", async () => {
  const note = page.locator(".learning-note").first();
  assert.equal(await note.evaluate((d) => d.open), false);
  await note.locator("summary").click();
  assert.equal(await note.evaluate((d) => d.open), true);
  assert.deepEqual(await note.locator(".note-code small").allInnerTexts(), ["Go", "TypeScript"]);
  assert.match(await page.locator(".learn-label").innerText(), /for learning Go · you know TypeScript/i);
  await note.getByRole("button", { name: "See after L12" }).click();
  assert.equal(await page.locator(".code-line.highlighted").getAttribute("data-new"), "12");
});
await page.screenshot({ path: join(out, "e2e-desktop-file.png") });

await check("viewed persists across reloads (and x toggles it)", async () => {
  await page.keyboard.press("x");
  assert.equal(await page.locator(".viewed-count").innerText(), `1 / ${change.files.length} viewed`);
  await page.locator('.diff-file[data-path="web/README.md"] input[type=checkbox]').check();
  await page.reload();
  await page.waitForSelector(".reader");
  assert.equal(await page.locator(".viewed-count").innerText(), `2 / ${change.files.length} viewed`);
  assert.ok(await page.locator('.diff-file[data-path="api/cart.go"] input[type=checkbox]').isChecked());
  const key = await page.evaluate((id) => localStorage.getItem("throughline-viewed:" + id), change.id);
  assert.deepEqual(JSON.parse(key).sort(), ["api/cart.go", "web/README.md"]);
});

await check("tests toggle hides tests, shows both totals and j/k skips them", async () => {
  await page.locator(".tests-toggle").click();
  assert.equal(await page.locator(".tests-toggle").getAttribute("aria-pressed"), "false");
  const visible = await page.locator(".diff-file").evaluateAll((els) => els.map((e) => e.dataset.path));
  assert.deepEqual(visible, ["api/cart.go", "web/src/cart.ts", "web/README.md"]);
  const noTests = change.files.filter((f) => !f.isTest).reduce((a, f) => [a[0] + f.additions, a[1] + f.deletions], [0, 0]);
  assert.match(await page.locator(".review-size h1").innerText(), new RegExp(`· without tests \\+${noTests[0]} −${noTests[1]}$`));
  const seen = [];
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press("j");
    seen.push(await page.locator(".diff-file.selected").getAttribute("data-path"));
  }
  assert.deepEqual(seen, ["api/cart.go", "web/src/cart.ts", "web/README.md", "web/README.md"]);
  await page.keyboard.press("k");
  assert.equal(await page.locator(".diff-file.selected").getAttribute("data-path"), "web/src/cart.ts");
  await page.reload();
  await page.waitForSelector(".reader");
  assert.equal(await page.locator(".tests-toggle").getAttribute("aria-pressed"), "false", "remembered");
  await page.locator(".tests-toggle").click();
});

await check("no horizontal page scroll on desktop", () => noHorizontalScroll(page));
await page.screenshot({ path: join(out, "e2e-desktop-overview.png") });

// Phone.
const phone = await open(390, 844);
await check("phone: diff first, explanation rises as a sheet", async () => {
  await noHorizontalScroll(phone);
  assert.equal(await phone.locator(".lesson-pane.sheet-open").count(), 0);
  await phone.locator('.diff-file[data-path="api/cart.go"] .file-header').click();
  await phone.waitForTimeout(300);
  assert.equal(await phone.locator(".lesson-pane.sheet-open").count(), 1);
  assert.equal(await phone.locator(".lesson-content h1").innerText(), "API: clamp, then discount");
  await phone.screenshot({ path: join(out, "e2e-phone-sheet.png") });
  assert.ok(await phone.getByRole("button", { name: "Larger text" }).isVisible());
  await phone.locator(".tour-step-head").nth(1).click();
  await phone.waitForTimeout(400);
  assert.equal(await phone.locator(".lesson-pane.sheet-open").count(), 0, "a tapped step shows its code");
  assert.equal(await phone.locator(".code-line.highlighted").count(), 4);
  await phone.locator('.diff-file[data-path="api/cart.go"] .explain-open-file').click().catch(() => {});
  await phone.locator(".diff-file.selected .file-header").click();
  await phone.locator('.diff-file[data-path="api/cart.go"] .file-header').click();
  await phone.waitForTimeout(300);
  await phone.getByRole("link", { name: "guard", exact: true }).click();
  await phone.waitForTimeout(400);
  assert.equal(await phone.locator(".lesson-pane.sheet-open").count(), 0, "jumping to code dismisses the sheet");
  assert.equal(await phone.locator(".code-line.highlighted").count(), 3);
  await phone.getByRole("button", { name: "The whole idea ↑" }).click();
  await phone.waitForTimeout(300);
  assert.equal(await phone.locator(".lesson-content h1").innerText(), walkthrough.overview.title);
  await noHorizontalScroll(phone);
  await phone.screenshot({ path: join(out, "e2e-phone-overview.png") });
});

await check("no page errors", () => assert.deepEqual(errors, []));

// README screenshots from the committed demo.
if (process.argv.includes("--readme")) {
  const demo = "file://" + join(root, "examples/rate-limiter/throughline.html");
  const d = await (await browser.newContext({ viewport: { width: 1512, height: 860 }, deviceScaleFactor: 2 })).newPage();
  await d.goto(demo);
  await d.waitForSelector(".reader");
  await d.locator('.diff-file[data-path="ratelimit/limiter.go"] .file-header').click();
  await d.waitForTimeout(300);
  for (let i = 0; i < 5; i++) await d.keyboard.press("n");
  await d.waitForTimeout(800);
  await d.locator(".lesson-pane").evaluate((e) => e.scrollBy(0, e.querySelector(".tour").getBoundingClientRect().top - e.getBoundingClientRect().top - 16));
  await d.waitForTimeout(400);
  await d.screenshot({ path: join(root, "docs/demo-desktop.png") });
  const p = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage();
  await p.goto(demo);
  await p.waitForSelector(".reader");
  await p.getByRole("button", { name: "The whole idea ↑" }).click();
  await p.waitForTimeout(400);
  await p.screenshot({ path: join(root, "docs/demo-phone.png") });
  console.log("wrote docs/demo-desktop.png and docs/demo-phone.png");
}

await browser.close();
console.log(`\n${checks.length} browser checks passed · screenshots in ${out}`);
