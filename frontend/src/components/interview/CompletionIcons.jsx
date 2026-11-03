// Animated end-of-interview icons. Self-contained: keyframes live in the
// inline <style> block so nothing depends on the global stylesheet or on
// Tailwind's layering. Both icons draw/animate once on mount.

export function SuccessTick({ size = 56 }) {
  return (
    <>
      <style>{`
        @keyframes hfTickCircle { to { stroke-dashoffset: 0; } }
        @keyframes hfTickCheck { to { stroke-dashoffset: 0; } }
        @keyframes hfTickPop {
          0% { transform: scale(0.6); opacity: 0; }
          60% { transform: scale(1.06); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        .hf-tick-wrap { animation: hfTickPop 0.45s cubic-bezier(0.22, 1, 0.36, 1) both; }
        .hf-tick-circle {
          stroke-dasharray: 151; stroke-dashoffset: 151;
          animation: hfTickCircle 0.55s 0.1s ease-out forwards;
        }
        .hf-tick-check {
          stroke-dasharray: 40; stroke-dashoffset: 40;
          animation: hfTickCheck 0.3s 0.6s ease-out forwards;
        }
      `}</style>
      <span className="hf-tick-wrap inline-flex" style={{ lineHeight: 0 }}>
        <svg width={size} height={size} viewBox="0 0 52 52" aria-hidden="true">
          <circle
            className="hf-tick-circle"
            cx="26" cy="26" r="24"
            fill="none" stroke="#177245" strokeWidth="2.5"
          />
          <path
            className="hf-tick-check"
            d="M14 27l8 8 16-16"
            fill="none" stroke="#177245" strokeWidth="3.5"
            strokeLinecap="round" strokeLinejoin="round"
          />
        </svg>
      </span>
    </>
  )
}

export function AlarmRing({ size = 56 }) {
  return (
    <>
      <style>{`
        @keyframes hfAlarmRing {
          0%, 100% { transform: rotate(0deg); }
          15% { transform: rotate(9deg); }
          30% { transform: rotate(-8deg); }
          45% { transform: rotate(6deg); }
          60% { transform: rotate(-5deg); }
          75% { transform: rotate(2deg); }
        }
        .hf-alarm-wrap {
          display: inline-flex; line-height: 0;
          transform-origin: 50% 0%;
          animation: hfAlarmRing 1.1s ease-in-out 2;
        }
      `}</style>
      <span className="hf-alarm-wrap">
        <svg
          width={size} height={size} viewBox="0 0 24 24"
          fill="none" stroke="#b45309" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
        >
          <circle cx="12" cy="13" r="8" />
          <polyline points="12 9 12 13 14.5 15" />
          <path d="M5 3 2 6" />
          <path d="m22 6-3-3" />
          <path d="M6.38 18.7 4 21" />
          <path d="M17.64 18.67 20 21" />
        </svg>
      </span>
    </>
  )
}
