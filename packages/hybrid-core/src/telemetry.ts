import type { PipelineStageTrace, SessionTelemetry } from "./types.js";

// Conservative cloud inference cost saved per local call (token + multimodal overhead avoided)
const USD_SAVED_PER_ON_DEVICE_TEXT_CALL = 0.0042;
const USD_SAVED_PER_ON_DEVICE_IMAGE_CALL = 0.0115;

export function estimateUsdSavedForTrace(
  trace: PipelineStageTrace,
  isImage = false,
): number {
  if (trace.inferenceSource === "ON_DEVICE" || trace.inferenceSource === "LOCAL_REGEX_FALLBACK") {
    return isImage ? USD_SAVED_PER_ON_DEVICE_IMAGE_CALL : USD_SAVED_PER_ON_DEVICE_TEXT_CALL;
  }
  return 0;
}

export function createInitialTelemetry(): SessionTelemetry {
  return {
    totalRuns: 0,
    totalEntitiesShielded: 0,
    totalBytesShielded: 0,
    piiLeakedBytes: 0,
    onDeviceCalls: 0,
    inCloudCalls: 0,
    localRegexCalls: 0,
    estimatedUsdSaved: 0,
    avgOnDeviceLatencyMs: 0,
    avgCloudLatencyMs: 0,
  };
}

export function accumulateTelemetry(
  prev: SessionTelemetry,
  traces: PipelineStageTrace[],
  entitiesShielded: number,
  bytesShielded: number,
  isImage = false,
): SessionTelemetry {
  let onDeviceCalls = prev.onDeviceCalls;
  let inCloudCalls = prev.inCloudCalls;
  let localRegexCalls = prev.localRegexCalls;
  let piiLeakedBytes = prev.piiLeakedBytes;
  let estimatedUsdSaved = prev.estimatedUsdSaved;

  let onDeviceLatencySum = prev.avgOnDeviceLatencyMs * prev.onDeviceCalls;
  let cloudLatencySum = prev.avgCloudLatencyMs * prev.inCloudCalls;

  for (const trace of traces) {
    piiLeakedBytes += trace.piiLeakedBytes;
    estimatedUsdSaved += estimateUsdSavedForTrace(trace, isImage);

    if (trace.inferenceSource === "ON_DEVICE") {
      onDeviceCalls += 1;
      onDeviceLatencySum += trace.latencyMs;
    } else if (trace.inferenceSource === "IN_CLOUD") {
      inCloudCalls += 1;
      cloudLatencySum += trace.latencyMs;
    } else if (trace.inferenceSource === "LOCAL_REGEX_FALLBACK") {
      localRegexCalls += 1;
    }
  }

  return {
    totalRuns: prev.totalRuns + 1,
    totalEntitiesShielded: prev.totalEntitiesShielded + entitiesShielded,
    totalBytesShielded: prev.totalBytesShielded + bytesShielded,
    piiLeakedBytes,
    onDeviceCalls,
    inCloudCalls,
    localRegexCalls,
    estimatedUsdSaved: Number(estimatedUsdSaved.toFixed(4)),
    avgOnDeviceLatencyMs:
      onDeviceCalls > 0 ? Math.round(onDeviceLatencySum / onDeviceCalls) : 0,
    avgCloudLatencyMs:
      inCloudCalls > 0 ? Math.round(cloudLatencySum / inCloudCalls) : 0,
  };
}

export function computeLocalSharePercent(
  telemetry: SessionTelemetry,
): number | null {
  const totalCalls =
    telemetry.onDeviceCalls + telemetry.localRegexCalls + telemetry.inCloudCalls;
  if (totalCalls === 0) return null;
  return Math.round(
    ((telemetry.onDeviceCalls + telemetry.localRegexCalls) / totalCalls) * 100,
  );
}
