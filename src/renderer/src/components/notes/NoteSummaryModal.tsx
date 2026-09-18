import { useState } from "react";
import { FileText } from "lucide-react";
import { Modal } from "../ui/Modal";
import type { AiNoteSummary } from "../../lib/ai-client";
import type { Note } from "../../types/orbit";

interface Props {
  open: boolean;
  note: Note | null;
  summary: AiNoteSummary | null;
  onClose: () => void;
}

interface DisplayState {
  note: Note | null;
  summary: AiNoteSummary | null;
}

export function NoteSummaryModal({ open, note, summary, onClose }: Props) {
  const [displayState, setDisplayState] = useState<DisplayState>({
    note,
    summary,
  });

  if (open && note && summary) {
    const shouldSync =
      displayState.note?.id !== note.id ||
      displayState.summary?.summary !== summary.summary;

    if (shouldSync) {
      setDisplayState({ note, summary });
    }
  }

  const currentNote = note ?? displayState.note;
  const currentSummary = summary ?? displayState.summary;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Luna summary"
      maxWidth="max-w-2xl"
      zIndexClassName="z-[90]"
      backdropClassName="bg-slate-950/55 backdrop-blur-md"
      panelClassName="overflow-hidden border-cyan-400/18 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.16),_transparent_42%),linear-gradient(180deg,_rgba(15,23,42,0.98),_rgba(8,15,31,0.98))] shadow-[0_30px_90px_rgba(2,6,23,0.78)]"
    >
      {currentNote && currentSummary && (
        <div className="relative space-y-4 sm:space-y-5 overflow-hidden">
          <div className="pointer-events-none absolute -top-8 right-0 h-20 w-20 sm:h-28 sm:w-28 rounded-full bg-cyan-400/15 blur-3xl" />
          <div className="pointer-events-none absolute top-20 -left-6 h-16 w-16 sm:top-24 sm:-left-8 sm:h-24 sm:w-24 rounded-full bg-accent/12 blur-3xl" />

          <div className="relative glass rounded-2xl px-3.5 py-3.5 sm:px-4 sm:py-4">
            <h3 className="text-lg sm:text-xl font-semibold tracking-tight text-text-primary wrap-break-word">
              {currentSummary.headline}
            </h3>
            <p className="mt-1 text-xs sm:text-sm text-text-faint wrap-break-word">
              Built from {currentNote.title}
            </p>
          </div>

          <section className="relative glass rounded-2xl px-3.5 py-3.5 sm:px-5 sm:py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-text-faint">
              Executive summary
            </p>
            <p className="mt-2.5 sm:mt-3 text-sm leading-6 sm:leading-7 text-text-secondary wrap-break-word">
              {currentSummary.summary}
            </p>
          </section>

          <div className="grid grid-cols-1 gap-3.5 sm:gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <section className="glass rounded-2xl px-3.5 py-3.5 sm:px-5 sm:py-4">
              <div className="flex items-center gap-2 text-text-secondary">
                <FileText size={14} className="text-cyan-300/75" />
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-text-faint">
                  Key points
                </p>
              </div>
              <div className="mt-2.5 sm:mt-3 space-y-2">
                {currentSummary.keyPoints.length > 0 ? (
                  currentSummary.keyPoints.map((point, index) => (
                    <div
                      key={`${point}-${index}`}
                      className="flex items-start gap-2.5 glass rounded-xl px-3 py-2.5 sm:py-3"
                    >
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-cyan-400/14 text-[11px] font-semibold text-cyan-100">
                        {index + 1}
                      </span>
                      <p className="text-sm leading-6 text-text-secondary wrap-break-word">
                        {point}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="rounded-xl border border-dashed border-border-default bg-tint-1 px-3 py-4 text-sm text-text-muted">
                    Luna found a concise overall summary, but no distinct
                    highlights worth splitting out.
                  </p>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-cyan-400/12 bg-cyan-400/5 px-3.5 py-3.5 sm:px-5 sm:py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-100/70">
                Suggested next steps
              </p>
              <div className="mt-2.5 sm:mt-3 space-y-2">
                {currentSummary.nextSteps.length > 0 ? (
                  currentSummary.nextSteps.map((step, index) => (
                    <div
                      key={`${step}-${index}`}
                      className="rounded-xl border border-cyan-300/12 bg-slate-950/35 px-3 py-2.5 sm:py-3"
                    >
                      <p className="text-sm leading-6 text-text-secondary wrap-break-word">
                        {step}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="rounded-xl border border-dashed border-cyan-300/12 bg-slate-950/25 px-3 py-4 text-sm text-cyan-50/55">
                    No obvious follow-up actions surfaced. This note reads more
                    like reference material than an action list.
                  </p>
                )}
              </div>
            </section>
          </div>
        </div>
      )}
    </Modal>
  );
}
