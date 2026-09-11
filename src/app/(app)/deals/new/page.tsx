import { db } from "@/server/db/client";
import { requireUser } from "@/server/auth/guards";
import { createDeal } from "@/server/actions/deals";
import { IntakeFormFields } from "@/components/deals/intake-form-fields";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default async function NewDealPage() {
  const user = await requireUser();

  const allUsers = await db.query.users.findMany({
    where: (users, { eq }) => eq(users.active, true),
    orderBy: (users, { asc }) => asc(users.name),
  });
  const loanOfficers = allUsers.filter((u) => u.baseRole === "loan_officer");
  const processors = allUsers.filter((u) => u.baseRole === "processor");
  const assistants = allUsers.filter((u) => u.baseRole === "loan_officer_assistant");

  return (
    <div className="mx-auto max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>New Deal</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createDeal} className="space-y-8">
            <section className="space-y-4">
              <h2 className="text-sm font-semibold text-muted-foreground">Assignment</h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="assignedLoanOfficerId">Loan officer</Label>
                  <Select name="assignedLoanOfficerId" defaultValue={user.id} required>
                    <SelectTrigger id="assignedLoanOfficerId" className="w-full">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {loanOfficers.map((lo) => (
                        <SelectItem key={lo.id} value={lo.id}>
                          {lo.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="assignedProcessorId">Processor</Label>
                  <Select name="assignedProcessorId">
                    <SelectTrigger id="assignedProcessorId" className="w-full">
                      <SelectValue placeholder="Unassigned" />
                    </SelectTrigger>
                    <SelectContent>
                      {processors.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="assignedAssistantId">Assistant</Label>
                  <Select name="assignedAssistantId">
                    <SelectTrigger id="assignedAssistantId" className="w-full">
                      <SelectValue placeholder="Unassigned" />
                    </SelectTrigger>
                    <SelectContent>
                      {assistants.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="driveLink">Google Drive link</Label>
                <Input id="driveLink" name="driveLink" placeholder="Optional for now" />
              </div>
            </section>

            <IntakeFormFields />

            <Button type="submit" className="w-full">
              Create Deal
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
