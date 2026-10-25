"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Globe, Send, BellOff, Bell } from "lucide-react";
import { setReviewPublished, sendSurveyReminderNow, setSurveyReminders } from "@/server/actions/closing-survey";
import { isActionError } from "@/lib/action-result";
import { Button } from "@/components/ui/button";

/** The manual switch: a review only appears on the website after someone clicks Publish here. */
export function PublishReviewButton({ surveyId, published, allowed }: { surveyId: string; published: boolean; allowed: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant={published ? "outline" : "default"}
      disabled={pending || (!published && !allowed)}
      title={!allowed && !published ? "This client didn't give permission to share their review" : undefined}
      onClick={() =>
        startTransition(async () => {
          const result = await setReviewPublished(surveyId, !published);
          if (isActionError(result)) {
            toast.error(result.error);
            return;
          }
          toast.success(published ? "Removed from the website" : "Published to the website");
          router.refresh();
        })
      }
    >
      <Globe className="size-4" />
      {pending ? "Saving…" : published ? "Remove from website" : "Publish to website"}
    </Button>
  );
}

export function SurveyRowActions({ surveyId, status, requestsSent, total }: { surveyId: string; status: string; requestsSent: number; total: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  if (status === "completed") return null;

  function run(action: () => Promise<unknown>, done: string) {
    startTransition(async () => {
      const result = await action();
      if (isActionError(result)) {
        toast.error(result.error);
        return;
      }
      toast.success(done);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      {requestsSent < total && status !== "stopped" && (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => sendSurveyReminderNow(surveyId), "Sent")}>
          <Send className="size-4" />
          {requestsSent === 0 ? "Send the email now" : "Send a reminder now"}
        </Button>
      )}
      {status === "stopped" ? (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => setSurveyReminders(surveyId, true), "Reminders back on")}>
          <Bell className="size-4" />
          Turn reminders back on
        </Button>
      ) : (
        status === "pending" && (
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => setSurveyReminders(surveyId, false), "Reminders stopped")}>
            <BellOff className="size-4" />
            Stop reminders
          </Button>
        )
      )}
    </div>
  );
}
