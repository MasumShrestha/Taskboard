export default function Icon({ n, className = '' }: { n: string; className?: string }) {
  return <span className={`icon ${className}`} aria-hidden="true">{n}</span>
}
