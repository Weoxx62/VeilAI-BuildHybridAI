import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { User } from "firebase/auth";
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CloudOff,
  Copy,
  FileSearch,
  Globe,
  Loader2,
  Puzzle,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  UserCheck,
  WifiOff,
  X,
} from "lucide-react";
import {
  applyVaultRedaction,
  buildVaultAndScrub,
  checkChromeAICapability,
  DEFAULT_REMOTE_POLICY,
  DEMO_SCENARIOS,
  initVeilFirebase,
  loadRemotePolicy,
  runDeterministicRegexGuard,
  runLocalQuickTriage,
  runStage1LocalShield,
  runStage2CloudAudit,
  saveAnonymizedAudit,
  signInAsGuest,
  subscribeAnonymizedAudits,
  subscribeAuthState,
  toAnonymizedAuditRecord,
  type AnonymizedAuditRecord,
  type AuditReport,
  type ChromeAICapability,
  type ComplianceProfileId,
  type DocumentDomain,
  type EntityCategory,
  type LocalTriageResult,
  type PipelineStageTrace,
  type RedactionResult,
  type RemotePolicyConfig,
  type SplitBrainRunResult,
  type VaultEntity,
} from "@veilai/hybrid-core";

function readExtFirebaseServices() {
  const debugRaw = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN;
  return initVeilFirebase({
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? "",
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? "",
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? "",
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? "",
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? "",
    appId: import.meta.env.VITE_FIREBASE_APP_ID ?? "",
    recaptchaSiteKey: import.meta.env.VITE_FIREBASE_RECAPTCHA_SITE_KEY ?? "",
    appCheckDebugToken:
      debugRaw === "true"
        ? true
        : typeof debugRaw === "string" && debugRaw.trim().length > 0
          ? debugRaw.trim()
          : false,
  });
}

function buildInstantLocalPreview(
  text: string,
  profile: ComplianceProfileId,
  policy: RemotePolicyConfig,
): RedactionResult {
  const startedAt = performance.now();
  const allowed = policy.profiles[profile].categories;
  const regexHits = runDeterministicRegexGuard(text, profile, allowed);
  const vault = buildVaultAndScrub(text, [], regexHits);
  return {
    extractedText: text,
    scrubbedText: vault.scrubbedText,
    entities: vault.entities,
    zeroLeakVerified: vault.zeroLeakVerified,
    leakedMatches: vault.leakedMatches,
    bytesShielded: vault.bytesShielded,
    trace: {
      stage: "STAGE_1_SHIELD",
      modeRequested: "Local Pre-Flight Guard (0 Network)",
      inferenceSource: "LOCAL_REGEX_FALLBACK",
      modelUsed: "Deterministic Local Vault",
      latencyMs: Math.max(1, Math.round(performance.now() - startedAt)),
      bytesSentToCloud: 0,
      piiLeakedBytes: 0,
      timestamp: Date.now(),
    },
  };
}

function subtleHighlightClass(category: EntityCategory, enabled: boolean): string {
  if (!enabled) {
    return "border-b border-dashed border-white/25 text-[#8E8E96] line-through";
  }
  switch (category) {
    case "API_KEY":
    case "AWS_KEY":
    case "JWT":
    case "PRIVATE_KEY":
    case "DB_URI":
    case "PASSWORD":
      return "rounded-[3px] bg-rose-400/[0.15] px-1 py-0.5 text-[#FDE2E4] underline decoration-rose-400/40 decoration-dotted underline-offset-2";
    case "IBAN":
    case "SALARY":
    case "TAX_ID":
    case "ACCOUNT_NUMBER":
    case "SSN":
      return "rounded-[3px] bg-amber-300/[0.14] px-1 py-0.5 text-[#FEF3C7] underline decoration-amber-300/40 decoration-dotted underline-offset-2";
    default:
      return "rounded-[3px] bg-emerald-400/[0.13] px-1 py-0.5 text-[#D1FAE5] underline decoration-emerald-400/40 decoration-dotted underline-offset-2";
  }
}

