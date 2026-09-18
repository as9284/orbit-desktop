import { useCallback, useEffect, useRef, useState } from "react";
import type { MeetingSession, MeetingState } from "../types/orbit";
import { getMeetingState, setMeetingState } from "../lib/storage/db";

export type {
  MeetingSession,
  MeetingSessionEntry,
  MeetingSessionArtifacts,
} from "../types/orbit";

const STORAGE_EVENT = "orbit:meeting-sessions:changed";

function normalizeSessions(sessions: MeetingSession[]): MeetingSession[] {
  return [...sessions].sort((left, right) => {
    const leftTime = left.endedAt ?? left.startedAt;
    const rightTime = right.endedAt ?? right.startedAt;
    return rightTime.localeCompare(leftTime);
  });
}

async function readStoredState(): Promise<MeetingState> {
  const state = await getMeetingState();
  return {
    activeSession: state.activeSession,
    sessions: normalizeSessions(state.sessions),
  };
}

async function writeStoredState(state: MeetingState): Promise<void> {
  await setMeetingState({
    activeSession: state.activeSession,
    sessions: normalizeSessions(state.sessions),
  });
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(STORAGE_EVENT));
    window.dispatchEvent(new Event("orbit:data:changed"));
  }
}

export function useMeetingSessions() {
  const [state, setState] = useState<MeetingState>({
    activeSession: null,
    sessions: [],
  });
  const stateRef = useRef(state);

  useEffect(() => {
    void readStoredState().then((s) => {
      stateRef.current = s;
      setState(s);
    });
  }, []);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const syncState = () => {
      void readStoredState().then((nextState) => {
        stateRef.current = nextState;
        setState(nextState);
      });
    };

    window.addEventListener(STORAGE_EVENT, syncState);
    window.addEventListener("orbit:data:changed", syncState);
    return () => {
      window.removeEventListener(STORAGE_EVENT, syncState);
      window.removeEventListener("orbit:data:changed", syncState);
    };
  }, []);

  const applyStateUpdate = useCallback(
    (updater: (current: MeetingState) => MeetingState) => {
      const next = updater(stateRef.current);
      stateRef.current = next;
      setState(next);
      void writeStoredState(next);
      return next;
    },
    [],
  );

  const updateState = useCallback(
    (updater: (current: MeetingState) => MeetingState) => {
      return applyStateUpdate(updater);
    },
    [applyStateUpdate],
  );

  const startSession = useCallback(
    (title: string) => {
      const normalizedTitle = title.trim();
      if (!normalizedTitle) return null;

      const session: MeetingSession = {
        id: crypto.randomUUID(),
        title: normalizedTitle,
        startedAt: new Date().toISOString(),
        endedAt: null,
        entries: [],
      };

      let created: MeetingSession | null = null;
      updateState((current) => {
        if (current.activeSession) return current;
        created = session;
        return { ...current, activeSession: session };
      });

      return created;
    },
    [updateState],
  );

  const addEntry = useCallback(
    (content: string) => {
      const trimmed = content.trim();
      if (!trimmed) return false;

      let added = false;
      updateState((current) => {
        if (!current.activeSession) return current;
        added = true;
        return {
          ...current,
          activeSession: {
            ...current.activeSession,
            entries: [
              ...current.activeSession.entries,
              {
                id: crypto.randomUUID(),
                content: trimmed,
                createdAt: new Date().toISOString(),
              },
            ],
          },
        };
      });

      return added;
    },
    [updateState],
  );

  const endSession = useCallback(
    (artifacts: NonNullable<MeetingSession["artifacts"]>) => {
      let completed: MeetingSession | null = null;

      updateState((current) => {
        if (!current.activeSession) return current;

        completed = {
          ...current.activeSession,
          endedAt: new Date().toISOString(),
          artifacts,
        };

        return {
          activeSession: null,
          sessions: normalizeSessions([
            completed,
            ...current.sessions.filter(
              (session) => session.id !== current.activeSession?.id,
            ),
          ]),
        };
      });

      return completed;
    },
    [updateState],
  );

  const deleteSession = useCallback(
    (sessionId: string) => {
      let removed = false;

      updateState((current) => {
        const nextSessions = current.sessions.filter((session) => {
          const keep = session.id !== sessionId;
          if (!keep) removed = true;
          return keep;
        });

        const activeSession =
          current.activeSession?.id === sessionId
            ? null
            : current.activeSession;
        if (current.activeSession?.id === sessionId) removed = true;

        return { activeSession, sessions: nextSessions };
      });

      return removed;
    },
    [updateState],
  );

  const discardActiveSession = useCallback(() => {
    let removed = false;

    updateState((current) => {
      if (!current.activeSession) return current;
      removed = true;
      return { ...current, activeSession: null };
    });

    return removed;
  }, [updateState]);

  return {
    activeSession: state.activeSession,
    sessions: state.sessions,
    startSession,
    addEntry,
    endSession,
    deleteSession,
    discardActiveSession,
  };
}

export type MeetingSessionsApi = ReturnType<typeof useMeetingSessions>;
