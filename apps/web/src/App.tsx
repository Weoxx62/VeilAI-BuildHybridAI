import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { AlertCircle } from "lucide-react";
import {
  accumulateTelemetry,
  addCustomVaultTerm,
  applyVaultRedaction,
  askDocumentHybrid,
  buildVaultAndScrub,
  buildZeroLeakCertificate,
  checkChromeAICapability,
  createInitialTelemetry,
  DEFAULT_REMOTE_POLICY,
  deleteAnonymizedAudit,
  DEMO_SCENARIOS,
  fileToInlineImagePart,
  loadRemotePolicy,
  runDeterministicRegexGuard,
  runLocalOnlyBenchmark,
  runLocalQuickTriage,
  runStage1LocalShield,
  runStage2CloudAudit,
  saveAnonymizedAudit,
  signInAsGuest,
  signInWithGoogle,
  signOutUser,
  streamLocalRewrite,
  subscribeAnonymizedAudits,
  subscribeAuthState,
  toAnonymizedAuditRecord,
  verifyZeroLeak,
  warmupOnDeviceModel,
  type AnonymizedAuditRecord,
  type AuditReport,
  type ChromeAICapability,
  type CloudEscalationMode,
  type ComplianceProfileId,
  type DemoScenario,
  type DocumentDomain,
  type DocumentQaMessage,
  type EntityCategory,
  type LocalTriageResult,
  type LocalVsHybridBenchmark,
  type PipelineStageTrace,
  type RedactionResult,
  type RemotePolicyConfig,
  type SplitBrainRunResult,
} from "@veilai/hybrid-core";
import { getWebFirebaseServices } from "./firebaseEnv";
import { LeftSidebar } from "./components/LeftSidebar";
import { DocumentWorkbench } from "./components/DocumentWorkbench";
import { InspectorPanel } from "./components/InspectorPanel";
import { AuditHistoryDrawer } from "./components/AuditHistoryDrawer";
import { PrivacyInspectorDrawer } from "./components/PrivacyInspectorDrawer";
import { generateSampleMedicalLabPng } from "./utils/sampleLabImage";
import { extractTextFromPdfLocally } from "./utils/localPdfParser";

function inferDomainAndProfile(
  fileName: string,
  text: string,
  fallbackProfile: ComplianceProfileId,
): { domain: DocumentDomain; profile: ComplianceProfileId } {
  const sample = `${fileName}\n${text.slice(0, 1500)}`.toLowerCase();
  if (/\.(ts|tsx|js|jsx|py|go|rs|java|yml|yaml|json|env)$/i.test(fileName)) {
    return { domain: "code", profile: "DEVSECOPS_CODE" };
  }
  if (/(patient|hemoglobin|hba1c|cholesterol|lab report|physician|mrn-|hipaa|blood panel)/i.test(sample)) {
    return { domain: "medical", profile: "HIPAA_MEDICAL" };
  }
  if (/(payslip|salary|withholding|tax id|w-2|1099|rsu|invoice|fiscal|compensation)/i.test(sample)) {
    return { domain: "financial", profile: "FINANCIAL_TAX" };
  }
  if (/(agreement|confidential|non-compete|employment|nda|intellectual property|jurisdiction|clause)/i.test(sample)) {
    return { domain: "legal", profile: "GDPR_EU" };
  }
  return { domain: "general", profile: fallbackProfile };
}

function defaultCustomCategoryForDomain(domain: DocumentDomain): EntityCategory {
  switch (domain) {
    case "code":
      return "PASSWORD";
    case "medical":
      return "MEDICAL_ID";
    case "financial":
      return "ACCOUNT_NUMBER";
    default:
      return "COMPANY";
  }
}

