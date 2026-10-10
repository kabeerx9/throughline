import type {
  Change,
  ChangedFile,
  FileLesson,
  Highlight,
  LineRange,
  Repo,
} from "./types.ts";

export const fmt = (n: number) => n.toLocaleString("en-US");

/** The walkthrough may override capture's test heuristic per file. */
export function isTestFile(file: ChangedFile, lesson?: FileLesson) {
  return lesson?.isTest ?? file.isTest;
}

/** Explained files in the walkthrough's flow order, then the rest by path. */
export function flowOrder(files: ChangedFile[], lessons: FileLesson[]) {
  const rank = new Map(lessons.map((l, i) => [l.path, i]));
  return [...files].sort((a, b) => {
    const ra = rank.get(a.path) ?? Infinity;
    const rb = rank.get(b.path) ?? Infinity;
    if (ra !== rb) return ra - rb;
    return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
  });
}

export function totals(files: ChangedFile[]) {
  return files.reduce(
    (t, f) => ({
      files: t.files + 1,
      additions: t.additions + f.additions,
      deletions: t.deletions + f.deletions,
    }),
    { files: 0, additions: 0, deletions: 0 },
  );
}

/** Repository label and repo-relative path for a (possibly prefixed) path. */
export function splitPath(file: ChangedFile, change: Change) {
  const multi = change.repos.length > 1;
  return {
    repo: file.repo,
    path:
      multi && file.path.startsWith(file.repo + "/")
        ? file.path.slice(file.repo.length + 1)
        : file.path,
  };
}

export function editorLink(file: ChangedFile, change: Change, line = 1) {
  const repo: Repo | undefined = change.repos.find((r) => r.name === file.repo);
  const relative = splitPath(file, change).path;
  if (!repo || !repo.root.startsWith("/") && !/^[A-Za-z]:[\\/]/.test(repo.root))
    return undefined;
  if (relative.split("/").includes("..")) return undefined;
  const root = repo.root.replace(/\\/g, "/").replace(/\/$/, "");
  const encode = (p: string) => p.split("/").map(encodeURIComponent).join("/");
  return `vscode://file${root.startsWith("/") ? "" : "/"}${encode(root)}/${encode(relative)}:${line}`;
}

export function resolveRange(range: LineRange, path: string): Highlight {
  return {
    path: range.path ?? path,
    side: range.side ?? "after",
    startLine: range.startLine,
    endLine: range.endLine,
  };
}

export function inRange(
  line: { oldLine?: number; newLine?: number },
  r: Highlight,
) {
  const n = r.side === "before" ? line.oldLine : line.newLine;
  return n !== undefined && n >= r.startLine && n <= r.endLine;
}

/** Index of the next file in `list` from `current`, or -1 at the ends. */
export function step(list: string[], current: string | null, delta: number) {
  const i = current === null ? -1 : list.indexOf(current);
  if (i < 0) return list.length ? (delta > 0 ? 0 : list.length - 1) : -1;
  const next = i + delta;
  return next >= 0 && next < list.length ? next : -1;
}

type Store = Pick<Storage, "getItem" | "setItem">;
function safeStorage(): Store | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}
export const viewedKey = (id: string) => "throughline-viewed:" + id;
export const testsKey = "throughline-show-tests";

export function loadViewed(id: string, paths: string[], store = safeStorage()) {
  try {
    const value: unknown = JSON.parse(store?.getItem(viewedKey(id)) || "[]");
    return new Set(
      Array.isArray(value)
        ? value.filter((p): p is string => typeof p === "string" && paths.includes(p))
        : [],
    );
  } catch {
    return new Set<string>();
  }
}
export function saveViewed(id: string, viewed: Set<string>, store = safeStorage()) {
  try {
    store?.setItem(viewedKey(id), JSON.stringify([...viewed]));
  } catch {
    /* Reading still works without storage. */
  }
}
export function loadShowTests(store = safeStorage()) {
  try {
    return store?.getItem(testsKey) !== "hidden";
  } catch {
    return true;
  }
}
export function saveShowTests(show: boolean, store = safeStorage()) {
  try {
    store?.setItem(testsKey, show ? "shown" : "hidden");
  } catch {
    /* ignore */
  }
}

export const lineLabel = (r: Highlight) =>
  `${r.side} L${r.startLine}${r.endLine > r.startLine ? "–" + r.endLine : ""}`;
