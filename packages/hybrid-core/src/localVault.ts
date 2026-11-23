import type {
  AuditReport,
  ComplianceProfileId,
  EntityCategory,
  VaultEntity,
} from "./types.js";

export interface DetectedSpan {
  category: EntityCategory;
  original: string;
  source: "gemini-nano" | "regex-guard";
  confidence: number;
}

interface RegexRule {
  category: EntityCategory;
  pattern: RegExp;
  confidence: number;
}

const REGEX_RULES: RegexRule[] = [
  // PEM Private Keys
  {
    category: "PRIVATE_KEY",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
    confidence: 1.0,
  },
  // Database Connection URIs with credentials
  {
    category: "DB_URI",
    pattern: /\b(?:postgres(?:ql)?|mongodb(?:\+srv)?|mysql|redis):\/\/[^\s"'`]+:[^\s"'`@]+@[^\s"'`]+/gi,
    confidence: 0.99,
  },
  // Stripe / OpenAI / Anthropic / GitHub / Google API Keys
  {
    category: "API_KEY",
    pattern: /\b(?:sk_live_[A-Za-z0-9]{12,}|rk_live_[A-Za-z0-9]{12,}|pk_live_[A-Za-z0-9]{12,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AIza[0-9A-Za-z_-]{25,}|sk-proj-[A-Za-z0-9_-]{20,}|xox[baprs]-[A-Za-z0-9-]{12,})\b/g,
    confidence: 0.99,
  },
  // AWS Access Key IDs & Secret Keys
  {
    category: "AWS_KEY",
    pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
    confidence: 0.99,
  },
  {
    category: "AWS_KEY",
    pattern: /(?<=AWS_SECRET_ACCESS_KEY\s*[:=]\s*["']?)[A-Za-z0-9/+=]{24,}(?=["']?)/g,
    confidence: 0.98,
  },
  // JWT tokens
  {
    category: "JWT",
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
    confidence: 0.98,
  },
  // Hardcoded passwords / secrets in code or env assignments
  {
    category: "PASSWORD",
    pattern: /(?<=(?:JWT_SECRET|WEBHOOK_SECRET|DB_PASSWORD|API_SECRET|ADMIN_PASSWORD|SECRET_KEY)\s*[:=]\s*["']?)[^\s"';,`]{8,}(?=["']?)/g,
    confidence: 0.95,
  },
  // IBAN (European & international formats, spaced or compact)
  {
    category: "IBAN",
    pattern: /\b[A-Z]{2}\d{2}(?:[\s-]?[A-Z0-9]{4}){3,7}(?:[\s-]?[A-Z0-9]{1,4})?\b/g,
    confidence: 0.97,
  },
  // US SSN & French NIR / National ID patterns
  {
    category: "SSN",
    pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
    confidence: 0.96,
  },
  {
    category: "SSN",
    pattern: /\b[12]\s?\d{2}\s?(?:0[1-9]|1[0-2])\s?\d{2}\s?\d{3}\s?\d{3}\s?\d{2}\b/g,
    confidence: 0.95,
  },
  // Medical Record Number & Patient ID
  {
    category: "MEDICAL_ID",
    pattern: /\b(?:MRN|PATIENT[\s_-]?ID|LAB[\s_-]?ACC|SPECIMEN[\s_-]?ID)[#:\s-]*[A-Z0-9]{4,14}\b/gi,
    confidence: 0.95,
  },
  // Insurance policy numbers
  {
    category: "INSURANCE_ID",
    pattern: /\b(?:POLICY|INSURANCE|MEMBER[\s_-]?ID)[#:\s-]*[A-Z0-9-]{6,18}\b/gi,
    confidence: 0.92,
  },
  // Tax IDs / EIN / EU VAT / TIN
  {
    category: "TAX_ID",
    pattern: /\b(?:TIN|EIN|VAT|SIRET|SIREN|TAX[\s_-]?ID)[#:\s-]*(?:[A-Z]{2})?[0-9\s-]{8,16}\b/gi,
    confidence: 0.94,
  },
  // Bank account / routing numbers
  {
    category: "ACCOUNT_NUMBER",
    pattern: /\b(?:ACCT|ACCOUNT|ROUTING|EMP[\s_-]?ID)[#:\s-]*[A-Z0-9-]{6,16}\b/gi,
    confidence: 0.91,
  },
  // Email addresses
  {
    category: "EMAIL",
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    confidence: 0.99,
  },
  // International, European (e.g. +33 6 48 92 11 04) & US Phone numbers
  {
    category: "PHONE",
    pattern: /(?<!\w)(?:\+\d{1,3}[\s.-]?(?:\(\d{1,4}\)|\d{1,4})|(?:\(\d{2,4}\)|\d{2,4}))(?:[\s.-]\d{2,4}){2,4}\b/g,
    confidence: 0.9,
  },
  // Dates of birth explicitly tagged
  {
    category: "DOB",
    pattern: /(?<=(?:DOB|Date of Birth|Born)\s*[:\-]\s*)(?:\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4}|[A-Z][a-z]{2,8}\s+\d{1,2},\s+\d{4})/gi,
    confidence: 0.95,
  },
  // Salaries & Monetary compensation figures
  {
    category: "SALARY",
    pattern: /(?:€|\$|£)\s?\d{1,3}(?:[,\s]\d{3})+(?:\.\d{2})?(?:\s?(?:EUR|USD|GBP|\/year|\/yr|gross|net|annual))?\b|\b\d{1,3}(?:[,\s]\d{3})+(?:\.\d{2})?\s?(?:EUR|USD|GBP)\b/gi,
    confidence: 0.92,
  },
  // Street addresses (EU/FR/US formats, e.g. "42 Rue de la Paix, 75002 Paris, France")
  {
    category: "ADDRESS",
    pattern: /\b\d{1,5}\s+(?:Rue|Avenue|Boulevard|Place|Allée|Impasse|Street|St\.?|Avenue|Ave\.?|Road|Rd\.?|Terrace|Lane|Ln\.?|Drive|Dr\.?|Way)\s+[A-Za-zÀ-ÿ0-9\s.'-]{3,45}(?:,\s*(?:Apt\.?\s*[A-Za-z0-9-]+,\s*)?(?:\d{5}\s+)?[A-Za-zÀ-ÿ\s.-]{2,30}(?:,\s*(?:[A-Z]{2}\s+\d{5}|[A-Za-zÀ-ÿ\s.-]{2,25}))?)/gi,
    confidence: 0.9,
  },
  // Private/Public IPv4 addresses
  {
    category: "IP_ADDRESS",
    pattern: /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g,
    confidence: 0.92,
  },
];

const PROFILE_ALLOWED_CATEGORIES: Record<ComplianceProfileId, Set<EntityCategory>> = {
  GDPR_EU: new Set([
    "PERSON",
    "EMAIL",
    "PHONE",
    "IBAN",
    "ADDRESS",
    "SALARY",
    "TAX_ID",
    "COMPANY",
    "SSN",
    "DOB",
    "ACCOUNT_NUMBER",
    "API_KEY",
    "AWS_KEY",
    "PRIVATE_KEY",
    "DB_URI",
    "JWT",
    "PASSWORD",
  ]),
  HIPAA_MEDICAL: new Set([
    "PERSON",
    "DOB",
    "MEDICAL_ID",
    "INSURANCE_ID",
    "SSN",
    "PHONE",
    "EMAIL",
    "ADDRESS",
    "COMPANY",
  ]),
  DEVSECOPS_CODE: new Set([
    "API_KEY",
    "AWS_KEY",
    "JWT",
    "PRIVATE_KEY",
    "DB_URI",
    "EMAIL",
    "IP_ADDRESS",
    "PASSWORD",
    "PERSON",
  ]),
  FINANCIAL_TAX: new Set([
    "PERSON",
    "IBAN",
    "TAX_ID",
    "SSN",
    "SALARY",
    "ACCOUNT_NUMBER",
    "COMPANY",
    "ADDRESS",
    "EMAIL",
    "PHONE",
  ]),
};

export function runDeterministicRegexGuard(
  text: string,
  profile: ComplianceProfileId,
  allowedCategories?: EntityCategory[],
): DetectedSpan[] {
  const allowed = allowedCategories
    ? new Set<EntityCategory>(allowedCategories)
    : PROFILE_ALLOWED_CATEGORIES[profile];
  const spans: DetectedSpan[] = [];
  const seen = new Set<string>();

  for (const rule of REGEX_RULES) {
    if (!allowed.has(rule.category)) {
      continue;
    }
    const regex = new RegExp(rule.pattern.source, rule.pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const value = match[0].trim();
      if (value.length < 4) {
        continue;
      }
      // Avoid misclassifying simple dates like 2026-11-23 as phone numbers
      if (rule.category === "PHONE" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        continue;
      }
      const key = `${rule.category}::${value}`;
      if (!seen.has(key)) {
        seen.add(key);
        spans.push({
          category: rule.category,
          original: value,
          source: "regex-guard",
          confidence: rule.confidence,
        });
      }
    }
  }

  return spans;
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countOccurrences(text: string, needle: string): number {
  if (!needle) return 0;
  const regex = new RegExp(escapeRegExp(needle), "g");
  return (text.match(regex) ?? []).length;
}

/**
 * Merges Gemini Nano 4 semantic detections with deterministic regex detections,
 * deduplicates overlapping literals (longest-first), assigns stable tokens ([PERSON_1], [IBAN_1]...),
 * and produces a strictly scrubbed text ready for outbound Cloud AI inspection.
 */
export function buildVaultAndScrub(
  text: string,
  nanoDetections: DetectedSpan[],
  regexDetections: DetectedSpan[],
  previousToggleMap?: Map<string, boolean>,
): {
  entities: VaultEntity[];
  scrubbedText: string;
  bytesShielded: number;
  zeroLeakVerified: boolean;
  leakedMatches: string[];
} {
  const byLiteral = new Map<
    string,
    {
      category: EntityCategory;
      original: string;
      hasNano: boolean;
      hasRegex: boolean;
      confidence: number;
    }
  >();

  const ingest = (span: DetectedSpan) => {
    const clean = span.original.trim();
    if (clean.length < 3) return;
    // Ignore placeholders if model echoed one back
    if (/^\[[A-Z_]+_\d+\]$/.test(clean)) return;
    // Only keep entities that actually occur in the text
    if (!text.includes(clean)) return;

    const existing = byLiteral.get(clean);
    if (!existing) {
      byLiteral.set(clean, {
        category: span.category,
        original: clean,
        hasNano: span.source === "gemini-nano",
        hasRegex: span.source === "regex-guard",
        confidence: span.confidence,
      });
    } else {
      existing.hasNano = existing.hasNano || span.source === "gemini-nano";
      existing.hasRegex = existing.hasRegex || span.source === "regex-guard";
      existing.confidence = Math.max(existing.confidence, span.confidence);
      // Prefer regex category for strongly typed secrets/IBAN/emails
      if (span.source === "regex-guard") {
        existing.category = span.category;
      }
    }
  };

  for (const s of regexDetections) ingest(s);
  for (const s of nanoDetections) ingest(s);

  // Drop shorter substrings fully contained within an already captured longer secret/entity
  const sortedCandidates = Array.from(byLiteral.values()).sort(
    (a, b) => b.original.length - a.original.length,
  );
  const filtered: typeof sortedCandidates = [];
  for (const candidate of sortedCandidates) {
    const containedInLonger = filtered.some(
      (longer) =>
        longer.original.length > candidate.original.length &&
        longer.original.includes(candidate.original),
    );
    if (!containedInLonger) {
      filtered.push(candidate);
    }
  }

  // Sort deterministically by first position in document for clean [PERSON_1], [PERSON_2] numbering
  filtered.sort((a, b) => text.indexOf(a.original) - text.indexOf(b.original));

  const categoryCounters = new Map<EntityCategory, number>();
  const entities: VaultEntity[] = filtered.map((item) => {
    const nextCount = (categoryCounters.get(item.category) ?? 0) + 1;
    categoryCounters.set(item.category, nextCount);
    const token = `[${item.category}_${nextCount}]`;
    const enabled = previousToggleMap?.has(item.original)
      ? Boolean(previousToggleMap.get(item.original))
      : true;

    return {
      token,
      category: item.category,
      original: item.original,
      source: item.hasNano && item.hasRegex ? "hybrid" : item.hasNano ? "gemini-nano" : "regex-guard",
      enabled,
      confidence: item.confidence,
      occurrences: countOccurrences(text, item.original),
    };
  });

  const applied = applyVaultRedaction(text, entities);
  return {
    entities,
    ...applied,
  };
}

/**
 * Re-applies redaction after the user toggles any individual entity shield on/off.
 */
export function applyVaultRedaction(
  text: string,
  entities: VaultEntity[],
): {
  scrubbedText: string;
  bytesShielded: number;
  zeroLeakVerified: boolean;
  leakedMatches: string[];
} {
  const active = entities
    .filter((e) => e.enabled)
    .sort((a, b) => b.original.length - a.original.length);

  let scrubbed = text;
  let bytesShielded = 0;

  for (const entity of active) {
    const regex = new RegExp(escapeRegExp(entity.original), "g");
    const hits = scrubbed.match(regex);
    if (hits && hits.length > 0) {
      bytesShielded += new TextEncoder().encode(entity.original).length * hits.length;
      scrubbed = scrubbed.replace(regex, entity.token);
    }
  }

  const verification = verifyZeroLeak(scrubbed, active);

  return {
    scrubbedText: scrubbed,
    bytesShielded,
    zeroLeakVerified: verification.verified,
    leakedMatches: verification.leakedMatches,
  };
}

/**
 * Hard mathematical wire-guard executed immediately prior to ANY cloud call.
 * Proves zero enabled sensitive literals remain in the outbound payload.
 */
export function verifyZeroLeak(
  outboundPayload: string,
  entities: VaultEntity[],
): { verified: boolean; leakedMatches: string[]; leakedBytes: number } {
  const leakedMatches: string[] = [];
  let leakedBytes = 0;

  for (const entity of entities) {
    if (!entity.enabled) continue;
    if (entity.original.length < 3) continue;
    if (outboundPayload.includes(entity.original)) {
      leakedMatches.push(entity.token);
      leakedBytes += new TextEncoder().encode(entity.original).length;
    }
  }

  return {
    verified: leakedMatches.length === 0,
    leakedMatches,
    leakedBytes,
  };
}

/**
 * Re-hydrates anonymized placeholder tokens strictly in local browser RAM.
 */
export function rehydrateText(anonymizedText: string, entities: VaultEntity[]): string {
  let output = anonymizedText;
  for (const entity of entities) {
    if (!entity.enabled) continue;
    const tokenRegex = new RegExp(escapeRegExp(entity.token), "g");
    output = output.replace(tokenRegex, entity.original);
  }
  return output;
}

export function rehydrateAuditReport(
  report: AuditReport,
  entities: VaultEntity[],
): AuditReport {
  return {
    ...report,
    executiveSummary: rehydrateText(report.executiveSummary, entities),
    findings: report.findings.map((finding) => ({
      ...finding,
      title: rehydrateText(finding.title, entities),
      clauseRef: rehydrateText(finding.clauseRef, entities),
      explanation: rehydrateText(finding.explanation, entities),
      suggestedRedline: rehydrateText(finding.suggestedRedline, entities),
    })),
    complianceChecks: report.complianceChecks.map((check) => ({
      ...check,
      rule: rehydrateText(check.rule, entities),
      note: rehydrateText(check.note, entities),
    })),
    actionChecklist: report.actionChecklist.map((item) => rehydrateText(item, entities)),
  };
}

export function buildEntityCounts(entities: VaultEntity[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const entity of entities) {
    if (!entity.enabled) continue;
    counts[entity.category] = (counts[entity.category] ?? 0) + 1;
  }
  return counts;
}
