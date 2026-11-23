import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  Loader2,
  Lock,
  Mail,
  Plus,
  Send,
  ShieldCheck,
  Sparkles,
  Wand2,
  WifiOff,
} from "lucide-react";
import type {
  AuditReport,
  DocumentDomain,
  DocumentQaMessage,
  LocalTriageResult,
  RedactionResult,
  VaultEntity,
} from "@veilai/hybrid-core";

interface InspectorPanelProps {
  docTitle: string;
  docDomain: DocumentDomain;
  redaction: RedactionResult | null;
  onToggleEntity: (token: string) => void;
  onAddCustomTerm: (term: string) => void;
  cloudReportAnonymized: AuditReport | null;
  rehydratedReport: AuditReport | null;
  localTriage: LocalTriageResult | null;
  qaMessages: DocumentQaMessage[];
  qaStreamingAnswer: string;
  isAskingQa: boolean;
  isRunningShield: boolean;
  shieldElapsedSec: number;
  isRunningCloud: boolean;
  isRunningTriage: boolean;
  offlineQueued: boolean;
  effectiveOnline: boolean;
  onRunFullSplitBrain: () => void;
  onRunLocalTriage: () => void;
  onResumeCloudAudit: () => void;
  onFocusClause: (clauseRef: string) => void;
  onAskQuestion: (question: string, preferLocal: boolean) => Promise<void>;
  onPolishRedlineLocally: (
    findingId: string,
    anonymizedRedline: string,
    onChunk: (text: string) => void,
  ) => Promise<void>;
  onDraftFullReplyLocally: (onChunk: (text: string) => void) => Promise<void>;
}

const TOKEN_REGEX = /(\[[A-Z_]+_\d+\])/g;

const SUGGESTED_QUESTIONS: Record<DocumentDomain, string[]> = {
  legal: ["Is the non-compete enforceable?", "Summarize termination risks"],
  medical: ["Explain the abnormal lab values", "What follow-up should I ask for?"],
  financial: ["What is my double-tax exposure?", "How much is the 401(k) shortfall?"],
  code: ["Which credentials must be rotated first?", "How do I fix the SQL injection?"],
  general: ["What are the top 3 obligations?", "Are there hidden renewal traps?"],
};

