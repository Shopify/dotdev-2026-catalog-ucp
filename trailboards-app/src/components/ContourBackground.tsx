// Reusable topographic contour field (svg.contours). Decorative; pointer-events:none.
// Six faint topo paths — the shared "map paper" texture behind every screen.
export function ContourBackground({ className }: { className?: string }) {
  return (
    <svg
      className={className ? `contours ${className}` : 'contours'}
      viewBox="0 0 1200 800"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <path d="M-50 120 C 200 60 400 180 600 120 S 1000 40 1250 130" />
      <path d="M-50 260 C 220 200 420 320 640 260 S 1020 180 1250 270" />
      <path d="M-50 400 C 240 340 440 460 660 400 S 1040 320 1250 410" />
      <path d="M-50 540 C 200 480 420 600 640 540 S 1020 460 1250 550" />
      <path d="M-50 680 C 220 620 440 740 660 680 S 1040 600 1250 690" />
      <path d="M-50 200 C 300 300 500 100 700 220 S 1080 300 1250 210" />
    </svg>
  );
}
