/** The title: a glowing triangle wired between a blue and a yellow pole, and the name. */
export default function Logo({ size = "lg" }: { size?: "lg" | "sm" }) {
  const big = size === "lg";
  return (
    <span className={`inline-flex items-center ${big ? "gap-3" : "gap-2"}`}>
      <svg viewBox="0 0 40 36" className={big ? "h-10 w-11" : "h-6 w-7"} aria-hidden>
        <defs>
          <filter id="logo-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1.4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <g filter="url(#logo-glow)" strokeLinecap="round" strokeWidth="2.4" fill="none">
          <path d="M20 5 L35 31 L5 31 Z" stroke="#c9f3ff" />
          <path d="M5 31 L20 5" stroke="#4cc9ff" />
          <path d="M20 5 L35 31" stroke="#ffd23f" />
        </g>
        <circle cx="20" cy="5" r="2.6" fill="#e8edf7" />
        <circle cx="35" cy="31" r="2.6" fill="#e8edf7" />
        <circle cx="5" cy="31" r="2.6" fill="#e8edf7" />
      </svg>
      <span className={`font-black ${big ? "whitespace-nowrap text-3xl tracking-[0.12em] sm:text-5xl" : "whitespace-nowrap text-lg tracking-[0.1em]"}`}>
        <span className="text-ink">トライ</span>
        <span className="text-blue">アン</span>
        <span className="text-yellow">グラー</span>
      </span>
    </span>
  );
}