function buildInstantLocalPreview(
  text: string,
  profile: ComplianceProfileId,
  policy: RemotePolicyConfig,
): RedactionResult {
  const startedAt = performance.now();
  const allowed = policy.profiles[profile].categories;
  const regexHits = runDeterministicRegexGuard(text, profile, allowed);

  const semanticHits: Array<{
    category: "PERSON" | "COMPANY";
    original: string;
    source: "regex-guard";
    confidence: number;
  }> = [];

  const labeledNameRegex =
    /(?:Patient Name|Ordering Physician|Prepared for|Author|represented by|and)\s*[:\-]?\s*((?:Dr\.\s+)?[A-Z][a-z]+(?:\s+[A-Z]['a-zA-Z]+){1,2})/g;
  let m: RegExpExecArray | null;
  while ((m = labeledNameRegex.exec(text)) !== null) {
    const candidate = m[1].trim();
    if (
      candidate.length >= 5 &&
      !/^(Agreement|Section|Company|Employee|Annual|Clinical)$/i.test(candidate)
    ) {
      semanticHits.push({
        category: "PERSON",
        original: candidate,
        source: "regex-guard",
        confidence: 0.86,
      });
    }
  }
  const companyRegex =
    /\b([A-Z][A-Za-z0-9]+(?:\s+[A-Z][A-Za-z0-9]+){1,3}\s+(?:SAS|LLC|Inc\.?|Ltd\.?|GmbH|Corp\.?|Laboratory))\b/g;
  while ((m = companyRegex.exec(text)) !== null) {
    semanticHits.push({
      category: "COMPANY",
      original: m[1].trim(),
      source: "regex-guard",
      confidence: 0.88,
    });
  }

  const vault = buildVaultAndScrub(text, [], [...regexHits, ...semanticHits]);
  const latencyMs = Math.max(1, Math.round(performance.now() - startedAt));

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
      latencyMs,
      bytesSentToCloud: 0,
      piiLeakedBytes: 0,
      timestamp: Date.now(),
    },
  };
}

export function App() {
  const services = useMemo(() => getWebFirebaseServices(), []);

  // Auth & Drawers
  const [user, setUser] = useState<User | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [privacyDrawerOpen, setPrivacyDrawerOpen] = useState(false);
  const [auditRecords, setAuditRecords] = useState<
    Array<AnonymizedAuditRecord & { hasPendingWrites: boolean }>
  >([]);

  // Runtime Capabilities
  const [capability, setCapability] = useState<ChromeAICapability>({
    supported: false,
    multimodalSupported: false,
    status: "unavailable",
    downloadProgress: null,
    browserHint: "Checking Chrome Built-in AI (Gemini Nano 4)...",
  });
  const [isWarmingUp, setIsWarmingUp] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const [simulateOffline, setSimulateOffline] = useState(false);
  const effectiveOnline = isOnline && !simulateOffline;

  // Remote Config & Policy
  const [policy, setPolicy] = useState<RemotePolicyConfig>(DEFAULT_REMOTE_POLICY);
  const [activeProfile, setActiveProfile] = useState<ComplianceProfileId>("GDPR_EU");
  const [isSyncingRc, setIsSyncingRc] = useState(false);

  // Active Document
  const initialScenario = DEMO_SCENARIOS[0];
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(
    initialScenario.id,
  );
  const [docTitle, setDocTitle] = useState(initialScenario.title);
  const [docDomain, setDocDomain] = useState<DocumentDomain>(initialScenario.domain);
  const [inputModality, setInputModality] = useState<"text" | "image">("text");
  const [rawText, setRawText] = useState(initialScenario.content);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [isSampleLabImage, setIsSampleLabImage] = useState(false);
  const [isParsingPdf, setIsParsingPdf] = useState(false);
  const [pdfMeta, setPdfMeta] = useState<{ pageCount: number; truncated: boolean } | null>(
    null,
  );
  const [highlightedClauseRef, setHighlightedClauseRef] = useState<string | null>(null);

  // Pipeline State
  const [redaction, setRedaction] = useState<RedactionResult | null>(() =>
    buildInstantLocalPreview(
      initialScenario.content,
      initialScenario.recommendedProfile,
      DEFAULT_REMOTE_POLICY,
    ),
  );
  const [wirePayload, setWirePayload] = useState("");
  const [cloudReportAnonymized, setCloudReportAnonymized] =
    useState<AuditReport | null>(null);
  const [rehydratedReport, setRehydratedReport] = useState<AuditReport | null>(null);
  const [localTriage, setLocalTriage] = useState<LocalTriageResult | null>(null);
  const [benchmark, setBenchmark] = useState<LocalVsHybridBenchmark | null>(null);
  const [traces, setTraces] = useState<PipelineStageTrace[]>([]);
  const [qaMessages, setQaMessages] = useState<DocumentQaMessage[]>([]);
  const [qaStreamingAnswer, setQaStreamingAnswer] = useState("");
  const [isAskingQa, setIsAskingQa] = useState(false);
  const [offlineQueued, setOfflineQueued] = useState(false);
  const [telemetry, setTelemetry] = useState(() => createInitialTelemetry());
  const [leakTestResult, setLeakTestResult] = useState<{
    triggered: boolean;
    blockedToken: string;
    blockedSample: string;
    leakedBytes: number;
  } | null>(null);

  // Loading & Race-Guard
  const [isRunningShield, setIsRunningShield] = useState(false);
  const [shieldElapsedSec, setShieldElapsedSec] = useState(0);
  const [isRunningCloud, setIsRunningCloud] = useState(false);
  const [isRunningTriage, setIsRunningTriage] = useState(false);
  const [isRunningBenchmark, setIsRunningBenchmark] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const previewUrlRef = useRef<string | null>(null);
  const runIdRef = useRef(0);

  useEffect(() => {
    if (!isRunningShield) {
      setShieldElapsedSec(0);
      return;
    }
    const start = performance.now();
    const timer = window.setInterval(() => {
      setShieldElapsedSec((performance.now() - start) / 1000);
    }, 100);
    return () => window.clearInterval(timer);
  }, [isRunningShield]);

  useEffect(() => {
    void checkChromeAICapability().then(setCapability);
  }, []);

  useEffect(() => {
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
  }, [services]);

  useEffect(() => {
    if (!services.isConfigured) return;
    return subscribeAuthState(services.auth, setUser);
  }, [services]);

  useEffect(() => {
    if (!services.isConfigured || !user) {
      setAuditRecords([]);
      return;
    }
    return subscribeAnonymizedAudits(
      services.db,
      user.uid,
      setAuditRecords,
      (err) => setErrorBanner(`Firestore sync notice: ${err.message}`),
    );
  }, [services, user]);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  const setManagedPreviewUrl = (nextUrl: string | null) => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = nextUrl;
    setImagePreviewUrl(nextUrl);
  };

  const resetAnalysisState = () => {
    setWirePayload("");
    setCloudReportAnonymized(null);
    setRehydratedReport(null);
    setLocalTriage(null);
    setBenchmark(null);
    setTraces([]);
    setQaMessages([]);
    setQaStreamingAnswer("");
    setHighlightedClauseRef(null);
    setOfflineQueued(false);
    setLeakTestResult(null);
    setErrorBanner(null);
  };

  const handleWarmupNano = async () => {
    setErrorBanner(null);
    setIsWarmingUp(true);
    try {
      await warmupOnDeviceModel(services.ai, setDownloadProgress);
      setCapability(await checkChromeAICapability());
    } catch (err) {
      setErrorBanner(
        err instanceof Error
          ? `On-device AI setup: ${err.message}`
          : "Unable to enable on-device AI in this browser.",
      );
    } finally {
      setIsWarmingUp(false);
    }
  };

  const handleSyncRemoteConfig = async () => {
    setIsSyncingRc(true);
    setErrorBanner(null);
    try {
      const updated = await loadRemotePolicy(services.remoteConfig, true);
      setPolicy(updated);
      setActiveProfile(updated.defaultComplianceProfile);
    } finally {
      setIsSyncingRc(false);
    }
  };

  const handleSelectProfile = (nextProfile: ComplianceProfileId) => {
    setActiveProfile(nextProfile);
    if (rawText.trim()) {
      setRedaction(buildInstantLocalPreview(rawText, nextProfile, policy));
    }
  };

  const handleSelectScenario = async (scenario: DemoScenario) => {
    runIdRef.current += 1;
    setIsRunningShield(false);
    setIsRunningCloud(false);
    setIsRunningTriage(false);
    setIsRunningBenchmark(false);
    resetAnalysisState();

    setActiveScenarioId(scenario.id);
    setDocTitle(scenario.title);
    setDocDomain(scenario.domain);
    setActiveProfile(scenario.recommendedProfile);
    setPdfMeta(null);
    setRawText(scenario.content);
    setRedaction(
      buildInstantLocalPreview(scenario.content, scenario.recommendedProfile, policy),
    );

    if (scenario.modality === "image") {
      setInputModality("image");
      try {
        const sample = await generateSampleMedicalLabPng();
        setImageFile(sample.file);
        setIsSampleLabImage(true);
        setManagedPreviewUrl(sample.previewUrl);
      } catch (err) {
        setErrorBanner(
          err instanceof Error ? err.message : "Could not generate sample lab PNG.",
        );
      }
    } else {
      setInputModality("text");
      setImageFile(null);
      setIsSampleLabImage(false);
      setManagedPreviewUrl(null);
    }
  };

  const handleNewCustomDoc = () => {
    runIdRef.current += 1;
    setIsRunningShield(false);
    setIsRunningCloud(false);
    resetAnalysisState();
    setActiveScenarioId(null);
    setDocTitle("Untitled Document");
    setDocDomain("general");
    setInputModality("text");
    setPdfMeta(null);
    setRawText("");
    setRedaction(null);
  };

  const handleChangeRawText = (text: string) => {
    setRawText(text);
    setActiveScenarioId(null);
    setHighlightedClauseRef(null);
    setRedaction(
      text.trim().length > 0
        ? buildInstantLocalPreview(text, activeProfile, policy)
        : null,
    );
  };

  const handleGenerateSampleLabImage = async () => {
    const sample = await generateSampleMedicalLabPng();
    setImageFile(sample.file);
    setIsSampleLabImage(true);
    setManagedPreviewUrl(sample.previewUrl);
    setInputModality("image");
    setPdfMeta(null);
    setDocTitle("Clinical Blood Panel & Metabolic Lab Report");
    setDocDomain("medical");
    setActiveProfile("HIPAA_MEDICAL");
  };

  const handleSelectImageFile = (file: File) => {
    resetAnalysisState();
    setImageFile(file);
    setIsSampleLabImage(false);
    setManagedPreviewUrl(URL.createObjectURL(file));
    setInputModality("image");
    setPdfMeta(null);
    setActiveScenarioId(null);
    setDocTitle(file.name);
  };

  const handleUploadPdfFile = async (file: File) => {
    runIdRef.current += 1;
    setIsRunningShield(false);
    setIsRunningCloud(false);
    resetAnalysisState();
    setIsParsingPdf(true);
    try {
      const parsed = await extractTextFromPdfLocally(file);
      const { domain, profile } = inferDomainAndProfile(
        file.name,
        parsed.text,
        activeProfile,
      );
      setActiveScenarioId(null);
      setInputModality("text");
      setImageFile(null);
      setIsSampleLabImage(false);
      setManagedPreviewUrl(null);
      setDocTitle(file.name.replace(/\.pdf$/i, ""));
      setDocDomain(domain);
      setActiveProfile(profile);
      setPdfMeta({ pageCount: parsed.pageCount, truncated: parsed.truncated });
      setRawText(parsed.text);
      setRedaction(buildInstantLocalPreview(parsed.text, profile, policy));
    } catch (err) {
      setErrorBanner(
        err instanceof Error
          ? err.message
          : "Could not read this PDF locally in the browser.",
      );
    } finally {
      setIsParsingPdf(false);
    }
  };

  const handleDropTextFile = (fileName: string, content: string) => {
    runIdRef.current += 1;
    setIsRunningShield(false);
    setIsRunningCloud(false);
    resetAnalysisState();
    setActiveScenarioId(null);
    setInputModality("text");
    setImageFile(null);
    setIsSampleLabImage(false);
    setManagedPreviewUrl(null);
    setPdfMeta(null);
    setDocTitle(fileName);

    const { domain, profile } = inferDomainAndProfile(fileName, content, activeProfile);
    setDocDomain(domain);
    setActiveProfile(profile);
    setRawText(content);
    setRedaction(
      content.trim()
        ? buildInstantLocalPreview(content, profile, policy)
        : null,
    );
  };

  const persistIfSignedIn = useCallback(
    async (run: SplitBrainRunResult) => {
      if (!services.isConfigured || !user) return;
      try {
        await saveAnonymizedAudit(
          services.db,
          user.uid,
          toAnonymizedAuditRecord(run, "web"),
        );
      } catch {
        // Offline writes queue cleanly in IndexedDB
      }
    },
    [services, user],
  );

  const executeStage1 = async (currentRunId: number): Promise<RedactionResult | null> => {
    setErrorBanner(null);
    setLeakTestResult(null);
    setIsRunningShield(true);
    try {
      const imagePart =
        inputModality === "image" && imageFile
          ? await fileToInlineImagePart(imageFile, imageFile.type)
          : undefined;

      const previousToggles = new Map<string, boolean>();
      if (redaction) {
        for (const e of redaction.entities) {
          previousToggles.set(e.original, e.enabled);
        }
      }

      const result = await runStage1LocalShield({
        ai: services.ai,
        text: rawText,
        imagePart,
        profile: activeProfile,
        policy,
        previousToggleMap: previousToggles,
        onPreliminaryRedaction: (prelim) => {
          if (runIdRef.current !== currentRunId) return;
          setRedaction(prelim);
          setTraces([prelim.trace]);
        },
      });

      if (runIdRef.current !== currentRunId) return null;

      setRedaction(result);
      if (inputModality === "image" && result.extractedText) {
        setRawText(result.extractedText);
      }
      setTraces([result.trace]);
      setTelemetry((prev) =>
        accumulateTelemetry(
          prev,
          [result.trace],
          result.entities.filter((e) => e.enabled).length,
          result.bytesShielded,
          inputModality === "image",
        ),
      );
      return result;
    } catch (err) {
      if (runIdRef.current === currentRunId) {
        setErrorBanner(
          err instanceof Error ? err.message : "Local redaction failed.",
        );
      }
      return null;
    } finally {
      if (runIdRef.current === currentRunId) setIsRunningShield(false);
    }
  };

  const executeStage2 = async (
    shieldResult: RedactionResult,
    currentRunId: number,
  ) => {
    if (!effectiveOnline) {
      setOfflineQueued(true);
      await persistIfSignedIn({
        id: `audit-${Date.now()}`,
        title: docTitle,
        domain: docDomain,
        complianceProfile: activeProfile,
        inputModality,
        redaction: shieldResult,
        wirePayload: shieldResult.scrubbedText,
        cloudReportAnonymized: null,
        rehydratedReport: null,
        localTriage,
        traces: [shieldResult.trace],
        offlineQueued: true,
        estimatedUsdSaved: 0.0042,
        createdAt: Date.now(),
      });
      return;
    }

    if (!services.isConfigured) {
      setErrorBanner(
        "Local protection complete. Connect Firebase in apps/web/.env.local to run cloud review.",
      );
      return;
    }

    setIsRunningCloud(true);
    setOfflineQueued(false);
    try {
      const stage2 = await runStage2CloudAudit({
        ai: services.ai,
        scrubbedText: shieldResult.scrubbedText,
        domain: docDomain,
        profile: activeProfile,
        policy,
        entities: shieldResult.entities,
      });

      if (runIdRef.current !== currentRunId) return;

      setWirePayload(stage2.wirePayload);
      setCloudReportAnonymized(stage2.cloudReportAnonymized);
      setRehydratedReport(stage2.rehydratedReport);

      const allTraces = [shieldResult.trace, ...stage2.traces];
      setTraces(allTraces);
      setTelemetry((prev) => accumulateTelemetry(prev, stage2.traces, 0, 0, false));

      await persistIfSignedIn({
        id: `audit-${Date.now()}`,
        title: docTitle,
        domain: docDomain,
        complianceProfile: activeProfile,
        inputModality,
        redaction: shieldResult,
        wirePayload: stage2.wirePayload,
        cloudReportAnonymized: stage2.cloudReportAnonymized,
        rehydratedReport: stage2.rehydratedReport,
        localTriage,
        traces: allTraces,
        offlineQueued: false,
        estimatedUsdSaved: inputModality === "image" ? 0.0115 : 0.0042,
        createdAt: Date.now(),
      });
    } catch (err) {
      if (runIdRef.current === currentRunId) {
        setErrorBanner(
          err instanceof Error ? `Review failed: ${err.message}` : "Review failed.",
        );
      }
    } finally {
      if (runIdRef.current === currentRunId) setIsRunningCloud(false);
    }
  };

  const handleRunFullSplitBrain = useCallback(async () => {
    const currentRunId = ++runIdRef.current;
    setCloudReportAnonymized(null);
    setRehydratedReport(null);
    setLocalTriage(null);
    const shieldResult = await executeStage1(currentRunId);
    if (!shieldResult || runIdRef.current !== currentRunId) return;

    if (!effectiveOnline) {
      setIsRunningTriage(true);
      try {
        const { triage, trace } = await runLocalQuickTriage({
          ai: services.ai,
          scrubbedText: shieldResult.scrubbedText,
          domain: docDomain,
          policy,
          entities: shieldResult.entities,
        });
        if (runIdRef.current === currentRunId) {
          setLocalTriage(triage);
          setTraces((prev) => [...prev, trace]);
          setTelemetry((prev) => accumulateTelemetry(prev, [trace], 0, 0, false));
        }
      } catch {
        // Keep offline queue
      } finally {
        if (runIdRef.current === currentRunId) setIsRunningTriage(false);
      }
      await executeStage2(shieldResult, currentRunId);
      return;
    }

    await executeStage2(shieldResult, currentRunId);
  }, [docDomain, effectiveOnline, policy, services.ai, rawText, imageFile, inputModality, activeProfile, redaction, docTitle, localTriage, persistIfSignedIn]);

  // Keyboard shortcut: Ctrl/Cmd + Enter runs Review document
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        const activeId = (document.activeElement as HTMLElement | null)?.id;
        if (activeId === "veilai-qa-input" || activeId === "veilai-custom-shield-term") {
          return;
        }
        if (!isRunningShield && !isRunningCloud) {
          e.preventDefault();
          void handleRunFullSplitBrain();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleRunFullSplitBrain, isRunningCloud, isRunningShield]);

  const handleRunShieldOnly = async () => {
    const currentRunId = ++runIdRef.current;
    await executeStage1(currentRunId);
  };

  const handleRunLocalTriage = async () => {
    const currentRunId = ++runIdRef.current;
    setErrorBanner(null);
    let shieldResult = redaction;
    if (!shieldResult) {
      shieldResult = await executeStage1(currentRunId);
      if (!shieldResult || runIdRef.current !== currentRunId) return;
    }

    setIsRunningTriage(true);
    try {
      const { triage, trace } = await runLocalQuickTriage({
        ai: services.ai,
        scrubbedText: shieldResult.scrubbedText,
        domain: docDomain,
        policy,
        entities: shieldResult.entities,
      });
      if (runIdRef.current !== currentRunId) return;
      setLocalTriage(triage);
      setTraces((prev) => [...prev, trace]);
      setTelemetry((prev) => accumulateTelemetry(prev, [trace], 0, 0, false));
    } catch (err) {
      if (runIdRef.current === currentRunId) {
        setErrorBanner(
          err instanceof Error ? `Quick summary: ${err.message}` : "Summary failed.",
        );
      }
    } finally {
      if (runIdRef.current === currentRunId) setIsRunningTriage(false);
    }
  };

  const handleAskQuestion = async (question: string, preferLocal: boolean) => {
    if (!redaction || isAskingQa) return;
    if (!preferLocal && !services.isConfigured) {
      setErrorBanner("Connect Firebase in apps/web/.env.local to ask via anonymized cloud.");
      return;
    }
    setErrorBanner(null);
    setIsAskingQa(true);
    setQaStreamingAnswer("");
    try {
      const res = await askDocumentHybrid({
        ai: services.ai,
        question,
        scrubbedText: redaction.scrubbedText,
        domain: docDomain,
        profile: activeProfile,
        policy,
        entities: redaction.entities,
        preferLocal,
        onChunk: (partial) => setQaStreamingAnswer(partial),
      });

      setQaMessages((prev) => [
        ...prev,
        {
          id: `qa-${Date.now()}`,
          question,
          scrubbedQuestion: res.scrubbedQuestion,
          rehydratedAnswer: res.rehydratedAnswer,
          anonymizedAnswer: res.anonymizedAnswer,
          inferenceSource: res.trace.inferenceSource,
          modelUsed: res.trace.modelUsed,
          latencyMs: res.trace.latencyMs,
          createdAt: Date.now(),
        },
      ]);
      setTraces((prev) => [...prev, res.trace]);
      setTelemetry((prev) => accumulateTelemetry(prev, [res.trace], 0, 0, false));
    } catch (err) {
      setErrorBanner(
        err instanceof Error ? `Q&A failed: ${err.message}` : "Could not answer question.",
      );
    } finally {
      setIsAskingQa(false);
      setQaStreamingAnswer("");
    }
  };

  const handleFocusClause = (clauseRef: string) => {
    if (inputModality === "image" && rawText.trim().length > 0) {
      setInputModality("text");
    }
    setHighlightedClauseRef(clauseRef);
  };

  const handleTestLeakGuard = () => {
    if (!redaction) return;
    const firstEnabled = redaction.entities.find((e) => e.enabled);
    if (!firstEnabled) return;
    const tampered = `${redaction.scrubbedText}\n[INJECTED]: ${firstEnabled.original}`;
    const check = verifyZeroLeak(tampered, redaction.entities);
    if (!check.verified) {
      setLeakTestResult({
        triggered: true,
        blockedToken: firstEnabled.token,
        blockedSample: firstEnabled.original,
        leakedBytes: check.leakedBytes,
      });
    }
  };

  const handleRunBenchmark = async () => {
    if (!redaction) return;
    const currentRunId = ++runIdRef.current;
    setIsRunningBenchmark(true);
    setErrorBanner(null);
    try {
      const cloudTrace =
        traces.find((t) => t.stage === "STAGE_2_CLOUD_AUDIT") ?? null;
      const { benchmark: bench, trace } = await runLocalOnlyBenchmark({
        ai: services.ai,
        scrubbedText: redaction.scrubbedText,
        domain: docDomain,
        entities: redaction.entities,
        cloudReport: cloudReportAnonymized,
        cloudTrace,
        cloudModelName: policy.cloudAuditModel,
      });
      if (runIdRef.current !== currentRunId) return;
      setBenchmark(bench);
      setTraces((prev) => [...prev, trace]);
      setTelemetry((prev) => accumulateTelemetry(prev, [trace], 0, 0, false));
    } catch (err) {
      if (runIdRef.current === currentRunId) {
        setErrorBanner(
          err instanceof Error ? `Benchmark: ${err.message}` : "Benchmark failed.",
        );
      }
    } finally {
      if (runIdRef.current === currentRunId) setIsRunningBenchmark(false);
    }
  };

  const handleExportCertificate = async () => {
    if (!redaction) return;
    const auditId = `veilai-${Date.now()}`;
    const cert = await buildZeroLeakCertificate({
      auditId,
      complianceProfile: activeProfile,
      inputModality,
      wirePayload: wirePayload || redaction.scrubbedText,
      redaction,
      traces,
    });
    const blob = new Blob([JSON.stringify(cert, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${auditId}-zero-leak-proof.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleToggleEntity = (token: string) => {
    if (!redaction) return;
    const nextEntities = redaction.entities.map((e) =>
      e.token === token ? { ...e, enabled: !e.enabled } : e,
    );
    const reapplied = applyVaultRedaction(redaction.extractedText, nextEntities);
    setRedaction({
      ...redaction,
      entities: nextEntities,
      scrubbedText: reapplied.scrubbedText,
      bytesShielded: reapplied.bytesShielded,
      zeroLeakVerified: reapplied.zeroLeakVerified,
      leakedMatches: reapplied.leakedMatches,
    });
  };

  const handleAddCustomTerm = (term: string) => {
    if (!redaction) return;
    const updated = addCustomVaultTerm(
      redaction.extractedText,
      redaction.entities,
      term,
      defaultCustomCategoryForDomain(docDomain),
    );
    if (!updated.added) return;
    setRedaction({
      ...redaction,
      entities: updated.entities,
      scrubbedText: updated.scrubbedText,
      bytesShielded: updated.bytesShielded,
      zeroLeakVerified: updated.zeroLeakVerified,
      leakedMatches: updated.leakedMatches,
    });
  };

  const handlePolishRedlineLocally = async (
    _findingId: string,
    anonymizedRedline: string,
    onChunk: (partial: string) => void,
  ) => {
    if (!redaction) return;
    setErrorBanner(null);
    try {
      const { trace } = await streamLocalRewrite({
        ai: services.ai,
        scrubbedExcerpt: anonymizedRedline,
        instruction:
          "Rewrite into a crisp, assertive, professionally balanced counter-clause or remediation statement ready to paste directly.",
        policy,
        entities: redaction.entities,
        onChunk,
      });
      setTraces((prev) => [...prev, trace]);
      setTelemetry((prev) => accumulateTelemetry(prev, [trace], 0, 0, false));
    } catch (err) {
      setErrorBanner(
        err instanceof Error ? `Refine tone: ${err.message}` : "Refinement failed.",
      );
    }
  };

  const handleDraftFullReplyLocally = async (
    onChunk: (partial: string) => void,
  ) => {
    if (!redaction || !cloudReportAnonymized) return;
    setErrorBanner(null);
    const findingsDigest = cloudReportAnonymized.findings
      .map((f) => `- [${f.severity}] ${f.title}: ${f.suggestedRedline}`)
      .join("\n");
    try {
      const { trace } = await streamLocalRewrite({
        ai: services.ai,
        scrubbedExcerpt: `Summary: ${cloudReportAnonymized.executiveSummary}\nFindings:\n${findingsDigest}`,
        instruction:
          docDomain === "code"
            ? "Draft a concise, constructive GitHub Pull Request review comment listing the critical secret leaks and security patches required before merge."
            : docDomain === "medical"
              ? "Draft a calm, clear list of 4 focused questions to send to the ordering physician about these lab findings."
              : "Draft a polite, firm counter-proposal email summarizing the key redlines needed before signing.",
        policy,
        entities: redaction.entities,
        onChunk,
      });
      setTraces((prev) => [...prev, trace]);
      setTelemetry((prev) => accumulateTelemetry(prev, [trace], 0, 0, false));
    } catch (err) {
      setErrorBanner(
        err instanceof Error ? `Draft response: ${err.message}` : "Could not draft response.",
      );
    }
  };

  const handleGuestLogin = async () => {
    if (!services.isConfigured) {
      setErrorBanner("Configure apps/web/.env.local to enable Firebase Authentication.");
      return;
    }
    setAuthBusy(true);
    setErrorBanner(null);
    try {
      await signInAsGuest(services.auth);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : "Guest sign-in failed.");
    } finally {
      setAuthBusy(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (!services.isConfigured) {
      setErrorBanner("Configure apps/web/.env.local to enable Google Sign-In.");
      return;
    }
    setAuthBusy(true);
    setErrorBanner(null);
    try {
      await signInWithGoogle(services.auth);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : "Google sign-in failed.");
    } finally {
      setAuthBusy(false);
    }
  };

  const handleDeleteRecord = async (auditId: string) => {
    if (!user) return;
    await deleteAnonymizedAudit(services.db, user.uid, auditId);
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#161618] text-[#EAE9E5] lg:h-screen lg:flex-row lg:overflow-hidden">
      <LeftSidebar
        activeScenarioId={activeScenarioId}
        onSelectScenario={handleSelectScenario}
        onNewCustomDoc={handleNewCustomDoc}
        auditRecords={auditRecords}
        onOpenHistory={() => setHistoryOpen(true)}
        capability={capability}
        isWarmingUp={isWarmingUp}
        downloadProgress={downloadProgress}
        onWarmupNano={handleWarmupNano}
        effectiveOnline={effectiveOnline}
        user={user}
        authBusy={authBusy}
        onGuestLogin={handleGuestLogin}
        onGoogleLogin={handleGoogleLogin}
        onSignOut={() => void signOutUser(services.auth)}
      />

      <div className="flex min-w-0 flex-1 flex-col xl:flex-row">
        <div className="flex min-w-0 flex-1 flex-col">
          {errorBanner && (
            <div className="flex items-center justify-between gap-3 border-b border-amber-400/25 bg-amber-400/[0.08] px-6 py-2.5 text-[12.5px] text-amber-200">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{errorBanner}</span>
              </div>
              <button
                type="button"
                onClick={() => setErrorBanner(null)}
                className="text-[11.5px] underline"
              >
                Dismiss
              </button>
            </div>
          )}

          <DocumentWorkbench
            docTitle={docTitle}
            onChangeDocTitle={setDocTitle}
            docDomain={docDomain}
            policy={policy}
            activeProfile={activeProfile}
            onSelectProfile={handleSelectProfile}
            inputModality={inputModality}
            onChangeModality={setInputModality}
            rawText={rawText}
            onChangeRawText={handleChangeRawText}
            imagePreviewUrl={imagePreviewUrl}
            imageFileName={imageFile?.name ?? null}
            isSampleLabImage={isSampleLabImage}
            isParsingPdf={isParsingPdf}
            pdfMeta={pdfMeta}
            onSelectImageFile={handleSelectImageFile}
            onUploadPdfFile={handleUploadPdfFile}
            onDropTextFile={handleDropTextFile}
            onGenerateSampleLabImage={handleGenerateSampleLabImage}
            redaction={redaction}
            onToggleEntity={handleToggleEntity}
            highlightedClauseRef={highlightedClauseRef}
            onClearHighlightedClause={() => setHighlightedClauseRef(null)}
            onOpenPrivacyInspector={() => setPrivacyDrawerOpen(true)}
          />
        </div>

        <InspectorPanel
          docTitle={docTitle}
          docDomain={docDomain}
          redaction={redaction}
          onToggleEntity={handleToggleEntity}
          onAddCustomTerm={handleAddCustomTerm}
          cloudReportAnonymized={cloudReportAnonymized}
          rehydratedReport={rehydratedReport}
          localTriage={localTriage}
          qaMessages={qaMessages}
          qaStreamingAnswer={qaStreamingAnswer}
          isAskingQa={isAskingQa}
          isRunningShield={isRunningShield}
          shieldElapsedSec={shieldElapsedSec}
          isRunningCloud={isRunningCloud}
          isRunningTriage={isRunningTriage}
          offlineQueued={offlineQueued}
          effectiveOnline={effectiveOnline}
          onRunFullSplitBrain={handleRunFullSplitBrain}
          onRunLocalTriage={handleRunLocalTriage}
          onResumeCloudAudit={() => {
            if (redaction) {
              void executeStage2(redaction, ++runIdRef.current);
            }
          }}
          onFocusClause={handleFocusClause}
          onAskQuestion={handleAskQuestion}
          onPolishRedlineLocally={handlePolishRedlineLocally}
          onDraftFullReplyLocally={handleDraftFullReplyLocally}
        />
      </div>

      <PrivacyInspectorDrawer
        open={privacyDrawerOpen}
        onClose={() => setPrivacyDrawerOpen(false)}
        capability={capability}
        policy={policy}
        telemetry={telemetry}
        redaction={redaction}
        wirePayload={wirePayload}
        traces={traces}
        benchmark={benchmark}
        effectiveOnline={effectiveOnline}
        simulateOffline={simulateOffline}
        isSyncingRc={isSyncingRc}
        isRunningShield={isRunningShield}
        isRunningBenchmark={isRunningBenchmark}
        leakTestResult={leakTestResult}
        onToggleSimulateOffline={() => setSimulateOffline((v) => !v)}
        onSyncRemoteConfig={handleSyncRemoteConfig}
        onToggleEscalationMode={(mode: CloudEscalationMode) =>
          setPolicy((prev) => ({ ...prev, cloudEscalationMode: mode }))
        }
        onRunShieldOnly={handleRunShieldOnly}
        onTestLeakGuard={handleTestLeakGuard}
        onClearLeakTest={() => setLeakTestResult(null)}
        onRunBenchmark={handleRunBenchmark}
        onExportCertificate={handleExportCertificate}
      />

      <AuditHistoryDrawer
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        records={auditRecords}
        onDelete={handleDeleteRecord}
        isSignedIn={Boolean(user)}
        firebaseConfigured={services.isConfigured}
      />
    </div>
  );
}
export default App;
