#!/usr/bin/env node
// Throughline capture: snapshot a git change into change.json. Zero dependencies, Node >= 18.
//
//   node capture.mjs [repo…] [--base <ref>] [--commits <n>] [--staged|--unstaged] [--out <dir>]
//   node capture.mjs --show <path> [--dir <dir>] [--from <line>]
//
// Stdout stays compact on purpose: it is what the agent reads. Hunks live in change.json.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const EMPTY_TREE = "4b825dc642cb6eb9a060ae54bf8d69288fbee4904";
const MAX_FILE_BYTES = 1024 * 1024;
const MAX_DIFF_LINES = 4000;
const SHOW_LIMIT = 160;
const LOCKFILES = new Set([
  "package-lock.json", "npm-shrinkwrap.json", "yarn.lock", "pnpm-lock.yaml", "bun.lockb", "bun.lock",
  "Cargo.lock", "go.sum", "poetry.lock", "Pipfile.lock", "uv.lock", "Gemfile.lock", "composer.lock",
  "Podfile.lock", "mix.lock", "flake.lock", "packages.lock.json",
]);

export function isTestPath(path) {
  const name = path.split("/").at(-1);
  return (
    /(^|\/)(__tests__|tests?)\//.test(path) ||
    /_test\.go$/.test(name) ||
    /\.(test|spec)\.[^.]+$/.test(name) ||
    /^test_.*\.py$/.test(name) ||
    name === "conftest.py"
  );
}
export const isLockfile = (path) => LOCKFILES.has(path.split("/").at(-1));

