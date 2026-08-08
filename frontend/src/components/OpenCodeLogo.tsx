interface Props {
  className?: string;
}

// Official OpenCode logo geometry and colors.
// Source: https://opencode.ai/brand
export default function OpenCodeLogo({ className = "" }: Props) {
  return (
    <span className={`inline-flex shrink-0 ${className}`} aria-label="OpenCode">
      <svg
        className="opencode-logo opencode-logo-light"
        width="32"
        height="40"
        viewBox="0 0 240 300"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
      >
        <path d="M180 240H60V120H180V240Z" fill="#CFCECD" />
        <path d="M180 60H60V240H180V60ZM240 300H0V0H240V300Z" fill="#211E1E" />
      </svg>
      <svg
        className="opencode-logo opencode-logo-dark"
        width="32"
        height="40"
        viewBox="0 0 240 300"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
      >
        <path d="M180 240H60V120H180V240Z" fill="#4B4646" />
        <path d="M180 60H60V240H180V60ZM240 300H0V0H240V300Z" fill="#F1ECEC" />
      </svg>
    </span>
  );
}