function renderProtectedPreview(
  text: string,
  entities: VaultEntity[],
  onToggleEntity: (token: string) => void,
): ReactNode {
  if (!entities.length) return text;
  const sorted = [...entities].sort((a, b) => b.original.length - a.original.length);
  const segments: Array<{ text: string; entity?: VaultEntity }> = [{ text }];

  for (const entity of sorted) {
    if (entity.original.length < 3) continue;
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (seg.entity) continue;
      const idx = seg.text.indexOf(entity.original);
      if (idx === -1) continue;
      const before = seg.text.slice(0, idx);
      const after = seg.text.slice(idx + entity.original.length);
      const next: Array<{ text: string; entity?: VaultEntity }> = [];
      if (before) next.push({ text: before });
      next.push({ text: entity.original, entity });
      if (after) next.push({ text: after });
      segments.splice(i, 1, ...next);
      i += next.length - 1;
    }
  }

  return segments.map((seg, idx) => {
    if (!seg.entity) return <span key={idx}>{seg.text}</span>;
    const entity = seg.entity;
    return (
      <button
        key={`${entity.token}-${idx}`}
        type="button"
        onClick={() => onToggleEntity(entity.token)}
        className={`inline text-left transition ${subtleHighlightClass(entity.category, entity.enabled)}`}
        title={
          entity.enabled
            ? `Protected locally — sent as ${entity.token}. Click to toggle.`
            : `Not protected — click to shield as ${entity.token}.`
        }
      >
        {seg.text}
      </button>
    );
  });
}

function severityBadge(severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"): string {
  switch (severity) {
    case "CRITICAL":
      return "bg-rose-400/15 text-rose-300";
    case "HIGH":
      return "bg-amber-400/15 text-amber-300";
    case "MEDIUM":
      return "bg-sky-400/15 text-sky-300";
    case "LOW":
      return "bg-emerald-400/15 text-emerald-300";
  }
}

type SideTab = "document" | "review" | "history";
const PROFILE_ORDER: ComplianceProfileId[] = [
  "GDPR_EU",
  "HIPAA_MEDICAL",
  "DEVSECOPS_CODE",
  "FINANCIAL_TAX",
];

