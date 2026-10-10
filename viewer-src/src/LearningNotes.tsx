import type { Highlight, Note, Profile } from "./types.ts";
import { lineLabel, resolveRange } from "./model.ts";
import { Code, languageForName } from "./highlight.tsx";

export function learnFor(profile: Profile | null) {
  if (!profile?.learning.length) return "";
  const knows = profile.knows.length ? ` · you know ${profile.knows.join(", ")}` : "";
  return `for learning ${profile.learning.join(", ")}${knows}`;
}

export function LearningNotes({
  notes,
  path,
  profile,
  onHighlight,
  onJump,
}: {
  notes?: Note[];
  path: string;
  profile: Profile | null;
  onHighlight: (range?: Highlight) => void;
  onJump: (range: Highlight) => void;
}) {
  if (!notes?.length) return null;
  const subtitle = learnFor(profile);
  return (
    <section class="learning-notes" aria-label="Learn notes">
      <span class="learn-label">
        Learn{subtitle && <span class="learn-for"> {subtitle}</span>}
      </span>
      {notes.map((note, i) => {
        const range = note.lines ? resolveRange(note.lines, path) : undefined;
        const codeLang = note.lang || (note.vs ? profile?.learning[0] : undefined);
        const vsLang = note.vsLang || profile?.knows[0] || "What you know";
        return (
          <details
            key={i}
            class="learning-note"
            onMouseEnter={() => onHighlight(range)}
            onMouseLeave={() => onHighlight(undefined)}
          >
            <summary>{note.title}</summary>
            <p>{note.body}</p>
            {note.code && (
              <div class={"note-code" + (note.vs ? " comparison" : "")}>
                <div>
                  {codeLang && <small>{codeLang}</small>}
                  <pre>
                    <code>
                      <Code text={note.code} language={languageForName(codeLang)} />
                    </code>
                  </pre>
                </div>
                {note.vs && (
                  <div>
                    <small>{vsLang}</small>
                    <pre>
                      <code>
                        <Code text={note.vs} language={languageForName(vsLang)} />
                      </code>
                    </pre>
                  </div>
                )}
              </div>
            )}
            {range && (
              <button type="button" class="note-lines" onClick={() => onJump(range)}>
                See {lineLabel(range)}
              </button>
            )}
          </details>
        );
      })}
    </section>
  );
}
