import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  AlertCircle,
  BrainCircuit,
  CheckCircle2,
  Database,
  Download,
  Link2,
  RefreshCw,
  Trash2,
  Upload,
  User,
} from "lucide-react";
import { Modal } from "../ui/Modal";
import { Spinner } from "../ui/Spinner";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { SectionLabel } from "../ui/SectionLabel";
import { Select } from "../ui/Select";
import { EffortSlider } from "../ui/EffortSlider";
import { useApp } from "../../contexts/AppContext";
import {
  fetchOpenCodeGoModels,
  getAiSettings,
  pickDefaultModel,
  saveAiSettings,
  type AiFeatures,
  type AiSettings,
  type ModelConfig,
} from "../../lib/ai";
import { resolveModelSelection } from "../../lib/ai-models";
import {
  clearAllData,
  downloadBackup,
  exportAllData,
  importData,
} from "../../lib/storage/backup";
import { setNoteCategories, setTaskCategories } from "../../lib/storage/db";
import type { CodexAccountState } from "../../../../shared/contracts";

type Tab = "profile" | "data" | "ai";

interface Props {
  open: boolean;
  onClose: () => void;
}

const TABS: Array<{ id: Tab; label: string; icon: ReactNode }> = [
  { id: "profile", label: "Profile", icon: <User size={15} /> },
  { id: "data", label: "Local data", icon: <Database size={15} /> },
  { id: "ai", label: "Codex & Luna", icon: <BrainCircuit size={15} /> },
];

export function SettingsModal({ open, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("profile");

  return (
    <Modal open={open} onClose={onClose} title="Settings" maxWidth="max-w-3xl">
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings sections">
          {TABS.map(({ id, label, icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`settings-nav-item ${tab === id ? "is-active" : ""}`}
            >
              {icon}
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="settings-panel">
          {tab === "profile" && <ProfileTab />}
          {tab === "data" && <DataTab onClose={onClose} />}
          {tab === "ai" && <AITab />}
        </div>
      </div>
    </Modal>
  );
}

function ProfileTab() {
  const { profile, setDisplayName } = useApp();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(profile?.displayName ?? "");
  const [success, setSuccess] = useState(false);

  const handleSave = (event: FormEvent): void => {
    event.preventDefault();
    setDisplayName(name.trim() || "Explorer");
    setEditing(false);
    setSuccess(true);
    setTimeout(() => setSuccess(false), 2000);
  };

  return (
    <SettingsPage
      title="Profile"
      description="The name Orbit uses in greetings and generated writing."
    >
      <SettingsSection label="Display name">
        {editing ? (
          <form onSubmit={handleSave} className="space-y-3">
            <Input
              type="text"
              autoFocus
              value={name}
              maxLength={100}
              onChange={(event) => setName(event.target.value)}
            />
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                type="button"
                className="flex-1"
                onClick={() => {
                  setEditing(false);
                  setName(profile?.displayName ?? "");
                }}
              >
                Cancel
              </Button>
              <Button variant="primary" size="sm" type="submit" className="flex-1">
                Save
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <span className="min-w-0 truncate text-sm text-text-secondary">
              {profile?.displayName ?? "Explorer"}
            </span>
            {success ? (
              <span className="inline-status is-success">
                <CheckCircle2 size={12} /> Saved
              </span>
            ) : (
              <button type="button" className="text-action" onClick={() => setEditing(true)}>
                Edit
              </button>
            )}
          </div>
        )}
      </SettingsSection>

      <div className="settings-note">
        Orbit keeps tasks, notes, projects, meetings, and preferences on this device.
      </div>
    </SettingsPage>
  );
}

function DataTab({ onClose }: { onClose: () => void }) {
  const { resetApp } = useApp();
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleExport = async (): Promise<void> => {
    setExporting(true);
    setMessage(null);
    try {
      downloadBackup(await exportAllData());
      setMessage({ type: "success", text: "Backup exported." });
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : String(error) });
    } finally {
      setExporting(false);
    }
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setMessage(null);
    try {
      const result = await importData(JSON.parse(await file.text()) as unknown, "replace");
      setMessage({
        type: "success",
        text: `Imported ${result.tasks} tasks, ${result.notes} notes, and ${result.projects} projects.`,
      });
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : String(error) });
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleClear = async (): Promise<void> => {
    setClearing(true);
    try {
      await clearAllData();
      await resetApp();
      onClose();
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : String(error) });
    } finally {
      setClearing(false);
      setConfirmClear(false);
    }
  };

  return (
    <SettingsPage title="Local data" description="Move, restore, or clear Orbit’s local workspace.">
      {message && (
        <InlineAlert
          tone={message.type}
          icon={message.type === "success" ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
        >
          {message.text}
        </InlineAlert>
      )}

      <SettingsSection label="Backup">
        <p className="settings-body-copy">
          Export one JSON file containing your complete Orbit workspace, including AI preferences.
        </p>
        <div className="settings-actions-grid">
          <Button variant="secondary" onClick={() => void handleExport()} disabled={exporting}>
            {exporting ? <Spinner size={14} /> : <Download size={14} />}
            Export data
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(event) => void handleImport(event)}
          />
          <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={importing}>
            {importing ? <Spinner size={14} /> : <Upload size={14} />}
            Import backup
          </Button>
        </div>
      </SettingsSection>

      <SettingsSection label="Danger zone">
        {!confirmClear ? (
          <Button variant="danger" className="w-full" onClick={() => setConfirmClear(true)}>
            <Trash2 size={14} /> Clear all data
          </Button>
        ) : (
          <div className="space-y-3">
            <p className="settings-body-copy text-danger/80">
              This permanently clears the local workspace and returns to onboarding.
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" className="flex-1" onClick={() => setConfirmClear(false)}>
                Cancel
              </Button>
              <Button variant="danger" size="sm" className="flex-1" onClick={() => void handleClear()} disabled={clearing}>
                {clearing && <Spinner size={13} />} Delete everything
              </Button>
            </div>
          </div>
        )}
      </SettingsSection>
    </SettingsPage>
  );
}

