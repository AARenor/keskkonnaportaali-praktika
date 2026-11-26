import {
  citedEvidenceAnswersQuestion,
  repeatsEarlierAnswer,
  withRepeatedAnswerNote,
} from "./answer_coverage.mjs";
import { composeNoAnswerResponse } from "./search_response.mjs";
import { publicUsageTelemetry } from "./search_usage_projection.mjs";
import { isContinuationFollowUp, isSafeEllipticalFollowUp } from "./retrieval_context.mjs";


export function finalizeFollowUpResult({ question, checkQuery = question, result, previousAnswers = [], listing } = {}) {
  const answerText = [result?.answer?.intro, ...(result?.answer?.parts || []).map((part) => part?.text)]
    .filter(Boolean)
    .join(" ");
  const usageTelemetry = publicUsageTelemetry(result?.usage_telemetry);
  const noAnswer = () => ({
    ...composeNoAnswerResponse(question),
    ...(usageTelemetry ? { usage_telemetry: usageTelemetry } : {}),
    searchResults: listing,
  });
  const elliptical = isContinuationFollowUp(question) || isSafeEllipticalFollowUp(question);
  const answersQuestion = elliptical || citedEvidenceAnswersQuestion(checkQuery, result?.answer, result?.sources);
  if (!answersQuestion) return noAnswer();
  if (!repeatsEarlierAnswer(answerText, previousAnswers, {
    title: result?.answer?.title,
    question,
  })) return { ...result, searchResults: listing };
  return {
    ...result,
    answer: withRepeatedAnswerNote(result.answer),
    searchResults: listing,
  };
}
