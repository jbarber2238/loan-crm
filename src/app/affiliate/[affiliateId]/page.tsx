import { redirect } from "next/navigation";

// The old affiliate signup page. Partners now sign up and sign in through the
// partner portal; old emailed links land here and are sent on.
export default function LegacyAffiliatePage() {
  redirect("/partner/sign-in");
}
