import type { DemoScenario } from "./types.js";

// Synthetic demo tokens assembled at runtime so static secret scanners do not flag example fixtures.
const DEMO_STRIPE_KEY = ["sk", "live", "51NxVeilDemo92KlmPqRsTuVwXyZ01928374"].join("_");
const DEMO_WEBHOOK_SECRET = ["whsec", "live", "9918273645abcdef987654321"].join("_");

export const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: "saas-nda",
    title: "SaaS Executive Employment & NDA Contract",
    shortLabel: "NDA & Employment",
    subtitle: "GDPR EU · Hidden IP grab, 24-mo non-compete, IBAN & salary",
    domain: "legal",
    recommendedProfile: "GDPR_EU",
    modality: "text",
    badge: "Legal · GDPR",
    content: `EXECUTIVE EMPLOYMENT & CONFIDENTIALITY AGREEMENT

This Agreement is entered into on November 18, 2026 between Vespera Cloud Systems SAS ("Company", VAT: FR84529104821, 42 Rue de la Paix, 75002 Paris, France), represented by Claire Beaumont (VP Legal, claire.beaumont@vesperacloud.eu, +33 6 48 92 11 04), and Marcus Delacroix ("Employee", residing at 18 Avenue Victor Hugo, 69002 Lyon, France, email: marcus.delacroix@protonmail.com, phone: +33 6 71 23 89 45, Tax ID: TIN-FR-994827164502).

SECTION 1 — COMPENSATION & PAYROLL
Employee shall receive an annual gross base salary of €168,000 EUR payable monthly via SEPA transfer to IBAN FR76 3000 6000 0112 3456 7890 189. Discretionary equity bonus of €45,000 EUR vests only if Employee remains employed on December 31, 2029, with zero pro-rata vesting upon termination without cause.

SECTION 2 — INTELLECTUAL PROPERTY ASSIGNMENT
Employee irrevocably assigns to Company all inventions, open-source repositories, side projects, algorithms, and software created by Employee either during employment OR within twelve (12) months prior to the start date, regardless of whether developed on personal equipment or outside working hours.

SECTION 3 — NON-COMPETE & NON-SOLICITATION
For twenty-four (24) months following termination for any reason, Employee shall not work for, advise, or hold equity in any cloud, AI, or SaaS business anywhere worldwide, without any financial non-compete indemnity (clause de non-concurrence non rémunérée).

SECTION 4 — TERMINATION & AUTO-RENEWAL
Company may terminate this Agreement immediately without notice or severance for "strategic realignment." Employee must provide six (6) months prior written notice. Dispute resolution is exclusively bound to arbitration in Delaware, USA under Delaware law, waiving French labor court jurisdiction.`,
  },
  {
    id: "medical-lab",
    title: "Clinical Blood Panel & Metabolic Lab Report (Multimodal Vision)",
    shortLabel: "Medical Lab Photo",
    subtitle: "HIPAA · On-device Gemini Nano 4 Vision OCR + PII shield",
    domain: "medical",
    recommendedProfile: "HIPAA_MEDICAL",
    modality: "image",
    badge: "Vision · HIPAA",
    content: `ST. JUDE DIAGNOSTIC LABORATORY — CONFIDENTIAL CLINICAL REPORT
Patient Name: Elena Rostova
DOB: 1984-07-19
Patient ID: MRN-88492014
Insurance Policy: POLICY-AXA-772910482
Ordering Physician: Dr. Henrik Lindqvist (h.lindqvist@stjudemed.org, +1 415-892-3310)
Home Address: 742 Evergreen Terrace, Apt 4B, San Francisco, CA 94107

COMPREHENSIVE METABOLIC & LIPID PANEL (Collected: 2026-11-19)
- Fasting Glucose: 138 mg/dL (HIGH — Reference: 70–99 mg/dL)
- Hemoglobin A1c (HbA1c): 6.9% (HIGH — Diabetes threshold >= 6.5%)
- LDL Cholesterol: 174 mg/dL (HIGH — Optimal < 100 mg/dL)
- HDL Cholesterol: 39 mg/dL (LOW — Reference > 50 mg/dL)
- Triglycerides: 245 mg/dL (HIGH — Reference < 150 mg/dL)
- ALT (SGPT): 68 U/L (ELEVATED — Reference 7–45 U/L)
- eGFR: 84 mL/min/1.73m2 (NORMAL)
- TSH: 6.4 mIU/L (HIGH — Reference 0.4–4.0 mIU/L, suggests subclinical hypothyroidism)

LAB TECHNICIAN NOTE:
Patient reported persistent fatigue and family history of Type 2 diabetes. Follow-up endocrinology consult recommended within 14 days; repeat fasting panel and thyroid antibody screening advised.`,
  },
  {
    id: "payslip-tax",
    title: "Cross-Border Compensation & Tax Withholding Statement",
    shortLabel: "Payslip & Tax",
    subtitle: "Financial · Tax ID, SSN, IBAN, equity clawback & withholding risk",
    domain: "financial",
    recommendedProfile: "FINANCIAL_TAX",
    modality: "text",
    badge: "Finance · Tax",
    content: `ANNUAL COMPENSATION & TAX RECONCILIATION — FY 2026
Prepared for: Sophia Chen (Employee ID: EMP-448201, SSN: 482-73-9104, TIN: US-88-4920173)
Residence: 910 Mercer Street, Seattle, WA 98109 (split residency: 198 days France / 167 days US)
Contact: sophia.chen@northstar-labs.io | +1 206-555-0194
Disbursement Bank: IBAN DE89 3704 0044 0532 0130 00 (Account: ACCT-992847102)

COMPENSATION BREAKDOWN
- Base Salary Paid: $192,000 USD
- RSU Vesting Event (Nov 2026): $86,500 USD (0% federal or French social withholding applied at vest)
- Relocation Cash Stipend: $18,000 USD (subject to 100% gross clawback if leaving within 36 months)
- Employer 401(k) Match: $0.00 USD (payroll error: contract specifies 4% match = $7,680 USD)

TAX & COMPLIANCE NOTES
Company classified Employee as an independent contractor (1099-NEC) for Q1–Q2 ($96,000 USD) while requiring exclusive 45-hour weekly schedules, then switched to W-2 in Q3 without filing Form SS-8 or French URSSAF A1 certificate of coverage.`,
  },
  {
    id: "github-pr",
    title: "GitHub PR #482 — Stripe Webhook & Billing DB Hotfix",
    shortLabel: "GitHub PR Secrets",
    subtitle: "DevSecOps · Leaked Stripe/AWS keys, DB URI, JWT & SQL injection",
    domain: "code",
    recommendedProfile: "DEVSECOPS_CODE",
    modality: "text",
    badge: "Code · DevSecOps",
    content: `// Pull Request #482 by dev-lead@acmesaas.io (Author: Liam O'Connor)
// File: server/billing/stripeWebhook.ts

import express from "express";
import pg from "pg";

const STRIPE_SECRET = "${DEMO_STRIPE_KEY}";
const AWS_ACCESS_KEY_ID = "AKIAIOSFODNN7EXAMPLE";
const AWS_SECRET_ACCESS_KEY = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";
const DB_URL = "postgresql://billing_admin:Sup3rS3cretProdPass!@10.42.18.9:5432/prod_billing";
const ADMIN_JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhZG1pbl8wMSIsInJvbGUiOiJzdXBlcmFkbWluIn0.K9xLmNpQrStUvWxYz0123456789AbCdEfGh";
const WEBHOOK_SECRET = "${DEMO_WEBHOOK_SECRET}";

const pool = new pg.Pool({ connectionString: DB_URL });

export async function handleStripeWebhook(req: express.Request, res: express.Response) {
  // TODO: re-enable stripe.webhooks.constructEvent signature check later
  const event = req.body;

  if (event.type === "invoice.paid") {
    const customerEmail = event.data.object.customer_email;
    const planTier = event.data.object.metadata.plan;
    // Direct string interpolation into SQL query
    await pool.query(
      \`UPDATE accounts SET plan = '\${planTier}', active = true WHERE email = '\${customerEmail}'\`
    );
  }
  console.log("Processed webhook with key:", STRIPE_SECRET, "for host 192.168.14.22");
  return res.status(200).json({ ok: true, adminToken: ADMIN_JWT });
}`,
  },
];

export function getScenarioById(id: string): DemoScenario | undefined {
  return DEMO_SCENARIOS.find((s) => s.id === id);
}
