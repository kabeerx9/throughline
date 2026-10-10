import { useState } from "preact/hooks";
import type { QuizQuestion } from "./types.ts";

export function Quiz({ questions }: { questions: QuizQuestion[] }) {
  const [choices, setChoices] = useState<Record<number, number>>({});
  const [committed, setCommitted] = useState(false);
  const ready = questions.every((_, i) => choices[i] !== undefined);
  const right = questions.filter((q, i) => choices[i] === q.correct).length;
  return (
    <form
      class="quiz"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) setCommitted(true);
      }}
    >
      {questions.map((q, i) => (
        <fieldset key={i} disabled={committed}>
          <legend>
            {i + 1}. {q.prompt}
          </legend>
          {q.options.map((option, j) => (
            <label key={j} class={committed && j === q.correct ? "correct-option" : undefined}>
              <input
                type="radio"
                name={"question-" + i}
                checked={choices[i] === j}
                onChange={() => setChoices((c) => ({ ...c, [i]: j }))}
              />
              <span>{option}</span>
            </label>
          ))}
          {committed && (
            <p class={"quiz-feedback " + (choices[i] === q.correct ? "right" : "wrong")}>
              <strong>{choices[i] === q.correct ? "Correct." : "Not quite."}</strong> {q.answer}
            </p>
          )}
        </fieldset>
      ))}
      {committed ? (
        <>
          <p class="quiz-result" role="status">
            {right} of {questions.length} correct.{" "}
            {right === questions.length ? "You can defend this change." : "Revisit the files behind the missed answers."}
          </p>
          <button
            type="button"
            onClick={() => {
              setCommitted(false);
              setChoices({});
            }}
          >
            Try again
          </button>
        </>
      ) : (
        <button type="submit" disabled={!ready}>
          Check answers
        </button>
      )}
    </form>
  );
}
