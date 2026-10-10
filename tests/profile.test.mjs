import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { run, tempDir } from "./helpers.mjs";

test("profile.mjs sets, preserves and prints the reader profile", () => {
  const dir = tempDir();
  const env = { ...process.env, THROUGHLINE_CONFIG_DIR: dir };
  assert.match(run("profile.mjs", [], { env }).stdout, /^no profile/);
  const set = run("profile.mjs", ["--knows", "TypeScript, React Native", "--learning", "Go, Redis"], { env });
  assert.equal(set.stdout.trim(), "knows: TypeScript, React Native · learning: Go, Redis");
  run("profile.mjs", ["--goal", "Defend backend decisions"], { env });
  assert.deepEqual(JSON.parse(readFileSync(join(dir, "profile.json"), "utf8")), {
    knows: ["TypeScript", "React Native"],
    learning: ["Go", "Redis"],
    goal: "Defend backend decisions",
  });
  run("profile.mjs", ["--goal", ""], { env });
  assert.equal(run("profile.mjs", [], { env }).stdout.trim(), "knows: TypeScript, React Native · learning: Go, Redis");
  const bad = run("profile.mjs", ["--knows"], { env });
  assert.equal(bad.code, 2);
});

test("XDG_CONFIG_HOME is honoured", () => {
  const xdg = tempDir();
  const env = { ...process.env, THROUGHLINE_CONFIG_DIR: "", XDG_CONFIG_HOME: xdg };
  run("profile.mjs", ["--learning", "Rust"], { env });
  assert.deepEqual(JSON.parse(readFileSync(join(xdg, "throughline/profile.json"), "utf8")).learning, ["Rust"]);
});
