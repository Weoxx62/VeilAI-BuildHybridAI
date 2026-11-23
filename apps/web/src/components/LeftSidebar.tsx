import type { User } from "firebase/auth";
import {
  Code2,
  Download,
  FileText,
  History,
  Image as ImageIcon,
  Loader2,
  LogOut,
  Plus,
  Receipt,
  WifiOff,
} from "lucide-react";
import {
  DEMO_SCENARIOS,
  type AnonymizedAuditRecord,
  type ChromeAICapability,
  type DemoScenario,
} from "@veilai/hybrid-core";
import { VeilLogo } from "./VeilLogo";

interface LeftSidebarProps {
  activeScenarioId: string | null;
  onSelectScenario: (scenario: DemoScenario) => void;
  onNewCustomDoc: () => void;
  auditRecords: Array<AnonymizedAuditRecord & { hasPendingWrites: boolean }>;
  onOpenHistory: () => void;
  capability: ChromeAICapability;
  isWarmingUp: boolean;
  downloadProgress: number | null;
  onWarmupNano: () => void;
  effectiveOnline: boolean;
  user: User | null;
  authBusy: boolean;
  onGuestLogin: () => void;
  onGoogleLogin: () => void;
  onSignOut: () => void;
}

const SCENARIO_ICONS: Record<string, typeof FileText> = {
  "saas-nda": FileText,
  "medical-lab": ImageIcon,
  "payslip-tax": Receipt,
  "github-pr": Code2,
};

export function LeftSidebar({
  activeScenarioId,
  onSelectScenario,
  onNewCustomDoc,
  auditRecords,
  onOpenHistory,
  capability,
  isWarmingUp,
  downloadProgress,
  onWarmupNano,
  effectiveOnline,
  user,
  authBusy,
  onGuestLogin,
  onGoogleLogin,
  onSignOut,
}: LeftSidebarProps) {
  return (
    <aside className="flex w-full shrink-0 flex-col border-b border-white/[0.06] bg-[#161618] lg:h-screen lg:w-[232px] lg:border-r lg:border-b-0">
      {/* Brand */}
      <div className="flex h-14 items-center justify-between px-4">
        <div className="flex items-center gap-2.5">
          <VeilLogo size={24} />
          <span className="text-[14.5px] font-semibold tracking-[-0.02em] text-[#F4F3EF]">
            VeilAI
          </span>
        </div>

        <button
          type="button"
          onClick={onNewCustomDoc}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[#9A9AA0] transition hover:bg-white/[0.06] hover:text-[#F4F3EF]"
          title="New blank document"
          aria-label="New blank document"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* Clean Workspace Navigation */}
      <div className="flex-1 space-y-6 overflow-y-auto px-3 py-2">
        <div>
          <div className="mb-2 px-2 text-[11px] font-medium text-[#75757C]">
            Workspace
          </div>
          <nav className="space-y-0.5" aria-label="Documents">
            {DEMO_SCENARIOS.map((scenario) => {
              const Icon = SCENARIO_ICONS[scenario.id] ?? FileText;
              const active = activeScenarioId === scenario.id;
              return (
                <button
                  key={scenario.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onSelectScenario(scenario)}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition ${
                    active
                      ? "bg-white/[0.08] font-medium text-[#F4F3EF]"
                      : "text-[#A0A0A8] hover:bg-white/[0.04] hover:text-[#EAE9E5]"
                  }`}
                >
                  <Icon
                    className={`h-4 w-4 shrink-0 ${
                      active ? "text-[#EAE9E5]" : "text-[#6D6D75]"
                    }`}
                  />
                  <span className="truncate">{scenario.shortLabel}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Recent Synced Reviews */}
        <div>
          <div className="mb-2 flex items-center justify-between px-2">
            <span className="text-[11px] font-medium text-[#75757C]">
              Recent reviews
            </span>
            {auditRecords.length > 0 && (
              <button
                type="button"
                onClick={onOpenHistory}
                className="text-[11px] text-[#8E8E96] transition hover:text-[#F4F3EF]"
              >
                View all
              </button>
            )}
          </div>

          {auditRecords.length === 0 ? (
            <button
              type="button"
              onClick={onOpenHistory}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12px] text-[#75757C] transition hover:bg-white/[0.03] hover:text-[#A0A0A8]"
            >
              <History className="h-3.5 w-3.5 shrink-0" />
              <span>No saved reviews yet</span>
            </button>
          ) : (
            <div className="space-y-0.5">
              {auditRecords.slice(0, 4).map((rec) => (
                <button
                  key={rec.id}
                  type="button"
                  onClick={onOpenHistory}
                  className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left transition hover:bg-white/[0.04]"
                >
                  <span className="truncate text-[12.5px] text-[#B8B8C0]">
                    {rec.title}
                  </span>
                  <span className="shrink-0 font-mono text-[11px] text-[#75757C]">
                    {rec.riskScore}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quiet Footer: Local Protection + Account */}
      <div className="space-y-2.5 border-t border-white/[0.06] p-3.5">
        {!effectiveOnline && (
          <div className="flex items-center gap-2 rounded-md bg-amber-500/10 px-2.5 py-1.5 text-[11.5px] text-amber-200">
            <WifiOff className="h-3.5 w-3.5 shrink-0" />
            <span>Working offline</span>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 px-1 text-[11.5px] text-[#8E8E96]">
          <span className="flex items-center gap-2 truncate">
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${
                capability.status === "available"
                  ? "bg-emerald-400"
                  : "bg-amber-400"
              }`}
            />
            <span className="truncate">
              {capability.status === "available"
                ? "On-device AI active"
                : isWarmingUp
                  ? `Setting up${downloadProgress !== null ? ` (${Math.round(downloadProgress * 100)}%)` : "..."}`
                  : "Local shield active"}
            </span>
          </span>

          {capability.status !== "available" && !isWarmingUp && (
            <button
              type="button"
              onClick={onWarmupNano}
              className="inline-flex shrink-0 items-center gap-1 rounded bg-white/[0.07] px-1.5 py-0.5 text-[10.5px] text-[#EAE9E5] hover:bg-white/[0.12]"
              title="Enable on-device Gemini Nano 4"
            >
              <Download className="h-2.5 w-2.5" />
              <span>Enable</span>
            </button>
          )}
          {isWarmingUp && <Loader2 className="h-3 w-3 shrink-0 animate-spin" />}
        </div>

        {user ? (
          <div className="flex items-center justify-between rounded-lg px-2 py-1.5 text-[12px] text-[#D2D1CC] hover:bg-white/[0.04]">
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/[0.09] text-[11px] font-medium text-[#F4F3EF]">
                {user.isAnonymous ? "G" : (user.displayName?.[0] || "U").toUpperCase()}
              </div>
              <span className="truncate">
                {user.isAnonymous ? "Guest workspace" : user.displayName || user.email}
              </span>
            </div>
            <button
              type="button"
              onClick={onSignOut}
              className="rounded p-1 text-[#75757C] transition hover:text-[#F4F3EF]"
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onGuestLogin}
              disabled={authBusy}
              className="flex-1 rounded-lg bg-white/[0.09] px-2.5 py-1.5 text-[12px] font-medium text-[#F4F3EF] transition hover:bg-white/[0.14] disabled:opacity-50"
            >
              Guest mode
            </button>
            <button
              type="button"
              onClick={onGoogleLogin}
              disabled={authBusy}
              className="rounded-lg px-2.5 py-1.5 text-[12px] text-[#9A9AA0] transition hover:bg-white/[0.05] hover:text-[#F4F3EF] disabled:opacity-50"
            >
              Sign in
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
