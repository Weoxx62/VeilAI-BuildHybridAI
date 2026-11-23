export type ComplianceProfileId =
  | "GDPR_EU"
  | "HIPAA_MEDICAL"
  | "DEVSECOPS_CODE"
  | "FINANCIAL_TAX";

export type EntityCategory =
  | "PERSON"
  | "EMAIL"
  | "PHONE"
  | "IBAN"
  | "SSN"
  | "TAX_ID"
  | "SALARY"
  | "ADDRESS"
  | "DOB"
  | "MEDICAL_ID"
  | "INSURANCE_ID"
  | "COMPANY"
  | "API_KEY"
  | "AWS_KEY"
  | "JWT"
  | "PRIVATE_KEY"
  | "DB_URI"
  | "IP_ADDRESS"
  | "PASSWORD"
  | "ACCOUNT_NUMBER";

export type DocumentDomain = "legal" | "medical" | "financial" | "code" | "general";
export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type AppSurface = "web" | "extension";
export type InputModality = "text" | "image";

export type InferenceSourceTag =
  | "ON_DEVICE"
  | "IN_CLOUD"
  | "LOCAL_REGEX_FALLBACK"
  | "OFFLINE_QUEUED";

export type CloudEscalationMode = "ONLY_IN_CLOUD" | "PREFER_IN_CLOUD";

export interface VaultEntity {
  token: string;
  category: EntityCategory;
  original: string;
  source: "gemini-nano" | "regex-guard" | "hybrid";
  enabled: boolean;
  confidence: number;
  occurrences: number;
}

export interface ComplianceProfileDefinition {
  id: ComplianceProfileId;
  label: string;
  description: string;
  categories: EntityCategory[];
  minSeverity: RiskLevel;
}

export interface RemotePolicyConfig {
  defaultComplianceProfile: ComplianceProfileId;
  cloudAuditModel: string;
  cloudFastFallbackModel: string;
  strictLocalFirewall: boolean;
  cloudEscalationMode: CloudEscalationMode;
  profiles: Record<ComplianceProfileId, ComplianceProfileDefinition>;
  source: "remote" | "default" | "cached";
  lastFetchedAt: number;
}

export interface AuditFinding {
  id: string;
  severity: RiskLevel;
  title: string;
  clauseRef: string;
  explanation: string;
  suggestedRedline: string;
}

export interface ComplianceCheckItem {
  rule: string;
  status: "PASS" | "WARN" | "FAIL";
  note: string;
}

export interface AuditReport {
  riskScore: number;
  riskLevel: RiskLevel;
  executiveSummary: string;
  findings: AuditFinding[];
  complianceChecks: ComplianceCheckItem[];
  actionChecklist: string[];
}

export interface LocalTriageResult {
  documentType: string;
  urgency: "LOW" | "MEDIUM" | "HIGH";
  quickSummary: string;
  topFlags: string[];
  inferenceSource: InferenceSourceTag;
  modelUsed: string;
  latencyMs: number;
}

export interface PipelineStageTrace {
  stage:
    | "STAGE_1_SHIELD"
    | "STAGE_2_CLOUD_AUDIT"
    | "STAGE_3_LOCAL_REHYDRATE"
    | "LOCAL_TRIAGE"
    | "LOCAL_REWRITE";
  modeRequested: string;
  inferenceSource: InferenceSourceTag;
  modelUsed: string;
  latencyMs: number;
  bytesSentToCloud: number;
  piiLeakedBytes: number;
  timestamp: number;
  note?: string;
}

export interface RedactionResult {
  extractedText: string;
  scrubbedText: string;
  entities: VaultEntity[];
  zeroLeakVerified: boolean;
  leakedMatches: string[];
  bytesShielded: number;
  trace: PipelineStageTrace;
}

export interface SplitBrainRunResult {
  id: string;
  title: string;
  domain: DocumentDomain;
  complianceProfile: ComplianceProfileId;
  inputModality: InputModality;
  redaction: RedactionResult;
  wirePayload: string;
  cloudReportAnonymized: AuditReport | null;
  rehydratedReport: AuditReport | null;
  localTriage: LocalTriageResult | null;
  traces: PipelineStageTrace[];
  offlineQueued: boolean;
  estimatedUsdSaved: number;
  createdAt: number;
}

export interface AnonymizedAuditRecord {
  id: string;
  title: string;
  domain: DocumentDomain;
  surface: AppSurface;
  complianceProfile: ComplianceProfileId;
  inputModality: InputModality;
  scrubbedPreview: string;
  entityCounts: Record<string, number>;
  totalEntitiesRedacted: number;
  bytesShielded: number;
  riskScore: number;
  riskLevel: RiskLevel;
  summary: string;
  findingsCount: number;
  stage1Source: "ON_DEVICE" | "LOCAL_REGEX_FALLBACK" | "IN_CLOUD";
  stage2Source: "IN_CLOUD" | "ON_DEVICE" | "OFFLINE_QUEUED";
  stage1LatencyMs: number;
  stage2LatencyMs: number;
  cloudModel: string;
  estimatedUsdSaved: number;
  createdAt: number;
  updatedAt: number;
}

export interface SessionTelemetry {
  totalRuns: number;
  totalEntitiesShielded: number;
  totalBytesShielded: number;
  piiLeakedBytes: number;
  onDeviceCalls: number;
  inCloudCalls: number;
  localRegexCalls: number;
  estimatedUsdSaved: number;
  avgOnDeviceLatencyMs: number;
  avgCloudLatencyMs: number;
}

export interface ChromeAICapability {
  supported: boolean;
  multimodalSupported: boolean;
  status: "available" | "downloadable" | "downloading" | "unavailable" | "unsupported";
  downloadProgress: number | null;
  browserHint: string;
}

export interface LocalVsHybridBenchmark {
  localModel: string;
  localInferenceSource: InferenceSourceTag;
  localLatencyMs: number;
  localRiskScore: number;
  localFindingsCount: number;
  localSummary: string;
  localTopRisks: string[];
  localCostUsd: number;
  cloudModel: string;
  cloudInferenceSource: InferenceSourceTag;
  cloudLatencyMs: number;
  cloudRiskScore: number;
  cloudFindingsCount: number;
  cloudSummary: string;
  cloudCostEstUsd: number;
}

export interface ZeroLeakCertificate {
  certificateVersion: "1.0";
  application: "VeilAI — Zero-Leak Split-Brain Hybrid AI";
  issuedAtIso: string;
  auditId: string;
  complianceProfile: ComplianceProfileId;
  inputModality: InputModality;
  wirePayloadSha256: string;
  wirePayloadBytes: number;
  entitiesShieldedCount: number;
  bytesShielded: number;
  entityCategoryBreakdown: Record<string, number>;
  piiLeakedBytes: 0;
  zeroLeakVerified: boolean;
  sdkTraces: Array<{
    stage: PipelineStageTrace["stage"];
    modeRequested: string;
    inferenceSource: InferenceSourceTag;
    modelUsed: string;
    latencyMs: number;
    bytesSentToCloud: number;
    piiLeakedBytes: number;
  }>;
}

export interface FirebaseConfigInput {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId: string;
  recaptchaSiteKey?: string;
  appCheckDebugToken?: string | boolean;
}

export interface DemoScenario {
  id: string;
  title: string;
  shortLabel: string;
  subtitle: string;
  domain: DocumentDomain;
  recommendedProfile: ComplianceProfileId;
  modality: InputModality;
  badge: string;
  content: string;
}
