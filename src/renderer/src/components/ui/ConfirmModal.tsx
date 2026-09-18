import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Modal } from "./Modal";
import { Button } from "./Button";

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  icon?: ReactNode;
  variant?: "danger" | "default";
}

export function ConfirmModal({
  open,
  onClose,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  icon,
  variant = "danger",
}: Props) {
  return (
    <Modal open={open} onClose={onClose} title={title} maxWidth="max-w-sm">
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
              variant === "danger"
                ? "bg-danger/10 border border-danger/20"
                : "bg-accent/10 border border-accent/20"
            }`}
          >
            {icon ?? (
              <AlertTriangle
                size={16}
                className={
                  variant === "danger" ? "text-danger" : "text-accent-text"
                }
              />
            )}
          </div>
          <p className="text-xs text-text-muted leading-relaxed pt-1">
            {message}
          </p>
        </div>
        <div className="flex gap-2.5">
          <Button
            type="button"
            variant="secondary"
            className="flex-1"
            onClick={onClose}
          >
            {cancelLabel}
          </Button>
          <button
            type="button"
            onClick={onConfirm}
            className={`flex-1 py-2.5 text-sm font-semibold rounded-xl active:scale-[0.98] transition-all duration-150 focus-ring ${
              variant === "danger"
                ? "bg-danger text-white hover:brightness-110"
                : "bg-linear-to-r from-accent to-accent-2 text-white hover:brightness-110 shadow-lg shadow-accent/15"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
