// Rebuilds the demo: a made-up Go notes API gaining a per-client rate limiter.
// It replays before/ -> after/ in a scratch git repo, captures the change with the
// skill's own capture.mjs, then renders throughline.html from walkthrough.json.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { capture } from "../skills/throughline/scripts/capture.mjs";
import { validate } from "../skills/throughline/scripts/validate.mjs";
import { render } from "../skills/throughline/scripts/show.mjs";

const demo = fileURLToPath(new URL("./rate-limiter/", import.meta.url));
const repo = join(mkdtempSync(join(tmpdir(), "throughline-demo-")), "notes");
const env = { ...process.env, GIT_AUTHOR_DATE: "2026-01-01T00:00:00Z", GIT_COMMITTER_DATE: "2026-01-01T00:00:00Z" };
const git = (...args) =>
  execFileSync("git", ["-c", "user.name=Demo", "-c", "user.email=demo@example.com", ...args], { cwd: repo, env, stdio: "pipe" });

try {
  cpSync(join(demo, "before"), repo, { recursive: true });
  git("init", "-q", "-b", "main");
  git("add", "-A");
  git("commit", "-q", "-m", "Notes API");
  for (const entry of readdirSync(repo)) if (entry !== ".git") rmSync(join(repo, entry), { recursive: true });
  cpSync(join(demo, "after"), repo, { recursive: true });

  const change = capture([repo]);
  change.id = "demo-notes-rate-limit";
  change.createdAt = "2026-01-01T00:00:00.000Z";
  change.repos[0].root = "/home/you/notes";
  writeFileSync(join(demo, "change.json"), JSON.stringify(change, null, 1) + "\n");

  const walkthroughFile = join(demo, "walkthrough.json");
  if (existsSync(walkthroughFile)) {
    const walkthrough = JSON.parse(readFileSync(walkthroughFile, "utf8"));
    const { errors, warnings } = validate(change, walkthrough);
    for (const w of warnings) console.log("warning: " + w);
    if (errors.length) throw new Error("demo walkthrough is invalid:\n" + errors.join("\n"));
    const profile = { knows: ["TypeScript", "React Native"], learning: ["Go"] };
    writeFileSync(join(demo, "throughline.html"), render({ change, walkthrough, profile }));
    console.log("demo: wrote examples/rate-limiter/throughline.html");
  } else console.log("demo: wrote change.json (no walkthrough.json yet)");
} finally {
  rmSync(join(repo, ".."), { recursive: true, force: true });
}
