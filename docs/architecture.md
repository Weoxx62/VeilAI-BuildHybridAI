# VeilAI Architecture & Zero-Leak Threat Model

## 1. Split-Brain Hybrid Inference Sequence

VeilAI uses all four official `firebase/ai` `InferenceMode` strategies purposefully so that **both on-device and cloud inference are architecturally indispensable**:

```mermaid
sequenceDiagram
    participant U as User (Web App / Chrome Side Panel)
    participant V as Local Vault + Wire Guard (Browser RAM)
    participant N as Gemini Nano 4 (ONLY_ON_DEVICE / PREFER_ON_DEVICE)
    participant C as Gemini Cloud (ONLY_IN_CLOUD via App Check)
    participant RC as Firebase Remote Config
    participant FS as Cloud Firestore (Offline Persistence)

    U->>RC: fetchAndActivate() compliance profile & cloud model (gemini-4-hydrogen)
    U->>N: Stage 1 (ONLY_ON_DEVICE): Text or PNG/JPEG Image PII Extraction
    N-->>V: Semantic entities (names, addresses, companies, PHI)
    V->>V: Merge with Deterministic Regex Guard (IBAN, SSN, Stripe/AWS/JWT/DB URI)
    V->>V: verifyZeroLeak(wirePayload, activeEntities) == 0 bytes PII
    alt Offline / Airplane Mode
        V->>N: Quick Triage (PREFER_ON_DEVICE, $0.00, 0 network)
        V->>FS: Queue strictly anonymized audit record in IndexedDB cache
    else Online
        V->>C: Stage 2 (ONLY_IN_CLOUD / PREFER_IN_CLOUD): Scrubbed Skeleton ONLY
        C-->>V: Structured JSON AuditReport referencing [PERSON_1], [IBAN_1], [API_KEY_1]
        V->>V: Stage 3 (RAM Re-Hydration): Restore real values strictly in local browser memory
        V->>FS: Persist strictly anonymized summary + scrubbedPreview (0 raw PII)
    end
```

## 2. Hard Zero-Leak Security Invariants

1. **No Cloud Fallback on Raw PII (`InferenceMode.ONLY_ON_DEVICE`)**:
   Stage 1 never uses `PREFER_ON_DEVICE`. If Gemini Nano 4 is unavailable in a reviewer's browser, VeilAI degrades strictly to its local deterministic Regex Vault (`LOCAL_REGEX_FALLBACK`) — raw documents NEVER traverse the network.
2. **Pre-Transmission Wire Guard (`verifyZeroLeak`)**:
   Immediately before calling `model.generateContent(wirePayload)` in Stage 2 (or `PREFER_ON_DEVICE` triage/rewrite), VeilAI scans the exact outbound string against every enabled vault entity and throws a hard error if any byte survives unredacted.
3. **Zero-PII Firestore Security Rules (`firestore.rules`)**:
   Defense-in-depth `hasOnly` allowlists enforce that raw input fields (`rawInput`, `originalText`, `vaultMap`, `secretMap`, `rehydratedReport`) are rejected at the database layer even if a compromised client attempts to write them.
4. **Firebase App Check + Per-User Isolation**:
   Every cloud Firebase AI Logic request is protected by Firebase App Check (reCAPTCHA v3 in production + debug token mode for local judge testing). Firestore records live strictly under `/users/{uid}/audits/{auditId}` with owner-only rules supporting both Google Sign-In and 1-click Anonymous Guest Mode.
5. **Runtime Proof (`result.response.inferenceSource`)**:
   Every inference call inspects `result.response.inferenceSource` (`InferenceSource.ON_DEVICE` vs `InferenceSource.IN_CLOUD`) and renders live latency, wire bytes, and estimated cost saved in the UI.
