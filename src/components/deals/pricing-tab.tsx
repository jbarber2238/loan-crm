"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  deletePricingRequest,
  sendAllPricingRequests,
  sendPricingRequest,
  updateDealPricingNote,
  updatePricingRequest,
} from "@/server/actions/pricing";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/submit-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { PriceLoanDialog } from "@/components/deals/price-loan-dialog";
import { ReplyImportView } from "@/components/deals/reply-import-view";
import { QuickPricerCard } from "@/components/deals/quick-pricer-card";
import { PricingAutoCheckReplies } from "@/components/deals/pricing-auto-check-replies";
import { CollapsibleSection } from "@/components/email-templates/collapsible-section";
import { RecipientLine } from "@/components/emails/recipient-line";
import { SignaturePreview } from "@/components/emails/signature-preview";
import { HtmlBodyEditor } from "@/components/emails/html-body-editor";
import type { RecipientCandidate } from "@/lib/email-recipients";

interface LenderWithReps {
  id: string;
  name: string;
  reps: { id: string; name: string; email: string }[];
}

interface PricingRequest {
  id: string;
  emailSubject: string;
  emailBody: string;
  emailCc: string | null;
  isQuickPricer: boolean;
  status: "draft" | "sent";
  sentAt: Date | null;
  gmailThreadId: string | null;
  lenderId: string;
  lender: { name: string; quickPricerUrl: string | null };
  lenderRep: { name: string; email: string };
  replyCheckedAt: Date | null;
  replyFrom: string | null;
  replyReceivedAt: Date | null;
  replyBodyText: string | null;
  replyAttachments: { id: string; fileName: string; mimeType: string }[];
}

interface ProductOption {
  id: string;
  name: string;
  category: string;
  lenderId: string;
}

function hasReply(request: PricingRequest) {
  return Boolean(request.replyBodyText || request.replyAttachments.length);
}

