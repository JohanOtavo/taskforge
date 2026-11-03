"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { restoreIssueAction } from "@/app/(app)/actions";
import { Button } from "@/components/ui/button";

export function RestoreIssueButton({ issueId }: { issueId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onRestore() {
    setError(null);
    startTransition(async () => {
      const result = await restoreIssueAction(issueId);
      if (!result.ok) setError(result.message);
      else router.refresh();
    });
  }

  return (
    <span className="inline-flex items-center gap-2">
      {error && (
        <span className="text-xs text-danger" role="alert">
          {error}
        </span>
      )}
      <Button variant="secondary" size="sm" disabled={pending} onClick={onRestore}>
        {pending ? "Restaurando..." : "Restaurar"}
      </Button>
    </span>
  );
}
