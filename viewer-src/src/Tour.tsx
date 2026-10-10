import type { Highlight, TourStep } from "./types.ts";
import { lineLabel, tourRange } from "./model.ts";
import { Markdown, type LinkHandlers } from "./Markdown.tsx";

/** A file's code tour: numbered steps over blocks of its diff, walked with n/p. */
export function Tour({
  tour,
  path,
  active,
  onStep,
  onHover,
  links,
}: {
  tour: TourStep[];
  path: string;
  active: number | null;
  onStep: (i: number) => void;
  onHover: (r?: Highlight) => void;
  links: LinkHandlers;
}) {
  const at = active ?? -1;
  return (
    <section class="tour" aria-label="Code tour">
      <div class="tour-head">
        <h2>Code tour</h2>
        <span class="tour-count">{active === null ? `${tour.length} steps` : `Step ${at + 1} of ${tour.length}`}</span>
        <button type="button" aria-label="Previous step" disabled={at <= 0} onClick={() => onStep(at - 1)}>
          ‹
        </button>
        <button type="button" aria-label="Next step" disabled={at >= tour.length - 1} onClick={() => onStep(at + 1)}>
          ›
        </button>
        <span class="key-hint-inline">n / p</span>
      </div>
      <ol class="tour-steps">
        {tour.map((t, i) => {
          const r = tourRange(t, path);
          return (
            <li
              key={i}
              id={"tour-step-" + i}
              class={"tour-step" + (i === active ? " active" : "")}
              onMouseEnter={() => onHover(r)}
              onMouseLeave={() => onHover(undefined)}
            >
              <button type="button" class="tour-step-head" aria-current={i === active ? "step" : undefined} onClick={() => onStep(i)}>
                <span class="tour-num">{i + 1}</span>
                <span class="tour-title">{t.title || "Lines " + r.startLine + "–" + r.endLine}</span>
                <small>{lineLabel(r)}</small>
              </button>
              <div class="tour-text">
                <Markdown text={t.text} {...links} />
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
