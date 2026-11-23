import {
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  Timestamp,
  type Firestore,
} from "firebase/firestore";
import { buildEntityCounts } from "./localVault.js";
import type {
  AnonymizedAuditRecord,
  AppSurface,
  SplitBrainRunResult,
} from "./types.js";

/**
 * Converts a full in-memory SplitBrainRunResult into a STRICTLY ANONYMIZED
 * Firestore record. Raw input text, original PII values, and the local vault
 * replacement map are NEVER serialized or transmitted to Cloud Firestore.
 */
export function toAnonymizedAuditRecord(
  run: SplitBrainRunResult,
  surface: AppSurface,
): AnonymizedAuditRecord {
  const stage2Trace = run.traces.find((t) => t.stage === "STAGE_2_CLOUD_AUDIT");
  const cloudReport = run.cloudReportAnonymized;
  const now = Date.now();

  const stage1Source =
    run.redaction.trace.inferenceSource === "ON_DEVICE" ||
    run.redaction.trace.inferenceSource === "IN_CLOUD"
      ? run.redaction.trace.inferenceSource
      : "LOCAL_REGEX_FALLBACK";

  const stage2Source = run.offlineQueued
    ? "OFFLINE_QUEUED"
    : stage2Trace?.inferenceSource === "ON_DEVICE"
      ? "ON_DEVICE"
      : "IN_CLOUD";

  return {
    id: run.id.slice(0, 128),
    title: run.title.slice(0, 160),
    domain: run.domain,
    surface,
    complianceProfile: run.complianceProfile,
    inputModality: run.inputModality,
    // Strictly scrubbed skeleton snippet (tokens only, 0 raw PII)
    scrubbedPreview: run.redaction.scrubbedText.slice(0, 1950),
    entityCounts: buildEntityCounts(run.redaction.entities),
    totalEntitiesRedacted: Math.min(
      1000,
      run.redaction.entities.filter((e) => e.enabled).length,
    ),
    bytesShielded: Math.min(500_000, Math.max(0, Math.round(run.redaction.bytesShielded))),
    riskScore: cloudReport ? cloudReport.riskScore : 0,
    riskLevel: cloudReport ? cloudReport.riskLevel : "MEDIUM",
    // Strictly anonymized summary (never the re-hydrated summary!)
    summary: (
      cloudReport?.executiveSummary ??
      "Shielded locally on-device while offline. Pending cloud deep audit sync."
    ).slice(0, 1950),
    findingsCount: cloudReport ? Math.min(100, cloudReport.findings.length) : 0,
    stage1Source,
    stage2Source,
    stage1LatencyMs: Math.min(600_000, Math.max(0, Math.round(run.redaction.trace.latencyMs))),
    stage2LatencyMs: Math.min(600_000, Math.max(0, Math.round(stage2Trace?.latencyMs ?? 0))),
    cloudModel: (stage2Trace?.modelUsed ?? "offline-queued").slice(0, 80),
    estimatedUsdSaved: Math.min(100, Math.max(0, Number(run.estimatedUsdSaved.toFixed(4)))),
    createdAt: run.createdAt || now,
    updatedAt: now,
  };
}

/**
 * Saves an anonymized audit record to `/users/{uid}/audits/{auditId}`.
 * Works offline automatically thanks to Cloud Firestore `persistentLocalCache()`.
 */
export async function saveAnonymizedAudit(
  db: Firestore,
  uid: string,
  record: AnonymizedAuditRecord,
): Promise<void> {
  const auditRef = doc(db, "users", uid, "audits", record.id);
  await setDoc(auditRef, {
    id: record.id,
    title: record.title,
    domain: record.domain,
    surface: record.surface,
    complianceProfile: record.complianceProfile,
    inputModality: record.inputModality,
    scrubbedPreview: record.scrubbedPreview,
    entityCounts: record.entityCounts,
    totalEntitiesRedacted: record.totalEntitiesRedacted,
    bytesShielded: record.bytesShielded,
    riskScore: record.riskScore,
    riskLevel: record.riskLevel,
    summary: record.summary,
    findingsCount: record.findingsCount,
    stage1Source: record.stage1Source,
    stage2Source: record.stage2Source,
    stage1LatencyMs: record.stage1LatencyMs,
    stage2LatencyMs: record.stage2LatencyMs,
    cloudModel: record.cloudModel,
    estimatedUsdSaved: record.estimatedUsdSaved,
    createdAt: Timestamp.fromMillis(record.createdAt),
    updatedAt: Timestamp.fromMillis(record.updatedAt),
  });
}

export async function deleteAnonymizedAudit(
  db: Firestore,
  uid: string,
  auditId: string,
): Promise<void> {
  const auditRef = doc(db, "users", uid, "audits", auditId);
  await deleteDoc(auditRef);
}

/**
 * Subscribes to live anonymized audit records synced across Web App & Chrome Extension
 * (including offline cached writes via Firestore `includeMetadataChanges`).
 */
export function subscribeAnonymizedAudits(
  db: Firestore,
  uid: string,
  onUpdate: (records: Array<AnonymizedAuditRecord & { hasPendingWrites: boolean }>) => void,
  onError?: (err: Error) => void,
  maxItems = 20,
): () => void {
  const auditsQuery = query(
    collection(db, "users", uid, "audits"),
    orderBy("createdAt", "desc"),
    limit(maxItems),
  );

  return onSnapshot(
    auditsQuery,
    { includeMetadataChanges: true },
    (snapshot) => {
      const items = snapshot.docs.map((docSnap) => {
        const d = docSnap.data();
        const createdTs = d.createdAt instanceof Timestamp ? d.createdAt.toMillis() : Date.now();
        const updatedTs = d.updatedAt instanceof Timestamp ? d.updatedAt.toMillis() : createdTs;
        return {
          id: String(d.id ?? docSnap.id),
          title: String(d.title ?? "Untitled Audit"),
          domain: d.domain ?? "general",
          surface: d.surface ?? "web",
          complianceProfile: d.complianceProfile ?? "GDPR_EU",
          inputModality: d.inputModality ?? "text",
          scrubbedPreview: String(d.scrubbedPreview ?? ""),
          entityCounts: (d.entityCounts ?? {}) as Record<string, number>,
          totalEntitiesRedacted: Number(d.totalEntitiesRedacted ?? 0),
          bytesShielded: Number(d.bytesShielded ?? 0),
          riskScore: Number(d.riskScore ?? 0),
          riskLevel: d.riskLevel ?? "MEDIUM",
          summary: String(d.summary ?? ""),
          findingsCount: Number(d.findingsCount ?? 0),
          stage1Source: d.stage1Source ?? "LOCAL_REGEX_FALLBACK",
          stage2Source: d.stage2Source ?? "IN_CLOUD",
          stage1LatencyMs: Number(d.stage1LatencyMs ?? 0),
          stage2LatencyMs: Number(d.stage2LatencyMs ?? 0),
          cloudModel: String(d.cloudModel ?? ""),
          estimatedUsdSaved: Number(d.estimatedUsdSaved ?? 0),
          createdAt: createdTs,
          updatedAt: updatedTs,
          hasPendingWrites: docSnap.metadata.hasPendingWrites,
        };
      });
      onUpdate(items);
    },
    (err) => {
      onError?.(err);
    },
  );
}
