---
name: throughline
description: Explains a code change as an interactive page, with the full git diff beside an overview and per-file explanations that include line links, diagrams, Learn notes and a quiz. Use when the user asks to walk through, explain, review or understand a change (uncommitted work, a branch, recent commits, or one change across several repos), or mentions Throughline.
---

# Throughline

Turn a git change into one self-contained HTML reader. `<skill>` is the directory containing this file. The scripts need Node 18 or later and nothing else.

## Workflow

1. **Capture:** `node <skill>/scripts/capture.mjs [repo…] [--base <ref> | --commits <n> | --staged | --unstaged]`.
   - By default it captures uncommitted work (untracked files included). With none, it compares the branch with its merge base on the default branch.
   - Pass several repo paths for one change that spans repos.
   - It prints one line per file, the totals and where it wrote `change.json` (call that directory `<dir>`).
2. **Read the file list.** Skip lockfiles and generated files.
3. **Pull only the diffs you need:** `node <skill>/scripts/capture.mjs --show <path> [--dir <dir>]`. The printed numbers are the ones anchors use. Read surrounding code with your normal tools when the diff isn't enough.
4. **Choose the flow order:** follow the request or the dependencies (entry point, then core logic, then effects, then tests and docs). Don't sort alphabetically.
5. **Check the profile:** `node <skill>/scripts/profile.mjs` prints what the reader knows and is learning. Add Learn notes only for `learning` topics that appear in this diff.
6. **Read `<skill>/reference/format.md` once.** Then write `<dir>/walkthrough.json`:
   - the overview;
   - every non-test source file, in flow order;
   - one line each for tests, docs and config.
7. **Render:** `node <skill>/scripts/show.mjs <dir>` validates the JSON, writes `<dir>/throughline.html` and opens it. Each `error:` line names a JSON path; fix it and rerun.
8. **Report:** give the user the HTML path and say what you could not verify.

## Quality bar

Write for a developer who has to defend this change in review, not for a beginner. Cover:
- what changed, why, and how the parts connect;
- the decisions, the alternatives not taken and the tradeoffs;
- failure modes, concurrency and ordering, retries, security and scale limits;
- the questions a senior reviewer would ask.

Ground every claim in the diff. Don't claim tests ran unless you ran them. Never narrate code line by line.
