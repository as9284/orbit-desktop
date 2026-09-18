import { useState, useRef, useCallback, useEffect } from "react";
import { orbitNotify as toast } from "../lib/notify";
import {
  PenLine,
  Copy,
  Check,
  ArrowRight,
  Eraser,
  Loader2,
} from "lucide-react";
import { isFeatureReady } from "../lib/ai";
import { processWriting, type WritingMode } from "../lib/ai-client";
import { useApp } from "../contexts/AppContext";
import { Button } from "../components/ui/Button";

interface ModeOption {
  mode: WritingMode;
  label: string;
  description: string;
}

const MODES: ModeOption[] = [
  {
    mode: "improve",
    label: "Improve",
    description: "Enhance clarity and quality",
  },
  {
    mode: "grammar",
    label: "Fix Grammar",
    description: "Correct errors and polish",
  },
  {
    mode: "rephrase",
    label: "Rephrase",
    description: "Say it a different way",
  },
  {
    mode: "formal",
    label: "Make Formal",
    description: "Professional & polished tone",
  },
  {
    mode: "casual",
    label: "Make Casual",
    description: "Friendly & conversational",
  },
  {
    mode: "expand",
    label: "Expand",
    description: "Add more detail and context",
  },
  { mode: "shorten", label: "Shorten", description: "Make it more concise" },
  {
    mode: "bullets",
    label: "Bullet Points",
    description: "Convert to a bullet list",
  },
  {
    mode: "continue",
    label: "Continue",
    description: "Keep writing in the same style",
  },
  {
    mode: "email",
    label: "Format as Email",
    description:
      "Reformat as a formal, professional email with greeting and signature",
  },
];