function renderTokens(text: string): ReactNode {
  const parts = text.split(TOKEN_REGEX);
  return parts.map((part, idx) => {
    if (/^\[[A-Z_]+_\d+\]$/.test(part)) {
      return (
        <span
          key={idx}
          className="mx-0.5 inline-block rounded bg-white/[0.08] px-1 py-0.5 font-mono text-[11px] text-[#D6D3CD]"
        >
          {part}
        </span>
      );
    }
    return <span key={idx}>{part}</span>;
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

export function InspectorPanel({
  docTitle,
  docDomain,
  redaction,
  onToggleEntity,
  onAddCustomTerm,
  cloudReportAnonymized,
  rehydratedReport,
  localTriage,
  qaMessages,
  qaStreamingAnswer,
  isAskingQa,
  isRunningShield,
  shieldElapsedSec,
  isRunningCloud,
  isRunningTriage,
  offlineQueued,
  effectiveOnline,
  onRunFullSplitBrain,
  onRunLocalTriage,
  onResumeCloudAudit,
  onFocusClause,
  onAskQuestion,
  onPolishRedlineLocally,
  onDraftFullReplyLocally,
}: InspectorPanelProps) {
  const [reportViewMode, setReportViewMode] = useState<"rehydrated" | "cloud-raw">(
    "rehydrated",
  );
  const [showShieldedList, setShowShieldedList] = useState(false);
  const [customTerm, setCustomTerm] = useState("");
  const [acceptedIds, setAcceptedIds] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [polishingFindingId, setPolishingFindingId] = useState<string | null>(null);
  const [polishedMap, setPolishedMap] = useState<Record<string, string>>({});
  const [draftingReply, setDraftingReply] = useState(false);
  const [draftedReply, setDraftedReply] = useState("");
  const [qaInput, setQaInput] = useState("");
  const [qaPreferLocal, setQaPreferLocal] = useState(true);

  useEffect(() => {
    if (!rehydratedReport) {
      setDraftedReply("");
      setPolishedMap({});
      setAcceptedIds({});
    }
  }, [rehydratedReport]);

  useEffect(() => {
    if (!effectiveOnline) setQaPreferLocal(true);
  }, [effectiveOnline]);

  const activeReport =
    reportViewMode === "rehydrated" ? rehydratedReport : cloudReportAnonymized;
  const enabledCount = redaction?.entities.filter((e) => e.enabled).length ?? 0;
  const acceptedCount = Object.values(acceptedIds).filter(Boolean).length;
  const isBusy = isRunningShield || isRunningCloud;

  const handleCopy = async (id: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopiedId(id);
    setTimeout(() => setCopiedId((curr) => (curr === id ? null : curr)), 1600);
  };

  const handlePolish = async (findingId: string, anonymizedRedline: string) => {
    setPolishingFindingId(findingId);
    setPolishedMap((prev) => ({ ...prev, [findingId]: "" }));
    try {
      await onPolishRedlineLocally(findingId, anonymizedRedline, (partial) => {
        setPolishedMap((prev) => ({ ...prev, [findingId]: partial }));
      });
    } finally {
      setPolishingFindingId(null);
    }
  };

  const handleDraftReply = async () => {
    setDraftingReply(true);
    setDraftedReply("");
    try {
      await onDraftFullReplyLocally((partial) => {
        setDraftedReply(partial);
      });
    } finally {
      setDraftingReply(false);
    }
  };

  const handleAddCustomSubmit = (e: FormEvent) => {
    e.preventDefault();
    const cleaned = customTerm.trim();
    if (cleaned.length < 3) return;
    onAddCustomTerm(cleaned);
    setCustomTerm("");
  };

  const handleAskSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = qaInput.trim();
    if (!trimmed || isAskingQa || !redaction) return;
    setQaInput("");
    await onAskQuestion(trimmed, effectiveOnline ? qaPreferLocal : true);
  };

  const handleExportMarkdown = () => {
    if (!activeReport) return;
    const modeLabel =
      reportViewMode === "rehydrated"
        ? "Local Re-Hydrated Copy (Keep Private)"
        : "Strictly Anonymized Copy (Zero PII)";
    const lines = [
      `# VeilAI Review Memo — ${docTitle}`,
      `> ${modeLabel} · Risk Score: **${activeReport.riskScore}/100 (${activeReport.riskLevel})**`,
      "",
      "## Executive Summary",
      activeReport.executiveSummary,
      "",
      "## Key Issues & Suggested Revisions",
      ...activeReport.findings.flatMap((f, i) => [
        `### ${i + 1}. [${f.severity}] ${f.title} (${f.clauseRef})${acceptedIds[f.id] ? " — [Accepted]" : ""}`,
        f.explanation,
        "",
        `**Suggested revision:**`,
        `> ${polishedMap[f.id] || f.suggestedRedline}`,
        "",
      ]),
      ...(activeReport.complianceChecks.length > 0
        ? [
            "## Compliance Checks",
            ...activeReport.complianceChecks.map(
              (c) => `- **${c.status}** — ${c.rule}: ${c.note}`,
            ),
            "",
          ]
        : []),
      ...(qaMessages.length > 0
        ? [
            "## Follow-up Q&A",
            ...qaMessages.flatMap((m) => [
              `**Q:** ${reportViewMode === "cloud-raw" ? m.scrubbedQuestion : m.question}`,
              "",
              reportViewMode === "cloud-raw" ? m.anonymizedAnswer : m.rehydratedAnswer,
              "",
            ]),
          ]
        : []),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${docTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 42)}-review.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <aside className="flex w-full shrink-0 flex-col border-t border-white/[0.06] bg-[#19191C] xl:h-screen xl:w-[428px] xl:border-t-0 xl:border-l">
      {/* Calm Review Header */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/[0.06] px-6">
        <span className="text-[13.5px] font-semibold text-[#F4F3EF]">
          Review
        </span>

        {activeReport && (
          <div className="flex items-center gap-1.5">
            <div className="inline-flex rounded-lg bg-white/[0.05] p-0.5 text-[11.5px]">
              <button
                type="button"
                aria-pressed={reportViewMode === "rehydrated"}
                onClick={() => setReportViewMode("rehydrated")}
                className={`rounded-md px-2 py-0.5 font-medium transition ${
                  reportViewMode === "rehydrated"
                    ? "bg-[#2C2C31] text-[#F4F3EF]"
                    : "text-[#9A9AA0] hover:text-[#EAE9E5]"
                }`}
              >
                With your details
              </button>
              <button
                type="button"
                aria-pressed={reportViewMode === "cloud-raw"}
                onClick={() => setReportViewMode("cloud-raw")}
                className={`rounded-md px-2 py-0.5 font-medium transition ${
                  reportViewMode === "cloud-raw"
                    ? "bg-[#2C2C31] text-[#F4F3EF]"
                    : "text-[#9A9AA0] hover:text-[#EAE9E5]"
                }`}
              >
                Anonymized
              </button>
            </div>
            <button
              type="button"
              onClick={handleExportMarkdown}
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-[#9A9AA0] transition hover:bg-white/[0.08] hover:text-[#F4F3EF]"
              title="Download review memo (.md)"
              aria-label="Download review memo"
            >
              <Download className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </header>

      {/* Scrollable Review Content */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {/* Primary CTA + Local Privacy Summary */}
        <div className="space-y-4">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onRunFullSplitBrain}
              disabled={isBusy}
              className="flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-[#F2F1EE] px-4 text-[13.5px] font-semibold text-[#161618] transition hover:bg-white disabled:opacity-60"
              title="Run private review (Ctrl/Cmd + Enter)"
            >
              {isBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              <span>
                {isRunningShield
                  ? `Shielding locally (${shieldElapsedSec.toFixed(1)}s)...`
                  : isRunningCloud
                    ? "Reviewing anonymized draft..."
                    : effectiveOnline
                      ? activeReport
                        ? "Re-run review"
                        : "Review document"
                      : "Summarize offline"}
              </span>
            </button>
          </div>

          {/* Quiet Privacy Guarantee Line + Collapsible Protected Items + Custom Term Shield */}
          <div className="rounded-xl border border-white/[0.06] bg-[#202024] px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-[12.5px] font-medium text-[#EAE9E5]">
                <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400" />
                <span>{enabledCount} private details kept on this device</span>
              </div>

              {redaction && (
                <button
                  type="button"
                  onClick={() => setShowShieldedList((v) => !v)}
                  className="inline-flex items-center gap-1 text-[11.5px] text-[#9A9AA0] transition hover:text-[#F4F3EF]"
                >
                  <span>{showShieldedList ? "Hide" : "Manage"}</span>
                  {showShieldedList ? (
                    <ChevronUp className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" />
                  )}
                </button>
              )}
            </div>

            {!showShieldedList ? (
              <p className="mt-1.5 text-[12px] leading-relaxed text-[#8E8E96]">
                Names, account numbers, salaries, and credentials are stripped locally before review and restored only on your screen.
              </p>
            ) : (
              <div className="mt-3 space-y-2.5 border-t border-white/[0.06] pt-2.5">
                {redaction && redaction.entities.length > 0 && (
                  <div className="max-h-44 divide-y divide-white/[0.06] overflow-y-auto">
                    {redaction.entities.map((entity: VaultEntity) => (
                      <div
                        key={entity.token}
                        className={`flex items-center justify-between gap-3 py-2 text-[12px] ${
                          entity.enabled ? "" : "opacity-45"
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="truncate text-[#EAE9E5]">{entity.original}</div>
                          <div className="font-mono text-[10.5px] text-[#75757C]">
                            {entity.category.toLowerCase().replace("_", " ")} → {entity.token}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => onToggleEntity(entity.token)}
                          className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium transition ${
                            entity.enabled
                              ? "bg-emerald-400/15 text-emerald-300"
                              : "bg-white/[0.06] text-[#9A9AA0]"
                          }`}
                        >
                          {entity.enabled ? "Protected" : "Visible"}
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add Custom Confidential Word/Phrase */}
                <form onSubmit={handleAddCustomSubmit} className="flex items-center gap-1.5 pt-1">
                  <input
                    id="veilai-custom-shield-term"
                    name="customShieldTerm"
                    type="text"
                    value={customTerm}
                    onChange={(e) => setCustomTerm(e.target.value)}
                    placeholder="Hide custom word (e.g. Project Helios)..."
                    className="h-8 flex-1 rounded-lg border border-white/[0.08] bg-[#161618] px-2.5 text-[12px] text-[#EAE9E5] placeholder-[#6D6D75] focus:border-white/[0.2] focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={customTerm.trim().length < 3}
                    className="inline-flex h-8 items-center gap-1 rounded-lg bg-white/[0.08] px-2.5 text-[11.5px] font-medium text-[#EAE9E5] transition hover:bg-white/[0.14] disabled:opacity-40"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Hide</span>
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>

        {/* Offline Summary Card (PREFER_ON_DEVICE) */}
        {localTriage && (
          <div className="mt-5 rounded-xl border border-white/[0.07] bg-[#202024] p-4">
            <div className="flex items-center justify-between text-[11.5px] text-[#9A9AA0]">
              <span className="font-medium text-[#EAE9E5]">
                Quick Summary · {localTriage.documentType}
              </span>
              <span>
                {localTriage.inferenceSource === "ON_DEVICE" ? "On-device" : "Cloud"}
              </span>
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-[#D2D1CC]">
              {localTriage.quickSummary}
            </p>
            {localTriage.topFlags.length > 0 && (
              <ul className="mt-3 space-y-1.5 text-[12px] text-[#B8B8C0]">
                {localTriage.topFlags.map((flag, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400/80" />
                    <span>{flag}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Review Output Area */}
        <div className="mt-6">
          {isRunningCloud ? (
            <div className="space-y-3 py-6">
              <div className="flex items-center gap-2 text-[13px] text-[#B8B8C0]">
                <Lock className="h-3.5 w-3.5 text-emerald-400" />
                <span>Analyzing anonymized draft...</span>
              </div>
              <div className="h-3 w-2/3 animate-pulse rounded bg-white/[0.06]" />
              <div className="h-3 w-full animate-pulse rounded bg-white/[0.05]" />
              <div className="h-3 w-5/6 animate-pulse rounded bg-white/[0.05]" />
            </div>
          ) : offlineQueued && !activeReport ? (
            <div className="rounded-xl border border-amber-400/25 bg-amber-400/[0.06] p-4">
              <div className="flex items-center gap-2 text-[13px] font-medium text-amber-200">
                <WifiOff className="h-4 w-4" />
                <span>Saved offline — waiting for connection</span>
              </div>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-[#C8C7C2]">
                Your document was protected locally and queued safely. Reconnect whenever ready to finish the full review.
              </p>
              {effectiveOnline && (
                <button
                  type="button"
                  onClick={onResumeCloudAudit}
                  className="mt-3 rounded-lg bg-[#F2F1EE] px-3.5 py-1.5 text-[12px] font-semibold text-[#161618] hover:bg-white"
                >
                  Finish review now
                </button>
              )}
            </div>
          ) : !activeReport ? (
            <div className="border-t border-white/[0.06] pt-5">
              <p className="text-[13px] leading-relaxed text-[#8E8E96]">
                Start a full review to surface high-risk clauses, compliance gaps, and ready-to-send revisions — or run a fast offline summary directly on your device.
              </p>
              <button
                type="button"
                onClick={onRunLocalTriage}
                disabled={isRunningTriage || isBusy}
                className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[#D2D1CC] underline decoration-white/25 underline-offset-4 transition hover:text-white hover:decoration-white disabled:opacity-50"
              >
                {isRunningTriage && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <span>Run quick on-device summary</span>
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Executive Risk Summary */}
              <div className="border-b border-white/[0.07] pb-5">
                <div className="flex items-baseline justify-between">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-[28px] font-semibold tracking-tight tabular-nums text-[#F4F3EF]">
                      {activeReport.riskScore}
                    </span>
                    <span className="text-[13px] text-[#75757C]">/ 100 risk</span>
                  </div>
                  <span
                    className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${severityBadge(activeReport.riskLevel)}`}
                  >
                    {activeReport.riskLevel}
                  </span>
                </div>
                <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.07]">
                  <div
                    className={`h-full rounded-full ${
                      activeReport.riskScore >= 75
                        ? "bg-rose-400"
                        : activeReport.riskScore >= 45
                          ? "bg-amber-400"
                          : "bg-emerald-400"
                    }`}
                    style={{ width: `${activeReport.riskScore}%` }}
                  />
                </div>
                <p className="mt-3.5 text-[13.5px] leading-relaxed text-[#D2D1CC]">
                  {reportViewMode === "cloud-raw"
                    ? renderTokens(activeReport.executiveSummary)
                    : activeReport.executiveSummary}
                </p>
              </div>

              {/* Key Issues */}
              <div className="space-y-4">
                <div className="flex items-center justify-between text-[12px] text-[#8E8E96]">
                  <h2 className="font-medium">
                    Key issues ({activeReport.findings.length})
                  </h2>
                  {acceptedCount > 0 && (
                    <span className="text-emerald-300">
                      {acceptedCount} of {activeReport.findings.length} accepted
                    </span>
                  )}
                </div>

                <div className="space-y-3.5">
                  {activeReport.findings.map((finding, idx) => {
                    const anonymizedRedline =
                      cloudReportAnonymized?.findings[idx]?.suggestedRedline ??
                      finding.suggestedRedline;
                    const polished = polishedMap[finding.id];
                    const isPolishing = polishingFindingId === finding.id;
                    const isAccepted = Boolean(acceptedIds[finding.id]);

                    return (
                      <article
                        key={finding.id}
                        className={`rounded-xl border p-4 transition ${
                          isAccepted
                            ? "border-emerald-400/25 bg-emerald-400/[0.04]"
                            : "border-white/[0.06] bg-[#202024]"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="text-[13.5px] font-semibold leading-snug text-[#F4F3EF]">
                            {finding.title}
                          </h3>
                          <span
                            className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${severityBadge(finding.severity)}`}
                          >
                            {finding.severity}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => onFocusClause(finding.clauseRef)}
                          className="mt-1 inline-flex items-center gap-1 text-[11.5px] text-[#9A9AA0] transition hover:text-[#F4F3EF]"
                          title="Jump to this section in the document"
                        >
                          <span>{finding.clauseRef}</span>
                          <ArrowUpRight className="h-3 w-3" />
                        </button>

                        <p className="mt-2 text-[13px] leading-relaxed text-[#B8B8C0]">
                          {reportViewMode === "cloud-raw"
                            ? renderTokens(finding.explanation)
                            : finding.explanation}
                        </p>

                        <div className="mt-3 rounded-lg bg-[#17171A] p-3">
                          <div className="mb-1.5 flex items-center justify-between gap-2">
                            <span className="text-[11px] font-medium text-[#9A9AA0]">
                              Suggested revision
                            </span>
                            <div className="flex items-center gap-2.5">
                              <button
                                type="button"
                                onClick={() =>
                                  setAcceptedIds((prev) => ({
                                    ...prev,
                                    [finding.id]: !prev[finding.id],
                                  }))
                                }
                                className={`inline-flex items-center gap-1 text-[11px] transition ${
                                  isAccepted
                                    ? "font-medium text-emerald-300"
                                    : "text-[#9A9AA0] hover:text-white"
                                }`}
                              >
                                <Check className="h-3 w-3" />
                                <span>{isAccepted ? "Accepted" : "Accept"}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  handlePolish(finding.id, anonymizedRedline)
                                }
                                disabled={isPolishing}
                                className="inline-flex items-center gap-1 text-[11px] text-[#C8C7C2] transition hover:text-white disabled:opacity-50"
                              >
                                {isPolishing ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Wand2 className="h-3 w-3" />
                                )}
                                <span>Refine</span>
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  handleCopy(
                                    finding.id,
                                    polished || finding.suggestedRedline,
                                  )
                                }
                                className="inline-flex items-center gap-1 text-[11px] text-[#9A9AA0] transition hover:text-white"
                              >
                                {copiedId === finding.id ? (
                                  <Check className="h-3 w-3 text-emerald-400" />
                                ) : (
                                  <Copy className="h-3 w-3" />
                                )}
                                <span>{copiedId === finding.id ? "Copied" : "Copy"}</span>
                              </button>
                            </div>
                          </div>
                          <p className="text-[12.5px] leading-relaxed text-[#EAE9E5]">
                            {polished
                              ? polished
                              : reportViewMode === "cloud-raw"
                                ? renderTokens(finding.suggestedRedline)
                                : finding.suggestedRedline}
                          </p>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>

              {/* Compliance Checks */}
              {activeReport.complianceChecks.length > 0 && (
                <div className="space-y-2.5 border-t border-white/[0.06] pt-5">
                  <h2 className="text-[12px] font-medium text-[#8E8E96]">
                    Compliance checks
                  </h2>
                  <div className="divide-y divide-white/[0.06] rounded-xl border border-white/[0.06] bg-[#202024]">
                    {activeReport.complianceChecks.map((check, i) => (
                      <div
                        key={i}
                        className="flex items-start justify-between gap-3 px-4 py-3 text-[12.5px]"
                      >
                        <div>
                          <div className="font-medium text-[#EAE9E5]">
                            {check.rule}
                          </div>
                          <p className="mt-0.5 text-[12px] text-[#8E8E96]">
                            {check.note}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                            check.status === "PASS"
                              ? "bg-emerald-400/15 text-emerald-300"
                              : check.status === "WARN"
                                ? "bg-amber-400/15 text-amber-300"
                                : "bg-rose-400/15 text-rose-300"
                          }`}
                        >
                          {check.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Draft Ready-to-Send Response */}
              <div className="border-t border-white/[0.06] pt-5">
                <button
                  type="button"
                  onClick={handleDraftReply}
                  disabled={draftingReply}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/[0.1] bg-white/[0.04] px-4 py-2.5 text-[13px] font-medium text-[#F4F3EF] transition hover:bg-white/[0.08] disabled:opacity-50"
                >
                  {draftingReply ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Mail className="h-4 w-4" />
                  )}
                  <span>
                    {draftingReply ? "Drafting response locally..." : "Draft response message"}
                  </span>
                </button>

                {draftedReply && (
                  <div className="mt-3 rounded-xl border border-white/[0.08] bg-[#202024] p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-[11.5px] font-medium text-[#9A9AA0]">
                        Ready-to-send draft
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopy("draft-reply", draftedReply)}
                        className="inline-flex items-center gap-1 text-[11.5px] text-[#D2D1CC] hover:text-white"
                      >
                        {copiedId === "draft-reply" ? (
                          <Check className="h-3.5 w-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                        <span>{copiedId === "draft-reply" ? "Copied" : "Copy"}</span>
                      </button>
                    </div>
                    <div className="whitespace-pre-wrap text-[13px] leading-relaxed text-[#EAE9E5]">
                      {draftedReply}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Private Follow-Up Q&A Thread */}
          {(qaMessages.length > 0 || isAskingQa) && (
            <div className="mt-6 space-y-3 border-t border-white/[0.06] pt-5">
              <h2 className="text-[12px] font-medium text-[#8E8E96]">
                Document Q&amp;A
              </h2>
              {qaMessages.map((msg) => (
                <div
                  key={msg.id}
                  className="rounded-xl border border-white/[0.06] bg-[#202024] p-3.5"
                >
                  <div className="text-[12.5px] font-medium text-[#F4F3EF]">
                    {reportViewMode === "cloud-raw"
                      ? renderTokens(msg.scrubbedQuestion)
                      : msg.question}
                  </div>
                  <div className="mt-2 whitespace-pre-wrap text-[12.5px] leading-relaxed text-[#D2D1CC]">
                    {reportViewMode === "cloud-raw"
                      ? renderTokens(msg.anonymizedAnswer)
                      : msg.rehydratedAnswer}
                  </div>
                  <div className="mt-2 text-[10.5px] text-[#75757C]">
                    {msg.inferenceSource === "ON_DEVICE"
                      ? `Answered on-device · ${(msg.latencyMs / 1000).toFixed(1)}s`
                      : `Answered via anonymized cloud · ${(msg.latencyMs / 1000).toFixed(1)}s`}
                  </div>
                </div>
              ))}

              {isAskingQa && (
                <div className="rounded-xl border border-white/[0.06] bg-[#202024] p-3.5">
                  <div className="flex items-center gap-2 text-[12px] text-[#9A9AA0]">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" />
                    <span>
                      {qaPreferLocal ? "Thinking privately on this device..." : "Asking anonymized cloud..."}
                    </span>
                  </div>
                  {qaStreamingAnswer && (
                    <div className="mt-2 whitespace-pre-wrap text-[12.5px] leading-relaxed text-[#EAE9E5]">
                      {qaStreamingAnswer}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Calm Pinned Private Q&A Composer */}
      {redaction && (
        <div className="shrink-0 border-t border-white/[0.06] bg-[#161618] px-5 py-3.5">
          {qaMessages.length === 0 && !isAskingQa && (
            <div className="mb-2.5 flex flex-wrap gap-1.5">
              {(SUGGESTED_QUESTIONS[docDomain] ?? SUGGESTED_QUESTIONS.general).map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => void onAskQuestion(q, effectiveOnline ? qaPreferLocal : true)}
                  className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[11px] text-[#B8B8C0] transition hover:border-white/[0.16] hover:text-[#F4F3EF]"
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          <form onSubmit={(e) => void handleAskSubmit(e)} className="flex items-center gap-2">
            <input
              id="veilai-qa-input"
              name="documentQuestion"
              type="text"
              value={qaInput}
              onChange={(e) => setQaInput(e.target.value)}
              disabled={isAskingQa}
              placeholder="Ask a question about this document..."
              className="h-9 flex-1 rounded-xl border border-white/[0.09] bg-[#202024] px-3 text-[12.5px] text-[#EAE9E5] placeholder-[#75757C] focus:border-white/[0.22] focus:outline-none disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!qaInput.trim() || isAskingQa}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#F2F1EE] text-[#161618] transition hover:bg-white disabled:opacity-35"
              aria-label="Send question"
            >
              {isAskingQa ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
            </button>
          </form>

          <div className="mt-2 flex items-center justify-between text-[11px] text-[#75757C]">
            <span>Questions are anonymized locally before sending</span>
            <div className="inline-flex items-center gap-2">
              <button
                type="button"
                onClick={() => setQaPreferLocal(true)}
                className={qaPreferLocal ? "font-medium text-emerald-300" : "hover:text-[#D2D1CC]"}
              >
                On-device
              </button>
              <span>·</span>
              <button
                type="button"
                disabled={!effectiveOnline}
                onClick={() => setQaPreferLocal(false)}
                className={
                  !qaPreferLocal && effectiveOnline
                    ? "font-medium text-[#EAE9E5]"
                    : "hover:text-[#D2D1CC] disabled:opacity-40"
                }
              >
                Cloud
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
