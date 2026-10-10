// The viewer's pure logic; Node strips the TypeScript types (Node >= 22.18).
import { test } from "node:test";
import assert from "node:assert/strict";
import { editorLink, flowOrder, isTestFile, loadShowTests, loadViewed, saveShowTests, saveViewed, step, totals } from "../viewer-src/src/model.ts";

const file = (path, extra = {}) => ({ path, repo: "app", status: "modified", additions: 1, deletions: 2, isTest: false, hunks: [], ...extra });
const memory = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) };
};

test("flow order puts explained files first, in walkthrough order", () => {
  const files = [file("a.ts"), file("b.ts"), file("c.ts"), file("d.ts")];
  const order = flowOrder(files, [{ path: "c.ts" }, { path: "a.ts" }]).map((f) => f.path);
  assert.deepEqual(order, ["c.ts", "a.ts", "b.ts", "d.ts"]);
});

test("the walkthrough can override the test heuristic", () => {
  assert.equal(isTestFile(file("fixtures.ts"), { isTest: true }), true);
  assert.equal(isTestFile(file("x.test.ts", { isTest: true }), { isTest: false }), false);
  assert.equal(isTestFile(file("x.test.ts", { isTest: true })), true);
});

test("totals and j/k stepping", () => {
  assert.deepEqual(totals([file("a"), file("b")]), { files: 2, additions: 2, deletions: 4 });
  const list = ["a", "c"];
  assert.equal(step(list, null, 1), 0);
  assert.equal(step(list, null, -1), 1);
  assert.equal(step(list, "a", 1), 1);
  assert.equal(step(list, "c", 1), -1);
  assert.equal(step(list, "b", 1), 0, "a hidden selection restarts from the visible list");
});

test("editor links are absolute, encoded and repo-aware", () => {
  const change = { repos: [{ name: "api", root: "/w/my api" }, { name: "web", root: "/w/web" }], files: [] };
  assert.equal(editorLink(file("api/src/a b.go", { repo: "api" }), change, 12), "vscode://file/w/my%20api/src/a%20b.go:12");
  assert.equal(editorLink(file("web/../x", { repo: "web" }), change), undefined);
  assert.equal(editorLink(file("x", { repo: "gone" }), change), undefined);
});

test("viewed and tests state persist per review", () => {
  const store = memory();
  saveViewed("r1", new Set(["a", "b"]), store);
  assert.deepEqual([...loadViewed("r1", ["a"], store)], ["a"], "unknown paths are dropped");
  assert.deepEqual([...loadViewed("r2", ["a"], store)], []);
  assert.equal(loadShowTests(store), true);
  saveShowTests(false, store);
  assert.equal(loadShowTests(store), false);
  const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
  assert.deepEqual([...loadViewed("r1", ["a"], broken)], []);
  assert.equal(loadShowTests(broken), true);
});

test("text size is bounded and remembered", async () => {
  const { loadTextSize, saveTextSize, TEXT_SIZES, DEFAULT_TEXT_SIZE } = await import("../viewer-src/src/model.ts");
  const store = memory();
  assert.equal(loadTextSize(store), DEFAULT_TEXT_SIZE);
  saveTextSize(3, store);
  assert.equal(loadTextSize(store), 3);
  store.setItem("throughline-text-size", "9");
  assert.equal(loadTextSize(store), DEFAULT_TEXT_SIZE);
  assert.ok(TEXT_SIZES[DEFAULT_TEXT_SIZE] < 18, "default is smaller than the old 18px");
});