export function WritingAssistantPage() {
  const { profile } = useApp();
  const userName: string = profile?.displayName ?? "";
  const [input, setInput] = useState(
    () => sessionStorage.getItem("orbit:writing:input") ?? "",
  );
  const [output, setOutput] = useState(
    () => sessionStorage.getItem("orbit:writing:output") ?? "",
  );
  const [activeMode, setActiveMode] = useState<WritingMode>(
    () =>
      (sessionStorage.getItem("orbit:writing:mode") as WritingMode | null) ??
      "improve",
  );
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const outputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    sessionStorage.setItem("orbit:writing:input", input);
  }, [input]);

  useEffect(() => {
    sessionStorage.setItem("orbit:writing:output", output);
  }, [output]);

  useEffect(() => {
    sessionStorage.setItem("orbit:writing:mode", activeMode);
  }, [activeMode]);

  const handleProcess = useCallback(async () => {
    if (!input.trim()) {
      toast.error("Please enter some text first");
      return;
    }

    if (!isFeatureReady("writingAssistant")) {
      toast.error("Enable Writing Assistant in Settings → Luna first");
      return;
    }

    setLoading(true);
    setOutput("");

    try {
      const result = await processWriting(
        input,
        activeMode,
        activeMode === "email" ? userName : undefined,
      );
      if (!result.text) {
        toast.error(result.error ?? "Luna couldn't process your text");
        return;
      }
      setOutput(result.text);
    } finally {
      setLoading(false);
    }
  }, [input, activeMode, userName]);

  const handleCopy = useCallback(async () => {
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  }, [output]);

  const handleUseOutput = useCallback(() => {
    if (!output) return;
    setInput(output);
    setOutput("");
    toast.success("Output moved to input");
  }, [output]);

  const handleClear = useCallback(() => {
    setInput("");
    setOutput("");
  }, []);

  const featureReady = isFeatureReady("writingAssistant");

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pr-17 md:pr-5 py-4 border-b border-border-subtle shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-accent-muted border border-accent/20 flex items-center justify-center">
            <PenLine size={15} className="text-accent-text" />
          </div>
          <div>
            <h1 className="text-sm font-semibold font-display text-text-primary">
              Writing Assistant
            </h1>
            <p className="text-[11px] text-text-faint">
              AI-powered text transformation
            </p>
          </div>
        </div>
        {input.trim() && (
          <button
            type="button"
            onClick={handleClear}
            className="flex items-center gap-1.5 text-[11px] text-text-faint hover:text-text-muted transition-colors"
          >
            <Eraser size={12} />
            Clear
          </button>
        )}
      </div>

      <div className="flex flex-col md:flex-row flex-1 min-h-0 gap-0">
        {/* Left column  -  input + modes */}
        <div className="flex flex-col flex-1 min-h-0 border-r border-border-subtle">
          {/* Mode selector */}
          <div className="px-4 pt-3 pb-2 border-b border-border-subtle shrink-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-text-faint mb-2">
              Mode
            </p>
            <div className="flex flex-wrap gap-1.5">
              {MODES.map(({ mode, label, description }) => (
                <button
                  key={mode}
                  type="button"
                  title={description}
                  onClick={() => setActiveMode(mode)}
                  className={`min-h-9 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all duration-150 border ${
                    activeMode === mode
                      ? "bg-accent-muted border-accent/30 text-accent-text"
                      : "bg-tint-1 border-border-subtle text-text-muted hover:text-text-secondary hover:bg-tint-2 hover:border-border-strong"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Text input */}
          <div className="flex flex-col flex-1 min-h-0 p-4 gap-3">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Paste or type your text here…"
              className="flex-1 min-h-0 w-full resize-none bg-tint-1 border border-border-default rounded-xl px-4 py-3 text-sm text-text-primary placeholder:text-text-faint focus:outline-none focus:border-accent/35 focus:bg-tint-2 transition-all duration-200 leading-relaxed"
            />

            {/* Process button */}
            <Button
              variant="primary"
              onClick={handleProcess}
              disabled={!input.trim()}
              loading={loading}
              className="w-full"
            >
              {loading ? (
                "Processing…"
              ) : (
                <>
                  {MODES.find((m) => m.mode === activeMode)?.label}
                  <ArrowRight size={14} />
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Right column  -  output */}
        <div className="flex flex-col flex-1 min-h-0">
          <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-border-subtle shrink-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-text-faint">
              Result
            </p>
            {output && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleUseOutput}
                  title="Move result back to input"
                  className="flex items-center gap-1 text-[11px] text-text-faint hover:text-accent-text transition-colors px-2 py-1 rounded-lg hover:bg-accent/8"
                >
                  <ArrowRight size={11} className="rotate-180" />
                  Use as input
                </button>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex items-center gap-1 text-[11px] text-text-faint hover:text-text-secondary transition-colors px-2 py-1 rounded-lg hover:bg-tint-2"
                >
                  {copied ? (
                    <Check size={11} className="text-emerald-400" />
                  ) : (
                    <Copy size={11} />
                  )}
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
            )}
          </div>

          <div className="flex-1 min-h-0 p-4">
            {output ? (
              <textarea
                ref={outputRef}
                readOnly
                value={output}
                className="h-full w-full resize-none bg-tint-1 border border-border-default rounded-xl px-4 py-3 text-sm text-text-primary focus:outline-none leading-relaxed"
              />
            ) : (
              <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
                {loading ? (
                  <>
                    <Loader2
                      size={22}
                      className="animate-spin text-accent-text/60"
                    />
                    <p className="text-xs text-text-faint">Luna is writing…</p>
                  </>
                ) : !featureReady ? (
                  <>
                    <div className="w-10 h-10 rounded-2xl bg-tint-2 border border-border-subtle flex items-center justify-center">
                      <PenLine size={18} className="text-text-faint" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-text-muted">
                        Writing Assistant is disabled
                      </p>
                      <p className="text-[11px] text-text-faint mt-0.5">
                        Enable it in Settings → Luna
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="w-10 h-10 rounded-2xl bg-tint-2 border border-border-subtle flex items-center justify-center">
                      <PenLine size={18} className="text-text-faint" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-text-muted">
                        Your result will appear here
                      </p>
                      <p className="text-[11px] text-text-faint mt-0.5">
                        Enter text, choose a mode, and tap the button
                      </p>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
