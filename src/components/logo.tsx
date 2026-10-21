import Link from "next/link";

import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8 shrink-0", className)} aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="var(--acid)" />
      <path
        d="M9 11.5V9h2.5M20.5 9H23v2.5M23 20.5V23h-2.5M11.5 23H9v-2.5"
        fill="none"
        stroke="#0a0d09"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M12 13.2h8M12 16.2h6M12 19.2h4"
        fill="none"
        stroke="#0a0d09"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Logo({
  href = "/",
  className,
  markClassName,
  wordmark = true,
}: {
  href?: string;
  className?: string;
  markClassName?: string;
  wordmark?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group inline-flex items-center gap-2.5 rounded-lg transition-opacity hover:opacity-90",
        className,
      )}
      aria-label="LLMReady home"
    >
      <LogoMark className={markClassName} />
      {wordmark ? (
        <span className="text-[17px] font-semibold tracking-tight">
          LLM<span className="text-acid">Ready</span>
        </span>
      ) : null}
    </Link>
  );
}
