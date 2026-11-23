/**
 * Generates a realistic high-resolution PNG clinical blood lab report right in the browser
 * so judges can test Gemini Nano 4 multimodal Vision (`ONLY_ON_DEVICE`) in 1 click without
 * needing to download or upload an external image file.
 */
export async function generateSampleMedicalLabPng(): Promise<{
  file: File;
  previewUrl: string;
}> {
  const canvas = document.createElement("canvas");
  canvas.width = 1040;
  canvas.height = 1220;
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Canvas 2D context unavailable.");
  }

  // Crisp paper background
  ctx.fillStyle = "#F8FAFC";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Header band
  ctx.fillStyle = "#0F172A";
  ctx.fillRect(0, 0, canvas.width, 130);

  ctx.fillStyle = "#38BDF8";
  ctx.font = "bold 30px sans-serif";
  ctx.fillText("ST. JUDE DIAGNOSTIC LABORATORY", 48, 58);

  ctx.fillStyle = "#CBD5E1";
  ctx.font = "18px monospace";
  ctx.fillText("CLIA #05D2198841  |  CONFIDENTIAL CLINICAL PATHOLOGY REPORT", 48, 96);

  // Patient PHI box (sensitive data to be redacted on-device!)
  ctx.fillStyle = "#FFFFFF";
  ctx.strokeStyle = "#CBD5E1";
  ctx.lineWidth = 2;
  ctx.fillRect(48, 162, 944, 212);
  ctx.strokeRect(48, 162, 944, 212);

  ctx.fillStyle = "#0F172A";
  ctx.font = "bold 20px sans-serif";
  ctx.fillText("PATIENT & PROVIDER IDENTIFIERS (HIPAA PROTECTED PHI)", 70, 198);

  ctx.font = "18px monospace";
  ctx.fillStyle = "#1E293B";
  const phiRows = [
    "Patient Name: Elena Rostova                  DOB: 1984-07-19",
    "Patient ID:   MRN-88492014                   Policy: POLICY-AXA-772910482",
    "Home Address: 742 Evergreen Terrace, Apt 4B, San Francisco, CA 94107",
    "Physician:    Dr. Henrik Lindqvist (h.lindqvist@stjudemed.org)",
    "Phone:        +1 415-892-3310                Collected: 2026-11-19",
  ];
  phiRows.forEach((line, i) => {
    ctx.fillText(line, 70, 236 + i * 29);
  });

  // Table header
  ctx.fillStyle = "#E2E8F0";
  ctx.fillRect(48, 408, 944, 46);
  ctx.fillStyle = "#0F172A";
  ctx.font = "bold 19px sans-serif";
  ctx.fillText("BIOMARKER", 70, 438);
  ctx.fillText("RESULT", 430, 438);
  ctx.fillText("FLAG", 620, 438);
  ctx.fillText("REFERENCE RANGE", 740, 438);

  const biomarkers: Array<[string, string, string, string, boolean]> = [
    ["Fasting Glucose", "138 mg/dL", "HIGH", "70 - 99 mg/dL", true],
    ["Hemoglobin A1c (HbA1c)", "6.9 %", "HIGH", "< 5.7 % (Diabetes >= 6.5%)", true],
    ["LDL Cholesterol", "174 mg/dL", "HIGH", "< 100 mg/dL", true],
    ["HDL Cholesterol", "39 mg/dL", "LOW", "> 50 mg/dL", true],
    ["Triglycerides", "245 mg/dL", "HIGH", "< 150 mg/dL", true],
    ["ALT (SGPT)", "68 U/L", "HIGH", "7 - 45 U/L", true],
    ["eGFR (CKD-EPI)", "84 mL/min", "NORMAL", "> 60 mL/min/1.73m2", false],
    ["TSH (Thyroid)", "6.4 mIU/L", "HIGH", "0.4 - 4.0 mIU/L", true],
  ];

  biomarkers.forEach(([name, val, flag, ref, abnormal], idx) => {
    const y = 454 + idx * 62;
    ctx.fillStyle = idx % 2 === 0 ? "#FFFFFF" : "#F1F5F9";
    ctx.fillRect(48, y, 944, 62);
    ctx.strokeStyle = "#E2E8F0";
    ctx.strokeRect(48, y, 944, 62);

    ctx.fillStyle = "#0F172A";
    ctx.font = "20px sans-serif";
    ctx.fillText(name, 70, y + 38);

    ctx.font = "bold 20px monospace";
    ctx.fillStyle = abnormal ? "#BE123C" : "#0F766E";
    ctx.fillText(val, 430, y + 38);
    ctx.fillText(flag, 620, y + 38);

    ctx.font = "17px monospace";
    ctx.fillStyle = "#475569";
    ctx.fillText(ref, 740, y + 38);
  });

  // Clinical note footer
  ctx.fillStyle = "#FFF7ED";
  ctx.strokeStyle = "#FDBA74";
  ctx.fillRect(48, 984, 944, 155);
  ctx.strokeRect(48, 984, 944, 155);

  ctx.fillStyle = "#9A3412";
  ctx.font = "bold 19px sans-serif";
  ctx.fillText("CLINICAL TECHNICIAN NOTE", 70, 1020);
  ctx.fillStyle = "#431407";
  ctx.font = "18px sans-serif";
  ctx.fillText(
    "Patient reported persistent fatigue and family history of Type 2 diabetes.",
    70,
    1056,
  );
  ctx.fillText(
    "Recommend endocrinology consult within 14 days, repeat fasting lipid panel,",
    70,
    1088,
  );
  ctx.fillText("and thyroid peroxidase (TPO) antibody screening.", 70, 1120);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => {
      if (b) resolve(b);
      else reject(new Error("Failed to encode PNG blob"));
    }, "image/png");
  });

  const file = new File([blob], "st-jude-lab-report-sample.png", {
    type: "image/png",
  });
  const previewUrl = URL.createObjectURL(blob);
  return { file, previewUrl };
}
