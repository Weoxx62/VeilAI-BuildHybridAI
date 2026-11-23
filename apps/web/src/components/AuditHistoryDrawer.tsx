import { useEffect } from "react";
import {
  ArrowUpRight,
  CheckCircle2,
  Clock,
  CloudOff,
  Globe,
  History,
  Puzzle,
  Trash2,
  X,
} from "lucide-react";
import type { AnonymizedAuditRecord } from "@veilai/hybrid-core";

interface AuditHistoryDrawerProps {
  open: boolean;
  onClose: () => void;
  records: Array<AnonymizedAuditRecord & { hasPendingWrites: boolean }>;
  onRestoreRecord: (record: AnonymizedAuditRecord) => void;
  onDelete: (auditId: string) => void;
  isSignedIn: boolean;
  firebaseConfigured: boolean;
}

export function AuditHistoryDrawer({
  open,
  onClose,
  records,
  onRestoreRecord,
  onDelete,
  isSignedIn,
  firebaseConfigured,
}: AuditHistoryDrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/55 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-md flex-col border-l border-white/[0.08] bg-[#161618] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/[0.07] px-6 py-4">
          <div>
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-[#EAE9E5]" />
              <h2 className="text-[14px] font-semibold text-[#F4F3EF]">
                Saved Reviews
              </h2>
            </div>
            <p className="mt-0.5 text-[12px] text-[#8E8E96]">
              Synced across Web &amp; Chrome Extension · Anonymized tokens only
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-[#8E8E96] transition hover:bg-white/[0.06] hover:text-white"
            aria-label="Close saved reviews"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {!firebaseConfigured ? (
            <div className="rounded-xl border border-white/[0.07] bg-[#1E1E22] p-4 text-[12.5px] leading-relaxed text-[#A0A0A8]">
              Connect Firebase in <code className="font-mono text-[#EAE9E5]">apps/web/.env.local</code> to sync anonymized reviews across devices.
            </div>
          ) : !isSignedIn ? (
            <div className="rounded-xl border border-white/[0.07] bg-[#1E1E22] p-4 text-[12.5px] leading-relaxed text-[#A0A0A8]">
              Use <strong>Guest mode</strong> or <strong>Sign in</strong> in the bottom-left corner to save and sync anonymized reviews across Web and Chrome Extension.
            </div>
          ) : records.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/[0.1] p-8 text-center text-[12.5px] text-[#8E8E96]">
              No saved reviews yet. Click <strong>Review document</strong> to create your first synced entry.
            </div>
          ) : (
            <div className="space-y-3">
              {records.map((rec) => (
                <div
                  key={rec.id}
                  className="rounded-xl border border-white/[0.07] bg-[#1E1E22] p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10px]">
                        <span className="inline-flex items-center gap-1 rounded bg-white/[0.06] px-1.5 py-0.5 text-[#D2D1CC]">
                          {rec.surface === "extension" ? (
                            <Puzzle className="h-2.5 w-2.5" />
                          ) : (
                            <Globe className="h-2.5 w-2.5" />
                          )}
                          {rec.surface.toUpperCase()}
                        </span>
                        <span className="rounded bg-white/[0.05] px-1.5 py-0.5 text-[#8E8E96]">
                          {rec.complianceProfile}
                        </span>
                        {rec.hasPendingWrites ? (
                          <span className="inline-flex items-center gap-1 text-amber-300">
                            <CloudOff className="h-2.5 w-2.5" />
                            OFFLINE
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-emerald-400">
                            <CheckCircle2 className="h-2.5 w-2.5" />
                            SYNCED
                          </span>
                        )}
                      </div>
                      <h3 className="mt-2 truncate text-[13.5px] font-semibold text-[#F4F3EF]">
                        {rec.title}
                      </h3>
                    </div>

                    <button
                      type="button"
                      onClick={() => onDelete(rec.id)}
                      className="rounded p-1 text-[#75757C] transition hover:bg-rose-500/15 hover:text-rose-300"
                      title="Delete review"
                      aria-label="Delete review"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <p className="mt-1.5 line-clamp-2 text-[12.5px] leading-relaxed text-[#B8B8C0]">
                    {rec.summary}
                  </p>

                  <div className="mt-3 rounded-lg border border-white/[0.06] bg-[#161618] p-2.5 font-mono text-[10.5px]">
                    <div className="mb-1 text-[9.5px] uppercase tracking-wider text-emerald-400">
                      Stored in Firestore (tokens only · 0 raw PII)
                    </div>
                    <p className="line-clamp-2 text-[#8E8E96]">{rec.scrubbedPreview}</p>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-[#75757C]">
                    <span className="font-mono">
                      Risk <strong className="text-[#EAE9E5]">{rec.riskScore}/100</strong> ·{" "}
                      {rec.totalEntitiesRedacted} shielded
                    </span>
                    <div className="flex items-center gap-2.5">
                      <span className="inline-flex items-center gap-1 font-mono text-[10.5px]">
                        <Clock className="h-3 w-3" />
                        {new Date(rec.createdAt).toLocaleTimeString()}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          onRestoreRecord(rec);
                          onClose();
                        }}
                        className="inline-flex items-center gap-1 rounded-md bg-white/[0.07] px-2 py-1 text-[11px] font-medium text-[#EAE9E5] transition hover:bg-white/[0.13]"
                      >
                        <span>Open</span>
                        <ArrowUpRight className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
