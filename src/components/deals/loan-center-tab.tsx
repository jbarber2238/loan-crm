import { DocumentsTab } from "@/components/deals/documents-tab";
import type { DealDocumentRow } from "@/server/actions/client-need-documents";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RolesTab } from "@/components/deals/roles-tab";
import { ClientNeedsTab, type ClientNeed } from "@/components/deals/client-needs-tab";
import { ConditionsTab, type DealCondition } from "@/components/deals/conditions-tab";
import { NotesTab } from "@/components/deals/notes-tab";
import { KeyDateTracker } from "@/components/deals/key-date-tracker";
import { KeyDatesForm } from "@/components/deals/key-dates-form";
import type { KeyDateEvent } from "@/lib/key-date-tracker";
import type { DealCatalogItem } from "@/components/deals/add-client-need-to-deal-dialog";
import { EmailLogTab } from "@/components/deals/email-log-tab";
import type { EmailLogEntry } from "@/server/actions/email-log";

interface UserOption {
  id: string;
  name: string | null;
}

interface Follower {
  id: string;
  name: string;
  email: string;
  phone: string | null;
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
  dealStage,
  creditPullDate,
  clearToCloseDate,
  closedDate,
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
  emailLog,
  initialTab,
  teamChat,
  documents,
  propertyLabel,
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
  dealStage: string;
  creditPullDate: Date | null;
  clearToCloseDate: Date | null;
  closedDate: Date | null;
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
  emailLog: EmailLogEntry[];
  initialTab?: string;
  /** Server-rendered internal team chat for this deal. */
  teamChat: React.ReactNode;
  documents: { accepted: DealDocumentRow[]; rejected: DealDocumentRow[]; unused: DealDocumentRow[] };
  propertyLabel: string;
}) {
  return (
    <div className="space-y-4">
      <Tabs defaultValue={initialTab ?? "client-needs"}>
        <TabsList>
          <TabsTrigger value="client-needs">Client Needs</TabsTrigger>
          <TabsTrigger value="conditions">Conditions</TabsTrigger>
          <TabsTrigger value="roles">Roles and Key Contacts</TabsTrigger>
          <TabsTrigger value="key-dates">Key Dates</TabsTrigger>
          <TabsTrigger value="email-log">Email Log</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="team-chat">Team Chat</TabsTrigger>
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
          <KeyDatesForm
            dealId={dealId}
            dealStage={dealStage}
            creditPullDate={creditPullDate}
            clearToCloseDate={clearToCloseDate}
            closedDate={closedDate}
            driveLink={driveLink}
          />
        </TabsContent>

        <TabsContent value="email-log">
          <EmailLogTab entries={emailLog} />
        </TabsContent>

        <TabsContent value="notes">
          <NotesTab dealId={dealId} notes={notes} />
        </TabsContent>

        <TabsContent value="documents">
          <DocumentsTab
            dealId={dealId}
            accepted={documents.accepted}
            rejected={documents.rejected}
            unused={documents.unused}
            propertyLabel={propertyLabel}
            needs={clientNeeds.map((n) => ({
              id: n.id,
              itemName: n.itemName,
              needType: n.needType,
              status: n.status,
              description: n.description,
            }))}
            catalog={clientNeedsCatalog}
          />
        </TabsContent>

        <TabsContent value="team-chat">{teamChat}</TabsContent>
      </Tabs>
    </div>
  );
}
