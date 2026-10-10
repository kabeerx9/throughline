#!/usr/bin/env node
// Strict, zero-dependency validator for walkthrough.json against change.json.
//   node validate.mjs <dir>   (reads <dir>/change.json and <dir>/walkthrough.json)
// Errors name the JSON path; exit code 1 when there are errors.
import { readFileSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const LIMITS = { notes: 3, noteLines: 20, quiz: 12, diagrams: 6, anchors: 40, decisions: 12, tour: 40 };
// Files that need no code tour: docs and config.
const PROSE = /\.(md|mdx|markdown|txt|rst|json|jsonc|ya?ml|toml|lock|ini|cfg|env|csv|svg)$/i;

function checker() {
  const errors = [];
  const fail = (path, msg) => errors.push(`${path}: ${msg}`);
  const obj = (path, v, shape, required = []) => {
    if (!v || typeof v !== "object" || Array.isArray(v)) return fail(path, "must be an object"), false;
    for (const k of Object.keys(v)) if (!(k in shape)) fail(`${path}.${k}`, `unknown key (allowed: ${Object.keys(shape).join(", ")})`);
    for (const k of required) if (v[k] === undefined) fail(`${path}.${k}`, "is required");
    for (const [k, check] of Object.entries(shape)) if (v[k] !== undefined) check(`${path}.${k}`, v[k]);
    return true;
  };
  const str = (max, min = 1) => (path, v) => {
    if (typeof v !== "string") return fail(path, "must be a string");
    if (v.trim().length < min) fail(path, "must not be empty");
    if (v.length > max) fail(path, `is ${v.length} chars; max ${max}`);
  };
  const int = (min, max = Infinity) => (path, v) => {
    if (!Number.isInteger(v)) return fail(path, "must be an integer");
    if (v < min || v > max) fail(path, `must be between ${min} and ${max === Infinity ? "∞" : max}`);
  };
  const bool = (path, v) => typeof v !== "boolean" && fail(path, "must be true or false");
  const oneOf = (...values) => (path, v) => !values.includes(v) && fail(path, `must be one of ${values.map((x) => JSON.stringify(x)).join(", ")}`);
  const arr = (item, min, max) => (path, v) => {
    if (!Array.isArray(v)) return fail(path, "must be an array");
    if (v.length < min) fail(path, `needs at least ${min} item(s)`);
    if (v.length > max) fail(path, `has ${v.length} items; max ${max}`);
    v.forEach((x, i) => item(`${path}[${i}]`, x));
  };
  return { errors, fail, obj, str, int, bool, oneOf, arr };
}

/** Lines on one side that are rendered in the diff, for one file. */
function visibleLines(file, side) {
  const set = new Set();
  for (const h of file?.hunks || []) for (const l of h.lines) {
    const n = side === "before" ? l.oldLine : l.newLine;
    if (n !== undefined) set.add(n);
  }
  return set;
}
function ranges(set) {
  const xs = [...set].sort((a, b) => a - b);
  const out = [];
  for (const x of xs) {
    const last = out.at(-1);
    if (last && x === last[1] + 1) last[1] = x;
    else out.push([x, x]);
  }
  return out.map(([a, b]) => (a === b ? `${a}` : `${a}-${b}`)).join(", ") || "none";
}
/** Every diff row of a file in display order, so ranges on either side can be ordered. */
function rowIndex(file) {
  const rows = { after: new Map(), before: new Map() };
  const changed = []; // per hunk: the row indices of + and - rows
  let i = 0;
  for (const h of file?.hunks || []) {
    const hunkRows = [];
    for (const l of h.lines) {
      if (l.newLine !== undefined) rows.after.set(l.newLine, i);
      if (l.oldLine !== undefined) rows.before.set(l.oldLine, i);
      if (l.kind !== "context") hunkRows.push(i);
      i++;
    }
    if (hunkRows.length) changed.push({ rows: hunkRows, label: `${h.newStart}-${h.newStart + Math.max(0, h.newLines - 1)}` });
  }
  return { rows, changed };
}

export function anchorLinks(markdown) {
  return [...markdown.matchAll(/\]\(#([^)\s]+)\)/g)].map((m) => m[1]);
}

export function validate(change, walkthrough) {
  const c = checker();
  const { fail, obj, str, int, bool, oneOf, arr } = c;
  const warnings = [];
  const byPath = new Map((change?.files || []).map((f) => [f.path, f]));

  const range = (path, v, filePath) => {
    const side = v.side || "after";
    const file = byPath.get(filePath);
    if (!file || !Number.isInteger(v.startLine) || !Number.isInteger(v.endLine)) return;
    if (v.endLine < v.startLine) return fail(path, `endLine ${v.endLine} is before startLine ${v.startLine}`);
    const seen = visibleLines(file, side);
    for (const k of ["startLine", "endLine"])
      if (!seen.has(v[k])) fail(`${path}.${k}`, `${side} line ${v[k]} is not in the diff of ${filePath}; visible ${side} lines: ${ranges(seen)}`);
  };
  const diagram = (path, v) =>
    obj(path, v, { html: str(60000), script: str(30000, 0), caption: str(1000), height: int(160, 2000) }, ["html"]);
  const note = (ownerPath, isFile = false) => (path, v) => {
    obj(path, v, {
      title: str(120), body: str(1000), code: str(1500), lang: str(40), vs: str(1500), vsLang: str(40),
      lines: (p, l) => obj(p, l, { path: str(1000), side: oneOf("after", "before"), startLine: int(1), endLine: int(1) }, ["startLine", "endLine"]),
    }, ["title", "body"]);
    for (const k of ["code", "vs"])
      if (typeof v?.[k] === "string" && v[k].split("\n").length > LIMITS.noteLines) fail(`${path}.${k}`, `has ${v[k].split("\n").length} lines; max ${LIMITS.noteLines}`);
    if (v?.vs !== undefined && v?.code === undefined) fail(`${path}.vs`, "needs code: vs is the comparison shown beside code");
    const lines = v?.lines;
    if (lines && typeof lines === "object") {
      const target = lines.path ?? ownerPath;
      if (isFile && !byPath.has(ownerPath)) return; // the file path error is already reported
      if (!target) fail(`${path}.lines.path`, "is required for overview notes");
      else if (ownerPath && target !== ownerPath) fail(`${path}.lines.path`, `must be this file (${ownerPath})`);
      else if (!byPath.has(target)) fail(`${path}.lines.path`, `${target} is not in change.json`);
      else range(`${path}.lines`, lines, target);
    }
  };
  const quiz = (path, v) => {
    obj(path, v, { prompt: str(2000), options: arr(str(1000), 2, 6), correct: int(0), answer: str(4000) }, ["prompt", "options", "correct", "answer"]);
    if (Array.isArray(v?.options) && Number.isInteger(v?.correct) && v.correct >= v.options.length)
      fail(`${path}.correct`, `${v.correct} is not a valid index into ${v.options.length} options (zero-based)`);
  };
  const decision = (path, v) => obj(path, v, { title: str(200), choice: str(2000), alternatives: str(2000), tradeoff: str(2000) }, ["title", "choice"]);

  if (!obj("walkthrough", walkthrough, {
    title: str(200),
    changeId: (p, v) => {
      str(64)(p, v);
      if (change?.id && v !== change.id) fail(p, `is ${v} but change.json is ${change.id}; the walkthrough was written for another capture`);
    },
    overview: (p, v) => {
      obj(p, v, {
        title: str(200), explanation: str(12000), remember: str(300),
        diagrams: arr(diagram, 1, LIMITS.diagrams), decisions: arr(decision, 1, LIMITS.decisions),
        quiz: arr(quiz, 1, LIMITS.quiz), notes: arr(note(undefined), 1, LIMITS.notes),
      }, ["title", "explanation"]);
      if (typeof v?.explanation === "string")
        for (const id of anchorLinks(v.explanation)) fail(`${p}.explanation`, `links to #${id}; the overview has no anchors (link anchors from file explanations)`);
    },
    files: arr(() => {}, 1, 2000),
  }, ["title", "overview", "files"])) return { errors: c.errors, warnings };

  const seen = new Set();
  (Array.isArray(walkthrough.files) ? walkthrough.files : []).forEach((f, i) => {
    const p = `files[${i}]`;
    const path = f?.path;
    if (typeof path === "string") {
      if (!byPath.has(path)) fail(`${p}.path`, `${path} is not in change.json`);
      if (seen.has(path)) fail(`${p}.path`, `${path} is explained twice`);
      seen.add(path);
    }
    const inChange = typeof path === "string" && byPath.has(path);
    obj(p, f, {
      path: str(1000), role: str(200), explanation: str(12000), isTest: bool, remember: str(300), diagram,
      anchors: arr((ap, a) => {
        obj(ap, a, { id: (pp, id) => typeof id !== "string" || !/^[a-z][a-z0-9-]{0,39}$/.test(id) ? fail(pp, "must be a lowercase slug like save-token") : undefined, side: oneOf("after", "before"), startLine: int(1), endLine: int(1), note: str(300) }, ["startLine", "endLine"]);
        if (inChange && a && typeof a === "object") range(ap, a, path);
      }, 1, LIMITS.anchors),
      notes: arr(note(path, true), 1, LIMITS.notes),
      tour: arr((tp, t) => {
        obj(tp, t, {
          lines: (lp, l) => obj(lp, l, { start: int(1), end: int(1), side: oneOf("after", "before") }, ["start", "end"]),
          title: str(120), text: str(3000),
        }, ["lines", "text"]);
      }, 1, LIMITS.tour),
    }, ["path", "role", "explanation"]);
    if (inChange && Array.isArray(f.tour)) {
      const { rows, changed } = rowIndex(byPath.get(path));
      let prevEnd = -1;
      const covered = [];
      f.tour.forEach((t, j) => {
        const l = t?.lines;
        if (!l || !Number.isInteger(l.start) || !Number.isInteger(l.end)) return;
        const side = l.side || "after";
        if (!rows[side]) return; // an invalid side is already reported
        const lp = `${p}.tour[${j}].lines`;
        const a = rows[side].get(l.start), b = rows[side].get(l.end);
        const visible = ranges(new Set(rows[side].keys()));
        if (a === undefined) fail(`${lp}.start`, `${side} line ${l.start} is not in the diff of ${path}; visible ${side} lines: ${visible}`);
        if (b === undefined) fail(`${lp}.end`, `${side} line ${l.end} is not in the diff of ${path}; visible ${side} lines: ${visible}`);
        if (a === undefined || b === undefined) return;
        if (b < a) return fail(lp, `end ${l.end} comes before start ${l.start}`);
        if (a <= prevEnd) fail(lp, "overlaps or comes before the previous segment; segments must follow the diff in order");
        prevEnd = Math.max(prevEnd, b);
        covered.push([a, b]);
      });
      const missed = changed.filter((h) => !h.rows.some((r) => covered.some(([a, b]) => r >= a && r <= b)));
      if (missed.length) warnings.push(`${path}: the tour misses ${missed.length} changed hunk(s) (after lines ${missed.map((h) => h.label).join(", ")})`);
    }
    const ids = new Set();
    for (const [j, a] of (Array.isArray(f?.anchors) ? f.anchors : []).entries())
      if (a?.id) {
        if (ids.has(a.id)) fail(`${p}.anchors[${j}].id`, `${a.id} is used twice in this file`);
        ids.add(a.id);
      }
    if (typeof f?.explanation === "string")
      for (const id of anchorLinks(f.explanation)) if (!ids.has(id)) fail(`${p}.explanation`, `links to #${id}, which is not an anchor id of this file`);
    for (const [j, t] of (Array.isArray(f?.tour) ? f.tour : []).entries())
      if (typeof t?.text === "string")
        for (const id of anchorLinks(t.text)) if (!ids.has(id)) fail(`${p}.tour[${j}].text`, `links to #${id}, which is not an anchor id of this file`);
    const changedFile = inChange && byPath.get(path);
    if (changedFile && !f.tour && !(f.isTest ?? changedFile.isTest) && !changedFile.binary && !changedFile.omitted && !PROSE.test(path) && changedFile.status !== "deleted")
      warnings.push(`${path} has no code tour`);
  });

  for (const f of change?.files || []) {
    const override = walkthrough.files?.find?.((x) => x?.path === f.path)?.isTest;
    const isTest = override ?? f.isTest;
    if (!seen.has(f.path) && !isTest && !f.binary && !f.omitted) warnings.push(`${f.path} is not explained (it will appear under "Not explained")`);
  }
  return { errors: c.errors, warnings };
}

export function validateDir(dir) {
  const read = (name) => {
    try {
      return JSON.parse(readFileSync(join(dir, name), "utf8"));
    } catch (e) {
      throw new Error(`${join(dir, name)}: ${e.code === "ENOENT" ? "missing" : "invalid JSON: " + e.message}`);
    }
  };
  const change = read("change.json");
  const walkthrough = read("walkthrough.json");
  return { change, walkthrough, ...validate(change, walkthrough) };
}

// realpath on both sides: installs are often symlinked (npx skills add, /tmp -> /private/tmp).
const isMain = () => { try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } };
if (isMain()) {
  try {
    const dir = process.argv[2];
    if (!dir) throw new Error("usage: node validate.mjs <dir>");
    const { errors, warnings } = validateDir(dir);
    for (const w of warnings) console.log("warning: " + w);
    for (const e of errors) console.log("error: " + e);
    console.log(errors.length ? `${errors.length} error(s)` : "walkthrough is valid");
    process.exitCode = errors.length ? 1 : 0;
  } catch (e) {
    console.error("validate: " + e.message);
    process.exitCode = 2;
  }
}
