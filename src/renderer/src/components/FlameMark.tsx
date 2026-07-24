// Path vendored from lucide (ISC license) — https://lucide.dev, icon "flame".
// Rendered filled (rather than lucide's default stroke) since it's used as a
// small brand mark, not a UI action icon.
const FLAME_PATH =
  'M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z'

interface FlameMarkProps {
  className?: string
}

export default function FlameMark({ className }: FlameMarkProps): React.JSX.Element {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d={FLAME_PATH} />
    </svg>
  )
}
