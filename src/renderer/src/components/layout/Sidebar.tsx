import { NavLink } from "react-router-dom";
import { Settings } from "lucide-react";
import { useEffect, useState } from "react";
import { useApp } from "../../contexts/AppContext";
import { SettingsModal } from "../settings/SettingsModal";
import { Tooltip } from "../ui/Tooltip";
import {
  PlanetIcon,
  CometIcon,
  ConstellationIcon,
  BinaryOrbitIcon,
  CrescentIcon,
  SparkleIcon,
  CollapsedStarIcon,
  type CosmicIcon,
} from "../ui/CosmicIcons";
import { getAiSettings, type AiFeatures } from "../../lib/ai";

const NAV: Array<{
  icon: CosmicIcon;
  label: string;
  to: string;
  feature?: keyof AiFeatures;
}> = [
  { icon: PlanetIcon, label: "Tasks", to: "/" },
  { icon: CometIcon, label: "Notes", to: "/notes" },
  { icon: ConstellationIcon, label: "Projects", to: "/projects" },
  { icon: BinaryOrbitIcon, label: "Meeting", to: "/meeting", feature: "meetingMode" },
  { icon: CrescentIcon, label: "Luna", to: "/luna", feature: "lunaChat" },
  { icon: SparkleIcon, label: "Writing", to: "/writing", feature: "writingAssistant" },
  { icon: CollapsedStarIcon, label: "Archive", to: "/archive" },
];

function useAiFeatures(): AiFeatures {
  const [features, setFeatures] = useState(() => getAiSettings().features);
  useEffect(() => {
    const sync = () => setFeatures(getAiSettings().features);
    window.addEventListener("orbit:ai:changed", sync);
    return () => window.removeEventListener("orbit:ai:changed", sync);
  }, []);
  return features;
}

export function Sidebar() {
  const { profile } = useApp();
  const features = useAiFeatures();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsKey, setSettingsKey] = useState(0);
  const visibleNav = NAV.filter(({ feature }) => !feature || features[feature]);
  const name = profile?.displayName ?? "Explorer";
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const openSettings = (): void => {
    setSettingsKey((key) => key + 1);
    setSettingsOpen(true);
  };

  return (
    <>
      <aside className="sidebar" aria-label="Main navigation">
        <nav className="sidebar-nav">
          {visibleNav.map(({ icon: Icon, label, to }) => (
            <NavLink
              key={to}
              to={to}
              end
              className={({ isActive }) => `sidebar-link ${isActive ? "is-active" : ""}`}
            >
              {({ isActive }) => (
                <>
                  <span className="sidebar-icon-wrap">
                    <Icon size={22} active={isActive} />
                  </span>
                  <span className="sidebar-label">{label}</span>
                  <Tooltip label={label} side="right" className="sidebar-tooltip" />
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <button type="button" className="sidebar-profile" onClick={openSettings} aria-label="Open settings">
          <span className="sidebar-avatar">{initials}</span>
          <span className="sidebar-profile-copy">
            <span className="sidebar-profile-name">{name}</span>
            <span className="sidebar-profile-action">Settings</span>
          </span>
          <Settings size={15} className="sidebar-settings-icon" />
          <Tooltip label="Settings" side="right" className="sidebar-tooltip" />
        </button>
      </aside>

      <SettingsModal
        key={settingsKey}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </>
  );
}
