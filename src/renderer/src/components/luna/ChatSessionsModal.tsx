import { useEffect, useMemo, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import {
  MessageSquare,
  Pencil,
  Plus,
  Search,
  Trash2,
  Check,
  X,
} from "lucide-react";
import type { LunaChatSession } from "../../types/orbit";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { Input } from "../ui/Input";
import { ScrollArea } from "../ui/ScrollArea";
import { ConfirmModal } from "../ui/ConfirmModal";
import { EmptyState } from "../ui/EmptyState";
import { cn } from "../../lib/cn";

interface Props {
  open: boolean;
  onClose: () => void;
  sessions: LunaChatSession[];
  activeSessionId: string | null;
  streamingIds: string[];
  onSelect: (sessionId: string) => void;
  onDelete: (sessionId: string) => void;
  onRename: (sessionId: string, title: string) => void;
  onNewChat: () => void;
}

/** First non-empty message, flattened, for the list's second line. */
function previewOf(session: LunaChatSession): string {
  const source =
    session.messages.find((m) => m.role === "user" && m.content.trim()) ??
    session.messages.find((m) => m.content.trim());
  if (!source) return "No messages yet";
  const flat = source.content.replace(/\s+/g, " ").trim();
  return flat.length > 110 ? `${flat.slice(0, 110)}…` : flat;
}

function matches(session: LunaChatSession, query: string): boolean {
  if (session.title.toLowerCase().includes(query)) return true;
  // Searching message bodies too, so a chat is findable by what was said in
  // it rather than only by the title a model happened to choose.
  return session.messages.some((message) =>
    message.content.toLowerCase().includes(query),
  );
}

export function ChatSessionsModal({
  open,
  onClose,
  sessions,
  activeSessionId,
  streamingIds,
  onSelect,
  onDelete,
  onRename,
  onNewChat,
}: Props) {
  const [search, setSearch] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const renameRef = useRef<HTMLInputElement>(null);

  // Focus once the panel's entrance animation has settled.
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => searchRef.current?.focus(), 240);
    return () => clearTimeout(timer);
  }, [open]);

  // Reset on the way out rather than in an effect on the way in, so reopening
  // never inherits the last visit's search text or half-finished rename.
  const handleClose = () => {
    setSearch("");
    setDeleteId(null);
    setRenameId(null);
    onClose();
  };

  useEffect(() => {
    if (renameId) renameRef.current?.select();
  }, [renameId]);

  const query = search.trim().toLowerCase();
  const filtered = useMemo(
    () => (query ? sessions.filter((s) => matches(s, query)) : sessions),
    [sessions, query],
  );

  const pendingDelete = sessions.find((s) => s.id === deleteId) ?? null;

  const commitRename = () => {
    if (renameId) onRename(renameId, renameValue);
    setRenameId(null);
  };

  return (
    <>
      <Modal open={open} onClose={handleClose} title="Chats" maxWidth="max-w-xl">
        <div className="flex min-h-0 flex-col gap-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1 min-w-0">
              <Search
                size={14}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-faint"
              />
              <Input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search chats…"
                aria-label="Search chats"
                className="pl-9"
              />
            </div>
            <Button
              variant="secondary"
              className="shrink-0 px-3"
              onClick={() => {
                onNewChat();
                handleClose();
              }}
            >
              <Plus size={15} />
              New
            </Button>
          </div>

          {filtered.length === 0 ? (
            <div className="py-6">
              <EmptyState
                icon={<MessageSquare size={20} className="text-accent/40" />}
                title={
                  sessions.length === 0
                    ? "No chats yet. Send a message to start one."
                    : `No chats match "${search.trim()}"`
                }
              />
            </div>
          ) : (
            <ScrollArea className="max-h-[52vh]">
              <ul className="flex flex-col gap-1.5 pr-1">
                {filtered.map((session) => {
                  const isActive = session.id === activeSessionId;
                  const isStreaming = streamingIds.includes(session.id);
                  const isRenaming = renameId === session.id;

                  return (
                    <li key={session.id}>
                      <div
                        className={cn(
                          "group flex items-center gap-2 rounded-xl border px-3 py-2.5 transition-colors",
                          isActive
                            ? "border-accent/30 bg-accent-muted"
                            : "border-border-default bg-tint-1 hover:bg-tint-2",
                        )}
                      >
                        {isRenaming ? (
                          <>
                            <Input
                              ref={renameRef}
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  commitRename();
                                }
                                if (e.key === "Escape") {
                                  e.preventDefault();
                                  setRenameId(null);
                                }
                              }}
                              aria-label="Chat title"
                              className="py-1.5 text-[13px]"
                            />
                            <IconButton
                              label="Save title"
                              onClick={commitRename}
                              className="shrink-0"
                            >
                              <Check size={14} />
                            </IconButton>
                            <IconButton
                              label="Cancel rename"
                              onClick={() => setRenameId(null)}
                              className="shrink-0"
                            >
                              <X size={14} />
                            </IconButton>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                onSelect(session.id);
                                handleClose();
                              }}
                              className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left focus-ring rounded-lg"
                            >
                              <span className="flex w-full min-w-0 items-center gap-1.5">
                                <span className="truncate text-[13px] font-semibold text-text-primary">
                                  {session.title}
                                </span>
                                {isStreaming && (
                                  <span
                                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent/70 animate-pulse"
                                    title="Luna is replying in this chat"
                                  />
                                )}
                              </span>
                              <span className="truncate w-full text-[11px] text-text-faint">
                                {previewOf(session)}
                              </span>
                            </button>
                            <span className="shrink-0 text-[10px] tabular-nums text-text-faint">
                              {format(parseISO(session.updatedAt), "MMM d")}
                            </span>
                            <div className="flex shrink-0 items-center gap-0.5 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                              <IconButton
                                label="Rename chat"
                                onClick={() => {
                                  setRenameValue(session.title);
                                  setRenameId(session.id);
                                }}
                              >
                                <Pencil size={13} />
                              </IconButton>
                              <IconButton
                                label="Delete chat"
                                onClick={() => setDeleteId(session.id)}
                                className="hover:text-danger hover:bg-danger/8"
                              >
                                <Trash2 size={13} />
                              </IconButton>
                            </div>
                          </>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </ScrollArea>
          )}
        </div>
      </Modal>

      <ConfirmModal
        open={!!pendingDelete}
        onClose={() => setDeleteId(null)}
        title="Delete chat"
        message={
          pendingDelete && streamingIds.includes(pendingDelete.id)
            ? `"${pendingDelete.title}" is still replying. Deleting it stops the reply and removes the chat permanently.`
            : `Permanently delete "${pendingDelete?.title ?? ""}"? This cannot be undone.`
        }
        confirmLabel="Delete"
        onConfirm={() => {
          if (deleteId) onDelete(deleteId);
          setDeleteId(null);
        }}
      />
    </>
  );
}
