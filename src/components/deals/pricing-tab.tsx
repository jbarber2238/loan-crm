"use client";

import { useState } from "react";
import {
  deletePricingRequest,
  sendAllPricingRequests,
  sendPricingRequest,
  updateDealPricingNote,
  updatePricingRequest,
} from "@/server/actions/pricing";
import { Button } from "@/components/ui/button";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { PriceLoanDialog } from "@/components/deals/price-loan-dialog";
import { ReplyImportView } from "@/components/deals/reply-import-view";
import { PricingAutoCheckReplies } from "@/components/deals/pricing-auto-check-replies";
import { CollapsibleSection } from "@/components/email-templates/collapsible-section";

interface LenderWithReps {
  id: string;
  name: string;
  reps: { id: string; name: string; email: string }[];
}

interface PricingRequest {
  id: string;
  emailSubject: string;
  emailBody: string;
  status: "draft" | "sent";
  sentAt: Date | null;
  gmailThreadId: string | null;
  lenderId: string;
  lender: { name: string };
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
  products,
}: {
  dealId: string;
  lenders: LenderWithReps[];
  requests: PricingRequest[];
  pricingNoteToRep: string | null;
  loanCategory: string;
  products: ProductOption[];
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
          <form action={updateNote} className="space-y-3">
            <p className="text-xs text-muted-foreground">
              A standing note for lender reps — a unique situation, something to flag up front.
              Included automatically on every new pricing email drafted below.
            </p>
            <Textarea name="pricingNoteToRep" rows={3} defaultValue={pricingNoteToRep ?? ""} />
            <Button type="submit" size="sm" variant="outline">
              Save note
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        {draftCount >= 2 && (
          <form action={sendAll}>
            <ConfirmSubmitButton
              type="submit"
              variant="secondary"
              confirmMessage={`Send all ${draftCount} draft pricing emails now?`}
            >
              Send All Drafts ({draftCount})
            </ConfirmSubmitButton>
          </form>
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
                  const updateRequest = updatePricingRequest.bind(null, dealId, request.id);
                  const send = sendPricingRequest.bind(null, dealId, request.id);
                  const deleteRequest = deletePricingRequest.bind(null, dealId, request.id);
                  return (
                    <Card key={request.id}>
                      <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle className="text-base">{request.lenderRep.name}</CardTitle>
                        <Badge variant={request.status === "sent" ? "default" : "secondary"}>
                          {request.status === "sent" ? "Sent" : "Draft"}
                        </Badge>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <form action={updateRequest} className="space-y-3">
                          <Input
                            name="emailSubject"
                            defaultValue={request.emailSubject}
                            disabled={request.status === "sent"}
                          />
                          <Textarea
                            name="emailBody"
                            rows={8}
                            defaultValue={request.emailBody}
                            disabled={request.status === "sent"}
                          />
                          {request.status === "draft" && (
                            <Button type="submit" variant="secondary">
                              Save draft
                            </Button>
                          )}
                        </form>
                        {request.status === "draft" ? (
                          <div className="flex gap-2">
                            <form action={send}>
                              <Button type="submit">Send</Button>
                            </form>
                            <form action={deleteRequest}>
                              <ConfirmSubmitButton
                                type="submit"
                                variant="ghost"
                                confirmMessage="Delete this draft pricing request?"
                              >
                                Delete draft
                              </ConfirmSubmitButton>
                            </form>
                          </div>
                        ) : (
                          <div className="w-full space-y-3">
                            <p className="text-xs text-muted-foreground">
                              Sent {request.sentAt?.toLocaleString()}
                            </p>
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
                            />
                          </div>
                        )}
                      </CardContent>
                    </Card>
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
