import type { ChangedFile, Highlight } from "./types.ts";
import { inRange } from "./model.ts";
import { Code, languageForPath } from "./highlight.tsx";

export function FullDiff({
  file,
  highlight,
  mentioned,
  steps,
  activeStep,
}: {
  file: ChangedFile;
  highlight?: Highlight;
  mentioned: Highlight[];
  /** The selected file's tour ranges: the step number marks each range's first row. */
  steps?: Highlight[];
  activeStep?: number | null;
}) {
  const language = languageForPath(file.path);
  const own = mentioned.filter((m) => m.path === file.path);
  const lit = highlight?.path === file.path ? highlight : undefined;
  if (file.binary || file.omitted || !file.hunks.length)
    return (
      <div class="full-diff">
        <p class="diff-unavailable">
          {file.binary
            ? "Binary file: no text diff."
            : file.omitted
              ? `No diff body (${file.omitted}).`
              : "No text changes (mode or rename only)."}
        </p>
      </div>
    );
  return (
    <div class="full-diff">
      {file.hunks.map((h, hi) => (
        <section class="diff-hunk" key={hi}>
          <div class="hunk-header">
            @@ −{h.oldStart},{h.oldLines} +{h.newStart},{h.newLines} @@
          </div>
          {h.lines.map((line, i) => {
            const active = lit && inRange(line, lit);
            const marked = own.some((m) => inRange(line, m));
            const stepAt = steps?.findIndex(
              (r) => (r.side === "before" ? line.oldLine : line.newLine) === r.startLine && (r.side === "before" ? line.kind !== "add" : line.kind !== "delete"),
            );
            const isStep = stepAt !== undefined && stepAt >= 0;
            return (
              <div
                key={i}
                data-old={line.oldLine}
                data-new={line.newLine}
                class={
                  "code-line " +
                  line.kind +
                  (active ? " highlighted" : "") +
                  (marked ? " mentioned" : "")
                }
              >
                <span
                  class={"reference-gutter" + (isStep ? " step-mark" + (stepAt === activeStep ? " active" : "") : "")}
                  aria-hidden="true"
                >
                  {isStep ? stepAt + 1 : marked ? "•" : ""}
                </span>
                <span class="line-number">{line.oldLine ?? ""}</span>
                <span class="line-number">{line.newLine ?? ""}</span>
                <span class="diff-sign">
                  {line.kind === "add" ? "+" : line.kind === "delete" ? "−" : " "}
                </span>
                <code>
                  <Code text={line.text} language={language} />
                </code>
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}
