#!/usr/bin/env node
// Validate a walkthrough and write a self-contained <dir>/throughline.html, then open it.
//   node show.mjs [<dir>] [--no-open]
import { execFile } from "node:child_process";
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { latestDir } from "./capture.mjs";
import { readProfile } from "./profile.mjs";
import { validateDir } from "./validate.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const PLACEHOLDER = '<script type="application/json" id="throughline-data">null</script>';
const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

export function render({ change, walkthrough, profile }, viewer = readFileSync(join(here, "../viewer/viewer.html"), "utf8")) {
  if (!viewer.includes(PLACEHOLDER)) throw new Error("viewer.html has no data placeholder; rebuild the viewer");
  // "<" is escaped so no string in the data can close the script element.
  const json = JSON.stringify({ change, walkthrough, profile: profile || null }).replace(/</g, "\\u003c");
  return viewer
    .replace(PLACEHOLDER, () => `<script type="application/json" id="throughline-data">${json}</script>`)
    .replace(/<title>[^<]*<\/title>/, () => `<title>${escapeHtml(walkthrough.title)} · Throughline</title>`);
}

export function openFile(file) {
  const [cmd, args] =
    process.platform === "darwin" ? ["open", [file]] : process.platform === "win32" ? ["cmd", ["/c", "start", "", file]] : ["xdg-open", [file]];
  execFile(cmd, args, () => {});
}

// realpath on both sides: installs are often symlinked (npx skills add, /tmp -> /private/tmp).
const isMain = () => { try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } };
if (isMain()) {
  try {
    const args = process.argv.slice(2);
    const dir = args.find((a) => !a.startsWith("--")) || latestDir();
    if (!dir) throw new Error("usage: node show.mjs <dir> [--no-open]");
    const { change, walkthrough, errors, warnings } = validateDir(dir);
    for (const w of warnings) console.log("warning: " + w);
    if (errors.length) {
      for (const e of errors) console.log("error: " + e);
      console.log(`${errors.length} error(s); fix walkthrough.json and run show again`);
      process.exitCode = 1;
    } else {
      const out = join(resolve(dir), "throughline.html");
      writeFileSync(out, render({ change, walkthrough, profile: readProfile() }));
      if (!args.includes("--no-open")) openFile(out);
      console.log(out);
    }
  } catch (e) {
    console.error("show: " + e.message);
    process.exitCode = 2;
  }
}
