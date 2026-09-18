import { useState, type FormEvent } from "react";
import { StarField } from "../ui/StarField";
import { OrbitMark } from "../ui/Logo";
import { Input } from "../ui/Input";
import { Button } from "../ui/Button";
import { useApp } from "../../contexts/AppContext";

export function WelcomeScreen() {
  const { completeOnboarding } = useApp();
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    completeOnboarding(name.trim() || "Explorer");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg relative px-4">
      <StarField />
      <div className="fixed inset-0 pointer-events-none" aria-hidden="true">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-150 h-100 bg-accent/4 rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10 w-full max-w-md">
        <div className="text-center mb-8">
          <OrbitMark className="mb-5 h-16 w-16 rounded-2xl" />
          <h1 className="font-display text-2xl font-bold text-text-primary tracking-tight mb-2">
            Welcome to Orbit
          </h1>
          <p className="text-sm text-text-muted leading-relaxed max-w-xs mx-auto">
            Your personal productivity workspace. Tasks, notes, projects, and
            Luna  -  all stored locally on your device.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-surface-1/80 border border-border-subtle rounded-2xl p-6 backdrop-blur-sm"
        >
          <label
            htmlFor="display-name"
            className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2"
          >
            What should Luna call you?
          </label>
          <Input
            id="display-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name (optional)"
            autoFocus
            className="mb-4"
          />

          <Button
            type="submit"
            variant="primary"
            disabled={submitting}
            className="w-full"
          >
            Get started
          </Button>

          <p className="text-[11px] text-text-faint text-center mt-4 leading-relaxed">
            Everything stays on this device. Export your data anytime from
            Settings.
          </p>
        </form>
      </div>
    </div>
  );
}
