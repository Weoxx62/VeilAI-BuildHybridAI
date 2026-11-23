import { useEffect, useState, type DragEvent, type ReactNode } from "react";
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  Lock,
  ShieldCheck,
  SlidersHorizontal,
  Upload,
} from "lucide-react";
import type {
  ComplianceProfileId,
  DocumentDomain,
  EntityCategory,
  RedactionResult,
  RemotePolicyConfig,
  VaultEntity,
} from "@veilai/hybrid-core";

interface DocumentWorkbenchProps {
  docTitle: string;
  docDomain: DocumentDomain;
  policy: RemotePolicyConfig;
  activeProfile: ComplianceProfileId;
  onSelectProfile: (profile: ComplianceProfileId) => void;
  inputModality: "text" | "image";
  onChangeModality: (modality: "text" | "image") => void;
  rawText: string;
  onChangeRawText: (text: string) => void;
  imagePreviewUrl: string | null;
  imageFileName: string | null;
  isSampleLabImage: boolean;
  onSelectImageFile: (file: File) => void;
  onDropTextFile: (fileName: string, content: string) => void;
  onGenerateSampleLabImage: () => void;
  redaction: RedactionResult | null;
  onToggleEntity: (token: string) => void;
  onOpenPrivacyInspector: () => void;
}

const TOKEN_REGEX = /(\[[A-Z_]+_\d+\])/g;
const PROFILE_ORDER: ComplianceProfileId[] = [
  "GDPR_EU",
  "HIPAA_MEDICAL",
  "DEVSECOPS_CODE",
  "FINANCIAL_TAX",
];

function renderAnonymizedTokens(text: string): ReactNode {
  const parts = text.split(TOKEN_REGEX);
  return parts.map((part, idx) => {
    if (/^\[[A-Z_]+_\d+\]$/.test(part)) {
      return (
        <span
          key={idx}
          className="mx-0.5 inline-block rounded bg-white/[0.09] px-1.5 py-0.5 font-mono text-[12px] font-medium text-[#D6D3CD]"
        >
          {part}
        </span>
      );
    }
    return <span key={idx}>{part}</span>;
  });
}

function subtleHighlightClass(category: EntityCategory, enabled: boolean): string {
  if (!enabled) {
    return "border-b border-dashed border-white/25 text-[#8E8E96] line-through hover:text-[#EAE9E5]";
  }
  switch (category) {
    case "API_KEY":
    case "AWS_KEY":
    case "JWT":
    case "PRIVATE_KEY":
    case "DB_URI":
    case "PASSWORD":
      return "rounded-[4px] bg-rose-400/[0.14] px-1 py-0.5 text-[#FDE2E4] underline decoration-rose-400/40 decoration-dotted underline-offset-4 hover:bg-rose-400/[0.22]";
    case "IBAN":
    case "SALARY":
    case "TAX_ID":
    case "ACCOUNT_NUMBER":
    case "SSN":
      return "rounded-[4px] bg-amber-300/[0.13] px-1 py-0.5 text-[#FEF3C7] underline decoration-amber-300/40 decoration-dotted underline-offset-4 hover:bg-amber-300/[0.22]";
    default:
      return "rounded-[4px] bg-emerald-400/[0.12] px-1 py-0.5 text-[#D1FAE5] underline decoration-emerald-400/40 decoration-dotted underline-offset-4 hover:bg-emerald-400/[0.2]";
  }
}

function renderReadableProtectedDocument(
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
            ? `Protected locally — sent as ${entity.token}. Click to include original.`
            : `Not protected — click to shield as ${entity.token}.`
        }
      >
        {seg.text}
      </button>
    );
  });
}

