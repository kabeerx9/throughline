import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { capture, isTestPath, showFile } from "../skills/throughline/scripts/capture.mjs";
import { git, repo, run, write } from "./helpers.mjs";

const byPath = (change) => Object.fromEntries(change.files.map((f) => [f.path, f]));

test("isTest heuristic", () => {
  for (const p of ["src/__tests__/a.ts", "test/a.js", "pkg/tests/a.py", "x/a_test.go", "a.test.tsx", "b.spec.js", "test_x.py", "conftest.py", "a/b/conftest.py"])
    assert.equal(isTestPath(p), true, p);
  for (const p of ["src/testing.ts", "latest.go", "contest.py", "src/attest/a.js", "spec.md", "testdata.json"])
    assert.equal(isTestPath(p), false, p);
});

test("uncommitted: modified, untracked, binary and lockfile", () => {
  const dir = repo({ "src/app.js": "one\ntwo\nthree\n", "package-lock.json": "{}\n" });
  write(dir, {
    "src/app.js": "one\nTWO\nthree\nfour\n",
    "src/new.js": "export const x = 1;\n",
    "src/__tests__/app.test.js": "test('x', () => {});\n",
    "package-lock.json": '{\n  "lockfileVersion": 3\n}\n',
  });
  writeFileSync(join(dir, "logo.png"), Buffer.from([0x89, 0x50, 0, 1, 2]));
  const change = capture([dir]);
  const f = byPath(change);
  assert.equal(change.repos[0].mode, "uncommitted");
  assert.equal(change.repos[0].head, "working tree");
  assert.deepEqual(Object.keys(f).sort(), ["logo.png", "package-lock.json", "src/__tests__/app.test.js", "src/app.js", "src/new.js"]);
  assert.equal(f["src/app.js"].status, "modified");
  assert.equal(f["src/app.js"].additions, 2);
  assert.equal(f["src/app.js"].deletions, 1);
  const lines = f["src/app.js"].hunks[0].lines;
  assert.deepEqual(lines.find((l) => l.kind === "delete"), { kind: "delete", text: "two", oldLine: 2 });
  assert.deepEqual(lines.find((l) => l.text === "four"), { kind: "add", text: "four", newLine: 4 });
  assert.equal(f["src/new.js"].status, "added");
  assert.equal(f["src/new.js"].hunks[0].lines[0].newLine, 1);
  assert.equal(f["src/__tests__/app.test.js"].isTest, true);
  assert.equal(f["src/app.js"].isTest, false);
  assert.equal(f["logo.png"].binary, true);
  assert.equal(f["logo.png"].hunks.length, 0);
  assert.equal(f["package-lock.json"].hunks.length, 0, "lockfile body skipped");
  assert.ok(f["package-lock.json"].additions > 0, "lockfile stats kept");
  assert.match(f["package-lock.json"].omitted, /lockfile/);
});

test("branch against the merge base with the default branch", () => {
  const dir = repo();
  git(dir, "switch", "-q", "-c", "feature");
  write(dir, { "src/feature.js": "a\n" });
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "feature");
  git(dir, "switch", "-q", "main");
  write(dir, { "src/main-only.js": "later on main\n" });
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "main moves on");
  git(dir, "switch", "-q", "feature");
  const change = capture([dir]);
  assert.equal(change.repos[0].mode, "branch");
  assert.equal(change.repos[0].branch, "feature");
  assert.match(change.repos[0].baseLabel, /merge-base with main/);
  assert.deepEqual(change.files.map((f) => f.path), ["src/feature.js"], "main's later commit is excluded");
});

test("--base, --commits, --staged and --unstaged", () => {
  const dir = repo();
  write(dir, { "b.js": "b\n" });
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "b");
  write(dir, { "c.js": "c\n" });
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "c");
  assert.deepEqual(capture([dir], { commits: "1" }).files.map((f) => f.path), ["c.js"]);
  assert.deepEqual(capture([dir], { commits: "2" }).files.map((f) => f.path), ["b.js", "c.js"]);
  assert.deepEqual(capture([dir], { base: "HEAD~1" }).files.map((f) => f.path), ["c.js"]);
  write(dir, { "staged.js": "s\n", "unstaged.js": "u\n" });
  git(dir, "add", "staged.js");
  assert.deepEqual(capture([dir], { mode: "staged" }).files.map((f) => f.path), ["staged.js"]);
  assert.deepEqual(capture([dir], { mode: "unstaged" }).files.map((f) => f.path), ["unstaged.js"]);
  assert.deepEqual(capture([dir]).files.map((f) => f.path), ["staged.js", "unstaged.js"]);
});

test("renames and deletions", () => {
  const dir = repo({ "old.js": "same\ncontent\nhere\n", "gone.js": "bye\n" });
  git(dir, "mv", "old.js", "new.js");
  git(dir, "rm", "-q", "gone.js");
  const f = byPath(capture([dir]));
  assert.equal(f["new.js"].status, "renamed");
  assert.equal(f["new.js"].oldPath, "old.js");
  assert.equal(f["gone.js"].status, "deleted");
  assert.equal(f["gone.js"].deletions, 1);
});

