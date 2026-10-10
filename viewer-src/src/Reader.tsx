import { Fragment } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { ChangedFile, FileLesson, Highlight, ViewerData } from "./types.ts";
import {
  editorLink,
  flowOrder,
  fmt,
  isTestFile,
  lineLabel,
  loadShowTests,
  loadViewed,
  resolveRange,
  saveShowTests,
  saveViewed,
  splitPath,
  step,
  totals,
} from "./model.ts";
import { Markdown } from "./Markdown.tsx";
import { FullDiff } from "./FullDiff.tsx";
import { Diagram } from "./Diagram.tsx";
import { LearningNotes } from "./LearningNotes.tsx";
import { Quiz } from "./Quiz.tsx";

function Stats({ t }: { t: { additions: number; deletions: number } }) {
  return (
    <>
      <span class="adds">+{fmt(t.additions)}</span> <span class="dels">−{fmt(t.deletions)}</span>
    </>
  );
}

export function Reader({ data }: { data: ViewerData }) {
  const { change, walkthrough, profile } = data;
  const lessons = useMemo(() => new Map(walkthrough.files.map((l) => [l.path, l])), [walkthrough]);
  const ordered = useMemo(() => flowOrder(change.files, walkthrough.files), [change, walkthrough]);
  const testOf = (f: ChangedFile) => isTestFile(f, lessons.get(f.path));
  const multiRepo = change.repos.length > 1;

  const [showTests, setShowTests] = useState(loadShowTests);
  const [filter, setFilter] = useState("");
  const [viewed, setViewed] = useState(() => loadViewed(change.id, change.files.map((f) => f.path)));
  const [selected, setSelected] = useState<string | null>(null);
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const [highlight, setHighlight] = useState<Highlight>();
  const [hover, setHover] = useState<Highlight>();
  const [sheet, setSheet] = useState(false);
  const codePane = useRef<HTMLDivElement>(null);
  const lessonPane = useRef<HTMLDivElement>(null);

  const navFiles = ordered.filter((f) => showTests || !testOf(f));
  const navPaths = navFiles.map((f) => f.path);
  const shown = navFiles.filter((f) => f.path.toLowerCase().includes(filter.trim().toLowerCase()));
  const all = totals(change.files);
  const withoutTests = totals(change.files.filter((f) => !testOf(f)));
  const testCount = all.files - withoutTests.files;
  const current = selected ? lessons.get(selected) : undefined;
  const selectedFile = selected ? change.files.find((f) => f.path === selected) : undefined;

  const mentioned = useMemo(() => {
    const out: Highlight[] = [];
    for (const l of walkthrough.files) {
      for (const a of l.anchors || []) out.push(resolveRange(a, l.path));
      for (const n of l.notes || []) if (n.lines) out.push(resolveRange(n.lines, l.path));
    }
    for (const n of walkthrough.overview.notes || []) if (n.lines?.path) out.push(resolveRange(n.lines, n.lines.path));
    return out;
  }, [walkthrough]);

  useEffect(() => lessonPane.current?.scrollTo(0, 0), [selected]);

  const setOpen = (path: string, open: boolean) =>
    setOpened((old) => {
      const next = new Set(old);
      if (open) next.add(path);
      else next.delete(path);
      return next;
    });
  // Saved in the handler, not an effect: effects run after paint, and a reload
  // right after a click would lose the change.
  const toggleViewed = (path: string) => {
    const next = new Set(viewed);
    if (next.has(path)) next.delete(path);
    else {
      next.add(path);
      setOpen(path, false);
    }
    setViewed(next);
    saveViewed(change.id, next);
  };
  const select = (path: string) => {
    setSelected(path);
    setOpen(path, true);
    setHighlight(undefined);
    setHover(undefined);
    setSheet(true);
  };
  const back = () => {
    setSelected(null);
    setHighlight(undefined);
    setHover(undefined);
  };
  const go = (delta: number) => {
    const i = step(navPaths, selected, delta);
    if (i < 0) return;
    const path = navPaths[i];
    setFilter("");
    select(path);
    requestAnimationFrame(() => document.getElementById("file-" + path)?.scrollIntoView({ block: "nearest" }));
  };
  const toggleTests = () => {
    const next = !showTests;
    setShowTests(next);
    saveShowTests(next);
    if (!next && selectedFile && testOf(selectedFile)) back();
  };

  // Keys read the latest render through a ref: effects run after paint, so a
  // listener re-registered per render would miss fast repeated presses.
  const onKey = useRef<(e: KeyboardEvent) => void>(() => {});
  onKey.current = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (e.key === "Escape") {
      if (target.closest?.("input[type=search]") && filter) return;
      back();
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (target.closest?.("input,textarea,select,[contenteditable]")) return;
    if (e.key === "ArrowRight" || e.key === "j") {
      e.preventDefault();
      go(1);
    } else if (e.key === "ArrowLeft" || e.key === "k") {
      e.preventDefault();
      go(-1);
    } else if (e.key === "x" && selected) {
      e.preventDefault();
      toggleViewed(selected);
    }
  };
  useEffect(() => {
    const listener = (e: KeyboardEvent) => onKey.current(e);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  function jumpRange(range: Highlight) {
    setFilter("");
    setHover(undefined);
    setHighlight(range);
    setOpen(range.path, true);
    setSheet(false);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const el = document.getElementById("diff-" + range.path)?.querySelector<HTMLElement>(".highlighted");
        const pane = codePane.current;
        if (!el || !pane) return;
        const top = pane.scrollTop + el.getBoundingClientRect().top - pane.getBoundingClientRect().top - 80;
        pane.scrollTo({ top, behavior: "smooth" });
      }),
    );
  }
  const anchorById = (lesson: FileLesson | undefined, id?: string) => {
    const a = lesson?.anchors?.find((x, i) => (x.id || "range-" + i) === id);
    return a && lesson ? resolveRange(a, lesson.path) : undefined;
  };
  const linkHandlers = {
    onAnchor: (id: string) => {
      const r = anchorById(current, id);
      if (r) jumpRange(r);
    },
    onAnchorHover: (id?: string) => setHover(anchorById(current, id)),
  };

  let unexplainedShown = false;
  return (
    <div class="reader">
      <nav class="review-nav" aria-label="File navigation">
        <span class="brand" aria-hidden="true" />
        <strong title={walkthrough.title}>{walkthrough.title}</strong>
        <button type="button" aria-label="Previous file" onClick={() => go(-1)}>
          ←
        </button>
        <button type="button" aria-label="Next file" onClick={() => go(1)}>
          →
        </button>
      </nav>
      <main class="reader-body">
        <div ref={codePane} class="code-pane" aria-label="Full git diff" tabIndex={0}>
          <div class="diff-heading">
            <div class="review-size">
              <h1>
                {fmt(all.files)} {all.files === 1 ? "file" : "files"} · <Stats t={all} />
                {!showTests && testCount > 0 && (
                  <span class="without-tests">
                    {" "}
                    · without tests <Stats t={withoutTests} />
                  </span>
                )}
              </h1>
              <span class="viewed-count">
                {viewed.size} / {all.files} viewed
              </span>
            </div>
            {multiRepo && (
              <ul class="repo-breakdown" aria-label="Per-repository totals">
                {change.repos.map((r) => {
                  const files = change.files.filter((f) => f.repo === r.name && (showTests || !testOf(f)));
                  const t = totals(files);
                  return (
                    <li key={r.name}>
                      <strong>{r.name}</strong>
                      <span>
                        {t.files} files · <Stats t={t} />
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            <button
              type="button"
              class="phone-overview"
              onClick={() => {
                back();
                setSheet(true);
              }}
            >
              The whole idea ↑
            </button>
          </div>
          <div class="diff-controls">
            <button
              type="button"
              class="tests-toggle"
              aria-pressed={showTests}
              disabled={!testCount}
              title={showTests ? "Hide test files" : "Show test files"}
              onClick={toggleTests}
            >
              <span class="switch" aria-hidden="true" />
              Tests <small>{testCount}</small>
            </button>
            <input
              type="search"
              aria-label="Filter files by path"
              placeholder="Filter files…"
              value={filter}
              onInput={(e) => setFilter((e.target as HTMLInputElement).value)}
            />
            <button type="button" onClick={() => setOpened(new Set(shown.map((f) => f.path)))}>
              Expand all
            </button>
            <button type="button" onClick={() => setOpened(new Set())}>
              Collapse all
            </button>
            <span class="key-hint">j/k or ←/→ files · x viewed · Esc whole idea</span>
          </div>
          {!shown.length && <p class="diff-unavailable">No files match “{filter}”.</p>}
          {shown.map((file) => {
            const lesson = lessons.get(file.path);
            const label = splitPath(file, change);
            const group = !lesson && !unexplainedShown;
            if (group) unexplainedShown = true;
            const open = opened.has(file.path);
            const firstLine = lesson?.anchors?.find((a) => (a.side ?? "after") === "after")?.startLine || 1;
            const link = file.status === "deleted" ? undefined : editorLink(file, change, firstLine);
            return (
              <Fragment key={file.path}>
                {group && <h2 class="unexplained-heading">Not explained</h2>}
                <section
                  id={"file-" + file.path}
                  class={
                    "diff-file" + (selected === file.path ? " selected" : "") + (viewed.has(file.path) ? " viewed" : "")
                  }
                  data-path={file.path}
                >
                  <div class="file-header-row">
                    <button
                      type="button"
                      class="file-header"
                      aria-expanded={open}
                      aria-pressed={selected === file.path}
                      onClick={() => {
                        if (open) {
                          setOpen(file.path, false);
                          if (selected === file.path) back();
                        } else select(file.path);
                      }}
                    >
                      <span class="chevron" aria-hidden="true">
                        {open ? "⌄" : "›"}
                      </span>
                      <span class="file-label">
                        {multiRepo && <small>{label.repo}</small>}
                        <strong>
                          {file.oldPath ? splitPath({ ...file, path: file.oldPath }, change).path + " → " : ""}
                          {label.path}
                        </strong>
                        {testOf(file) && <span class="tag">test</span>}
                      </span>
                      <span class="file-stats">
                        <Stats t={file} />
                        <small>{file.status}</small>
                      </span>
                    </button>
                    <div class="file-actions">
                      {link && (
                        <a href={link} aria-label={"Open " + label.path + " in editor"} title="Open in editor">
                          ↗
                        </a>
                      )}
                      <label>
                        <input
                          type="checkbox"
                          aria-label={"Mark " + label.path + " viewed"}
                          checked={viewed.has(file.path)}
                          onChange={() => toggleViewed(file.path)}
                        />
                        <span>Viewed</span>
                      </label>
                    </div>
                  </div>
                  {open && (
                    <div id={"diff-" + file.path}>
                      {selected !== file.path && (
                        <button type="button" class="explain-open-file" onClick={() => select(file.path)}>
                          {lesson ? "Read this file's explanation →" : "Select this file →"}
                        </button>
                      )}
                      <FullDiff file={file} highlight={hover || highlight} mentioned={mentioned} />
                    </div>
                  )}
                </section>
              </Fragment>
            );
          })}
        </div>
        <div
          ref={lessonPane}
          class={"lesson-pane" + (sheet ? " sheet-open" : "")}
          aria-label="Explanation"
          tabIndex={0}
        >
          <div class="sheet-handle">
            <button type="button" onClick={() => setSheet(false)} aria-label="Dismiss explanation">
              ↓
            </button>
          </div>
          <article class="lesson-content" key={selected || "overview"}>
            {selected ? (
              <>
                <button type="button" class="back-link" onClick={back}>
                  ← The whole idea
                </button>
                {current && selectedFile ? (
                  <>
                    <p class="flow-role">
                      {walkthrough.files.indexOf(current) + 1} of {walkthrough.files.length} in the flow
                      {multiRepo ? " · " + selectedFile.repo : ""}
                      {testOf(selectedFile) ? " · test" : ""}
                    </p>
                    <h1>{current.role}</h1>
                    <p class="file-caption">{splitPath(selectedFile, change).path}</p>
                    <Markdown text={current.explanation} {...linkHandlers} />
                    {current.diagram && <Diagram diagram={current.diagram} title={current.role} />}
                    {current.anchors?.length ? (
                      <nav class="line-references" aria-label="Line references">
                        {current.anchors.map((a, i) => {
                          const r = resolveRange(a, current.path);
                          return (
                            <a
                              key={i}
                              href={"#" + (a.id || "range-" + i)}
                              onMouseEnter={() => setHover(r)}
                              onMouseLeave={() => setHover(undefined)}
                              onFocus={() => setHover(r)}
                              onBlur={() => setHover(undefined)}
                              onClick={(e) => {
                                e.preventDefault();
                                jumpRange(r);
                              }}
                            >
                              {a.note || "See the change"}{" "}
                              <small>{lineLabel(r)}</small>
                            </a>
                          );
                        })}
                      </nav>
                    ) : null}
                    {current.remember && (
                      <p class="remember">
                        <b>Remember</b>
                        {current.remember}
                      </p>
                    )}
                    <LearningNotes
                      notes={current.notes}
                      path={current.path}
                      profile={profile}
                      onHighlight={setHover}
                      onJump={jumpRange}
                    />
                  </>
                ) : (
                  <>
                    <p class="flow-role">Not explained</p>
                    <h1>{selectedFile ? splitPath(selectedFile, change).path : selected}</h1>
                    <p class="not-covered">
                      The walkthrough doesn't cover this file.
                      {selectedFile?.omitted ? ` Its diff body was skipped (${selectedFile.omitted}).` : ""}
                    </p>
                  </>
                )}
              </>
            ) : (
              <>
                <p class="flow-role">The whole idea</p>
                <h1>{walkthrough.overview.title}</h1>
                <Markdown text={walkthrough.overview.explanation} />
                {walkthrough.overview.diagrams?.map((d, i) => (
                  <Diagram key={i} diagram={d} title={walkthrough.overview.title + " " + (i + 1)} />
                ))}
                {walkthrough.overview.decisions?.length ? (
                  <section class="decisions">
                    <h2>Decisions to defend</h2>
                    {walkthrough.overview.decisions.map((d, i) => (
                      <div key={i} class="decision">
                        <h3>{d.title}</h3>
                        <p>{d.choice}</p>
                        {d.alternatives && (
                          <p>
                            <span class="decision-label">Instead of</span> {d.alternatives}
                          </p>
                        )}
                        {d.tradeoff && (
                          <p>
                            <span class="decision-label">Cost</span> {d.tradeoff}
                          </p>
                        )}
                      </div>
                    ))}
                  </section>
                ) : null}
                {walkthrough.overview.remember && (
                  <p class="remember">
                    <b>Remember</b>
                    {walkthrough.overview.remember}
                  </p>
                )}
                <LearningNotes
                  notes={walkthrough.overview.notes}
                  path=""
                  profile={profile}
                  onHighlight={setHover}
                  onJump={jumpRange}
                />
                {walkthrough.overview.quiz?.length ? (
                  <>
                    <h2>Test your understanding</h2>
                    <Quiz questions={walkthrough.overview.quiz} />
                  </>
                ) : null}
                <p class="start-hint">
                  Pick a file on the left, or press <kbd>j</kbd> to start with the first one in the flow.
                </p>
              </>
            )}
          </article>
        </div>
      </main>
    </div>
  );
}
