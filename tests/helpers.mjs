import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const root = fileURLToPath(new URL("..", import.meta.url));
export const scripts = join(root, "skills/throughline/scripts");

export function tempDir(prefix = "throughline-test-") {
  return mkdtempSync(join(tmpdir(), prefix));
}
export function git(cwd, ...args) {
  return execFileSync("git", ["-c", "user.name=T", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", ...args], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}
export function write(dir, files) {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
}
/** A repo with one commit on main. */
export function repo(files = { "src/app.js": "one\ntwo\nthree\n" }, name = "app") {
  const dir = join(tempDir(), name);
  mkdirSync(dir);
  write(dir, files);
  git(dir, "init", "-q", "-b", "main");
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "init");
  return dir;
}
export function run(script, args, opts = {}) {
  try {
    const stdout = execFileSync(process.execPath, [join(scripts, script), ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      ...opts,
    });
    return { code: 0, stdout, stderr: "" };
  } catch (e) {
    return { code: e.status, stdout: e.stdout, stderr: e.stderr };
  }
}
