import { Outlet, useLocation, useOutletContext } from "react-router-dom";
import { CosmicBackground } from "./CosmicBackground";
import { Sidebar } from "./Sidebar";
import { AppBar } from "./AppBar";
import { ScrollArea } from "../ui/ScrollArea";
import { useTasks, type TasksApi } from "../../hooks/useTasks";
import { useNotes, type NotesApi } from "../../hooks/useNotes";
import { useLunaChats, type LunaChatsApi } from "../../hooks/useLunaChats";

interface OutletContextType {
  tasksApi: TasksApi;
  notesApi: NotesApi;
  lunaChats: LunaChatsApi;
}

const FIXED_WORKSPACE_ROUTES = new Set(["/luna", "/meeting", "/writing"]);

export function AppLayout() {
  const tasksApi = useTasks();
  const notesApi = useNotes();
  // Lives here, not in LunaPage: this layout stays mounted across child route
  // changes, so an in-flight Luna turn survives switching tabs.
  const lunaChats = useLunaChats();
  const { pathname } = useLocation();
  const isFixedWorkspace = FIXED_WORKSPACE_ROUTES.has(pathname);

  const context = { tasksApi, notesApi, lunaChats } satisfies OutletContextType;

  return (
    <div className="app-shell">
      <CosmicBackground />
      <AppBar />
      <div className="app-workspace">
        <Sidebar />
        <main className="app-content">
          {isFixedWorkspace ? (
            <Outlet context={context} />
          ) : (
            <ScrollArea className="h-full">
              <Outlet context={context} />
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

// eslint-disable-next-line react-refresh/only-export-components
export function useLunaChatsApi() {
  return useOutletContext<OutletContextType>().lunaChats;
}
