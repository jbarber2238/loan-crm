"use client";

import { useRef, useState, useTransition } from "react";
import { unstable_rethrow as rethrowFrameworkSignals } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { completeOnboarding } from "@/server/actions/users";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmailSignatureEditor } from "@/components/settings/email-signature-editor";

type Step = "welcome" | "scheduling" | "profile" | "signature";

type WizardUser = {
  name?: string | null;
  image?: string | null;
  baseRole: "loan_officer" | "loan_officer_assistant" | "processor";
  schedulingLink: string | null;
  emailSignatureHtml: string | null;
};

// Scheduling links only mean anything for loan officers — the same
// condition the regular profile page already uses to show that field.
function stepsFor(user: WizardUser): Step[] {
  return ["welcome", ...(user.baseRole === "loan_officer" ? (["scheduling"] as const) : []), "profile", "signature"];
}

export function OnboardingWizard({ user }: { user: WizardUser }) {
  const steps = useRef(stepsFor(user)).current;
  const [stepIndex, setStepIndex] = useState(0);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const step = steps[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === steps.length - 1;

  function next() {
    if (step === "profile" && !nameInputRef.current?.value.trim()) {
      toast.error("Please enter your name before continuing.");
      nameInputRef.current?.focus();
      return;
    }
    setStepIndex((i) => Math.min(i + 1, steps.length - 1));
  }

  function back() {
    setStepIndex((i) => Math.max(i - 1, 0));
  }

  function finish() {
    if (!nameInputRef.current?.value.trim()) {
      setStepIndex(steps.indexOf("profile"));
      toast.error("Please enter your name before continuing.");
      nameInputRef.current?.focus();
      return;
    }
    const form = formRef.current;
    if (!form) return;
    const formData = new FormData(form);
    startTransition(async () => {
      try {
        await completeOnboarding(formData);
      } catch (err) {
        rethrowFrameworkSignals(err);
        toast.error(err instanceof Error ? err.message : "Something went wrong — try again.");
      }
    });
  }

  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle>Let&apos;s get you set up</CardTitle>
        <CardDescription>
          Step {stepIndex + 1} of {steps.length}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form ref={formRef}>
          <div className={step === "welcome" ? "space-y-2" : "hidden"}>
            <p className="text-sm text-muted-foreground">
              Just a couple of quick things before you dive in — should take under a minute.
            </p>
          </div>

          {steps.includes("scheduling") && (
            <div className={step === "scheduling" ? "space-y-1.5" : "hidden"}>
              <Label htmlFor="schedulingLink">Scheduling link (Calendly, etc.)</Label>
              <Input
                id="schedulingLink"
                name="schedulingLink"
                defaultValue={user.schedulingLink ?? ""}
                placeholder="https://calendly.com/you"
              />
              <p className="text-xs text-muted-foreground">
                Optional — used for the &ldquo;book a call&rdquo; email when sending term sheets to borrowers. You
                can skip this and add it later from Settings.
              </p>
            </div>
          )}

          <div className={step === "profile" ? "space-y-4" : "hidden"}>
            <div className="flex items-center gap-4">
              <Avatar className="size-16">
                <AvatarImage src={user.image ?? undefined} alt={user.name ?? ""} />
                <AvatarFallback className="text-lg">{user.name?.[0] ?? "?"}</AvatarFallback>
              </Avatar>
              <p className="text-xs text-muted-foreground">
                This photo comes from your Google account — update it there if you&apos;d like to change it.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="name">Your name</Label>
              <Input id="name" name="name" ref={nameInputRef} defaultValue={user.name ?? ""} />
              <p className="text-xs text-muted-foreground">Shown to borrowers and teammates throughout the CRM.</p>
            </div>
          </div>

          <div className={step === "signature" ? "space-y-1.5" : "hidden"}>
            <Label>Email signature</Label>
            <EmailSignatureEditor name="emailSignatureHtml" defaultValueHtml={user.emailSignatureHtml ?? ""} />
            <p className="text-xs text-muted-foreground">
              Appended to every email you send from the CRM — pricing requests, borrower updates, term sheets.
              Paste in a signature from Gmail or anywhere else, or write one here.
            </p>
          </div>
        </form>
      </CardContent>
      <CardFooter className="flex items-center justify-between">
        {isFirst ? <div /> : (
          <Button type="button" variant="ghost" onClick={back} disabled={isPending}>
            Back
          </Button>
        )}
        {isLast ? (
          <Button type="button" onClick={finish} disabled={isPending}>
            {isPending && <Loader2 className="size-4 animate-spin" />}
            Finish setup
          </Button>
        ) : (
          <Button type="button" onClick={next}>
            {step === "welcome" ? "Get started" : "Next"}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
