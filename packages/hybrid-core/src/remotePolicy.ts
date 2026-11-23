import {
  fetchAndActivate,
  getBoolean,
  getString,
  type RemoteConfig,
} from "firebase/remote-config";
import type {
  CloudEscalationMode,
  ComplianceProfileDefinition,
  ComplianceProfileId,
  RemotePolicyConfig,
} from "./types.js";

export const DEFAULT_COMPLIANCE_PROFILES: Record<
  ComplianceProfileId,
  ComplianceProfileDefinition
> = {
  GDPR_EU: {
    id: "GDPR_EU",
    label: "GDPR EU Legal & HR",
    description: "Shields personal identities, IBANs, salaries, tax IDs, and NDA parties.",
    categories: [
      "PERSON",
      "EMAIL",
      "PHONE",
      "IBAN",
      "ADDRESS",
      "SALARY",
      "TAX_ID",
      "COMPANY",
    ],
    minSeverity: "MEDIUM",
  },
  HIPAA_MEDICAL: {
    id: "HIPAA_MEDICAL",
    label: "HIPAA Medical & Labs",
    description: "Strips patient PHI (name, DOB, MRN, insurance, doctor contact) on-device.",
    categories: [
      "PERSON",
      "DOB",
      "MEDICAL_ID",
      "INSURANCE_ID",
      "SSN",
      "PHONE",
      "EMAIL",
      "ADDRESS",
    ],
    minSeverity: "LOW",
  },
  DEVSECOPS_CODE: {
    id: "DEVSECOPS_CODE",
    label: "DevSecOps & Secrets",
    description: "Blocks live API keys, AWS creds, DB URIs, JWTs, private keys, and IPs.",
    categories: [
      "API_KEY",
      "AWS_KEY",
      "JWT",
      "PRIVATE_KEY",
      "DB_URI",
      "EMAIL",
      "IP_ADDRESS",
      "PASSWORD",
    ],
    minSeverity: "LOW",
  },
  FINANCIAL_TAX: {
    id: "FINANCIAL_TAX",
    label: "Financial & Tax Audit",
    description: "Redacts SSNs, TINs, bank accounts, IBANs, and exact compensation numbers.",
    categories: [
      "PERSON",
      "IBAN",
      "TAX_ID",
      "SSN",
      "SALARY",
      "ACCOUNT_NUMBER",
      "COMPANY",
      "ADDRESS",
    ],
    minSeverity: "MEDIUM",
  },
};

export const DEFAULT_REMOTE_POLICY: RemotePolicyConfig = {
  defaultComplianceProfile: "GDPR_EU",
  // Verified high-quota no-billing models from firebase.google.com/docs/ai-logic/models (Nov 2026)
  cloudAuditModel: "gemini-3.5-flash-lite",
  cloudFastFallbackModel: "gemini-3.5-flash-lite",
  strictLocalFirewall: true,
  cloudEscalationMode: "ONLY_IN_CLOUD",
  profiles: DEFAULT_COMPLIANCE_PROFILES,
  source: "default",
  lastFetchedAt: Date.now(),
};

function isValidProfileId(val: string): val is ComplianceProfileId {
  return (
    val === "GDPR_EU" ||
    val === "HIPAA_MEDICAL" ||
    val === "DEVSECOPS_CODE" ||
    val === "FINANCIAL_TAX"
  );
}

function isValidEscalationMode(val: string): val is CloudEscalationMode {
  return val === "ONLY_IN_CLOUD" || val === "PREFER_IN_CLOUD";
}

/**
 * Loads live enterprise compliance & model routing policies from Firebase Remote Config.
 * Safely falls back to in-app defaults when offline or before Remote Config is published.
 */
export async function loadRemotePolicy(
  remoteConfig: RemoteConfig | null,
  forceRefresh = false,
): Promise<RemotePolicyConfig> {
  if (!remoteConfig) {
    return { ...DEFAULT_REMOTE_POLICY, lastFetchedAt: Date.now() };
  }

  remoteConfig.defaultConfig = {
    default_compliance_profile: DEFAULT_REMOTE_POLICY.defaultComplianceProfile,
    cloud_audit_model: DEFAULT_REMOTE_POLICY.cloudAuditModel,
    cloud_fast_fallback_model: DEFAULT_REMOTE_POLICY.cloudFastFallbackModel,
    strict_local_firewall: DEFAULT_REMOTE_POLICY.strictLocalFirewall,
    cloud_escalation_mode: DEFAULT_REMOTE_POLICY.cloudEscalationMode,
    compliance_profiles_json: JSON.stringify(DEFAULT_COMPLIANCE_PROFILES),
  };

  if (forceRefresh) {
    remoteConfig.settings.minimumFetchIntervalMillis = 0;
  }

  let source: RemotePolicyConfig["source"] = "cached";
  try {
    const activated = await fetchAndActivate(remoteConfig);
    source = activated ? "remote" : "cached";
  } catch {
    source = "default";
  }

  const rawProfile = getString(remoteConfig, "default_compliance_profile");
  const cloudAuditModel =
    getString(remoteConfig, "cloud_audit_model").trim() ||
    DEFAULT_REMOTE_POLICY.cloudAuditModel;
  const cloudFastFallbackModel =
    getString(remoteConfig, "cloud_fast_fallback_model").trim() ||
    DEFAULT_REMOTE_POLICY.cloudFastFallbackModel;
  const strictLocalFirewall = getBoolean(remoteConfig, "strict_local_firewall");
  const rawEscalation = getString(remoteConfig, "cloud_escalation_mode").trim();

  let profiles = DEFAULT_COMPLIANCE_PROFILES;
  try {
    const parsed = JSON.parse(
      getString(remoteConfig, "compliance_profiles_json"),
    ) as Record<string, Partial<ComplianceProfileDefinition>>;
    const merged: Record<ComplianceProfileId, ComplianceProfileDefinition> = {
      ...DEFAULT_COMPLIANCE_PROFILES,
    };
    for (const id of Object.keys(merged) as ComplianceProfileId[]) {
      if (parsed[id]) {
        merged[id] = {
          ...merged[id],
          ...parsed[id],
          id,
        };
      }
    }
    profiles = merged;
  } catch {
    profiles = DEFAULT_COMPLIANCE_PROFILES;
  }

  return {
    defaultComplianceProfile: isValidProfileId(rawProfile)
      ? rawProfile
      : DEFAULT_REMOTE_POLICY.defaultComplianceProfile,
    cloudAuditModel,
    cloudFastFallbackModel,
    strictLocalFirewall,
    cloudEscalationMode: isValidEscalationMode(rawEscalation)
      ? rawEscalation
      : DEFAULT_REMOTE_POLICY.cloudEscalationMode,
    profiles,
    source,
    lastFetchedAt: Date.now(),
  };
}
