import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/guards";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";

export default async function OnboardingPage() {
  const user = await requireUser();

  if (user.onboardedAt) {
    redirect("/pipeline");
  }

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <OnboardingWizard user={user} />
    </div>
  );
}
