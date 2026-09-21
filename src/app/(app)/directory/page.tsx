import { getAllContacts } from "@/server/actions/messages";
import { ContactDirectoryView } from "@/components/inbox/contact-directory-view";

export default async function DirectoryPage() {
  const contacts = await getAllContacts();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Contacts Directory</h1>
        <p className="text-sm text-muted-foreground">
          Every contact this app has a phone number for — borrowers, lender reps, insurance and title agents,
          referral partners. Consent only applies to borrowers, from the intake form&apos;s own consent checkbox.
        </p>
      </div>
      <ContactDirectoryView contacts={contacts} />
    </div>
  );
}