function git(cwd, args, opts = {}) {
  return execFileSync("git", ["-c", "core.quotepath=false", ...args], {
    cwd,
    encoding: opts.buffer ? undefined : "utf8",
    maxBuffer: 512 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
}
function tryGit(cwd, args) {
  try {
    return git(cwd, args).trim();
  } catch {
    return undefined;
  }
}

// ---------- unified diff parsing ----------
function unquote(p) {
  if (!p.startsWith('"')) return p;
  const bytes = [];
  const s = p.slice(1, -1);
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== "\\") {
      bytes.push(...Buffer.from(s[i]));
      continue;
    }
    const n = s[++i];
    if (/[0-7]/.test(n)) {
      bytes.push(parseInt(s.slice(i, i + 3), 8));
      i += 2;
    } else bytes.push({ n: 10, t: 9, r: 13, '"': 34, "\\": 92, a: 7, b: 8, f: 12, v: 11 }[n] ?? n.charCodeAt(0));
  }
  return Buffer.from(bytes).toString("utf8");
}
const stripPrefix = (p) => (p === "/dev/null" ? null : unquote(p).replace(/^[ab]\//, ""));

export function parseUnifiedDiff(text) {
  const files = [];
  const chunks = text.split(/^diff --git /m).slice(1);
  for (const chunk of chunks) {
    const lines = chunk.split("\n");
    const header = lines[0];
    const file = { path: "", status: "modified", additions: 0, deletions: 0, hunks: [] };
    let oldPath, newPath;
    let i = 1;
    for (; i < lines.length && !lines[i].startsWith("@@"); i++) {
      const l = lines[i];
      if (l.startsWith("new file mode")) file.status = "added";
      else if (l.startsWith("deleted file mode")) file.status = "deleted";
      else if (l.startsWith("rename from ")) { oldPath = unquote(l.slice(12)); file.status = "renamed"; }
      else if (l.startsWith("rename to ")) newPath = unquote(l.slice(10));
      else if (l.startsWith("--- ")) oldPath = stripPrefix(l.slice(4).replace(/\t$/, "")) ?? oldPath;
      else if (l.startsWith("+++ ")) newPath = stripPrefix(l.slice(4).replace(/\t$/, "")) ?? newPath;
      else if (l.startsWith("Binary files ") || l.startsWith("GIT binary patch")) file.binary = true;
    }
    if (!newPath && !oldPath) {
      // Mode-only or binary change: header is "a/X b/X".
      const m = header.match(/^("?a\/.*"?) ("?b\/.*"?)$/);
      const half = header.length >> 1;
      newPath = stripPrefix(m ? m[2] : header.slice(half + 1));
      oldPath = stripPrefix(m ? m[1] : header.slice(0, half));
    }
    file.path = file.status === "deleted" ? oldPath || newPath : newPath || oldPath;
    if (file.status === "renamed" && oldPath !== file.path) file.oldPath = oldPath;
    let hunk;
    let oldNo = 0, newNo = 0;
    for (; i < lines.length; i++) {
      const l = lines[i];
      const m = l.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
      if (m) {
        hunk = { oldStart: +m[1], oldLines: m[2] === undefined ? 1 : +m[2], newStart: +m[3], newLines: m[4] === undefined ? 1 : +m[4], lines: [] };
        oldNo = hunk.oldStart;
        newNo = hunk.newStart;
        file.hunks.push(hunk);
        continue;
      }
      if (!hunk || l.startsWith("\\")) continue;
      if (l[0] === "+") { hunk.lines.push({ kind: "add", text: l.slice(1), newLine: newNo++ }); file.additions++; }
      else if (l[0] === "-") { hunk.lines.push({ kind: "delete", text: l.slice(1), oldLine: oldNo++ }); file.deletions++; }
      else if (l[0] === " ") hunk.lines.push({ kind: "context", text: l.slice(1), oldLine: oldNo++, newLine: newNo++ });
    }
    files.push(file);
  }
  return files;
}

function untrackedFile(root, path) {
  const abs = join(root, path);
  let st;
  try {
    st = statSync(abs);
  } catch {
    return undefined;
  }
  if (!st.isFile()) return undefined; // symlinks to dirs, sockets, etc.
  const file = { path, status: "added", additions: 0, deletions: 0, hunks: [] };
  if (st.size > MAX_FILE_BYTES) {
    file.omitted = "file larger than 1 MiB";
    return file;
  }
  const buf = readFileSync(abs);
  if (buf.subarray(0, 8000).includes(0)) {
    file.binary = true;
    return file;
  }
  const text = buf.toString("utf8");
  const rows = text.split("\n");
  if (text.endsWith("\n")) rows.pop();
  if (!rows.length) return file;
  file.additions = rows.length;
  file.hunks = [{ oldStart: 0, oldLines: 0, newStart: 1, newLines: rows.length, lines: rows.map((t, i) => ({ kind: "add", text: t, newLine: i + 1 })) }];
  return file;
}

// ---------- comparisons ----------
function defaultBase(root) {
  const head = tryGit(root, ["symbolic-ref", "--quiet", "refs/remotes/origin/HEAD"]);
  const candidates = [head?.replace("refs/remotes/", ""), "origin/main", "origin/master", "main", "master"].filter(Boolean);
  const branch = tryGit(root, ["rev-parse", "--abbrev-ref", "HEAD"]);
  for (const c of candidates) if (c !== branch && tryGit(root, ["rev-parse", "--verify", "--quiet", c + "^{commit}"])) return c;
  return undefined;
}

function captureRepo(input, opts) {
  const root = tryGit(resolve(input), ["rev-parse", "--show-toplevel"]);
  if (!root) throw new Error(`${input} is not inside a git repository`);
  const headSha = tryGit(root, ["rev-parse", "--verify", "--quiet", "HEAD^{commit}"]);
  const branch = tryGit(root, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const diffArgs = ["diff", "--no-color", "--no-ext-diff", "--no-textconv", "--find-renames", "-U4"];
  let mode = opts.mode;
  const auto = !mode && !opts.base && !opts.commits;
  if (!mode) {
    const dirty = git(root, ["status", "--porcelain", "--untracked-files=all"]).trim();
    mode = opts.base ? "branch" : opts.commits ? "commits" : dirty ? "uncommitted" : "branch";
  }
  let base, head, baseLabel, patch, untracked = [];
  const listUntracked = () =>
    git(root, ["ls-files", "--others", "--exclude-standard", "-z"]).split("\0").filter(Boolean);
  if (mode === "uncommitted" || mode === "staged" || mode === "unstaged") {
    base = headSha || EMPTY_TREE;
    baseLabel = headSha ? "HEAD" : "empty tree";
    head = mode === "staged" ? "index" : "working tree";
    const args = mode === "staged" ? ["--cached", base] : mode === "unstaged" ? [] : [base];
    patch = git(root, [...diffArgs, ...args]);
    if (mode !== "staged") untracked = listUntracked();
  } else if (mode === "commits") {
    const n = Number(opts.commits);
    if (!Number.isInteger(n) || n < 1) throw new Error("--commits needs a positive integer");
    if (!headSha) throw new Error(`${root} has no commits`);
    base = tryGit(root, ["rev-parse", "--verify", "--quiet", `HEAD~${n}^{commit}`]) || EMPTY_TREE;
    baseLabel = `HEAD~${n}`;
    head = headSha;
    patch = git(root, [...diffArgs, base, head]);
  } else {
    if (!headSha) throw new Error(`${root} has no commits`);
    const ref = opts.base || defaultBase(root);
    // A clean checkout of the default branch: nothing to compare against.
    if (!ref && auto) return { name: basename(root), root, mode, branch, base: headSha, baseLabel: "HEAD", head: headSha, files: [], patchHash: "" };
    if (!ref) throw new Error(`${root}: no default branch found; pass --base <ref> or --commits <n>`);
    const refSha = tryGit(root, ["rev-parse", "--verify", "--quiet", ref + "^{commit}"]);
    if (!refSha) throw new Error(`${root}: unknown ref ${ref}`);
    base = tryGit(root, ["merge-base", refSha, headSha]) || refSha;
    baseLabel = `merge-base with ${ref}`;
    head = headSha;
    patch = git(root, [...diffArgs, base, head]);
  }
  const files = parseUnifiedDiff(patch);
  const seen = new Set(files.map((f) => f.path));
  for (const p of untracked) if (!seen.has(p)) {
    const f = untrackedFile(root, p);
    if (f) files.push(f);
  }
  for (const f of files) {
    f.isTest = isTestPath(f.path);
    const size = f.hunks.reduce((n, h) => n + h.lines.length, 0);
    if (isLockfile(f.path) && f.hunks.length) { f.hunks = []; f.omitted = "lockfile: diff body skipped"; }
    else if (size > MAX_DIFF_LINES) { f.hunks = []; f.omitted = `diff body skipped (${size} lines)`; }
    if (f.binary) f.hunks = [];
  }
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { name: basename(root), root, mode, branch: branch === "HEAD" ? undefined : branch, base, baseLabel, head, files, patchHash: createHash("sha256").update(patch).update(JSON.stringify(files.filter((f) => untracked.includes(f.path)))).digest("hex") };
}

export function capture(repoArgs, opts = {}) {
  const inputs = repoArgs.length ? repoArgs : [process.cwd()];
  const repos = inputs.map((r) => captureRepo(r, opts));
  const names = new Set();
  for (const r of repos) {
    let n = r.name, i = 2;
    while (names.has(n)) n = `${r.name}-${i++}`;
    r.name = n;
    names.add(n);
  }
  const multi = repos.length > 1;
  const files = repos.flatMap((r) => r.files.map((f) => ({
    ...f,
    path: multi ? `${r.name}/${f.path}` : f.path,
    ...(f.oldPath ? { oldPath: multi ? `${r.name}/${f.oldPath}` : f.oldPath } : {}),
    repo: r.name,
  })));
  const id = createHash("sha256")
    .update(JSON.stringify(repos.map((r) => [r.root, r.mode, r.base, r.head, r.patchHash])))
    .digest("hex")
    .slice(0, 12);
  return {
    version: 1,
    id,
    createdAt: new Date().toISOString(),
    repos: repos.map(({ name, root, mode, branch, base, baseLabel, head }) => ({ name, root, mode, ...(branch ? { branch } : {}), base, baseLabel, head })),
    files,
  };
}

export function totals(files) {
  return files.reduce((t, f) => ({ files: t.files + 1, additions: t.additions + f.additions, deletions: t.deletions + f.deletions }), { files: 0, additions: 0, deletions: 0 });
}
const fmt = (n) => n.toLocaleString("en-US");
const LETTER = { added: "A", modified: "M", deleted: "D", renamed: "R" };

export function summary(change, outFile) {
  const out = [];
  for (const r of change.repos) {
    const short = /^[0-9a-f]{40}$/.test(r.base) ? r.base.slice(0, 8) : r.base;
    const headShort = /^[0-9a-f]{40}$/.test(r.head) ? r.head.slice(0, 8) : r.head;
    out.push(`${r.name}: ${r.mode}${r.branch ? ` on ${r.branch}` : ""} · ${r.baseLabel} (${short}) → ${headShort}`);
  }
  for (const f of change.files) {
    const tags = [f.isTest && "test", f.binary && "binary", f.omitted && "no body"].filter(Boolean);
    out.push(`${LETTER[f.status]} +${f.additions} -${f.deletions} ${f.oldPath ? f.oldPath + " → " : ""}${f.path}${tags.length ? ` [${tags.join(",")}]` : ""}`);
  }
  const t = totals(change.files);
  const nt = totals(change.files.filter((f) => !f.isTest));
  out.push(`${fmt(t.files)} file${t.files === 1 ? "" : "s"} · +${fmt(t.additions)} -${fmt(t.deletions)}` + (nt.files !== t.files ? ` · without tests ${fmt(nt.files)} files +${fmt(nt.additions)} -${fmt(nt.deletions)}` : ""));
  out.push(`wrote ${outFile}`);
  return out.join("\n");
}

// Prints one file's hunks with the numbers anchors use: "+" and " " rows show after-side
// line numbers, "-" rows show before-side numbers.
export function showFile(change, path, from = 1, limit = SHOW_LIMIT) {
  const file = change.files.find((f) => f.path === path) || change.files.filter((f) => f.path.endsWith("/" + path) || f.path.endsWith(path)).at(0);
  if (!file) return `No file ${path} in this capture. Paths:\n` + change.files.map((f) => f.path).join("\n");
  const rows = [];
  for (const h of file.hunks) {
    rows.push(`@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@`);
    for (const l of h.lines) {
      const sign = l.kind === "add" ? "+" : l.kind === "delete" ? "-" : " ";
      rows.push(`${sign}${String(l.kind === "delete" ? l.oldLine : l.newLine).padStart(5)}| ${l.text}`);
    }
  }
  const head = `${file.path} (${file.status} +${file.additions} -${file.deletions}${file.isTest ? ", test" : ""}) · +/space rows: after-side line, - rows: before-side line`;
  if (file.binary) return head + "\nbinary file: no text diff";
  if (file.omitted) return head + "\n" + file.omitted;
  const start = Math.max(1, from) - 1;
  const page = rows.slice(start, start + limit);
  const more = start + limit < rows.length ? `\n… ${rows.length - start - limit} more rows: --show ${file.path} --from ${start + limit + 1}` : "";
  return [head, ...page].join("\n") + more;
}

function outRoot(root) {
  const gitDir = tryGit(root, ["rev-parse", "--absolute-git-dir"]);
  return join(gitDir, "throughline");
}

export function latestDir(cwd = process.cwd()) {
  const root = tryGit(cwd, ["rev-parse", "--show-toplevel"]);
  if (!root) return undefined;
  const dir = outRoot(root);
  const pointer = join(dir, "latest");
  if (existsSync(pointer)) return readFileSync(pointer, "utf8").trim();
  if (!existsSync(dir)) return undefined;
  const dirs = readdirSync(dir).map((d) => join(dir, d)).filter((d) => existsSync(join(d, "change.json")));
  return dirs.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
}

function parseArgs(argv) {
  const opts = { repos: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === "--base") opts.base = value();
    else if (a === "--commits") opts.commits = value();
    else if (a === "--staged") opts.mode = "staged";
    else if (a === "--unstaged") opts.mode = "unstaged";
    else if (a === "--out") opts.out = value();
    else if (a === "--show") (opts.show ||= []).push(value());
    else if (a === "--dir") opts.dir = value();
    else if (a === "--from") opts.from = Number(value());
    else if (a === "-h" || a === "--help") opts.help = true;
    else if (a.startsWith("-")) throw new Error(`Unknown option ${a}`);
    else opts.repos.push(a);
  }
  return opts;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log("capture.mjs [repo…] [--base <ref>] [--commits <n>] [--staged|--unstaged] [--out <dir>]\ncapture.mjs --show <path> [--dir <dir>] [--from <row>]");
    return;
  }
  if (opts.show) {
    const dir = opts.dir || latestDir();
    if (!dir) throw new Error("No capture found; run capture first or pass --dir");
    const change = JSON.parse(readFileSync(join(dir, "change.json"), "utf8"));
    console.log(opts.show.map((p) => showFile(change, p, opts.from || 1)).join("\n\n"));
    return;
  }
  if (opts.base && opts.commits) throw new Error("Use --base or --commits, not both");
  if (opts.mode && (opts.base || opts.commits)) throw new Error("--staged/--unstaged capture uncommitted work; drop --base/--commits");
  const change = capture(opts.repos, opts);
  if (!change.files.length) {
    console.log("No changes found. Try --commits <n> or --base <ref>.");
    process.exitCode = 1;
    return;
  }
  const firstRoot = change.repos[0].root;
  const dir = resolve(opts.out || join(outRoot(firstRoot), change.id));
  mkdirSync(dir, { recursive: true });
  const outFile = join(dir, "change.json");
  writeFileSync(outFile, JSON.stringify(change));
  mkdirSync(outRoot(firstRoot), { recursive: true });
  writeFileSync(join(outRoot(firstRoot), "latest"), dir + "\n");
  console.log(summary(change, outFile));
}

// realpath on both sides: installs are often symlinked (npx skills add, /tmp -> /private/tmp).
const isMain = () => { try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } };
if (isMain()) {
  try {
    main();
  } catch (e) {
    console.error("capture: " + (e.stderr?.toString().trim() || e.message));
    process.exitCode = 2;
  }
}
