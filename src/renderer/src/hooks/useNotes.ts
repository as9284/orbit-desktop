import { useState, useCallback, useEffect, useRef } from "react";
import { isFeatureReady, getActiveApiKey } from "../lib/ai";
import { categorizeNote, categorizeNotes } from "../lib/ai-client";
import { runBackgroundAiSession } from "../lib/background-ai-worker";
import { usesStableCategoryTaxonomy } from "../lib/category-taxonomy";
import type { Note } from "../types/orbit";
import {
  getAllNotes,
  putNote,
  deleteNote as dbDeleteNote,
  getNoteCategories,
  setNoteCategories,
} from "../lib/storage/db";

export interface CreateNoteData {
  title: string;
  content?: string;
}

export function useNotes() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiStatus, setAiStatus] = useState<string | null>(null);

  const [categories, setCategories] = useState<Record<string, string>>({});
  const [isCategorizingBackground, setIsCategorizingBackground] =
    useState(false);
  const categorizeSessionsRef = useRef(0);

  const loadCategories = useCallback(async () => {
    const cats = await getNoteCategories();
    setCategories(cats);
  }, []);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  const writeStoredCategories = useCallback(
    async (next: Record<string, string>) => {
      await setNoteCategories(next);
      setCategories({ ...next });
    },
    [],
  );

  const readStoredCategories = useCallback(async (): Promise<
    Record<string, string>
  > => {
    return getNoteCategories();
  }, []);

  const getExistingCategoryPool = useCallback(
    (stored: Record<string, string>): string[] => {
      return [...new Set(Object.values(stored).filter(Boolean))].sort();
    },
    [],
  );

  const backgroundCategorize = useCallback(
    async (notesList: Note[]) => {
      if (!isFeatureReady("autoCategorize")) return;
      categorizeSessionsRef.current += 1;
      setIsCategorizingBackground(true);
      setAiStatus(null);

      await runBackgroundAiSession("notes", async () => {
        let categorizedCount = 0;
        try {
          const stored = await readStoredCategories();
          const noteIds = new Set(notesList.map((n) => n.id));
          const pruned: Record<string, string> = {};
          for (const [id, cat] of Object.entries(stored)) {
            if (noteIds.has(id)) pruned[id] = cat;
          }
          const uncategorized = notesList.filter((n) => !pruned[n.id]);
          const existingCategories = getExistingCategoryPool(pruned);
          const rebuildTaxonomy = !usesStableCategoryTaxonomy(
            "note",
            existingCategories,
          );
          const pendingNotes = rebuildTaxonomy ? notesList : uncategorized;
          const nextCategories = rebuildTaxonomy ? {} : pruned;
          if (!rebuildTaxonomy) await writeStoredCategories(pruned);

          if (pendingNotes.length > 0) {
            const result = await categorizeNotes(
              pendingNotes.map((note) => ({
                id: note.id,
                title: note.title,
                context: note.content,
              })),
              rebuildTaxonomy ? [] : existingCategories,
            );
            for (const assignment of result.assignments) {
              nextCategories[assignment.id] = assignment.category;
            }
            categorizedCount = result.assignments.length;
            if (categorizedCount > 0 && (!rebuildTaxonomy || !result.error)) {
              await writeStoredCategories(nextCategories);
            }
            if (result.model) setAiStatus(`Luna via ${result.model}`);
            if (result.error) {
              setAiStatus(result.error);
              setError(`Luna categorization failed: ${result.error}`);
            }
          }
        } finally {
          categorizeSessionsRef.current -= 1;
          if (categorizeSessionsRef.current <= 0) {
            categorizeSessionsRef.current = 0;
            setIsCategorizingBackground(false);
          }
        }
        return categorizedCount;
      });
    },
    [readStoredCategories, writeStoredCategories, getExistingCategoryPool],
  );

  const categorizeSingleNote = useCallback(
    async ({
      noteId,
      title,
      content,
    }: {
      noteId: string;
      title: string;
      content?: string | null;
    }) => {
      const apiKey = getActiveApiKey();
      if (!apiKey) {
        return {
          category: null,
          model: null,
          error: "Missing API key  -  configure one in Settings → Luna.",
        };
      }
      const stored = await readStoredCategories();
      const existingCategories = getExistingCategoryPool(stored);
      const result = await categorizeNote(
        title,
        content,
        existingCategories,
        noteId,
      );
      if (result.category) {
        stored[noteId] = result.category;
        await writeStoredCategories(stored);
        if (result.model) setAiStatus(`Luna via ${result.model}`);
        return result;
      }
      if (result.error) {
        setAiStatus(result.error);
        setError(`Luna categorization failed: ${result.error}`);
      }
      return result;
    },
    [getExistingCategoryPool, readStoredCategories, writeStoredCategories],
  );

  const fetchNotes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAllNotes();
      setNotes(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onCategoriesCleared = () => {
      void loadCategories();
    };
    const onDataChanged = () => {
      void loadCategories();
      void fetchNotes();
    };
    window.addEventListener("orbit:note-categories:cleared", onCategoriesCleared);
    window.addEventListener("orbit:data:changed", onDataChanged);
    return () => {
      window.removeEventListener("orbit:note-categories:cleared", onCategoriesCleared);
      window.removeEventListener("orbit:data:changed", onDataChanged);
    };
  }, [loadCategories, fetchNotes]);

  const createNote = async (data: CreateNoteData): Promise<string | null> => {
    const now = new Date().toISOString();
    const note: Note = {
      id: crypto.randomUUID(),
      title: data.title.trim(),
      content: data.content?.trim() ?? null,
      created_at: now,
      updated_at: now,
    };
    try {
      await putNote(note);
      await fetchNotes();
      return note.id;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    }
  };

  const updateNote = async (
    id: string,
    updates: Partial<CreateNoteData>,
  ): Promise<boolean> => {
    try {
      const existing = notes.find((n) => n.id === id);
      if (!existing) {
        const all = await getAllNotes();
        const found = all.find((n) => n.id === id);
        if (!found) return false;
        await putNote({
          ...found,
          ...(updates.title !== undefined && { title: updates.title.trim() }),
          ...(updates.content !== undefined && {
            content: updates.content?.trim() ?? null,
          }),
          updated_at: new Date().toISOString(),
        });
      } else {
        await putNote({
          ...existing,
          ...(updates.title !== undefined && { title: updates.title.trim() }),
          ...(updates.content !== undefined && {
            content: updates.content?.trim() ?? null,
          }),
          updated_at: new Date().toISOString(),
        });
      }
      await fetchNotes();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    }
  };

  const deleteNote = async (id: string): Promise<boolean> => {
    try {
      await dbDeleteNote(id);
      setNotes((prev) => prev.filter((n) => n.id !== id));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    }
  };

  return {
    notes,
    loading,
    error,
    aiStatus,
    categories,
    isCategorizingBackground,
    fetchNotes,
    createNote,
    updateNote,
    deleteNote,
    backgroundCategorize,
    categorizeSingleNote,
  };
}

export type NotesApi = ReturnType<typeof useNotes>;
