import { AuditError, analyzeSite } from "@/lib/analyzer";
import { rateLimit } from "@/lib/rate-limit";
import { SITE_TYPES, isSiteType } from "@/lib/site-types";
import type { AuditApiError, SiteType } from "@/types/audit";

export const maxDuration = 60;

function errorResponse(code: string, message: string, status: number, hint?: string) {
  const body: AuditApiError = { error: { code, message, ...(hint ? { hint } : {}) } };
  return Response.json(body, { status });
}

export async function GET(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for") ?? "";
  const clientKey =
    forwardedFor.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";

  const limit = rateLimit(clientKey);
  if (!limit.ok) {
    return Response.json(
      {
        error: {
          code: "rate_limited",
          message: "Too many audits from this network. Give it a minute and try again.",
        },
      } satisfies AuditApiError,
      {
        status: 429,
        headers: { "retry-after": String(limit.retryAfterSeconds) },
      },
    );
  }

  const { searchParams } = new URL(request.url);
  const target = searchParams.get("url");

  if (!target) {
    return errorResponse(
      "missing_url",
      "Provide a url query parameter, for example ?url=example.com.",
      400,
    );
  }

  if (target.length > 2_048) {
    return errorResponse("invalid_url", "That URL is too long to audit.", 400);
  }

  const typeParam = searchParams.get("type")?.trim().toLowerCase() ?? null;
  let siteType: SiteType | null = null;

  if (typeParam) {
    if (!isSiteType(typeParam)) {
      return errorResponse(
        "invalid_site_type",
        `Unknown site type “${typeParam}”.`,
        400,
        `Use one of: ${SITE_TYPES.map((type) => type.id).join(", ")}. Omit the parameter to classify automatically.`,
      );
    }
    siteType = typeParam;
  }

  try {
    const audit = await analyzeSite(target, { siteType });
    return Response.json(audit, {
      headers: {
        "cache-control": "no-store",
        "x-audit-cache": audit.meta.cached ? "hit" : "miss",
      },
    });
  } catch (error) {
    if (error instanceof AuditError) {
      return errorResponse(error.code, error.message, error.status, error.hint);
    }

    console.error("[api/audit] unexpected failure", error);
    return errorResponse("internal_error", "The audit failed unexpectedly. Try again.", 500);
  }
}
