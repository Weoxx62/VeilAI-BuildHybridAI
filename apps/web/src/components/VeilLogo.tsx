import { useId } from "react";

interface VeilLogoProps {
  size?: number;
  className?: string;
}

/**
 * VeilAI "Folded Veil V" Brand Mark.
 * Two precision interlocking architectural facets:
 * - Warm alabaster front facet: On-device local privacy veil (RAM boundary)
 * - Sage-emerald rear facet: Filtered cloud intelligence safely behind the veil
 */
export function VeilLogo({ size = 22, className = "" }: VeilLogoProps) {
  const uid = useId().replace(/:/g, "");
  const bgId = `veil-bg-${uid}`;
  const rimId = `veil-rim-${uid}`;
  const cloudId = `veil-cloud-${uid}`;
  const localId = `veil-local-${uid}`;
  const shadowId = `veil-shadow-${uid}`;
  const glowId = `veil-glow-${uid}`;
  const clipId = `veil-clip-${uid}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      <defs>
        <linearGradient id={bgId} x1="18" y1="2" x2="46" y2="62" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#26262B" />
          <stop offset="100%" stopColor="#141417" />
        </linearGradient>
        <linearGradient id={rimId} x1="32" y1="2" x2="32" y2="62" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.04" />
        </linearGradient>
        <linearGradient id={cloudId} x1="48" y1="16" x2="30" y2="49" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#6EE7B7" />
          <stop offset="100%" stopColor="#10B981" />
        </linearGradient>
        <linearGradient id={localId} x1="16" y1="16" x2="34" y2="49" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#F7F6F2" />
          <stop offset="100%" stopColor="#DAD8D2" />
        </linearGradient>
        <linearGradient id={shadowId} x1="31" y1="31" x2="38" y2="34" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#0C0D10" stopOpacity="0.58" />
          <stop offset="100%" stopColor="#0C0D10" stopOpacity="0" />
        </linearGradient>
        <radialGradient
          id={glowId}
          cx="0"
          cy="0"
          r="1"
          gradientUnits="userSpaceOnUse"
          gradientTransform="translate(49 46) rotate(135) scale(26)"
        >
          <stop offset="0%" stopColor="#34D399" stopOpacity="0.16" />
          <stop offset="100%" stopColor="#34D399" stopOpacity="0" />
        </radialGradient>
        <clipPath id={clipId}>
          <polygon points="39.75,16.5 50.25,16.5 36.35,48.5 27.65,48.5" />
        </clipPath>
      </defs>

      <rect x="2" y="2" width="60" height="60" rx="15" fill={`url(#${bgId})`} />
      <rect x="2" y="2" width="60" height="60" rx="15" fill={`url(#${glowId})`} />
      <rect
        x="2.75"
        y="2.75"
        width="58.5"
        height="58.5"
        rx="14.25"
        stroke={`url(#${rimId})`}
        strokeWidth="1.5"
      />
      <polygon
        points="39.75,16.5 50.25,16.5 36.35,48.5 27.65,48.5"
        fill={`url(#${cloudId})`}
      />
      <polygon
        points="24.25,16.5 29.5,16.5 41.2,48.5 34.5,48.5"
        fill={`url(#${shadowId})`}
        clipPath={`url(#${clipId})`}
      />
      <polygon
        points="13.75,16.5 24.25,16.5 36.35,48.5 27.65,48.5"
        fill={`url(#${localId})`}
      />
      <polygon
        points="27.65,48.5 32,37.8 36.35,48.5"
        fill="#FFFFFF"
        fillOpacity="0.12"
      />
    </svg>
  );
}