const FEATURE_ROWS: Array<{ key: keyof AiFeatures; label: string; description: string }> = [
  { key: "lunaChat", label: "Luna chat", description: "Conversational planning with Orbit tools" },
  { key: "meetingMode", label: "Meeting mode", description: "Agendas, notes, and follow-up tasks" },
  { key: "writingAssistant", label: "Writing assistant", description: "Rewrite, refine, expand, and format text" },
  { key: "autoCategorize", label: "Auto-categorize", description: "Organize tasks and notes in the background" },
  { key: "noteTools", label: "Note tools", description: "Summaries and task extraction" },
];

function AITab() {
  const [settings, setSettings] = useState<AiSettings>(() => getAiSettings());
  const [account, setAccount] = useState<CodexAccountState | null>(null);
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loginPending, setLoginPending] = useState(false);
  const [cleared, setCleared] = useState(false);

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const [accountState, result] = await Promise.all([
        window.orbitDesktop.codex.account(),
        fetchOpenCodeGoModels(),
      ]);
      setAccount(accountState);
      if (result.error) throw new Error(result.error);
      setModels(result.models);
      if (result.models.length) {
        const current = getAiSettings();
        const next = {
          ...current,
          ...resolveModelSelection(result.models, current.model, current.effort),
        };
        setSettings(next);
        saveAiSettings(next);
      }
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : String(refreshError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    return window.orbitDesktop.codex.onAccountChanged(() => {
      setLoginPending(false);
      void refresh();
    });
  }, [refresh]);

  const update = (next: AiSettings): void => {
    setSettings(next);
    saveAiSettings(next);
  };

  const changeModel = (modelId: string): void => {
    const model = models.find((candidate) => candidate.id === modelId);
    if (!model) return;
    update({
      ...settings,
      ...resolveModelSelection(models, model.id, settings.effort),
    });
  };

  const selectedModel = models.find((model) => model.id === settings.model);
  const effortOptions = (selectedModel?.supportedReasoningEfforts ?? []).map((option) => ({
    value: option.reasoningEffort,
    label: effortLabel(option.reasoningEffort),
    description: option.description,
  }));
  const accountLabel = account?.account?.type === "chatgpt"
    ? account.account.email ?? "ChatGPT account"
    : account?.account?.type === "apiKey"
      ? "API key authentication"
      : account?.account
        ? "Codex account"
        : "Not signed in";
  const accountMeta = account?.account?.type === "chatgpt"
    ? `${account.account.planType} plan · Codex CLI ${account.cliVersion ?? "detected"}`
    : `Codex CLI ${account?.cliVersion ?? "detected"}`;

  const handleLogin = async (): Promise<void> => {
    setLoginPending(true);
    setError(null);
    try {
      await window.orbitDesktop.codex.login();
    } catch (loginError) {
      setLoginPending(false);
      setError(loginError instanceof Error ? loginError.message : String(loginError));
    }
  };

  const handleClearCategories = async (): Promise<void> => {
    await setTaskCategories({});
    await setNoteCategories({});
    window.dispatchEvent(new Event("orbit:categories:cleared"));
    window.dispatchEvent(new Event("orbit:note-categories:cleared"));
    setCleared(true);
    setTimeout(() => setCleared(false), 3500);
  };

  return (
    <SettingsPage
      title="Codex & Luna"
      description="Orbit uses your local Codex CLI and its existing ChatGPT authentication."
      action={
        <button type="button" className="icon-text-button" onClick={() => void refresh()} disabled={loading}>
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      }
    >
      {error && <InlineAlert tone="error" icon={<AlertCircle size={13} />}>{error}</InlineAlert>}

      <SettingsSection label="Connection">
        <div className="codex-account-row">
          <span className={`codex-account-mark ${account?.account ? "is-connected" : ""}`}>
            <Link2 size={16} />
          </span>
          <span className="codex-account-copy">
            <span className="codex-account-name">{loading ? "Checking Codex CLI" : accountLabel}</span>
            <span className="codex-account-meta">{accountMeta}</span>
          </span>
          {!loading && !account?.account && (
            <Button variant="primary" size="sm" onClick={() => void handleLogin()} disabled={loginPending}>
              {loginPending ? "Waiting for sign-in" : "Sign in with ChatGPT"}
            </Button>
          )}
        </div>
      </SettingsSection>

      <SettingsSection label="Model">
        {models.length ? (
          <Select
            ariaLabel="Codex model"
            value={settings.model || pickDefaultModel(models)}
            onChange={changeModel}
            options={models.map((model) => ({
              value: model.id,
              label: model.label,
              description: model.description,
              badge: model.recommended ? "Default" : undefined,
            }))}
          />
        ) : (
          <div className="settings-loading-row">
            {loading && <Spinner size={14} />} {loading ? "Loading available Codex models" : "No models available"}
          </div>
        )}
      </SettingsSection>

      {effortOptions.length > 0 && (
        <SettingsSection label="Reasoning effort">
          <EffortSlider
            value={settings.effort || effortOptions[0].value}
            options={effortOptions}
            onChange={(effort) => update({ ...settings, effort })}
          />
          <p className="settings-note mt-3">
            Categorization and project colors use the fastest effort supported by this model.
          </p>
        </SettingsSection>
      )}

      <SettingsSection label="Features">
        <div className="feature-toggle-list">
          {FEATURE_ROWS.map((feature) => (
            <div key={feature.key} className="feature-toggle-row">
              <span className="feature-toggle-copy">
                <span className="feature-toggle-name">{feature.label}</span>
                <span className="feature-toggle-description">{feature.description}</span>
              </span>
              <Toggle
                checked={settings.features[feature.key]}
                label={feature.label}
                onChange={(checked) => update({
                  ...settings,
                  features: { ...settings.features, [feature.key]: checked },
                })}
              />
            </div>
          ))}
        </div>
      </SettingsSection>

      {settings.features.autoCategorize && (
        <SettingsSection label="Generated categories">
          {cleared ? (
            <InlineAlert tone="success" icon={<CheckCircle2 size={13} />}>
              Categories cleared. Orbit will regenerate them as needed.
            </InlineAlert>
          ) : (
            <div className="flex items-center justify-between gap-4">
              <span className="settings-body-copy">Clear existing AI categories and rebuild them.</span>
              <button type="button" className="text-action whitespace-nowrap" onClick={() => void handleClearCategories()}>
                Clear categories
              </button>
            </div>
          )}
        </SettingsSection>
      )}
    </SettingsPage>
  );
}

function effortLabel(value: string): string {
  if (value === "xhigh") return "XHigh";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function Toggle({ checked, label, onChange }: { checked: boolean; label: string; onChange: (checked: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      className={`toggle ${checked ? "is-on" : ""}`}
      onClick={() => onChange(!checked)}
    >
      <span className="toggle-thumb" />
    </button>
  );
}

function SettingsPage({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="settings-page-heading">
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        {action}
      </div>
      <div className="settings-page-sections">{children}</div>
    </section>
  );
}

function SettingsSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <SectionLabel className="mb-2">{label}</SectionLabel>
      <div className="settings-section">{children}</div>
    </div>
  );
}

function InlineAlert({
  tone,
  icon,
  children,
}: {
  tone: "success" | "error";
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={`inline-alert is-${tone}`}>
      <span>{icon}</span>
      <span>{children}</span>
    </div>
  );
}
