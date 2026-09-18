import { useCallback, useEffect, useRef, useState } from "react";
import type { LunaChatSession, LunaMessage } from "../types/orbit";
import {
  deleteLunaSession,
  getLunaSessions,
  putLunaSession,
} from "../lib/storage/db";
import { fallbackChatTitle, generateChatTitle } from "../lib/ai-client";

export type { LunaChatSession, LunaMessage } from "../types/orbit";

const STORAGE_EVENT = "orbit:luna-sessions:changed";
const PERSIST_DEBOUNCE_MS = 350;

/**
 * Per-turn scratch state. Held in a ref rather than React state because the
 * stream callbacks mutate it many times per second and none of it is rendered.
 */
export interface LunaTurnRuntime {
  controller: AbortController;
  assistantMessageId: string | null;
  assistantHasOutput: boolean;
  thinkingFallback: boolean;
  toolBatchMessageId: string | null;
  notifyScope: string | null;
}

function newSession(): LunaChatSession {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title: "New chat",
    titleGenerated: false,
    createdAt: now,
    updatedAt: now,
    messages: [],
    activeTurnMessageId: null,
  };
}

function bySession(sessions: LunaChatSession[]): LunaChatSession[] {
  return [...sessions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** Nothing is ever written to disk mid-spinner; `pending` is runtime-only. */
function forStorage(session: LunaChatSession): LunaChatSession {
  return { ...session, messages: session.messages.map(clearPending) };
}

/**
 * A session that still names an active turn was cut off by the app closing, so
 * the message it points at is incomplete and says so.
 */
function reconcileOnLoad(session: LunaChatSession): LunaChatSession {
  const activeId = session.activeTurnMessageId;
  if (!activeId) {
    return { ...session, messages: session.messages.map(clearPending) };
  }
  return {
    ...session,
    activeTurnMessageId: null,
    messages: session.messages.map((message) =>
      message.id === activeId
        ? { ...clearPending(message), interrupted: true }
        : clearPending(message),
    ),
  };
}

function clearPending(message: LunaMessage): LunaMessage {
  if (!message.pending) return message;
  const stripped: LunaMessage = { ...message };
  delete stripped.pending;
  return stripped;
}

/**
 * Owns every Luna chat and every in-flight turn.
 *
 * This is mounted once in `AppLayout`, which React Router keeps mounted across
 * child route changes, so navigating away from Luna no longer destroys the
 * conversation or the turn streaming into it. The Codex run itself already
 * lived in the main process; what used to be lost was this state.
 */
export function useLunaChats() {
  const [sessions, setSessions] = useState<LunaChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  /** Session ids with a turn in flight. An array so React sees a new value. */
  const [streamingIds, setStreamingIds] = useState<string[]>([]);

  const sessionsRef = useRef<LunaChatSession[]>([]);
  const runtimeRef = useRef(new Map<string, LunaTurnRuntime>());
  const persistTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  /** Sessions with no messages yet, so never written to disk. */
  const draftIdsRef = useRef(new Set<string>());
  /** Titles being generated, so a stop plus a settle cannot ask twice. */
  const titlingRef = useRef(new Set<string>());

  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  // ── Load ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    void (async () => {
      try {
        const stored = await getLunaSessions();
        const reconciled = bySession(stored.map(reconcileOnLoad));
        sessionsRef.current = reconciled;
        setSessions(reconciled);
        // Anything reconciled had an interrupted turn; write that back.
        for (const session of reconciled) {
          const original = stored.find((s) => s.id === session.id);
          if (original?.activeTurnMessageId) {
            void putLunaSession(forStorage(session));
          }
        }
        setActiveSessionId(reconciled[0]?.id ?? null);
      } catch {
        sessionsRef.current = [];
        setSessions([]);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  /**
   * An import, restore or wipe from Settings replaces the chat store wholesale,
   * so this reload is authoritative: whatever is on disk afterwards is the
   * truth, and any turn still running in a chat that no longer exists is
   * cancelled.
   *
   * It deliberately does not listen to `orbit:data:changed`. That fires on
   * every Luna tool mutation, which never touches chats, and reloading from
   * disk mid-turn would race the debounced write of the conversation being
   * streamed.
   */
  useEffect(() => {
    const reload = () => {
      void (async () => {
        const stored = bySession((await getLunaSessions()).map(reconcileOnLoad));
        const survivingIds = new Set(stored.map((s) => s.id));
        for (const [id, runtime] of [...runtimeRef.current]) {
          if (survivingIds.has(id)) continue;
          runtime.controller.abort();
          runtimeRef.current.delete(id);
        }
        setStreamingIds((ids) => ids.filter((id) => survivingIds.has(id)));

        for (const timer of persistTimersRef.current.values()) {
          clearTimeout(timer);
        }
        persistTimersRef.current.clear();
        draftIdsRef.current.clear();

        sessionsRef.current = stored;
        setSessions(stored);
        setActiveSessionId((current) =>
          current && survivingIds.has(current) ? current : (stored[0]?.id ?? null),
        );
      })();
    };
    window.addEventListener(STORAGE_EVENT, reload);
    return () => window.removeEventListener(STORAGE_EVENT, reload);
  }, []);

  // ── Persistence ───────────────────────────────────────────────────────────

  const flushSession = useCallback((sessionId: string) => {
    const timer = persistTimersRef.current.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      persistTimersRef.current.delete(sessionId);
    }
    const session = sessionsRef.current.find((s) => s.id === sessionId);
    if (!session) return;
    // A chat with nothing in it stays a draft and never reaches the list.
    if (session.messages.length === 0) return;
    draftIdsRef.current.delete(sessionId);
    void putLunaSession(forStorage(session));
  }, []);

  const schedulePersist = useCallback(
    (sessionId: string) => {
      const existing = persistTimersRef.current.get(sessionId);
      if (existing) clearTimeout(existing);
      persistTimersRef.current.set(
        sessionId,
        setTimeout(() => flushSession(sessionId), PERSIST_DEBOUNCE_MS),
      );
    },
    [flushSession],
  );

  // Write out anything still debounced when the window goes away.
  useEffect(() => {
    const flushAll = () => {
      for (const id of [...persistTimersRef.current.keys()]) flushSession(id);
    };
    window.addEventListener("beforeunload", flushAll);
    return () => {
      window.removeEventListener("beforeunload", flushAll);
      flushAll();
    };
  }, [flushSession]);

  const patchSession = useCallback(
    (
      sessionId: string,
      updater: (session: LunaChatSession) => LunaChatSession,
      options: { touch?: boolean; persist?: boolean } = {},
    ) => {
      const { touch = true, persist = true } = options;
      const current = sessionsRef.current;
      const index = current.findIndex((s) => s.id === sessionId);
      if (index === -1) return;

      const updated = updater(current[index]);
      const next = [...current];
      next[index] = touch
        ? { ...updated, updatedAt: new Date().toISOString() }
        : updated;
      sessionsRef.current = next;
      setSessions(next);
      if (persist) schedulePersist(sessionId);
    },
    [schedulePersist],
  );

  // ── Session list operations ───────────────────────────────────────────────

  const createSession = useCallback(() => {
    const session = newSession();
    draftIdsRef.current.add(session.id);
    // Only ever one empty draft: reuse rather than pile them up.
    const next = [
      session,
      ...sessionsRef.current.filter(
        (s) => s.messages.length > 0 || runtimeRef.current.has(s.id),
      ),
    ];
    for (const dropped of sessionsRef.current) {
      if (!next.some((s) => s.id === dropped.id)) {
        draftIdsRef.current.delete(dropped.id);
      }
    }
    sessionsRef.current = next;
    setSessions(next);
    setActiveSessionId(session.id);
    return session;
  }, []);

  /** Guarantees an active session exists, creating a draft if needed. */
  const ensureActiveSession = useCallback((): LunaChatSession => {
    const current = sessionsRef.current.find((s) => s.id === activeSessionId);
    if (current) return current;
    return createSession();
  }, [activeSessionId, createSession]);

  const selectSession = useCallback((sessionId: string) => {
    if (!sessionsRef.current.some((s) => s.id === sessionId)) return;
    setActiveSessionId(sessionId);
  }, []);

  const removeSession = useCallback(
    (sessionId: string) => {
      runtimeRef.current.get(sessionId)?.controller.abort();
      runtimeRef.current.delete(sessionId);
      setStreamingIds((ids) => ids.filter((id) => id !== sessionId));

      const timer = persistTimersRef.current.get(sessionId);
      if (timer) {
        clearTimeout(timer);
        persistTimersRef.current.delete(sessionId);
      }

      const wasDraft = draftIdsRef.current.delete(sessionId);
      const next = sessionsRef.current.filter((s) => s.id !== sessionId);
      sessionsRef.current = next;
      setSessions(next);
      setActiveSessionId((current) =>
        current === sessionId ? (next[0]?.id ?? null) : current,
      );
      if (!wasDraft) void deleteLunaSession(sessionId);
    },
    [],
  );

  const renameSession = useCallback(
    (sessionId: string, title: string) => {
      const trimmed = title.replace(/\s+/g, " ").trim();
      if (!trimmed) return;
      patchSession(
        sessionId,
        (session) => ({ ...session, title: trimmed, titleGenerated: true }),
        { touch: false },
      );
      flushSession(sessionId);
    },
    [patchSession, flushSession],
  );

  // ── Message operations ────────────────────────────────────────────────────

  const setMessages = useCallback(
    (
      sessionId: string,
      updater: (messages: LunaMessage[]) => LunaMessage[],
    ) => {
      patchSession(sessionId, (session) => ({
        ...session,
        messages: updater(session.messages),
      }));
    },
    [patchSession],
  );

  const getMessages = useCallback((sessionId: string): LunaMessage[] => {
    return sessionsRef.current.find((s) => s.id === sessionId)?.messages ?? [];
  }, []);

  // ── Turn lifecycle ────────────────────────────────────────────────────────

  const beginTurn = useCallback(
    (sessionId: string): LunaTurnRuntime => {
      const runtime: LunaTurnRuntime = {
        controller: new AbortController(),
        assistantMessageId: null,
        assistantHasOutput: false,
        thinkingFallback: false,
        toolBatchMessageId: null,
        notifyScope: null,
      };
      runtimeRef.current.set(sessionId, runtime);
      setStreamingIds((ids) =>
        ids.includes(sessionId) ? ids : [...ids, sessionId],
      );
      return runtime;
    },
    [],
  );

  /** Records which message a turn is filling so a crash can be detected. */
  const markTurnMessage = useCallback(
    (sessionId: string, messageId: string | null) => {
      patchSession(
        sessionId,
        (session) => ({ ...session, activeTurnMessageId: messageId }),
        { touch: false },
      );
    },
    [patchSession],
  );

  const endTurn = useCallback(
    (sessionId: string) => {
      runtimeRef.current.delete(sessionId);
      setStreamingIds((ids) => ids.filter((id) => id !== sessionId));
      patchSession(
        sessionId,
        (session) => ({
          ...session,
          activeTurnMessageId: null,
          messages: session.messages.map(clearPending),
        }),
        { touch: false, persist: false },
      );
      flushSession(sessionId);
    },
    [patchSession, flushSession],
  );

  const getRuntime = useCallback((sessionId: string) => {
    return runtimeRef.current.get(sessionId);
  }, []);

  const stopTurn = useCallback(
    (sessionId: string) => {
      const runtime = runtimeRef.current.get(sessionId);
      if (!runtime) return false;
      runtime.controller.abort();
      endTurn(sessionId);
      return true;
    },
    [endTurn],
  );

  // ── Titles ────────────────────────────────────────────────────────────────

  /**
   * Titles a chat from its opening exchange, once. The truncated first message
   * is applied immediately so the list is never full of "New chat", then the
   * generated title replaces it if the call succeeds.
   */
  const maybeGenerateTitle = useCallback(
    (sessionId: string) => {
      const session = sessionsRef.current.find((s) => s.id === sessionId);
      if (!session || session.titleGenerated) return;
      if (titlingRef.current.has(sessionId)) return;

      const firstUser = session.messages.find((m) => m.role === "user");
      if (!firstUser?.content.trim()) return;
      const firstAssistant = session.messages.find(
        (m) => m.role === "assistant" && m.content.trim(),
      );

      const placeholder = fallbackChatTitle(firstUser.content);
      patchSession(sessionId, (s) => ({ ...s, title: placeholder }), {
        touch: false,
      });

      titlingRef.current.add(sessionId);
      void generateChatTitle(firstUser.content, firstAssistant?.content ?? "")
        .then((title) => {
          if (!title) return;
          // The chat may have been deleted while the title was generating.
          if (!sessionsRef.current.some((s) => s.id === sessionId)) return;
          patchSession(
            sessionId,
            (s) => (s.titleGenerated ? s : { ...s, title, titleGenerated: true }),
            { touch: false, persist: false },
          );
          flushSession(sessionId);
        })
        .catch(() => {
          /* Placeholder title stands. */
        })
        .finally(() => {
          titlingRef.current.delete(sessionId);
        });
    },
    [patchSession, flushSession],
  );

  const activeSession =
    sessions.find((session) => session.id === activeSessionId) ?? null;

  return {
    loaded,
    sessions,
    /** Drafts are in `sessions` for rendering but are not real chats yet. */
    savedSessions: sessions.filter((s) => s.messages.length > 0),
    activeSession,
    activeSessionId,
    streamingIds,
    isStreaming: (sessionId: string | null) =>
      sessionId !== null && streamingIds.includes(sessionId),
    createSession,
    ensureActiveSession,
    selectSession,
    removeSession,
    renameSession,
    getMessages,
    setMessages,
    beginTurn,
    markTurnMessage,
    endTurn,
    stopTurn,
    getRuntime,
    maybeGenerateTitle,
  };
}

export type LunaChatsApi = ReturnType<typeof useLunaChats>;
