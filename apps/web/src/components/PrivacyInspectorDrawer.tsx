import { useEffect } from "react";
import {
  AlertOctagon,
  Cpu,
  Download,
  Gauge,
  Loader2,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import {
  computeLocalSharePercent,
  type ChromeAICapability,
  type CloudEscalationMode,
  type LocalVsHybridBenchmark,
  type PipelineStageTrace,
  type RedactionResult,
  type RemotePolicyConfig,
  type SessionTelemetry,
} from "@veilai/hybrid-core";

interface PrivacyInspectorDrawerProps {
  open: boolean;
  onClose: () => void;
  capability: ChromeAICapability;
  policy: RemotePolicyConfig;
  telemetry: SessionTelemetry;
  redaction: RedactionResult | null;
  wirePayload: string;
  traces: PipelineStageTrace[];
  benchmark: LocalVsHybridBenchmark | null;
  effectiveOnline: boolean;
  simulateOffline: boolean;
  isSyncingRc: boolean;
  isRunningShield: boolean;
  isRunningBenchmark: boolean;
  leakTestResult: {
    triggered: boolean;
    blockedToken: string;
    blockedSample: string;
    leakedBytes: number;
  } | null;
  onToggleSimulateOffline: () => void;
  onSyncRemoteConfig: () => void;
  onToggleEscalationMode: (mode: CloudEscalationMode) => void;
  onRunShieldOnly: () => void;
  onTestLeakGuard: () => void;
  onClearLeakTest: () => void;
  onRunBenchmark: () => void;
  onExportCertificate: () => void;
}

/**
 * Dedicated Compliance & Firebase Hybrid AI Inspector drawer.
 * Keeps the primary user workspace calm and uncluttered while giving auditors, CISOs,
 * and Hackathon judges 1-click access to live SDK telemetry, wire verification,
 * leak-guard penetration testing, Remote Config, Airplane Mode, and Nano vs Cloud benchmarks.
 */
export function PrivacyInspectorDrawer({
  open,
  onClose,
  capability,
  policy,
  telemetry,
  redaction,
  wirePayload,
  traces,
  benchmark,
  effectiveOnline,
  simulateOffline,
  isSyncingRc,
  isRunningShield,
  isRunningBenchmark,
  leakTestResult,
  onToggleSimulateOffline,
  onSyncRemoteConfig,
  onToggleEscalationMode,
  onRunShieldOnly,
  onTestLeakGuard,
  onClearLeakTest,
  onRunBenchmark,
  onExportCertificate,
}: PrivacyInspectorDrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const localShare = computeLocalSharePercent(telemetry);
  const enabledCount = redaction?.entities.filter((e) => e.enabled).length ?? 0;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/55 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-xl flex-col border-l border-white/[0.08] bg-[#161618] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.07] px-6 py-4">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              <h2 className="text-[14px] font-semibold text-[#F4F3EF]">
                Privacy &amp; Hybrid AI Inspector
              </h2>
            </div>
            <p className="mt-0.5 text-[12px] text-[#8E8E96]">
              Firebase AI Logic runtime verification, zero-leak wire proof &amp; compliance controls
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-[#8E8E96] transition hover:bg-white/[0.06] hover:text-white"
            aria-label="Close privacy inspector"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          {/* Telemetry Summary */}
          <div className="grid grid-cols-4 gap-2.5">
            <div className="rounded-xl border border-white/[0.07] bg-[#1E1E22] p-3">
              <div className="text-[10.5px] text-[#8E8E96]">Shielded</div>
              <div className="mt-1 font-mono text-base font-semibold text-[#F4F3EF]">
                {enabledCount}
              </div>
            </div>
            <div className="rounded-xl border border-emerald-400/25 bg-emerald-400/[0.07] p-3">
              <div className="text-[10.5px] text-emerald-300/90">PII Leaked</div>
              <div className="mt-1 font-mono text-base font-semibold text-emerald-300">
                {telemetry.piiLeakedBytes} B
              </div>
            </div>
            <div className="rounded-xl border border-white/[0.07] bg-[#1E1E22] p-3">
              <div className="text-[10.5px] text-[#8E8E96]">On-Device</div>
              <div className="mt-1 font-mono text-base font-semibold text-[#F4F3EF]">
                {localShare === null ? "—" : `${localShare}%`}
              </div>
            </div>
            <div className="rounded-xl border border-white/[0.07] bg-[#1E1E22] p-3">
              <div className="text-[10.5px] text-[#8E8E96]">Cost Saved</div>
              <div className="mt-1 font-mono text-base font-semibold text-[#F4F3EF]">
                ${telemetry.estimatedUsdSaved.toFixed(4)}
              </div>
            </div>
          </div>

          {/* Verification Actions */}
          <div className="space-y-2.5">
            <div className="text-[11px] font-medium uppercase tracking-wider text-[#75757C]">
              Verification Tools
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onRunShieldOnly}
                disabled={isRunningShield}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-white/[0.09] bg-[#1E1E22] px-3 py-2 text-[12px] font-medium text-[#EAE9E5] transition hover:bg-white/[0.08] disabled:opacity-50"
              >
                {isRunningShield ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Cpu className="h-3.5 w-3.5 text-emerald-400" />
                )}
                <span>Run Nano 4 Shield Only</span>
              </button>

              <button
                type="button"
                onClick={onTestLeakGuard}
                disabled={!redaction}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-rose-400/30 bg-rose-400/[0.08] px-3 py-2 text-[12px] font-medium text-rose-200 transition hover:bg-rose-400/[0.15] disabled:opacity-50"
              >
                <ShieldAlert className="h-3.5 w-3.5" />
                <span>Simulate PII Leak Test</span>
              </button>

              <button
                type="button"
                onClick={onRunBenchmark}
                disabled={isRunningBenchmark || !redaction}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-white/[0.09] bg-[#1E1E22] px-3 py-2 text-[12px] font-medium text-[#EAE9E5] transition hover:bg-white/[0.08] disabled:opacity-50"
              >
                {isRunningBenchmark ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Gauge className="h-3.5 w-3.5 text-[#93C5FD]" />
                )}
                <span>Benchmark Nano vs Cloud</span>
              </button>

              <button
                type="button"
                onClick={onExportCertificate}
                disabled={!redaction}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-white/[0.09] bg-[#1E1E22] px-3 py-2 text-[12px] font-medium text-[#EAE9E5] transition hover:bg-white/[0.08] disabled:opacity-50"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Export SHA-256 Proof</span>
              </button>
            </div>
          </div>

          {/* Leak Interception Proof */}
          {leakTestResult?.triggered && (
            <div className="rounded-xl border border-rose-400/40 bg-rose-950/35 p-3.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold text-rose-300">
                  <AlertOctagon className="h-4 w-4" />
                  HARD WIRE GUARD ABORTED LEAK (0B SENT)
                </span>
                <button
                  type="button"
                  onClick={onClearLeakTest}
                  className="font-mono text-[10px] text-rose-300 underline"
                >
                  Dismiss
                </button>
              </div>
              <p className="mt-1.5 font-mono text-[11px] leading-relaxed text-rose-100/90">
                Simulated injection of raw secret for{" "}
                <strong>{leakTestResult.blockedToken}</strong> (
                <code className="rounded bg-black/40 px-1">
                  {leakTestResult.blockedSample}
                </code>
                , {leakTestResult.leakedBytes}B).{" "}
                <code className="text-emerald-300">verifyZeroLeak()</code> halted transmission before opening any network socket.
              </p>
            </div>
          )}

          {/* Side-by-Side Local vs Cloud Benchmark */}
          {benchmark && (
            <div className="rounded-xl border border-white/[0.08] bg-[#1E1E22] p-4">
              <div className="mb-3 font-mono text-[10.5px] font-semibold uppercase tracking-wider text-[#9A9AA0]">
                Benchmark · On-Device Only vs Split-Brain Hybrid
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-lg border border-white/[0.06] bg-[#161618] p-3">
                  <div className="font-mono text-[10px] font-semibold text-emerald-300">
                    NANO 4 ONLY (LOCAL)
                  </div>
                  <div className="mt-0.5 font-mono text-[10px] text-[#8E8E96]">
                    {benchmark.localLatencyMs}ms · $0.00 · {benchmark.localFindingsCount} flags
                  </div>
                  <p className="mt-2 text-[11.5px] leading-relaxed text-[#D2D1CC]">
                    {benchmark.localSummary}
                  </p>
                </div>
                <div className="rounded-lg border border-white/[0.06] bg-[#161618] p-3">
                  <div className="font-mono text-[10px] font-semibold text-[#93C5FD]">
                    HYBRID ({benchmark.cloudModel})
                  </div>
                  <div className="mt-0.5 font-mono text-[10px] text-[#8E8E96]">
                    {benchmark.cloudLatencyMs > 0
                      ? `${benchmark.cloudLatencyMs}ms`
                      : "Pending"}{" "}
                    · 0B PII · {benchmark.cloudFindingsCount} redlines
                  </div>
                  <p className="mt-2 text-[11.5px] leading-relaxed text-[#D2D1CC]">
                    {benchmark.cloudSummary}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Firebase Remote Config & Network Controls */}
          <div className="rounded-xl border border-white/[0.07] bg-[#1E1E22] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium uppercase tracking-wider text-[#8E8E96]">
                Firebase Remote Config &amp; Connectivity
              </span>
              <button
                type="button"
                onClick={onSyncRemoteConfig}
                disabled={isSyncingRc}
                className="inline-flex items-center gap-1 rounded bg-white/[0.06] px-2 py-1 text-[11px] text-[#EAE9E5] hover:bg-white/[0.1]"
              >
                <RefreshCw className={`h-3 w-3 ${isSyncingRc ? "animate-spin" : ""}`} />
                <span>Sync ({policy.source})</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
              <div className="rounded-lg bg-[#161618] px-3 py-2">
                <div className="text-[10px] text-[#75757C]">Cloud Model</div>
                <div className="mt-0.5 text-[#EAE9E5]">{policy.cloudAuditModel}</div>
              </div>
              <button
                type="button"
                onClick={() =>
                  onToggleEscalationMode(
                    policy.cloudEscalationMode === "ONLY_IN_CLOUD"
                      ? "PREFER_IN_CLOUD"
                      : "ONLY_IN_CLOUD",
                  )
                }
                className="rounded-lg bg-[#161618] px-3 py-2 text-left transition hover:bg-white/[0.06]"
              >
                <div className="text-[10px] text-[#75757C]">Stage 2 Mode (click)</div>
                <div className="mt-0.5 text-[#93C5FD]">{policy.cloudEscalationMode}</div>
              </button>
            </div>

            <div className="flex items-center justify-between rounded-lg bg-[#161618] px-3 py-2 text-xs">
              <div className="flex items-center gap-2 text-[#D2D1CC]">
                {effectiveOnline ? (
                  <Wifi className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <WifiOff className="h-3.5 w-3.5 text-amber-400" />
                )}
                <span>
                  {effectiveOnline
                    ? "Online · Hybrid routing active"
                    : "Airplane Mode · 100% on-device + Firestore cache"}
                </span>
              </div>
              <button
                type="button"
                onClick={onToggleSimulateOffline}
                className="rounded bg-white/[0.08] px-2 py-1 text-[11px] font-medium text-[#F4F3EF] hover:bg-white/[0.14]"
              >
                {simulateOffline ? "Reconnect" : "Simulate Offline"}
              </button>
            </div>

            <div className="text-[11px] text-[#8E8E96]">
              Runtime: <span className="text-[#D2D1CC]">{capability.browserHint}</span>
            </div>
          </div>

          {/* Live Firebase AI Logic SDK Execution Trace */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wider text-[#75757C]">
              <span>Firebase AI Logic SDK Trace</span>
              <span className="font-mono lowercase">result.response.inferenceSource</span>
            </div>

            {traces.length === 0 ? (
              <div className="rounded-xl border border-white/[0.06] bg-[#1E1E22] p-4 text-xs text-[#8E8E96]">
                Run a review or local shield to capture live runtime SDK calls.
              </div>
            ) : (
              <div className="space-y-2">
                {traces.map((t, i) => (
                  <div
                    key={`${t.stage}-${t.timestamp}-${i}`}
                    className="rounded-xl border border-white/[0.07] bg-[#1E1E22] p-3 font-mono text-[10.5px]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-[#F4F3EF]">{t.stage}</span>
                      <span
                        className={
                          t.inferenceSource === "ON_DEVICE"
                            ? "text-emerald-400"
                            : t.inferenceSource === "IN_CLOUD"
                              ? "text-[#93C5FD]"
                              : "text-[#D2D1CC]"
                        }
                      >
                        {t.inferenceSource} · {t.latencyMs}ms
                      </span>
                    </div>
                    <div className="mt-1 text-[10px] text-[#9A9AA0]">{t.modelUsed}</div>
                    <div className="mt-1 flex items-center justify-between text-[10px] text-[#75757C]">
                      <span>{t.modeRequested}</span>
                      <span className="text-emerald-400">
                        {t.bytesSentToCloud}B wire · {t.piiLeakedBytes}B PII
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Exact Outbound Prompt Envelope */}
          {wirePayload && (
            <div className="space-y-2">
              <div className="text-[11px] font-medium uppercase tracking-wider text-[#75757C]">
                Exact Cloud Prompt Envelope
              </div>
              <pre className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-xl border border-white/[0.07] bg-[#111113] p-3 font-mono text-[10.5px] leading-relaxed text-[#B8B8C0]">
                {wirePayload}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
