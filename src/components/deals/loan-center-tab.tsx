import { updateDealDates } from "@/server/actions/deals";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/submit-button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RolesTab } from "@/components/deals/roles-tab";
import { ClientNeedsTab, type ClientNeed } from "@/components/deals/client-needs-tab";
import { ConditionsTab, type DealCondition } from "@/components/deals/conditions-tab";
import { NotesTab } from "@/components/deals/notes-tab";
import { KeyDateTracker } from "@/components/deals/key-date-tracker";
import type { KeyDateEvent } from "@/lib/key-date-tracker";
import type { DealCatalogItem } from "@/components/deals/add-client-need-to-deal-dialog";

function toDateInputValue(date: Date | null) {
  if (!date) return "";
  return date.toISOString().slice(0, 10);
}

interface UserOption {
  id: string;
  name: string | null;
}

interface Follower {
  id: string;
  name: string;
  email: string;
  roleLabel: string | null;
}


interface Note {
  id: string;
  body: string;
  source: "user" | "ai" | "system";
  resolved: boolean;
  createdAt: Date;
  author?: { name: string | null } | null;
  canDelete: boolean;
}

function OtherDatesSection({
  dealId,
  creditPullDate,
  driveLink,
}: {
  dealId: string;
  creditPullDate: Date | null;
  driveLink: string | null;
}) {
  const updateDates = updateDealDates.bind(null, dealId);

  return (
    <Card>
      <CardContent className="pt-6">
        <ActionForm action={updateDates} successMessage="Saved" className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="creditPullDate">Credit pulled</Label>
            <Input
              id="creditPullDate"
              name="creditPullDate"
              type="date"
              defaultValue={toDateInputValue(creditPullDate)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="driveLink">Google Drive link</Label>
            <Input id="driveLink" name="driveLink" defaultValue={driveLink ?? ""} />
          </div>
          <div className="md:col-span-2">
            <SubmitButton>Save</SubmitButton>
          </div>
        </ActionForm>
      </CardContent>
    </Card>
  );
}

export function LoanCenterTab({
  dealId,
  loanCategory,
  assignedLoanOfficerId,
  assignedProcessorId,
  assignedAssistantId,
  loanOfficers,
  processors,
  assistants,
  followers,
  clientNeeds,
  clientNeedsCatalog,
  loanCategoryProducts,
  allProducts,
  currentProductId,
  hasBorrowerEmail,
  remindersPaused,
  reminderIntervalHours,
  hasAcceptedProduct,
  conditions,
  notes,
  creditPullDate,
  driveLink,
  titleCompanyAgentName,
  titleCompanyName,
  titleAgentEmail,
  titleAgentPhone,
  insuranceAgency,
  insuranceAgentName,
  insuranceAgentEmail,
  insuranceAgentPhone,
  insuranceContactNotes,
  interiorAccessContactRelationship,
  interiorAccessContactName,
  interiorAccessContactEmail,
  interiorAccessContactPhone,
  interiorAccessLockBoxInfo,
  appraisalNotes,
  insuranceNotes,
  titleNotes,
  keyDateEvents,
  appraisalDocumentFileName,
}: {
  dealId: string;
  loanCategory: string;
  assignedLoanOfficerId: string;
  assignedProcessorId: string | null;
  assignedAssistantId: string | null;
  loanOfficers: UserOption[];
  processors: UserOption[];
  assistants: UserOption[];
  followers: Follower[];
  clientNeeds: ClientNeed[];
  clientNeedsCatalog: DealCatalogItem[];
  loanCategoryProducts: { id: string; label: string }[];
  allProducts: { id: string; label: string }[];
  currentProductId: string | null;
  hasBorrowerEmail: boolean;
  remindersPaused: boolean;
  reminderIntervalHours: number;
  hasAcceptedProduct: boolean;
  conditions: DealCondition[];
  notes: Note[];
  creditPullDate: Date | null;
  driveLink: string | null;
  titleCompanyAgentName: string | null;
  titleCompanyName: string | null;
  titleAgentEmail: string | null;
  titleAgentPhone: string | null;
  insuranceAgency: string | null;
  insuranceAgentName: string | null;
  insuranceAgentEmail: string | null;
  insuranceAgentPhone: string | null;
  insuranceContactNotes: string | null;
  interiorAccessContactRelationship: string | null;
  interiorAccessContactName: string | null;
  interiorAccessContactEmail: string | null;
  interiorAccessContactPhone: string | null;
  interiorAccessLockBoxInfo: string | null;
  appraisalNotes: string | null;
  insuranceNotes: string | null;
  titleNotes: string | null;
  keyDateEvents: KeyDateEvent[];
  appraisalDocumentFileName: string | null;
}) {
  return (
    <div className="space-y-4">
      <Tabs defaultValue="client-needs">
        <TabsList>
          <TabsTrigger value="client-needs">Client Needs</TabsTrigger>
          <TabsTrigger value="conditions">Conditions</TabsTrigger>
          <TabsTrigger value="roles">Roles and Key Contacts</TabsTrigger>
          <TabsTrigger value="key-dates">Key Dates</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
        </TabsList>

        <TabsContent value="client-needs">
          <ClientNeedsTab
            dealId={dealId}
            needs={clientNeeds}
            catalog={clientNeedsCatalog}
            loanCategoryProducts={loanCategoryProducts}
            allProducts={allProducts}
            currentProductId={currentProductId}
            hasBorrowerEmail={hasBorrowerEmail}
            remindersPaused={remindersPaused}
            reminderIntervalHours={reminderIntervalHours}
            hasAcceptedProduct={hasAcceptedProduct}
          />
        </TabsContent>

        <TabsContent value="conditions">
          <ConditionsTab dealId={dealId} conditions={conditions} />
        </TabsContent>

        <TabsContent value="roles">
          <RolesTab
            dealId={dealId}
            assignedLoanOfficerId={assignedLoanOfficerId}
            assignedProcessorId={assignedProcessorId}
            assignedAssistantId={assignedAssistantId}
            loanOfficers={loanOfficers}
            processors={processors}
            assistants={assistants}
            followers={followers}
            titleCompanyAgentName={titleCompanyAgentName}
            titleCompanyName={titleCompanyName}
            titleAgentEmail={titleAgentEmail}
            titleAgentPhone={titleAgentPhone}
            insuranceAgency={insuranceAgency}
            insuranceAgentName={insuranceAgentName}
            insuranceAgentEmail={insuranceAgentEmail}
            insuranceAgentPhone={insuranceAgentPhone}
            insuranceContactNotes={insuranceContactNotes}
            interiorAccessContactRelationship={interiorAccessContactRelationship}
            interiorAccessContactName={interiorAccessContactName}
            interiorAccessContactEmail={interiorAccessContactEmail}
            interiorAccessContactPhone={interiorAccessContactPhone}
            interiorAccessLockBoxInfo={interiorAccessLockBoxInfo}
          />
        </TabsContent>

        <TabsContent value="key-dates" className="space-y-4">
          <KeyDateTracker
            dealId={dealId}
            loanCategory={loanCategory}
            events={keyDateEvents}
            appraisalNotes={appraisalNotes}
            insuranceNotes={insuranceNotes}
            titleNotes={titleNotes}
            insuranceEmail={insuranceAgentEmail}
            titleEmail={titleAgentEmail}
            appraisalDocumentFileName={appraisalDocumentFileName}
          />
          <OtherDatesSection dealId={dealId} creditPullDate={creditPullDate} driveLink={driveLink} />
        </TabsContent>

        <TabsContent value="notes">
          <NotesTab dealId={dealId} notes={notes} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
