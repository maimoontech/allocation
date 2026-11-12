import { useEffect, useRef, useState, type FormEvent } from "react";
import { apiErrorMessage } from "../../features/api/apiErrorMessage";
import { useAskHelpChatMutation, useRateHelpChatMutation } from "../../features/member/helpChatApi";

/**
 * The Need Help chat (FR-110).
 *
 * A fixed button at the bottom right of every member screen. It opens a window that walks
 * one exchange at a time: question, answer, rate the answer out of five, then "Do you need
 * further help?" — Yes returns to the question box with the conversation kept above, No
 * thanks the member and closes.
 *
 * WHY A STATE MACHINE AND NOT A FEW BOOLEANS
 *   The steps are mutually exclusive and the order matters: the stars must not appear before
 *   an answer, the Yes/No must not appear before a rating, and a second question must not
 *   be typed while the first is still unrated. Booleans allow all of those at once; one
 *   `step` cannot.
 *
 * The transcript stays visible as the member works through several questions, because the
 * answer they are rating is usually the one they are still reading.
 */

type Step = "asking" | "answered" | "rated" | "closing";

type Turn = {
  id: number;
  question: string;
  reply: string;
  rating: number | null;
};

const CLOSING_MESSAGE = "Thanks from Anjuman e Zakereen Hussain AS.";

export function HelpChatWidget() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("asking");
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [ask, askState] = useAskHelpChatMutation();
  const [rate] = useRateHelpChatMutation();

  const endRef = useRef<HTMLDivElement | null>(null);
  const current = turns[turns.length - 1] ?? null;

  // Keep the newest exchange in view. A long answer otherwise leaves the member looking at
  // the top of a reply whose stars are below the fold.
  useEffect(() => {
    // Optional-called: jsdom does not implement scrollIntoView, and a missing scroll is
    // not worth throwing from an effect over.
    endRef.current?.scrollIntoView?.({ block: "end" });
  }, [turns, step]);

  function reset() {
    setStep("asking");
    setQuestion("");
    setTurns([]);
    setError(null);
  }

  async function onAsk(event: FormEvent) {
    event.preventDefault();
    const text = question.trim();
    if (!text) return;

    setError(null);
    try {
      const answer = await ask({ question: text }).unwrap();
      setTurns((prev) => [...prev, { id: answer.id, question: text, reply: answer.reply, rating: null }]);
      setQuestion("");
      setStep("answered");
    } catch (err: unknown) {
      setError(apiErrorMessage(err, "Could not answer that right now."));
    }
  }

  async function onRate(stars: number) {
    if (!current) return;
    setTurns((prev) =>
      prev.map((t) => (t.id === current.id ? { ...t, rating: stars } : t))
    );
    setStep("rated");
    try {
      await rate({ id: current.id, star_rating: stars }).unwrap();
    } catch {
      // The rating is the member's courtesy, not their task. If storing it fails the
      // conversation carries on rather than stopping to report a problem they cannot fix.
    }
  }

  function onFurtherHelp(wantsMore: boolean) {
    if (wantsMore) {
      setStep("asking");
      return;
    }
    setStep("closing");
    window.setTimeout(() => {
      setOpen(false);
      reset();
    }, 2200);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-50 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-white shadow-lg hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      >
        Need Help
      </button>
    );
  }

  return (
    <div
      role="dialog"
      aria-label="Need Help"
      className="fixed bottom-4 right-4 z-50 flex max-h-[80vh] w-[min(24rem,calc(100vw-2rem))] flex-col rounded-input border border-border bg-white shadow-xl"
    >
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="text-sm font-semibold">Need Help</div>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            reset();
          }}
          className="text-sm underline"
          aria-label="Close help chat"
        >
          Close
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3 text-sm">
        {turns.length === 0 ? (
          <div className="text-textMuted">
            Ask me anything about filling in your profile — which years a field accepts, why
            a value is not showing, or what a tab is for.
          </div>
        ) : null}

        {turns.map((turn) => (
          <div key={turn.id} className="space-y-2">
            <div className="ml-auto w-fit max-w-[85%] rounded-input bg-primary/10 px-3 py-2">
              {turn.question}
            </div>
            <div className="w-fit max-w-[90%] whitespace-pre-line rounded-input bg-surface px-3 py-2">
              {turn.reply}
            </div>
            {turn.rating ? (
              <div className="text-xs text-textMuted">You rated this {turn.rating} of 5.</div>
            ) : null}
          </div>
        ))}

        {error ? <div className="text-xs text-danger">{error}</div> : null}

        {step === "answered" && current ? (
          <div className="rounded-input border border-border p-2">
            <div className="mb-1 text-xs font-semibold">How helpful was this answer?</div>
            <div className="flex gap-1" role="group" aria-label="Rate this answer">
              {[1, 2, 3, 4, 5].map((stars) => (
                <button
                  key={stars}
                  type="button"
                  onClick={() => onRate(stars)}
                  aria-label={`${stars} ${stars === 1 ? "star" : "stars"}`}
                  className="px-1 text-xl leading-none text-warning hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  ☆
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {step === "rated" ? (
          <div className="rounded-input border border-border p-2">
            <div className="mb-2 text-xs font-semibold">Do you need further help?</div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onFurtherHelp(true)}
                className="rounded-button bg-primary px-3 py-1 text-xs font-semibold text-white"
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => onFurtherHelp(false)}
                className="rounded-button border border-border px-3 py-1 text-xs font-semibold"
              >
                No
              </button>
            </div>
          </div>
        ) : null}

        {step === "closing" ? (
          <div className="rounded-input bg-primary/10 px-3 py-2 font-semibold" role="status">
            {CLOSING_MESSAGE}
          </div>
        ) : null}

        <div ref={endRef} />
      </div>

      {step === "asking" ? (
        <form onSubmit={onAsk} className="border-t border-border p-2">
          <label className="sr-only" htmlFor="help-chat-question">
            Your question
          </label>
          <div className="flex gap-2">
            <input
              id="help-chat-question"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Type your question..."
              maxLength={1000}
              className="w-full rounded-input border border-border px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
            <button
              type="submit"
              disabled={askState.isLoading || question.trim() === ""}
              className="rounded-button bg-primary px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {askState.isLoading ? "..." : "Send"}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
