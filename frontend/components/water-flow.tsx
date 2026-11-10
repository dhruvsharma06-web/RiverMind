/**
 * A slim band of moving water used between sections. Purely decorative;
 * motion stops for reduced-motion visitors.
 */
export function WaterFlow({ className }: { className?: string }) {
  const wave = (y: number, amp: number) =>
    `M0 ${y} ` +
    Array.from({ length: 8 }, (_, i) => {
      const x = i * 150;
      return `Q ${x + 37.5} ${y - amp} ${x + 75} ${y} T ${x + 150} ${y}`;
    }).join(" ") +
    ` V 64 H 0 Z`;
  return (
    <div className={`water-flow ${className ?? ""}`} aria-hidden="true">
      <svg viewBox="0 0 1200 64" preserveAspectRatio="none" focusable="false">
        <path className="water-flow-back" d={wave(26, 9)} />
        <path className="water-flow-mid" d={wave(36, 7)} />
        <path className="water-flow-front" d={wave(46, 5)} />
      </svg>
    </div>
  );
}
