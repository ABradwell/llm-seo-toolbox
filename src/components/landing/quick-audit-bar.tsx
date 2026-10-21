"use client";

import { ArrowRight, Loader2, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { UrlInputError, normalizeUserUrl } from "@/lib/url";
import { cn } from "@/lib/utils";

export interface QuickAuditBarProps {
  size?: "hero" | "compact" | "default";
  defaultValue?: string;
  className?: string;
  buttonLabel?: string;
  placeholder?: string;
}

/** Dense URL input shared by the landing hero and the workspace header. */
export function QuickAuditBar({
  size = "default",
  defaultValue = "",
  className,
  buttonLabel = "Run audit",
  placeholder = "https://example.com",
}: QuickAuditBarProps) {
  const router = useRouter();
  const inputId = useId();
  const [value, setValue] = useState(defaultValue);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const hero = size === "hero";
  const compact = size === "compact";

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    let normalized: string;
    try {
      normalized = normalizeUserUrl(value);
    } catch (cause) {
      setError(cause instanceof UrlInputError ? cause.message : "Enter a valid domain or URL.");
      return;
    }

    setError(null);
    startTransition(() => {
      router.push(`/app?url=${encodeURIComponent(normalized)}`);
    });
  }

  return (
    <form onSubmit={submit} className={cn("w-full", className)} noValidate>
      <div
        className={cn(
          "flex w-full items-center gap-1 rounded-[4px] border border-line bg-panel transition-colors focus-within:border-accent/60 focus-within:ring-1 focus-within:ring-accent/30",
          hero ? "p-1.5" : "p-1",
        )}
      >
        <Search
          className={cn("ml-1.5 shrink-0 text-muted", hero ? "size-4" : "size-3.5")}
          aria-hidden="true"
        />
        <label htmlFor={inputId} className="sr-only">
          Domain or URL to audit
        </label>
        <input
          id={inputId}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            if (error) setError(null);
          }}
          placeholder={placeholder}
          inputMode="url"
          autoComplete="url"
          spellCheck={false}
          className={cn(
            "min-w-0 flex-1 bg-transparent px-1 font-mono placeholder:text-muted/50 focus:outline-none focus-visible:outline-none",
            hero ? "h-10 text-sm" : compact ? "h-7 text-xs" : "h-8 text-sm",
          )}
        />
        <Button
          type="submit"
          disabled={isPending}
          size={hero ? "lg" : compact ? "sm" : "default"}
          className="shrink-0"
        >
          {isPending ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : (
            <ArrowRight aria-hidden="true" />
          )}
          <span className={compact ? "sr-only" : ""}>{buttonLabel}</span>
        </Button>
      </div>
      {error ? (
        <p className="mt-1.5 pl-1 font-mono text-[11px] text-fail" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
