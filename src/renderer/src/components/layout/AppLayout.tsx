import { Outlet, useLocation, useOutletContext } from "react-router-dom";
import { CosmicBackground } from "./CosmicBackground";
import { Sidebar } from "./Sidebar";
import { AppBar } from "./AppBar";
import { ScrollArea } from "../ui/ScrollArea";
import { useTasks, type TasksApi } from "../../hooks/useTasks";
import { useNotes, type NotesApi } from "../../hooks/useNotes";

interface OutletContextType {
  tasksApi: TasksApi;
  notesApi: NotesApi;
}

const FIXED_WORKSPACE_ROUTES = new Set(["/luna", "/meeting", "/writing"]);

export function AppLayout() {
  const tasksApi = useTasks();
  const notesApi = useNotes();
  const { pathname } = useLocation();
  const isFixedWorkspace = FIXED_WORKSPACE_ROUTES.has(pathname);

  return (
    <div className="app-shell">
      <CosmicBackground />
      <AppBar />
      <div className="app-workspace">
        <Sidebar />
        <main className="app-content">
          {isFixedWorkspace ? (
            <Outlet context={{ tasksApi, notesApi } satisfies OutletContextType} />
          ) : (
            <ScrollArea className="h-full">
              <Outlet context={{ tasksApi, notesApi } satisfies OutletContextType} />
            </ScrollArea>
          )}
        </main>
      </div>
    </div>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTasksApi() {
  return useOutletContext<OutletContextType>().tasksApi;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useNotesApi() {
  return useOutletContext<OutletContextType>().notesApi;
}
