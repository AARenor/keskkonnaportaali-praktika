import { answerPartsPresentation } from "./answer_parts.js";

function CitedText({ part, sources, Citation }) {
  const citations = Array.isArray(part.citations) ? [...new Set(part.citations)] : [];
  return (
    <>
      {part.text}
      {citations.length ? " " : null}
      {Citation ? citations.map((citation) => (
        <Citation key={citation} number={citation} sources={sources} />
      )) : null}
    </>
  );
}

function answerPartKey(part) {
  return part.id || `${part.role || "part"}:${part.step || ""}:${part.title || ""}:${part.text}`;
}

function PartTitle({ children, headingLevel }) {
  if (!children) return null;
  const Heading = headingLevel === "h4" ? "h4" : "h2";
  return <Heading>{children}</Heading>;
}

function procedureStepHeading(part) {
  const title = typeof part.title === "string" ? part.title.trim() : "";
  return /^Samm\s+\d+[.:]?$/iu.test(title) ? null : part.title;
}

export default function AnswerParts({ answer, sources = [], Citation, headingLevel = "h2" }) {
  const { format, sections, steps } = answerPartsPresentation(answer);
  if (!sections.length && !steps.length) return null;
  return (
    <div className={`answer-parts answer-parts--${format}`}>
      {sections.map((part) => (
        <section key={answerPartKey(part)}>
          <PartTitle headingLevel={headingLevel}>{part.title}</PartTitle>
          <p><CitedText Citation={Citation} part={part} sources={sources} /></p>
        </section>
      ))}
      {steps.length ? (
        <ol aria-label="Protseduuri sammud" className="answer-procedure-steps">
          {steps.map((part) => (
            <li key={answerPartKey(part)} value={part.step}>
              <PartTitle headingLevel={headingLevel}>{procedureStepHeading(part)}</PartTitle>
              <p><CitedText Citation={Citation} part={part} sources={sources} /></p>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