test("several repositories make one bundle with prefixed paths", () => {
  const api = repo({ "server.go": "package main\n" }, "api");
  const web = repo({ "app.ts": "export {};\n" }, "web");
  write(api, { "server.go": "package main\n\nfunc main() {}\n", "server_test.go": "package main\n" });
  write(web, { "app.ts": "export const x = 1;\n" });
  const change = capture([api, web]);
  assert.deepEqual(change.repos.map((r) => r.name), ["api", "web"]);
  assert.deepEqual(change.files.map((f) => [f.path, f.repo]), [
    ["api/server.go", "api"],
    ["api/server_test.go", "api"],
    ["web/app.ts", "web"],
  ]);
  assert.equal(byPath(change)["api/server_test.go"].isTest, true);
  assert.ok(change.repos.every((r) => r.root.startsWith("/")));
});

test("CLI stdout is compact and output goes under .git", () => {
  const dir = repo();
  const body = Array.from({ length: 300 }, (_, i) => `line ${i} with a secret-looking body`).join("\n");
  write(dir, { "src/app.js": body + "\n", "src/app.test.js": "it('works', () => {});\n" });
  const { code, stdout } = run("capture.mjs", [], { cwd: dir });
  assert.equal(code, 0);
  const lines = stdout.trim().split("\n");
  assert.match(lines[0], /^app: uncommitted on main · HEAD \([0-9a-f]{8}\) → working tree$/);
  assert.deepEqual(lines.slice(1, 3), ["M +300 -3 src/app.js", "A +1 -0 src/app.test.js [test]"]);
  assert.match(lines[3], /^2 files · \+301 -3 · without tests 1 files \+300 -3$/);
  assert.match(lines[4], /^wrote .*\/\.git\/throughline\/[0-9a-f]{12}\/change\.json$/);
  assert.equal(lines.length, 5);
  assert.ok(!stdout.includes("secret-looking"), "no hunk bodies on stdout");
  assert.ok(stdout.length < 400, `stdout is ${stdout.length} chars`);
  const out = lines[4].replace(/^wrote /, "");
  assert.ok(existsSync(out));
  assert.equal(git(dir, "status", "--porcelain").includes("throughline"), false, "nothing in the working tree");
  // Same content, same id: Viewed state survives a re-capture.
  assert.equal(run("capture.mjs", [], { cwd: dir }).stdout.trim().split("\n").at(-1), lines[4]);
});

test("--show prints one file with anchor line numbers, capped with a hint", () => {
  const dir = repo();
  write(dir, { "src/app.js": Array.from({ length: 200 }, (_, i) => `row ${i + 1}`).join("\n") + "\n" });
  assert.equal(run("capture.mjs", [], { cwd: dir }).code, 0);
  const shown = run("capture.mjs", ["--show", "src/app.js"], { cwd: dir }).stdout;
  const rows = shown.trim().split("\n");
  assert.match(rows[0], /^src\/app\.js \(modified \+200 -3\)/);
  assert.ok(rows.length <= 163, `printed ${rows.length} rows`);
  assert.match(rows.at(-1), /more rows: --show src\/app\.js --from 161$/);
  assert.ok(rows.includes("-    2| two"));
  assert.ok(rows.includes("+    1| row 1"));
  const next = run("capture.mjs", ["--show", "src/app.js", "--from", "161"], { cwd: dir }).stdout;
  assert.match(next, /\+  200\| row 200/);
  const change = JSON.parse(readFileSync(join(dir, ".git/throughline", readFileSync(join(dir, ".git/throughline/latest"), "utf8").trim().split("/").at(-1), "change.json"), "utf8"));
  assert.match(showFile(change, "missing.js"), /No file missing\.js/);
});

test("no changes exits non-zero with a hint", () => {
  const dir = repo();
  const r = run("capture.mjs", [], { cwd: dir });
  assert.equal(r.code, 1);
  assert.match(r.stdout, /No changes found/);
});

test("--out writes where asked", () => {
  const dir = repo();
  write(dir, { "x.js": "x\n" });
  const out = join(dir, "..", "out");
  assert.equal(run("capture.mjs", [dir, "--out", out]).code, 0);
  assert.ok(existsSync(join(out, "change.json")));
  renameSync(join(out, "change.json"), join(out, "moved.json"));
});

test("scripts run when the skill is installed through a symlink", async () => {
  const { symlinkSync } = await import("node:fs");
  const { execFileSync } = await import("node:child_process");
  const { scripts, tempDir } = await import("./helpers.mjs");
  const link = join(tempDir(), "linked-scripts");
  symlinkSync(scripts, link);
  const dir = repo();
  write(dir, { "x.js": "x\n" });
  const out = execFileSync(process.execPath, [join(link, "capture.mjs")], { cwd: dir, encoding: "utf8" });
  assert.match(out, /A \+1 -0 x\.js/);
});
