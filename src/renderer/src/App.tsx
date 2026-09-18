import { Suspense, lazy, useEffect } from "react";
import { onBackgroundAiDrain } from "./lib/background-ai-worker";
import { notifyBackgroundCategorizeComplete } from "./lib/notify";
import { Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { AppProvider, useApp } from "./contexts/AppContext";
import { Spinner } from "./components/ui/Spinner";
import { initializeCodexSettings } from "./lib/ai";

const WelcomeScreen = lazy(() =>
  import("./components/welcome/WelcomeScreen").then((module) => ({
    default: module.WelcomeScreen,
  })),
);
const AppLayout = lazy(() =>
  import("./components/layout/AppLayout").then((module) => ({
    default: module.AppLayout,
  })),
);
const DashboardPage = lazy(() =>
  import("./pages/DashboardPage").then((module) => ({
    default: module.DashboardPage,
  })),
);
const ArchivePage = lazy(() =>
  import("./pages/ArchivePage").then((module) => ({
    default: module.ArchivePage,
  })),
);
const NotesPage = lazy(() =>
  import("./pages/NotesPage").then((module) => ({
    default: module.NotesPage,
  })),
);
const LunaPage = lazy(() =>
  import("./pages/LunaPage").then((module) => ({
    default: module.LunaPage,
  })),
);
const MeetingModePage = lazy(() =>
  import("./pages/MeetingModePage").then((module) => ({
    default: module.MeetingModePage,
  })),
);
const WritingAssistantPage = lazy(() =>
  import("./pages/WritingAssistantPage").then((module) => ({
    default: module.WritingAssistantPage,
  })),
);
const ProjectsPage = lazy(() =>
  import("./pages/ProjectsPage").then((module) => ({
    default: module.ProjectsPage,
  })),
);

function BackgroundNotifyBridge() {
  useEffect(() => {
    let taskTotal = 0;
    let noteTotal = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    return onBackgroundAiDrain(({ taskCount, noteCount }) => {
      taskTotal += taskCount;
      noteTotal += noteCount;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        notifyBackgroundCategorizeComplete(taskTotal, noteTotal);
        taskTotal = 0;
        noteTotal = 0;
      }, 1200);
    });
  }, []);

  return null;
}

function RouteFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-bg">
      <Spinner size={28} className="text-text-faint" />
    </div>
  );
}

function AppContent() {
  const { onboarded, loading } = useApp();

  if (loading) {
    return (
      <>
        <div className="min-h-screen flex items-center justify-center bg-orbit-950">
          <Spinner size={28} className="text-white/20" />
        </div>
      </>
    );
  }

  if (!onboarded) {
    return (
      <>
        <Suspense fallback={<RouteFallback />}>
          <WelcomeScreen />
        </Suspense>
      </>
    );
  }

  return (
    <>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route index element={<DashboardPage />} />
            <Route path="notes" element={<NotesPage />} />
            <Route path="meeting" element={<MeetingModePage />} />
            <Route path="luna" element={<LunaPage />} />
            <Route path="writing" element={<WritingAssistantPage />} />
            <Route path="archive" element={<ArchivePage />} />
            <Route path="projects" element={<ProjectsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </>
  );
}

export default function App() {
  useEffect(() => {
    void initializeCodexSettings();
    return window.orbitDesktop.codex.onAccountChanged(() => {
      void initializeCodexSettings();
    });
  }, []);

  return (
    <AppProvider>
      <BackgroundNotifyBridge />
      <AppContent />
      <Toaster
        position="bottom-right"
        toastOptions={{
          duration: 3000,
          style: {
            background: "#0c0e18",
            color: "#f1f5f9",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: "14px",
            fontSize: "13px",
            fontFamily: "Inter, system-ui, sans-serif",
            boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          },
          success: {
            iconTheme: { primary: "#34d399", secondary: "#0c0e18" },
          },
          error: {
            iconTheme: { primary: "#f87171", secondary: "#0c0e18" },
          },
        }}
      />
    </AppProvider>
  );
}
