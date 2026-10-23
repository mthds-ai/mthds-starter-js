import type { ProblemDomain } from "mthds/errors";
import type { PipelineError } from "@/lib/errors";

interface ErrorDisplayProps {
  error: PipelineError;
}

/**
 * Who must act on a failure, in the protocol's words for each `domain`. The
 * caller, the method's author and the account's owner are on this app's side,
 * so their failures read as something to change (amber); whoever runs the API
 * and a runtime fault nobody could prevent read as the API's (red).
 */
const WHO_MUST_ACT: Record<ProblemDomain, string> = {
  input: "The caller, whose request is at fault",
  method: "The method's author",
  account: "The account's owner",
  operator: "Whoever runs the MTHDS API",
  runtime: "Nobody beforehand: wait, retry or report it",
};

const TONE: Record<ProblemDomain, "amber" | "red"> = {
  input: "amber",
  method: "amber",
  account: "amber",
  operator: "red",
  runtime: "red",
};

const TONE_CLASSES = {
  amber: {
    frame: "border-amber-200 bg-amber-50 text-amber-950",
    muted: "text-amber-800",
    inner: "border-amber-200",
  },
  red: {
    frame: "border-red-200 bg-red-50 text-red-900",
    muted: "text-red-800",
    inner: "border-red-200",
  },
} as const;

export function ErrorDisplay({ error }: ErrorDisplayProps) {
  const tone = TONE_CLASSES[TONE[error.domain]];
  return (
    <div
      role="alert"
      aria-live="polite"
      data-domain={error.domain}
      className={`space-y-3 rounded-lg border p-5 text-sm ${tone.frame}`}
    >
      <div>
        <p className={`text-xs font-medium uppercase tracking-wide ${tone.muted}`}>
          Who must act: {WHO_MUST_ACT[error.domain]}
        </p>
        <h2 className="mt-1 text-base font-semibold">{error.title}</h2>
        <p className={`mt-1 ${tone.muted}`}>{error.message}</p>
        {error.nextStep && (
          <p className="mt-2">
            <span className="font-medium">Next step: </span>
            {error.nextStep}
          </p>
        )}
      </div>

      {error.hint && (
        <div className={`rounded-md border bg-white p-3 ${tone.inner}`}>
          <p className="font-medium text-slate-800">{error.hint.summary}</p>
          {error.hint.code && (
            <pre
              className="mt-2 overflow-x-auto rounded bg-slate-900 p-3 text-xs leading-relaxed text-slate-100"
              data-language={error.hint.codeLanguage}
            >
              <code>{error.hint.code}</code>
            </pre>
          )}
          {error.hint.docs && (
            <a
              href={error.hint.docs.href}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-2 inline-block text-xs font-medium text-blue-700 underline"
            >
              {error.hint.docs.label} →
            </a>
          )}
        </div>
      )}

      <details className={`text-xs ${tone.muted}`}>
        <summary className="cursor-pointer select-none font-medium">Technical details</summary>
        {(error.code || error.requestId) && (
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            {error.code && (
              <>
                <dt className="font-medium">Code</dt>
                <dd>
                  <code className="font-mono">{error.code}</code>
                </dd>
              </>
            )}
            {error.requestId && (
              <>
                <dt className="font-medium">Request id</dt>
                <dd>
                  <code className="select-all font-mono">{error.requestId}</code>
                </dd>
              </>
            )}
          </dl>
        )}
        <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-white p-2 font-mono">
          {error.details}
        </pre>
      </details>
    </div>
  );
}
