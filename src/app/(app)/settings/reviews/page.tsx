import { redirect } from "next/navigation";

// Client Reviews moved to the Contacts Directory section; old links and notifications land here.
export default function MovedClientReviews() {
  redirect("/directory/reviews");
}