export function SidePanelApp() {
  const services = useMemo(() => readExtFirebaseServices(), []);
  const [user, setUser] = useState<User | null>(null);
  const [capability, setCapability] = useState<ChromeAICapability | null>(null);
  const [policy, setPolicy] = useState<RemotePolicyConfig>(DEFAULT_REMOTE_POLICY);
  const [activeProfile, setActiveProfile] = useState<ComplianceProfileId>("DEVSECOPS_CODE");
  const [activeTab, setActiveTab] = useState<SideTab>("document");
  const [docViewMode, setDocViewMode] = useState<"protected" | "edit">("protected");
  const [reportView, setReportView] = useState<"rehydrated" | "cloud-raw">("rehydrated");
  const [showShieldedList, setShowShieldedList] = useState(false);
  const [inspectOpen, setInspectOpen] = useState(false);

  const [sourceLabel, setSourceLabel] = useState("GitHub PR / Active Tab");
  const [docDomain, setDocDomain] = useState<DocumentDomain>("code");
  const [rawText, setRawText] = useState(DEMO_SCENARIOS[3].content);

  const [redaction, setRedaction] = useState<RedactionResult | null>(() =>
    buildInstantLocalPreview(
      DEMO_SCENARIOS[3].content,
      "DEVSECOPS_CODE",
      DEFAULT_REMOTE_POLICY,
    ),
  );
  const [cloudReport, setCloudReport] = useState<AuditReport | null>(null);
  const [rehydratedReport, setRehydratedReport] = useState<AuditReport | null>(null);
  const [triage, setTriage] = useState<LocalTriageResult | null>(null);
  const [traces, setTraces] = useState<PipelineStageTrace[]>([]);
  const [records, setRecords] = useState<
    Array<AnonymizedAuditRecord & { hasPendingWrites: boolean }>
  >([]);

  const [busy, setBusy] = useState(false);
  const [busyTriage, setBusyTriage] = useState(false);
  const [syncingRc, setSyncingRc] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    void checkChromeAICapability().then(setCapability);
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    if (!services.isConfigured) return;
    void loadRemotePolicy(services.remoteConfig).then(setPolicy);
    return subscribeAuthState(services.auth, setUser);
  }, [services]);

  useEffect(() => {
    if (!services.isConfigured || !user) return;
    return subscribeAnonymizedAudits(services.db, user.uid, setRecords);
  }, [services, user]);

  const handleProfileChange = (next: ComplianceProfileId) => {
    setActiveProfile(next);
    if (rawText.trim()) {
      setRedaction(buildInstantLocalPreview(rawText, next, policy));
    }
  };

  const handleTextChange = (nextText: string) => {
    setRawText(nextText);
    setRedaction(
      nextText.trim()
        ? buildInstantLocalPreview(nextText, activeProfile, policy)
        : null,
    );
  };

  const handleCaptureActiveTab = async () => {
    setStatusMsg(null);
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) {
        setStatusMsg("No active browser tab found.");
        return;
      }

      const sendCapture = () =>
        chrome.tabs.sendMessage(tab.id!, { type: "VEILAI_CAPTURE_TAB" }) as Promise<{
          ok: boolean;
          title: string;
          surfaceHint: "gmail" | "github" | "docs" | "webpage";
          text: string;
        }>;

      let response: Awaited<ReturnType<typeof sendCapture>> | null = null;
      try {
        response = await sendCapture();
      } catch {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["content.js"],
        });
        response = await sendCapture();
      }

      if (response?.ok && response.text) {
        let nextProfile: ComplianceProfileId = activeProfile;
        if (response.surfaceHint === "github") {
          setDocDomain("code");
          nextProfile = "DEVSECOPS_CODE";
        } else if (response.surfaceHint === "gmail" || response.surfaceHint === "docs") {
          setDocDomain("legal");
          nextProfile = "GDPR_EU";
        } else {
          setDocDomain("general");
        }
        setActiveProfile(nextProfile);
        setRawText(response.text);
        setSourceLabel(response.title);
        setRedaction(buildInstantLocalPreview(response.text, nextProfile, policy));
        setCloudReport(null);
        setRehydratedReport(null);
        setTriage(null);
        setActiveTab("document");
        setDocViewMode("protected");
        setStatusMsg(`Captured locally from ${response.surfaceHint} (0 bytes sent).`);
      } else {
        setStatusMsg("Highlight text on the page or open Gmail, GitHub, or Docs, then click Capture.");
      }
    } catch (err) {
      setStatusMsg(
        err instanceof Error
          ? `Cannot read this tab: ${err.message}`
          : "Cannot capture internal Chrome pages.",
      );
    }
  };

  const handleReviewDocument = async () => {
    if (!rawText.trim()) return;
    setBusy(true);
    setStatusMsg(null);
    setCloudReport(null);
    setRehydratedReport(null);
    setTriage(null);

    try {
      const previousToggles = new Map<string, boolean>();
      if (redaction) {
        for (const e of redaction.entities) previousToggles.set(e.original, e.enabled);
      }

      const shield = await runStage1LocalShield({
        ai: services.ai,
        text: rawText,
        profile: activeProfile,
        policy,
        previousToggleMap: previousToggles,
      });
      setRedaction(shield);
      setTraces([shield.trace]);

      if (!isOnline) {
        try {
          const quick = await runLocalQuickTriage({
            ai: services.ai,
            scrubbedText: shield.scrubbedText,
            domain: docDomain,
            policy,
            entities: shield.entities,
          });
          setTriage(quick.triage);
          setTraces([shield.trace, quick.trace]);
        } catch {
          // Keep offline queue notice
        }
        setActiveTab("review");
        setStatusMsg("Working offline: protected locally and queued for sync.");
        if (services.isConfigured && user) {
          const offlineRun: SplitBrainRunResult = {
            id: `ext-${Date.now()}`,
            title: sourceLabel,
            domain: docDomain,
            complianceProfile: activeProfile,
            inputModality: "text",
            redaction: shield,
            wirePayload: shield.scrubbedText,
            cloudReportAnonymized: null,
            rehydratedReport: null,
            localTriage: null,
            traces: [shield.trace],
            offlineQueued: true,
            estimatedUsdSaved: 0.0042,
            createdAt: Date.now(),
          };
          await saveAnonymizedAudit(
            services.db,
            user.uid,
            toAnonymizedAuditRecord(offlineRun, "extension"),
          );
        }
        return;
      }

      if (!services.isConfigured) {
        setInspectOpen(true);
        setStatusMsg("Protected locally (0 bytes leaked). Connect Firebase in .env.local for cloud review.");
        return;
      }

      const stage2 = await runStage2CloudAudit({
        ai: services.ai,
        scrubbedText: shield.scrubbedText,
        domain: docDomain,
        profile: activeProfile,
        policy,
        entities: shield.entities,
      });

      setCloudReport(stage2.cloudReportAnonymized);
      setRehydratedReport(stage2.rehydratedReport);
      setTraces([shield.trace, ...stage2.traces]);
      setActiveTab("review");

      if (user) {
        const run: SplitBrainRunResult = {
          id: `ext-${Date.now()}`,
          title: sourceLabel,
          domain: docDomain,
          complianceProfile: activeProfile,
          inputModality: "text",
          redaction: shield,
          wirePayload: stage2.wirePayload,
          cloudReportAnonymized: stage2.cloudReportAnonymized,
          rehydratedReport: stage2.rehydratedReport,
          localTriage: null,
          traces: [shield.trace, ...stage2.traces],
          offlineQueued: false,
          estimatedUsdSaved: 0.0042,
          createdAt: Date.now(),
        };
        await saveAnonymizedAudit(
          services.db,
          user.uid,
          toAnonymizedAuditRecord(run, "extension"),
        );
      }
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : "Review failed.");
    } finally {
      setBusy(false);
    }
  };

  const handleQuickLocalSummary = async () => {
    if (!redaction) return;
    setBusyTriage(true);
    setStatusMsg(null);
    try {
      const quick = await runLocalQuickTriage({
        ai: services.ai,
        scrubbedText: redaction.scrubbedText,
        domain: docDomain,
        policy,
        entities: redaction.entities,
      });
      setTriage(quick.triage);
      setTraces((prev) => [...prev, quick.trace]);
      setActiveTab("review");
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : "Offline summary failed.");
    } finally {
      setBusyTriage(false);
    }
  };

  const handleSyncRc = async () => {
    setSyncingRc(true);
    try {
      const updated = await loadRemotePolicy(services.remoteConfig, true);
      setPolicy(updated);
    } finally {
      setSyncingRc(false);
    }
  };

  const handleToggleEntity = (token: string) => {
    if (!redaction) return;
    const nextEntities = redaction.entities.map((e) =>
      e.token === token ? { ...e, enabled: !e.enabled } : e,
    );
    const reapplied = applyVaultRedaction(redaction.extractedText, nextEntities);
    setRedaction({ ...redaction, entities: nextEntities, ...reapplied });
  };

  const handleCopy = async (key: string, val: string) => {
    await navigator.clipboard.writeText(val);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey((c) => (c === key ? null : c)), 1500);
  };

  const enabledCount = redaction?.entities.filter((e) => e.enabled).length ?? 0;
  const shownReport = reportView === "rehydrated" ? rehydratedReport : cloudReport;
  const isCodeDoc = docDomain === "code";

  return (
    <div className="flex min-h-screen flex-col bg-[#161618] text-[#EAE9E5]">
      {/* Calm Side Panel Header */}
      <header className="flex h-13 items-center justify-between border-b border-white/[0.06] bg-[#161618] px-4">
        <div className="flex items-center gap-2">
          <svg
            width="21"
            height="21"
            viewBox="0 0 64 64"
            fill="none"
            aria-hidden="true"
            className="shrink-0"
          >
            <defs>
              <linearGradient id="ext-bg" x1="18" y1="2" x2="46" y2="62" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#26262B" />
                <stop offset="100%" stopColor="#141417" />
              </linearGradient>
              <linearGradient id="ext-cloud" x1="48" y1="16" x2="30" y2="49" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#6EE7B7" />
                <stop offset="100%" stopColor="#10B981" />
              </linearGradient>
              <linearGradient id="ext-local" x1="16" y1="16" x2="34" y2="49" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#F7F6F2" />
                <stop offset="100%" stopColor="#DAD8D2" />
              </linearGradient>
              <linearGradient id="ext-shadow" x1="31" y1="31" x2="38" y2="34" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#0C0D10" stopOpacity="0.58" />
                <stop offset="100%" stopColor="#0C0D10" stopOpacity="0" />
              </linearGradient>
              <clipPath id="ext-clip">
                <polygon points="39.75,16.5 50.25,16.5 36.35,48.5 27.65,48.5" />
              </clipPath>
            </defs>
            <rect x="2" y="2" width="60" height="60" rx="15" fill="url(#ext-bg)" />
            <rect x="2.75" y="2.75" width="58.5" height="58.5" rx="14.25" stroke="#FFFFFF" strokeOpacity="0.14" strokeWidth="1.5" />
            <polygon points="39.75,16.5 50.25,16.5 36.35,48.5 27.65,48.5" fill="url(#ext-cloud)" />
            <polygon points="24.25,16.5 29.5,16.5 41.2,48.5 34.5,48.5" fill="url(#ext-shadow)" clipPath="url(#ext-clip)" />
            <polygon points="13.75,16.5 24.25,16.5 36.35,48.5 27.65,48.5" fill="url(#ext-local)" />
            <polygon points="27.65,48.5 32,37.8 36.35,48.5" fill="#FFFFFF" fillOpacity="0.12" />
          </svg>
          <span className="text-[14px] font-semibold tracking-[-0.02em] text-[#F4F3EF]">
            VeilAI
          </span>
          <span
            className={`ml-1 h-2 w-2 rounded-full ${
              capability?.status === "available" ? "bg-emerald-400" : "bg-amber-400"
            }`}
            title={
              capability?.status === "available"
                ? "On-device Gemini Nano 4 active"
                : "Local shield active"
            }
          />
        </div>

        <div className="flex items-center gap-1.5">
          {!isOnline && (
            <span className="inline-flex items-center gap-1 rounded bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-200">
              <WifiOff className="h-3 w-3" />
              Offline
            </span>
          )}
          <button
            type="button"
            onClick={() => setInspectOpen((v) => !v)}
            className={`inline-flex h-7 items-center gap-1.5 rounded-lg border px-2 text-[11px] transition ${
              inspectOpen
                ? "border-emerald-400/35 bg-emerald-400/10 text-emerald-200"
                : "border-white/[0.08] bg-white/[0.03] text-[#C8C7C2] hover:bg-white/[0.07]"
            }`}
            title="Inspect outbound anonymized payload and Firebase AI Logic traces"
          >
            <SlidersHorizontal className="h-3 w-3" />
            <span>Inspect</span>
          </button>
          {!user && services.isConfigured && (
            <button
              type="button"
              onClick={() => void signInAsGuest(services.auth)}
              className="inline-flex h-7 items-center gap-1 rounded-lg bg-white/[0.09] px-2 text-[11px] font-medium text-[#F4F3EF] hover:bg-white/[0.15]"
            >
              <UserCheck className="h-3 w-3" />
              <span>Guest</span>
            </button>
          )}
        </div>
      </header>

      {/* Primary Action Strip */}
      <div className="space-y-2.5 border-b border-white/[0.06] bg-[#19191C] px-4 py-3">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleCaptureActiveTab}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/[0.09] bg-white/[0.04] px-3 py-2 text-[12.5px] font-medium text-[#EAE9E5] transition hover:bg-white/[0.08]"
          >
            <FileSearch className="h-3.5 w-3.5" />
            <span>Capture tab</span>
          </button>

          <button
            type="button"
            onClick={handleReviewDocument}
            disabled={busy}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#F2F1EE] px-3 py-2 text-[12.5px] font-semibold text-[#161618] transition hover:bg-white disabled:opacity-55"
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            <span>{busy ? "Reviewing..." : "Review"}</span>
          </button>
        </div>

        <div className="flex items-center justify-between gap-2">
          <label className="sr-only" htmlFor="veilai-ext-policy">
            Compliance framework
          </label>
          <select
            id="veilai-ext-policy"
            name="extCompliancePolicy"
            value={activeProfile}
            onChange={(e) => handleProfileChange(e.target.value as ComplianceProfileId)}
            className="h-7 flex-1 rounded-lg border border-white/[0.08] bg-[#161618] px-2 text-[11.5px] text-[#C8C7C2] focus:border-white/[0.2] focus:outline-none"
          >
            {PROFILE_ORDER.map((id) => (
              <option key={id} value={id} className="bg-[#161618] text-[#EAE9E5]">
                {policy.profiles[id].label}
              </option>
            ))}
          </select>

          <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-emerald-300">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>{enabledCount} shielded</span>
          </span>
        </div>

        {statusMsg && (
          <div className="rounded-lg border border-white/[0.08] bg-[#161618] px-3 py-2 text-[11.5px] text-[#D2D1CC]">
            {statusMsg}
          </div>
        )}
      </div>

      {/* Collapsible Privacy & SDK Inspector (Hidden by default) */}
      {inspectOpen && (
        <div className="space-y-3 border-b border-white/[0.08] bg-[#141416] px-4 py-3 text-[11px]">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 font-medium text-emerald-300">
              <CheckCircle2 className="h-3.5 w-3.5" />
              0 bytes PII leaked · {redaction?.bytesShielded ?? 0}B stripped
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSyncRc}
                disabled={syncingRc}
                className="inline-flex items-center gap-1 rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-[#D2D1CC] hover:bg-white/[0.12]"
              >
                <RefreshCw className={`h-2.5 w-2.5 ${syncingRc ? "animate-spin" : ""}`} />
                <span>RC ({policy.cloudAuditModel})</span>
              </button>
              <button
                type="button"
                onClick={() => setInspectOpen(false)}
                className="text-[#8E8E96] hover:text-white"
                aria-label="Close inspector"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div>
            <div className="mb-1 text-[10px] uppercase tracking-wider text-[#75757C]">
              Exact anonymized outbound payload
            </div>
            <pre className="max-h-36 overflow-y-auto whitespace-pre-wrap rounded-lg border border-white/[0.07] bg-[#1C1C1F] p-2.5 font-mono text-[10.5px] text-[#C8C7C2]">
              {redaction?.scrubbedText || "No text loaded."}
            </pre>
          </div>

          {traces.length > 0 && (
            <div className="space-y-1">
              <div className="text-[10px] uppercase tracking-wider text-[#75757C]">
                Firebase AI Logic Trace (inferenceSource)
              </div>
              {traces.map((t, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between rounded bg-[#1C1C1F] px-2.5 py-1.5 font-mono text-[10px]"
                >
                  <span className="text-[#EAE9E5]">{t.stage}</span>
                  <span className="text-emerald-300">
                    {t.inferenceSource} · {t.latencyMs}ms
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Clean 3-Tab Switcher */}
      <nav className="grid grid-cols-3 border-b border-white/[0.06] bg-[#161618] text-[12px] font-medium">
        {(
          [
            ["document", "Document"],
            ["review", "Review"],
            ["history", `History (${records.length})`],
          ] as Array<[SideTab, string]>
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={`border-b-2 py-2.5 transition ${
              activeTab === id
                ? "border-[#EAE9E5] text-[#F4F3EF]"
                : "border-transparent text-[#75757C] hover:text-[#C8C7C2]"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto bg-[#1C1C1F] p-4">
        {activeTab === "document" && (
          <div className="space-y-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-[12.5px] font-medium text-[#F4F3EF]">
                {sourceLabel}
              </span>
              <div className="inline-flex shrink-0 rounded-md bg-white/[0.05] p-0.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => setDocViewMode("protected")}
                  className={`rounded px-2 py-0.5 ${
                    docViewMode === "protected"
                      ? "bg-[#2C2C31] text-[#F4F3EF]"
                      : "text-[#8E8E96]"
                  }`}
                >
                  View
                </button>
                <button
                  type="button"
                  onClick={() => setDocViewMode("edit")}
                  className={`rounded px-2 py-0.5 ${
                    docViewMode === "edit"
                      ? "bg-[#2C2C31] text-[#F4F3EF]"
                      : "text-[#8E8E96]"
                  }`}
                >
                  Edit
                </button>
              </div>
            </div>

            {docViewMode === "edit" ? (
              <textarea
                id="veilai-ext-source"
                name="extSource"
                aria-label="Captured or pasted document text"
                value={rawText}
                onChange={(e) => handleTextChange(e.target.value)}
                rows={11}
                className={`w-full rounded-xl border border-white/[0.08] bg-[#222226] p-3 leading-relaxed text-[#EAE9E5] focus:border-white/[0.2] focus:outline-none ${
                  isCodeDoc ? "font-mono text-[11.5px]" : "text-[12.5px]"
                }`}
                placeholder="Capture Gmail, GitHub PR, or Google Docs — or paste text here..."
              />
            ) : (
              <div
                className={`max-h-[300px] overflow-y-auto whitespace-pre-wrap rounded-xl border border-white/[0.07] bg-[#222226] p-3.5 leading-[1.7] text-[#EAE9E5] ${
                  isCodeDoc ? "font-mono text-[11.5px]" : "text-[12.5px]"
                }`}
              >
                {redaction && redaction.entities.length > 0
                  ? renderProtectedPreview(
                      redaction.extractedText,
                      redaction.entities,
                      handleToggleEntity,
                    )
                  : rawText}
              </div>
            )}

            {/* Collapsible Protected Items */}
            {redaction && redaction.entities.length > 0 && (
              <div className="rounded-xl border border-white/[0.06] bg-[#202024] px-3.5 py-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-medium text-[#EAE9E5]">
                    {enabledCount} private details kept on this device
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowShieldedList((v) => !v)}
                    className="inline-flex items-center gap-1 text-[11px] text-[#9A9AA0] hover:text-white"
                  >
                    <span>{showShieldedList ? "Hide" : "Manage"}</span>
                    {showShieldedList ? (
                      <ChevronUp className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>

                {showShieldedList && (
                  <div className="mt-2.5 max-h-44 divide-y divide-white/[0.06] overflow-y-auto border-t border-white/[0.06] pt-1">
                    {redaction.entities.map((e) => (
                      <div
                        key={e.token}
                        className={`flex items-center justify-between gap-2 py-1.5 text-[11.5px] ${
                          e.enabled ? "" : "opacity-45"
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="truncate text-[#EAE9E5]">{e.original}</div>
                          <div className="font-mono text-[10px] text-[#75757C]">
                            {e.category.toLowerCase().replace("_", " ")} → {e.token}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleToggleEntity(e.token)}
                          className={`shrink-0 rounded px-2 py-0.5 text-[10.5px] font-medium ${
                            e.enabled
                              ? "bg-emerald-400/15 text-emerald-300"
                              : "bg-white/[0.06] text-[#9A9AA0]"
                          }`}
                        >
                          {e.enabled ? "Protected" : "Visible"}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === "review" && (
          <div className="space-y-4">
            {shownReport && (
              <div className="grid grid-cols-2 rounded-lg bg-white/[0.05] p-0.5 text-[11.5px] font-medium">
                <button
                  type="button"
                  onClick={() => setReportView("rehydrated")}
                  className={`rounded-md py-1 ${
                    reportView === "rehydrated"
                      ? "bg-[#2C2C31] text-[#F4F3EF]"
                      : "text-[#8E8E96]"
                  }`}
                >
                  With your details
                </button>
                <button
                  type="button"
                  onClick={() => setReportView("cloud-raw")}
                  className={`rounded-md py-1 ${
                    reportView === "cloud-raw"
                      ? "bg-[#2C2C31] text-[#F4F3EF]"
                      : "text-[#8E8E96]"
                  }`}
                >
                  Anonymized
                </button>
              </div>
            )}

            {triage && (
              <div className="rounded-xl border border-white/[0.07] bg-[#202024] p-3.5 text-xs">
                <div className="flex items-center justify-between text-[11px] text-[#9A9AA0]">
                  <span className="font-medium text-[#EAE9E5]">
                    Quick Summary · {triage.documentType}
                  </span>
                  <span>{triage.inferenceSource === "ON_DEVICE" ? "On-device" : "Cloud"}</span>
                </div>
                <p className="mt-1.5 text-[12px] leading-relaxed text-[#D2D1CC]">
                  {triage.quickSummary}
                </p>
              </div>
            )}

            {!shownReport ? (
              <div className="rounded-xl border border-white/[0.06] bg-[#202024] p-5 text-center">
                <p className="text-[12.5px] leading-relaxed text-[#9A9AA0]">
                  Click <strong className="text-[#F4F3EF]">Review</strong> to audit this tab privately with zero personal data sent to the cloud.
                </p>
                <button
                  type="button"
                  onClick={handleQuickLocalSummary}
                  disabled={busyTriage || !redaction}
                  className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-medium text-[#EAE9E5] underline decoration-white/25 underline-offset-4 hover:text-white disabled:opacity-50"
                >
                  {busyTriage && <Loader2 className="h-3 w-3 animate-spin" />}
                  <span>Run quick offline summary</span>
                </button>
              </div>
            ) : (
              <div className="space-y-3.5">
                <div className="rounded-xl border border-white/[0.07] bg-[#202024] p-4">
                  <div className="flex items-baseline justify-between">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-[24px] font-semibold tabular-nums text-[#F4F3EF]">
                        {shownReport.riskScore}
                      </span>
                      <span className="text-[12px] text-[#75757C]">/ 100 risk</span>
                    </div>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${severityBadge(shownReport.riskLevel)}`}
                    >
                      {shownReport.riskLevel}
                    </span>
                  </div>
                  <p className="mt-2.5 text-[12.5px] leading-relaxed text-[#D2D1CC]">
                    {shownReport.executiveSummary}
                  </p>
                </div>

                {shownReport.findings.map((f) => (
                  <article
                    key={f.id}
                    className="rounded-xl border border-white/[0.06] bg-[#202024] p-3.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-[12.5px] font-semibold text-[#F4F3EF]">
                        {f.title}
                      </h3>
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 text-[9.5px] font-medium ${severityBadge(f.severity)}`}
                      >
                        {f.severity}
                      </span>
                    </div>
                    <p className="mt-1.5 text-[12px] leading-relaxed text-[#B8B8C0]">
                      {f.explanation}
                    </p>
                    <div className="mt-2.5 rounded-lg bg-[#161618] p-2.5">
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-[10.5px] font-medium text-[#9A9AA0]">
                          Suggested revision
                        </span>
                        <button
                          type="button"
                          onClick={() => void handleCopy(f.id, f.suggestedRedline)}
                          className="inline-flex items-center gap-1 text-[10.5px] text-[#9A9AA0] hover:text-white"
                        >
                          {copiedKey === f.id ? (
                            <Check className="h-3 w-3 text-emerald-400" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                          <span>{copiedKey === f.id ? "Copied" : "Copy"}</span>
                        </button>
                      </div>
                      <p className="text-[12px] leading-relaxed text-[#EAE9E5]">
                        {f.suggestedRedline}
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "history" && (
          <div className="space-y-3">
            <p className="text-[11.5px] text-[#8E8E96]">
              Synced live with VeilAI Web via Firestore (anonymized tokens only — 0 raw PII).
            </p>
            {records.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/[0.1] p-6 text-center text-[12px] text-[#8E8E96]">
                Click <strong>Guest</strong> above to sync anonymized reviews across Web and Chrome Extension.
              </div>
            ) : (
              records.map((r) => (
                <div
                  key={r.id}
                  className="rounded-xl border border-white/[0.07] bg-[#202024] p-3.5"
                >
                  <div className="flex items-center justify-between font-mono text-[10px]">
                    <span className="inline-flex items-center gap-1 text-[#C8C7C2]">
                      {r.surface === "extension" ? (
                        <Puzzle className="h-2.5 w-2.5" />
                      ) : (
                        <Globe className="h-2.5 w-2.5" />
                      )}
                      {r.surface.toUpperCase()}
                    </span>
                    <span className="inline-flex items-center gap-1 text-emerald-300">
                      {r.hasPendingWrites ? (
                        <>
                          <CloudOff className="h-2.5 w-2.5 text-amber-300" />
                          <span className="text-amber-300">OFFLINE</span>
                        </>
                      ) : (
                        <span>
                          Risk {r.riskScore} · {r.totalEntitiesRedacted} shielded
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="mt-1.5 text-[13px] font-semibold text-[#F4F3EF]">
                    {r.title}
                  </div>
                  <p className="mt-1 line-clamp-2 text-[12px] text-[#9A9AA0]">
                    {r.summary}
                  </p>
                </div>
              ))
            )}
          </div>
        )}
      </main>
    </div>
  );
}
