#!/usr/bin/env node
// Reader profile: what the reader knows and is learning. Drives Learn notes.
//   node profile.mjs                       print it in one line
//   node profile.mjs --knows "TypeScript, React Native" --learning "Go, Redis" [--goal "…"]
// Stored at $THROUGHLINE_CONFIG_DIR, $XDG_CONFIG_HOME/throughline or ~/.config/throughline.
import { mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function profilePath(env = process.env) {
  const dir = env.THROUGHLINE_CONFIG_DIR || join(env.XDG_CONFIG_HOME || join(homedir(), ".config"), "throughline");
  return join(dir, "profile.json");
}
const list = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim()) : []);
export function readProfile(env = process.env) {
  try {
    const p = JSON.parse(readFileSync(profilePath(env), "utf8"));
    return { knows: list(p.knows), learning: list(p.learning), ...(typeof p.goal === "string" && p.goal.trim() ? { goal: p.goal.trim() } : {}) };
  } catch {
    return undefined;
  }
}
export function describe(p) {
  if (!p) return "no profile; set one: node profile.mjs --knows \"…\" --learning \"…\"";
  return [`knows: ${p.knows.join(", ") || "-"}`, `learning: ${p.learning.join(", ") || "-"}`, p.goal && `goal: ${p.goal}`].filter(Boolean).join(" · ");
}
export function writeProfile(update, env = process.env) {
  const current = readProfile(env) || { knows: [], learning: [] };
  const split = (s) => s.split(",").map((x) => x.trim()).filter(Boolean);
  const next = { knows: current.knows, learning: current.learning, ...(current.goal ? { goal: current.goal } : {}) };
  if (update.knows !== undefined) next.knows = split(update.knows);
  if (update.learning !== undefined) next.learning = split(update.learning);
  if (update.goal !== undefined) {
    if (update.goal.trim()) next.goal = update.goal.trim();
    else delete next.goal;
  }
  const file = profilePath(env);
  mkdirSync(resolve(file, ".."), { recursive: true });
  writeFileSync(file + ".tmp", JSON.stringify(next, null, 2) + "\n");
  renameSync(file + ".tmp", file);
  return next;
}

// realpath on both sides: installs are often symlinked (npx skills add, /tmp -> /private/tmp).
const isMain = () => { try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } };
if (isMain()) {
  const args = process.argv.slice(2);
  const update = {};
  try {
    for (let i = 0; i < args.length; i++) {
      const key = { "--knows": "knows", "--learning": "learning", "--goal": "goal" }[args[i]];
      if (!key || args[i + 1] === undefined) throw new Error(`usage: profile.mjs [--knows "a, b"] [--learning "c, d"] [--goal "…"]`);
      update[key] = args[++i];
    }
    console.log(describe(Object.keys(update).length ? writeProfile(update) : readProfile()));
  } catch (e) {
    console.error("profile: " + e.message);
    process.exitCode = 2;
  }
}
