import { Schema } from "firebase/ai";

/**
 * Structured JSON schemas used by BOTH:
 * 1. Cloud Gemini models via `inCloudParams.generationConfig.responseSchema` (Firebase AI Logic Schema builder)
 * 2. On-device Gemini Nano 4 via `onDeviceParams.promptOptions.responseConstraint` (JSON Schema object)
 */

export const PII_CATEGORIES_ENUM = [
  "PERSON",
  "EMAIL",
  "PHONE",
  "IBAN",
  "SSN",
  "TAX_ID",
  "SALARY",
  "ADDRESS",
  "DOB",
  "MEDICAL_ID",
  "INSURANCE_ID",
  "COMPANY",
  "API_KEY",
  "AWS_KEY",
  "JWT",
  "PRIVATE_KEY",
  "DB_URI",
  "IP_ADDRESS",
  "PASSWORD",
  "ACCOUNT_NUMBER",
] as const;

/**
 * Ultra-compact flat JSON Schema for Chrome Gemini Nano 4 constrained decoding.
 * Deterministic Regex Guard already catches structured secrets (IBAN, API keys, emails,
 * phones, SSNs, salaries) in <2ms, so Nano 4 focuses exclusively on fast semantic PII
 * (person names, organizations, street addresses) — cutting local latency ~4-5x.
 */
export const ON_DEVICE_PII_JSON_SCHEMA = {
  type: "object",
  properties: {
    persons: {
      type: "array",
      items: { type: "string" },
    },
    companies: {
      type: "array",
      items: { type: "string" },
    },
    addresses: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["persons", "companies", "addresses"],
};

export const ON_DEVICE_IMAGE_PII_JSON_SCHEMA = {
  type: "object",
  properties: {
    extractedText: { type: "string" },
    persons: {
      type: "array",
      items: { type: "string" },
    },
    addresses: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["extractedText", "persons", "addresses"],
};

export const LOCAL_TRIAGE_JSON_SCHEMA = {
  type: "object",
  properties: {
    documentType: { type: "string" },
    urgency: { type: "string", enum: ["LOW", "MEDIUM", "HIGH"] },
    quickSummary: { type: "string" },
    topFlags: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["documentType", "urgency", "quickSummary", "topFlags"],
};

export const LOCAL_TRIAGE_FIREBASE_SCHEMA = Schema.object({
  properties: {
    documentType: Schema.string({
      description: "Short classification of the scrubbed document",
    }),
    urgency: Schema.enumString({
      enum: ["LOW", "MEDIUM", "HIGH"],
    }),
    quickSummary: Schema.string({
      description: "Two-sentence executive triage summary keeping all [TOKEN_N] placeholders intact",
    }),
    topFlags: Schema.array({
      items: Schema.string(),
      description: "Up to 3 concise risk signals detected",
    }),
  },
});

export const DEEP_AUDIT_FIREBASE_SCHEMA = Schema.object({
  properties: {
    riskScore: Schema.integer({
      description: "Overall risk score from 0 (safe) to 100 (severe risk)",
    }),
    riskLevel: Schema.enumString({
      enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
    }),
    executiveSummary: Schema.string({
      description:
        "Clear 2-3 sentence expert audit summary preserving exact placeholder tokens such as [PERSON_1], [COMPANY_1], [SALARY_1]",
    }),
    findings: Schema.array({
      items: Schema.object({
        properties: {
          id: Schema.string({ description: "Short ID like F-01" }),
          severity: Schema.enumString({
            enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
          }),
          title: Schema.string({ description: "Concise finding title" }),
          clauseRef: Schema.string({
            description: "Section, biomarker, line, or clause reference",
          }),
          explanation: Schema.string({
            description: "Expert explanation preserving exact placeholder tokens",
          }),
          suggestedRedline: Schema.string({
            description:
              "Concrete counter-clause, fix, code patch, or clinical follow-up preserving exact placeholder tokens",
          }),
        },
      }),
    }),
    complianceChecks: Schema.array({
      items: Schema.object({
        properties: {
          rule: Schema.string(),
          status: Schema.enumString({ enum: ["PASS", "WARN", "FAIL"] }),
          note: Schema.string(),
        },
      }),
    }),
    actionChecklist: Schema.array({
      items: Schema.string(),
      description: "3 to 5 concrete next steps for the user",
    }),
  },
});

export const DEEP_AUDIT_JSON_SCHEMA = {
  type: "object",
  properties: {
    riskScore: { type: "integer" },
    riskLevel: { type: "string", enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"] },
    executiveSummary: { type: "string" },
    findings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          severity: { type: "string", enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"] },
          title: { type: "string" },
          clauseRef: { type: "string" },
          explanation: { type: "string" },
          suggestedRedline: { type: "string" },
        },
        required: ["id", "severity", "title", "clauseRef", "explanation", "suggestedRedline"],
      },
    },
    complianceChecks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          rule: { type: "string" },
          status: { type: "string", enum: ["PASS", "WARN", "FAIL"] },
          note: { type: "string" },
        },
        required: ["rule", "status", "note"],
      },
    },
    actionChecklist: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: [
    "riskScore",
    "riskLevel",
    "executiveSummary",
    "findings",
    "complianceChecks",
    "actionChecklist",
  ],
};
