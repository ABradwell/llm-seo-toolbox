import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export {
  formatBytes,
  formatNumber,
  normalizeWhitespace,
  truncate,
} from "@llm-seo-toolbox/core/format";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