export function DocumentWorkbench({
  docTitle,
  docDomain,
  policy,
  activeProfile,
  onSelectProfile,
  inputModality,
  onChangeModality,
  rawText,
  onChangeRawText,
  imagePreviewUrl,
  imageFileName,
  isSampleLabImage,
  onSelectImageFile,
  onDropTextFile,
  onGenerateSampleLabImage,
  redaction,
  onToggleEntity,
  onOpenPrivacyInspector,
}: DocumentWorkbenchProps) {
  const [viewMode, setViewMode] = useState<"document" | "anonymized" | "edit">(
    "document",
  );
  const [imageMaskPreview, setImageMaskPreview] = useState(true);
  const [copiedAnon, setCopiedAnon] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  // Keep view mode natural when switching to an image or creating a new blank document
  useEffect(() => {
    if (inputModality === "image" && viewMode === "edit") {
      setViewMode("document");
    }
  }, [inputModality, viewMode]);

  useEffect(() => {
    if (inputModality === "text" && rawText === "" && docTitle === "Untitled Document") {
      setViewMode("edit");
    }
  }, [inputModality, rawText, docTitle]);

  const enabledCount = redaction?.entities.filter((e) => e.enabled).length ?? 0;
  const isCodeDoc = docDomain === "code";

  const handleCopyAnonymized = async () => {
    if (!redaction) return;
    await navigator.clipboard.writeText(redaction.scrubbedText);
    setCopiedAnon(true);
    setTimeout(() => setCopiedAnon(false), 1600);
  };

  const handleDragOver = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    if (!isDraggingFile) setIsDraggingFile(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      setIsDraggingFile(false);
    }
  };

  const handleDrop = async (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    setIsDraggingFile(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (file.type === "image/png" || file.type === "image/jpeg") {
      onSelectImageFile(file);
      setViewMode("document");
      return;
    }
    if (
      file.type.startsWith("text/") ||
      /\.(txt|md|json|csv|eml|ts|tsx|js|jsx|py|go|rs|java|yml|yaml|env|log)$/i.test(
        file.name,
      )
    ) {
      const content = await file.text();
      onDropTextFile(file.name, content);
      setViewMode("document");
    }
  };

  return (
    <main
      className="relative flex min-w-0 flex-1 flex-col bg-[#1C1C1F] lg:h-screen"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={(e) => void handleDrop(e)}
    >
      {isDraggingFile && (
        <div className="pointer-events-none absolute inset-4 z-30 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-emerald-400/50 bg-[#161618]/90 backdrop-blur-xs">
          <Upload className="h-7 w-7 text-emerald-400" />
          <p className="mt-2.5 text-[14px] font-medium text-[#F4F3EF]">
            Drop document or medical photo to protect locally
          </p>
          <p className="mt-1 text-[12px] text-[#8E8E96]">
            PNG, JPEG, TXT, Markdown, or source code — stays on your device
          </p>
        </div>
      )}
      {/* Calm, Uncluttered Top Header */}
      <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-white/[0.06] px-6">
        <div className="flex min-w-0 items-center gap-3">
          {/* Clean 3-tab document view switcher */}
          <div className="inline-flex rounded-lg bg-white/[0.05] p-0.5 text-[12px]">
            <button
              type="button"
              aria-pressed={viewMode === "document"}
              onClick={() => setViewMode("document")}
              className={`rounded-md px-2.5 py-1 font-medium transition ${
                viewMode === "document"
                  ? "bg-[#2C2C31] text-[#F4F3EF]"
                  : "text-[#9A9AA0] hover:text-[#EAE9E5]"
              }`}
            >
              Document
            </button>
            <button
              type="button"
              aria-pressed={viewMode === "anonymized"}
              onClick={() => setViewMode("anonymized")}
              className={`rounded-md px-2.5 py-1 font-medium transition ${
                viewMode === "anonymized"
                  ? "bg-[#2C2C31] text-[#F4F3EF]"
                  : "text-[#9A9AA0] hover:text-[#EAE9E5]"
              }`}
            >
              Anonymized view
            </button>
            {inputModality === "text" && (
              <button
                type="button"
                aria-pressed={viewMode === "edit"}
                onClick={() => setViewMode("edit")}
                className={`rounded-md px-2.5 py-1 font-medium transition ${
                  viewMode === "edit"
                    ? "bg-[#2C2C31] text-[#F4F3EF]"
                    : "text-[#9A9AA0] hover:text-[#EAE9E5]"
                }`}
              >
                Edit
              </button>
            )}
          </div>

          {/* Quiet Compliance Policy Selector */}
          <label className="sr-only" htmlFor="veilai-policy-select">
            Compliance framework
          </label>
          <select
            id="veilai-policy-select"
            name="compliancePolicy"
            value={activeProfile}
            onChange={(e) => onSelectProfile(e.target.value as ComplianceProfileId)}
            className="hidden h-8 rounded-lg border border-white/[0.08] bg-transparent px-2.5 text-[12px] text-[#C8C7C2] transition hover:border-white/[0.16] hover:text-[#F4F3EF] focus:border-white/[0.25] focus:outline-none sm:block"
          >
            {PROFILE_ORDER.map((id) => (
              <option key={id} value={id} className="bg-[#1C1C1F] text-[#EAE9E5]">
                {policy.profiles[id].label}
              </option>
            ))}
          </select>
        </div>

        {/* Single Quiet Trust Pill -> Opens Full Judge / Compliance Privacy Inspector */}
        <button
          type="button"
          onClick={onOpenPrivacyInspector}
          className="inline-flex h-8 shrink-0 items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 text-[12px] text-[#D2D1CC] transition hover:border-white/[0.16] hover:bg-white/[0.06] hover:text-[#F4F3EF]"
          title="Open Privacy & Hybrid AI Inspector (wire proof, SDK traces, benchmark, Remote Config, offline mode)"
        >
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
          <span className="hidden sm:inline">0 bytes leaked</span>
          <span className="h-3 w-px bg-white/[0.1]" />
          <SlidersHorizontal className="h-3 w-3 text-[#9A9AA0]" />
          <span>Inspect</span>
        </button>
      </header>

      {/* Spacious Centered Document Sheet (Feels like Harvey.ai / Notion / Claude) */}
      <div className="flex-1 overflow-y-auto px-6 py-8 sm:px-10">
        <div className="mx-auto max-w-[740px]">
          {/* Document Title & Subtle Subtitle */}
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-[20px] font-semibold tracking-[-0.02em] text-[#F4F3EF]">
                {docTitle}
              </h1>
              <p className="mt-1 text-[13px] text-[#8E8E96]">
                {viewMode === "anonymized"
                  ? "Exact anonymized draft prepared for external review — zero personal identifiers included."
                  : inputModality === "image"
                    ? "Scanned locally on your device. Personal identifiers are hidden before review."
                    : `${enabledCount} private details highlighted and shielded locally. Click any highlight to adjust.`}
              </p>
            </div>

            {viewMode === "anonymized" && redaction && (
              <button
                type="button"
                onClick={handleCopyAnonymized}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-1.5 text-[12px] font-medium text-[#EAE9E5] transition hover:bg-white/[0.08]"
              >
                {copiedAnon ? (
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                <span>{copiedAnon ? "Copied" : "Copy anonymized text"}</span>
              </button>
            )}

            {viewMode === "document" && inputModality === "image" && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setImageMaskPreview((v) => !v)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-1.5 text-[12px] font-medium text-[#EAE9E5] transition hover:bg-white/[0.08]"
                >
                  {imageMaskPreview ? (
                    <Eye className="h-3.5 w-3.5" />
                  ) : (
                    <EyeOff className="h-3.5 w-3.5" />
                  )}
                  <span>{imageMaskPreview ? "Show original" : "Hide patient info"}</span>
                </button>
              </div>
            )}
          </div>

          {/* Document Body Surface */}
          {inputModality === "image" && viewMode === "document" ? (
            <div className="space-y-4">
              {imagePreviewUrl && (
                <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#222226] p-4">
                  <div className="relative">
                    <img
                      src={imagePreviewUrl}
                      alt="Confidential document kept on your device"
                      className="mx-auto max-h-[540px] w-auto rounded-lg object-contain"
                    />
                    {imageMaskPreview && (
                      <div
                        className="pointer-events-none absolute inset-x-0 flex items-center justify-center"
                        style={{
                          top: isSampleLabImage ? "14%" : "10%",
                          height: isSampleLabImage ? "19%" : "22%",
                        }}
                      >
                        <div className="mx-auto flex h-full w-[72%] items-center justify-center rounded-md bg-[#161618]/95 shadow-lg ring-1 ring-emerald-400/35">
                          <span className="inline-flex items-center gap-2 text-[12px] font-medium text-emerald-200">
                            <Lock className="h-3.5 w-3.5" />
                            Patient details hidden locally
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-white/[0.12] bg-[#18181B] px-4 py-3 text-[12.5px] text-[#9A9AA0]">
                <label className="inline-flex cursor-pointer items-center gap-2 hover:text-[#F4F3EF]">
                  <Upload className="h-4 w-4" />
                  <span>
                    {imageFileName ? `Replace file (${imageFileName})` : "Upload PNG or JPEG document"}
                  </span>
                  <input
                    id="veilai-image-upload"
                    name="documentImage"
                    type="file"
                    accept="image/png,image/jpeg"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) onSelectImageFile(f);
                    }}
                  />
                </label>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={onGenerateSampleLabImage}
                    className="text-[#C8C7C2] underline-offset-4 hover:text-white hover:underline"
                  >
                    Use sample lab report
                  </button>
                  <button
                    type="button"
                    onClick={() => onChangeModality("text")}
                    className="text-[#9A9AA0] hover:text-white"
                  >
                    Switch to text
                  </button>
                </div>
              </div>
            </div>
          ) : viewMode === "edit" ? (
            <div className="rounded-xl border border-white/[0.08] bg-[#222226] p-5">
              <textarea
                id="veilai-source-document"
                name="sourceDocument"
                aria-label="Confidential source document input"
                value={rawText}
                onChange={(e) => onChangeRawText(e.target.value)}
                rows={18}
                placeholder="Paste a contract, medical report, payslip, or source code here..."
                className={`w-full resize-none bg-transparent leading-[1.85] text-[#EAE9E5] placeholder-[#6D6D75] focus:outline-none ${
                  isCodeDoc ? "font-mono text-[13px]" : "text-[14.5px]"
                }`}
              />
            </div>
          ) : viewMode === "anonymized" ? (
            <div className="rounded-xl border border-white/[0.08] bg-[#18181B] p-7">
              <div
                className={`whitespace-pre-wrap leading-[1.85] text-[#D2D1CC] ${
                  isCodeDoc ? "font-mono text-[13px]" : "text-[14.5px]"
                }`}
              >
                {redaction
                  ? renderAnonymizedTokens(redaction.scrubbedText)
                  : rawText}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-white/[0.07] bg-[#222226] p-7">
              <div
                className={`whitespace-pre-wrap leading-[1.85] text-[#EAE9E5] ${
                  isCodeDoc ? "font-mono text-[13px]" : "text-[14.5px]"
                }`}
              >
                {redaction && redaction.entities.length > 0
                  ? renderReadableProtectedDocument(
                      redaction.extractedText,
                      redaction.entities,
                      onToggleEntity,
                    )
                  : rawText || (
                      <span className="text-[#75757C]">
                        Switch to Edit to paste a document, or choose one from the workspace.
                      </span>
                    )}
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
