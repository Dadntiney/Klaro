import Link from "next/link";
import { cn } from "cn";

export function Wordmark({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-2 font-heading text-[1.35rem] leading-none tracking-tight text-foreground",
        className,
      )}
    >
      <span className="grid size-7 place-items-center rounded-md bg-primary text-primary-foreground">
        <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden="true">
          <path
            d="M3.2 8.2 6.3 11.4 12.8 4.6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      Klaro
    </Link>
  );
}
