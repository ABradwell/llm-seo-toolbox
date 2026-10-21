"use client";

import { ArrowRight, Globe2, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { UrlInputError, normalizeUserUrl } from "@/lib/url";
import { cn } from "@/lib/utils";

export interface ScanFormProps {
  size?: "hero" | "compact" | "default";
  defaultValue?: string;
  className?: string;
  buttonLabel?: string;
  placeholder?: string;
}

export function ScanForm({
  size = "default",
  defaultValue = "",
  className,
  buttonLabel = "Run audit",
  placeholder = "example.com or docs.example.com/start",
}: ScanFormProps) {
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
          "group flex w-full items-center gap-2 border border-line bg-panel/85 backdrop-blur transition-colors focus-within:border-acid/50",
          hero ? "rounded-2xl p-2.5" : compact ? "rounded-xl p-1.5" : "rounded-xl p-2",
        )}
      >
        <Globe2
          className={cn(
            "ml-1.5 shrink-0 text-muted transition-colors group-focus-within:text-acid",
            hero ? "size-5" : "size-4",
          )}
          aria-hidden="true"
        />
        <label htmlFor={inputId} className="sr-only">
          Domain to audit
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
            "min-w-0 flex-1 bg-transparent placeholder:text-muted/60 focus:outline-none",
            hero ? "h-11 px-1 text-base" : compact ? "h-8 px-1 text-sm" : "h-9 px-1 text-sm",
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
          <span className={hero ? "" : "hidden sm:inline"}>{buttonLabel}</span>
        </Button>
      </div>
      {error ? (
        <p className="mt-2 pl-1 font-mono text-xs text-fail" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
