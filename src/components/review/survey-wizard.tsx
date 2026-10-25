"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Send } from "lucide-react";
import { submitClosingSurvey, type SurveyAnswers } from "@/server/actions/closing-survey";
import { isActionError } from "@/lib/action-result";
import {
  PRIVATE_FEEDBACK_PROMPT,
  PUBLIC_REVIEW_PROMPT,
  RECOMMEND_PROMPT,
  SCORE_QUESTIONS,
  type ScoreKey,
} from "@/lib/closing-survey";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScaleQuestion } from "@/components/review/score-scale";

const STEPS = ["Your experience", "Private feedback", "Your review", "One last question"] as const;

// About a minute: four quick scores, two optional notes, then the recommend question last.
export function SurveyWizard({
  token,
  defaultName,
  onSubmit,
}: {
  token: string;
  defaultName: string;
  /** Replaces the real submit (used only by the local walk-through mockup). */
  onSubmit?: (answers: SurveyAnswers) => void;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<SurveyAnswers>({
    scoreCommunication: null,
    scoreProcess: null,
    scoreSpeed: null,
    scoreTerms: null,
    scoreRecommend: null,
    privateFeedback: "",
    publicReview: "",
    reviewerName: defaultName,
    reviewPermission: false,
  });

  const set = <K extends keyof SurveyAnswers>(key: K, value: SurveyAnswers[K]) => setAnswers((a) => ({ ...a, [key]: value }));
  const scoresDone = SCORE_QUESTIONS.every((q) => answers[q.key as ScoreKey] !== null);
  const wroteReview = answers.publicReview.trim().length > 0;
  const canContinue = step === 0 ? scoresDone : step === 2 ? !wroteReview || answers.reviewPermission : true;

  function submit() {
    setError(null);
    if (onSubmit) {
      onSubmit(answers);
      return;
    }
    startTransition(async () => {
      const result = await submitClosingSurvey(token, answers);
      if (isActionError(result)) {
        setError(result.error);
        return;
      }
      router.refresh();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-baseline justify-between text-xs font-medium text-muted-foreground">
          <span>{STEPS[step]}</span>
          <span>
            Step {step + 1} of {STEPS.length}
          </span>
        </div>
        <div className="flex gap-1" aria-hidden="true">
          {STEPS.map((s, i) => (
            <span key={s} className={`h-1.5 flex-1 rounded-full ${i <= step ? "bp-fill bg-primary" : "bg-muted"}`} />
          ))}
        </div>
      </div>

      {step === 0 && (
        <div className="space-y-6">
          {SCORE_QUESTIONS.map((q) => (
            <ScaleQuestion
              key={q.key}
              label={q.label}
              prompt={q.prompt}
              value={answers[q.key as ScoreKey]}
              onChange={(v) => set(q.key as ScoreKey, v)}
              low="Poor"
              high="Excellent"
            />
          ))}
        </div>
      )}

      {step === 1 && (
        <div className="space-y-2">
          <Label htmlFor="private-feedback" className="text-sm font-semibold">
            Help us improve
          </Label>
          <p className="text-sm text-muted-foreground">{PRIVATE_FEEDBACK_PROMPT}</p>
          <Textarea
            id="private-feedback"
            rows={6}
            maxLength={4000}
            value={answers.privateFeedback}
            onChange={(e) => set("privateFeedback", e.target.value)}
            placeholder="Optional. Anything at all, big or small."
          />
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="public-review" className="text-sm font-semibold">
              Leave us a review
            </Label>
            <p className="text-sm text-muted-foreground">{PUBLIC_REVIEW_PROMPT} Optional, and it means a lot to us.</p>
            <Textarea
              id="public-review"
              rows={5}
              maxLength={4000}
              value={answers.publicReview}
              onChange={(e) => set("publicReview", e.target.value)}
              placeholder="What stood out? What would you tell another investor?"
            />
          </div>
          {wroteReview && (
            <div className="space-y-3 rounded-lg border bg-muted/40 p-3">
              <div className="space-y-1.5">
                <Label htmlFor="reviewer-name" className="text-xs">
                  How should we sign it?
                </Label>
                <Input
                  id="reviewer-name"
                  maxLength={80}
                  value={answers.reviewerName}
                  onChange={(e) => set("reviewerName", e.target.value)}
                />
              </div>
              <label className="flex cursor-pointer items-start gap-2.5 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 size-5 shrink-0 accent-primary"
                  checked={answers.reviewPermission}
                  onChange={(e) => set("reviewPermission", e.target.checked)}
                />
                <span>
                  I give Manna Lending permission to use my review, with the name above, in its marketing and on its
                  website.
                </span>
              </label>
            </div>
          )}
        </div>
      )}

      {step === 3 && (
        <ScaleQuestion
          label="One last question"
          prompt={RECOMMEND_PROMPT}
          value={answers.scoreRecommend}
          onChange={(v) => set("scoreRecommend", v)}
          low="Not likely"
          high="Extremely likely"
        />
      )}

      {error && <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}

      <div className="flex items-center justify-between gap-3">
        {step > 0 ? (
          <Button type="button" variant="ghost" className="h-11" disabled={pending} onClick={() => setStep(step - 1)}>
            <ArrowLeft className="size-4" />
            Back
          </Button>
        ) : (
          <span />
        )}
        {step < STEPS.length - 1 ? (
          <Button type="button" className="bp-primary h-11 min-w-32" disabled={!canContinue} onClick={() => setStep(step + 1)}>
            {(step === 1 && !answers.privateFeedback.trim()) || (step === 2 && !wroteReview) ? "Skip" : "Continue"}
            <ArrowRight className="size-4" />
          </Button>
        ) : (
          <Button type="button" className="bp-primary h-11 min-w-32" disabled={pending || answers.scoreRecommend === null} onClick={submit}>
            <Send className="size-4" />
            {pending ? "Sending…" : "Submit"}
          </Button>
        )}
      </div>
    </div>
  );
}
