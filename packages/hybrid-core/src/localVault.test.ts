import { describe, expect, it } from "vitest";
import {
  addCustomVaultTerm,
  applyVaultRedaction,
  buildVaultAndScrub,
  rehydrateAuditReport,
  rehydrateText,
  runDeterministicRegexGuard,
  verifyZeroLeak,
} from "./localVault.js";
import { DEMO_SCENARIOS } from "./scenarios.js";
import { computeLocalSharePercent, createInitialTelemetry } from "./telemetry.js";
import { buildZeroLeakCertificate } from "./hybridRouter.js";
import type { AuditReport } from "./types.js";

const SYNTHETIC_STRIPE_KEY = ["sk", "live", "51NxVeilDemo92KlmPqRsTuVwXyZ01928374"].join("_");

describe("VeilAI Local Privacy Vault — Zero-Leak Invariants", () => {
  it("redacts IBAN, email, phone, salary, and tax ID from NDA scenario with 0 leaked bytes", () => {
    const nda = DEMO_SCENARIOS.find((s) => s.id === "saas-nda")!;
    const regexHits = runDeterministicRegexGuard(nda.content, "GDPR_EU");
    const nanoHits = [
      { category: "PERSON" as const, original: "Marcus Delacroix", source: "gemini-nano" as const, confidence: 0.98 },
      { category: "PERSON" as const, original: "Claire Beaumont", source: "gemini-nano" as const, confidence: 0.98 },
      { category: "COMPANY" as const, original: "Vespera Cloud Systems SAS", source: "gemini-nano" as const, confidence: 0.96 },
    ];

    const vault = buildVaultAndScrub(nda.content, nanoHits, regexHits);
    expect(vault.zeroLeakVerified).toBe(true);
    expect(vault.leakedMatches).toHaveLength(0);
    expect(vault.scrubbedText).not.toContain("Marcus Delacroix");
    expect(vault.scrubbedText).not.toContain("FR76 3000 6000 0112 3456 7890 189");
    expect(vault.scrubbedText).not.toContain("marcus.delacroix@protonmail.com");
    expect(vault.scrubbedText).not.toContain("+33 6 48 92 11 04");
    expect(vault.scrubbedText).not.toContain("+33 6 71 23 89 45");
    expect(vault.scrubbedText).not.toContain("€168,000 EUR");
    expect(vault.scrubbedText).toContain("[PERSON_1]");
    expect(vault.scrubbedText).toContain("[IBAN_1]");
  });

  it("blocks Stripe keys, AWS keys, DB URIs, JWTs, and internal IPs in GitHub PR scenario", () => {
    const pr = DEMO_SCENARIOS.find((s) => s.id === "github-pr")!;
    const regexHits = runDeterministicRegexGuard(pr.content, "DEVSECOPS_CODE");
    const vault = buildVaultAndScrub(pr.content, [], regexHits);

    expect(vault.zeroLeakVerified).toBe(true);
    expect(vault.scrubbedText).not.toContain(SYNTHETIC_STRIPE_KEY);
    expect(vault.scrubbedText).not.toContain("AKIAIOSFODNN7EXAMPLE");
    expect(vault.scrubbedText).not.toContain("Sup3rS3cretProdPass!");
    expect(vault.scrubbedText).not.toContain("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9");
    expect(vault.entities.length).toBeGreaterThanOrEqual(6);
  });

  it("detects leaks if someone accidentally passes unredacted text to verifyZeroLeak", () => {
    const text = "Contact Elena Rostova at elena@example.com";
    const vault = buildVaultAndScrub(
      text,
      [{ category: "PERSON", original: "Elena Rostova", source: "gemini-nano", confidence: 0.95 }],
      runDeterministicRegexGuard(text, "GDPR_EU"),
    );

    const leakCheck = verifyZeroLeak("Oops leaked Elena Rostova here", vault.entities);
    expect(leakCheck.verified).toBe(false);
    expect(leakCheck.leakedMatches).toContain("[PERSON_1]");
  });

  it("re-hydrates anonymized Cloud Audit reports cleanly in local RAM and respects user toggles", () => {
    const text = "Employee Marcus Delacroix earns €168,000 EUR via FR76 3000 6000 0112 3456 7890 189.";
    const vault = buildVaultAndScrub(
      text,
      [{ category: "PERSON", original: "Marcus Delacroix", source: "gemini-nano", confidence: 0.97 }],
      runDeterministicRegexGuard(text, "GDPR_EU"),
    );

    const cloudReport: AuditReport = {
      riskScore: 88,
      riskLevel: "HIGH",
      executiveSummary: "Contract for [PERSON_1] at [SALARY_1] paid to [IBAN_1] contains non-compete traps.",
      findings: [
        {
          id: "F-01",
          severity: "CRITICAL",
          title: "Unpaid non-compete for [PERSON_1]",
          clauseRef: "Section 3",
          explanation: "[PERSON_1] receives zero indemnity.",
          suggestedRedline: "Pay [PERSON_1] 50% of [SALARY_1].",
        },
      ],
      complianceChecks: [{ rule: "GDPR Art. 5", status: "PASS", note: "Protected [IBAN_1]" }],
      actionChecklist: ["Negotiate indemnity for [PERSON_1]"],
    };

    const rehydrated = rehydrateAuditReport(cloudReport, vault.entities);
    expect(rehydrated.executiveSummary).toContain("Marcus Delacroix");
    expect(rehydrated.executiveSummary).toContain("€168,000 EUR");
    expect(rehydrated.findings[0].suggestedRedline).toContain("Marcus Delacroix");

    // Disable one entity toggle and confirm applyVaultRedaction unmasks only that entity
    const toggled = vault.entities.map((e) =>
      e.category === "SALARY" ? { ...e, enabled: false } : e,
    );
    const reapplied = applyVaultRedaction(text, toggled);
    expect(reapplied.scrubbedText).toContain("€168,000 EUR");
    expect(reapplied.scrubbedText).not.toContain("Marcus Delacroix");
  });

  it("returns null local share before first run and builds SHA-256 Zero-Leak certificate with 0 PII", async () => {
    expect(computeLocalSharePercent(createInitialTelemetry())).toBeNull();

    const text = `Secret key ${SYNTHETIC_STRIPE_KEY} for Elena Rostova`;
    const vault = buildVaultAndScrub(
      text,
      [{ category: "PERSON", original: "Elena Rostova", source: "gemini-nano", confidence: 0.99 }],
      runDeterministicRegexGuard(text, "DEVSECOPS_CODE"),
    );

    const cert = await buildZeroLeakCertificate({
      auditId: "audit-test-1",
      complianceProfile: "DEVSECOPS_CODE",
      inputModality: "text",
      wirePayload: vault.scrubbedText,
      redaction: {
        extractedText: text,
        scrubbedText: vault.scrubbedText,
        entities: vault.entities,
        zeroLeakVerified: vault.zeroLeakVerified,
        leakedMatches: vault.leakedMatches,
        bytesShielded: vault.bytesShielded,
        trace: {
          stage: "STAGE_1_SHIELD",
          modeRequested: "InferenceMode.ONLY_ON_DEVICE",
          inferenceSource: "ON_DEVICE",
          modelUsed: "Gemini Nano 4",
          latencyMs: 120,
          bytesSentToCloud: 0,
          piiLeakedBytes: 0,
          timestamp: Date.now(),
        },
      },
      traces: [],
    });

    const serialized = JSON.stringify(cert);
    expect(cert.piiLeakedBytes).toBe(0);
    expect(cert.zeroLeakVerified).toBe(true);
    expect(cert.wirePayloadSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(serialized).not.toContain("Elena Rostova");
    expect(serialized).not.toContain(SYNTHETIC_STRIPE_KEY);
  });

  it("shields user-added custom confidential terms and re-hydrates follow-up answers cleanly", () => {
    const text = "Confidential acquisition memo for Project Helios led by Claire Beaumont.";
    const base = buildVaultAndScrub(
      text,
      [{ category: "PERSON", original: "Claire Beaumont", source: "gemini-nano", confidence: 0.96 }],
      runDeterministicRegexGuard(text, "GDPR_EU"),
    );

    const updated = addCustomVaultTerm(text, base.entities, "Project Helios", "COMPANY");
    expect(updated.added).toBe(true);
    expect(updated.zeroLeakVerified).toBe(true);
    expect(updated.scrubbedText).not.toContain("Project Helios");
    expect(updated.scrubbedText).toContain("[COMPANY_1]");

    // Verify follow-up Q&A question scrubbing & local re-hydration
    const scrubbedQ = applyVaultRedaction(
      "What are the risks for Project Helios and Claire Beaumont?",
      updated.entities,
    );
    expect(scrubbedQ.zeroLeakVerified).toBe(true);
    expect(scrubbedQ.scrubbedText).toBe("What are the risks for [COMPANY_1] and [PERSON_1]?");

    const answer = rehydrateText(
      "[COMPANY_1] requires IP carve-out approval from [PERSON_1].",
      updated.entities,
    );
    expect(answer).toBe("Project Helios requires IP carve-out approval from Claire Beaumont.");
  });
});
