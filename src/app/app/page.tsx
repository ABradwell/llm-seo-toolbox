import type { Metadata } from "next";
import { Suspense } from "react";

import { Workspace, WorkspaceSkeleton } from "@/components/workspace/workspace";

export const metadata: Metadata = {
  title: "Audit workspace",
  description:
    "Run the V3 audit pipeline: site classification, llms.txt structure, RFC 9309 crawler access, static HTML signal-to-noise and profile-aware schema.org metadata.",
};

export default function AppPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
          <WorkspaceSkeleton />
        </div>
      }
    >
      <Workspace />
    </Suspense>
  );
}