function PricingRequestCard({
  dealId,
  request,
  signatureHtml,
  candidates,
  loanCategory,
  products,
  purchasePrice,
  estimatedAsIsValue,
}: {
  dealId: string;
  request: PricingRequest;
  signatureHtml: string;
  candidates: RecipientCandidate[];
  loanCategory: string;
  products: ProductOption[];
  purchasePrice: number | null;
  estimatedAsIsValue: number | null;
}) {
  const router = useRouter();
  const bodyRef = useRef<HTMLDivElement>(null);
  const [subject, setSubject] = useState(request.emailSubject);
  const [cc, setCc] = useState(request.emailCc ?? "");
  const [saving, startSave] = useTransition();
  const send = sendPricingRequest.bind(null, dealId, request.id);
  const deleteRequest = deletePricingRequest.bind(null, dealId, request.id);

  function handleSaveDraft() {
    const formData = new FormData();
    formData.set("emailSubject", subject);
    formData.set("emailCc", cc);
    formData.set("emailBody", bodyRef.current?.innerHTML ?? request.emailBody);
    startSave(async () => {
      try {
        await updatePricingRequest(dealId, request.id, formData);
        toast.success("Draft saved");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't save this draft.");
      }
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">{request.lenderRep.name}</CardTitle>
        <Badge variant={request.status === "sent" ? "default" : "secondary"}>
          {request.status === "sent" ? "Sent" : "Draft"}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>To</Label>
            <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm">{request.lenderRep.email}</p>
          </div>
          <RecipientLine
            id={`cc-${request.id}`}
            label="Cc"
            value={cc}
            onChange={setCc}
            candidates={candidates}
          />
        </div>
        <Input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          disabled={request.status === "sent"}
        />
        {request.status === "draft" ? (
          <div className="space-y-1.5">
            <Label>Email preview — click any text below to edit it</Label>
            <HtmlBodyEditor html={request.emailBody} bodyRef={bodyRef} />
          </div>
        ) : (
          <div
            className="rounded-lg border bg-muted/20 p-4 text-sm [&_table]:my-2"
            dangerouslySetInnerHTML={{ __html: request.emailBody }}
          />
        )}
        {request.status === "draft" && (
          <Button type="button" variant="secondary" disabled={saving} onClick={handleSaveDraft}>
            {saving ? "Saving…" : "Save draft"}
          </Button>
        )}
        {request.status === "draft" && <SignaturePreview html={signatureHtml} />}
        {request.status === "draft" ? (
          <div className="flex gap-2">
            <ActionForm action={send} successMessage="Pricing request sent">
              <SubmitButton>Send</SubmitButton>
            </ActionForm>
            <ActionForm
              action={deleteRequest}
              successMessage="Draft deleted"
              confirmMessage="Delete this draft pricing request?"
            >
              <SubmitButton variant="ghost">Delete draft</SubmitButton>
            </ActionForm>
          </div>
        ) : (
          <div className="w-full space-y-3">
            <p className="text-xs text-muted-foreground">Sent {request.sentAt?.toLocaleString()}</p>
            <ReplyImportView
              dealId={dealId}
              pricingRequestId={request.id}
              lenderId={request.lenderId}
              loanCategory={loanCategory}
              replyCheckedAt={request.replyCheckedAt}
              replyFrom={request.replyFrom}
              replyReceivedAt={request.replyReceivedAt}
              replyBodyText={request.replyBodyText}
              attachments={request.replyAttachments}
              products={products}
              purchasePrice={purchasePrice}
              estimatedAsIsValue={estimatedAsIsValue}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function groupRequestsByLender(requests: PricingRequest[]) {
  const groups: { lenderId: string; lenderName: string; requests: PricingRequest[] }[] = [];
  const indexByLenderId = new Map<string, number>();
  for (const request of requests) {
    const existingIndex = indexByLenderId.get(request.lenderId);
    if (existingIndex !== undefined) {
      groups[existingIndex].requests.push(request);
    } else {
      indexByLenderId.set(request.lenderId, groups.length);
      groups.push({ lenderId: request.lenderId, lenderName: request.lender.name, requests: [request] });
    }
  }
  return groups;
}

export function PricingTab({
  dealId,
  lenders,
  requests,
  pricingNoteToRep,
  loanCategory,
  signatureHtml,
  candidates,
  products,
  purchasePrice = null,
  estimatedAsIsValue = null,
}: {
  dealId: string;
  lenders: LenderWithReps[];
  requests: PricingRequest[];
  pricingNoteToRep: string | null;
  loanCategory: string;
  signatureHtml: string;
  candidates: RecipientCandidate[];
  products: ProductOption[];
  purchasePrice?: number | null;
  estimatedAsIsValue?: number | null;
}) {
  const updateNote = updateDealPricingNote.bind(null, dealId);
  const sendAll = sendAllPricingRequests.bind(null, dealId);
  const draftCount = requests.filter((r) => r.status === "draft").length;
  const pendingReplyCheckIds = requests
    .filter((r) => r.status === "sent" && r.gmailThreadId && !hasReply(r))
    .map((r) => r.id);

  // null = no override yet, respect each group's own defaultOpen (a draft or
  // a fresh reply). Forcing all open/closed remounts every section (via the
  // key below) rather than lifting full state, so a reply arriving later
  // still auto-opens its group once the override is cleared again by the
  // next click — same "remount to re-run defaultOpen" trick each group
  // already used individually, just triggered for all of them at once.
  const [forceOpen, setForceOpen] = useState<boolean | null>(null);
  const [generation, setGeneration] = useState(0);
  const groups = groupRequestsByLender(requests);

  return (
    <div className="space-y-4">
      <PricingAutoCheckReplies dealId={dealId} pendingRequestIds={pendingReplyCheckIds} />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Note to Rep</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionForm action={updateNote} successMessage="Note saved" className="space-y-3">
            <p className="text-xs text-muted-foreground">
              A standing note for lender reps — a unique situation, something to flag up front.
              Included automatically on every new pricing email drafted below.
            </p>
            <Textarea name="pricingNoteToRep" rows={3} defaultValue={pricingNoteToRep ?? ""} />
            <SubmitButton size="sm" variant="outline">
              Save note
            </SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        {draftCount >= 2 && (
          <ActionForm
            action={sendAll}
            successMessage="Pricing emails sent"
            confirmMessage={`Send all ${draftCount} draft pricing emails now?`}
          >
            <SubmitButton variant="secondary">Send All Drafts ({draftCount})</SubmitButton>
          </ActionForm>
        )}
        <PriceLoanDialog dealId={dealId} lenders={lenders} />
      </div>

      {groups.length > 0 && (
        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setForceOpen((v) => (v === true ? false : true));
              setGeneration((g) => g + 1);
            }}
          >
            {forceOpen === true ? "Collapse all" : "Expand all"}
          </Button>
        </div>
      )}

      <div className="space-y-3">
        {groups.map((group) => {
          const hasDraft = group.requests.some((r) => r.status === "draft");
          const groupHasReply = group.requests.some(hasReply);
          const reps = Array.from(new Set(group.requests.map((r) => r.lenderRep.name)));
          const lastSent = group.requests
            .map((r) => r.sentAt)
            .filter((d): d is Date => d !== null)
            .sort((a, b) => b.getTime() - a.getTime())[0];
          const description =
            group.requests.length === 1
              ? `${reps[0]}${lastSent ? ` · Sent ${lastSent.toLocaleString()}` : " · Draft"}`
              : `${reps.join(", ")} · ${group.requests.length} outreaches${
                  lastSent ? ` · Last sent ${lastSent.toLocaleString()}` : ""
                }`;
          const autoDefaultOpen = hasDraft || groupHasReply;
          const defaultOpen = forceOpen !== null ? forceOpen : autoDefaultOpen;
          const keySignature = forceOpen !== null ? `forced-${generation}-${forceOpen}` : `auto-${autoDefaultOpen}`;

          return (
            // Key includes a signature so a reply arriving mid-session (via the
            // auto-check-and-refresh cycle), or an Expand/Collapse All click,
            // remounts this section with a fresh defaultOpen — CollapsibleSection
            // otherwise keeps its own open/closed state across refreshes.
            <CollapsibleSection
              key={`${group.lenderId}:${keySignature}`}
              title={group.lenderName}
              description={description}
              defaultOpen={defaultOpen}
            >
              <div className="space-y-3">
                {group.requests.map((request) => {
                  if (request.isQuickPricer && request.lender.quickPricerUrl) {
                    return (
                      <QuickPricerCard
                        key={request.id}
                        dealId={dealId}
                        lenderId={request.lenderId}
                        lenderName={request.lender.name}
                        quickPricerUrl={request.lender.quickPricerUrl}
                        loanCategory={loanCategory}
                        products={products}
                        purchasePrice={purchasePrice}
                        estimatedAsIsValue={estimatedAsIsValue}
                      />
                    );
                  }
                  return (
                    <PricingRequestCard
                      key={request.id}
                      dealId={dealId}
                      request={request}
                      signatureHtml={signatureHtml}
                      candidates={candidates}
                      loanCategory={loanCategory}
                      products={products}
                      purchasePrice={purchasePrice}
                      estimatedAsIsValue={estimatedAsIsValue}
                    />
                  );
                })}
              </div>
            </CollapsibleSection>
          );
        })}
        {requests.length === 0 && (
          <p className="text-sm text-muted-foreground">No pricing requests yet.</p>
        )}
      </div>
    </div>
  );
}
