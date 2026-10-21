import type { Metadata } from "next";
import { Suspense } from "react";

import { Workspace, WorkspaceSkeleton } from "@/components/tool/workspace";

export const metadata: Metadata = {
  title: "Audit workspace",
  description:
    "Score any site against four LLM-readiness pillars, generate /llms.txt, and see the page the way a scraper does.",
};

export default function AppPage() {
  return (
    <Suspense fallback={<WorkspaceSkeleton />}>
      <Workspace />
    </Suspense>
  );
}
