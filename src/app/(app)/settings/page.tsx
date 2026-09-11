import { requireUser } from "@/server/auth/guards";
import { updateMyProfile } from "@/server/actions/users";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BASE_ROLES, labelFor } from "@/lib/labels";

export default async function MyProfilePage() {
  const user = await requireUser();

  return (
    <Card>
      <CardHeader>
        <CardTitle>My Profile</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center gap-4">
          <Avatar className="size-16">
            <AvatarImage src={user.image ?? undefined} alt={user.name ?? ""} />
            <AvatarFallback className="text-lg">{user.name?.[0] ?? "?"}</AvatarFallback>
          </Avatar>
          <div>
            <p className="font-medium">{user.name}</p>
            <p className="text-sm text-muted-foreground">{user.email}</p>
            <div className="mt-1 flex gap-1.5">
              <Badge variant="secondary">{labelFor(BASE_ROLES, user.baseRole)}</Badge>
              {user.isAdmin && <Badge>Admin</Badge>}
            </div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Your name and photo come from your Google account. Contact an admin to change your role.
        </p>

        {user.baseRole === "loan_officer" && (
          <form action={updateMyProfile} className="space-y-1.5 border-t pt-4 max-w-sm">
            <Label htmlFor="schedulingLink">Scheduling link (Calendly, etc.)</Label>
            <Input
              id="schedulingLink"
              name="schedulingLink"
              defaultValue={user.schedulingLink ?? ""}
              placeholder="https://calendly.com/you"
            />
            <p className="text-xs text-muted-foreground pb-2">
              Used for the &ldquo;book a call&rdquo; email when sending term sheets to borrowers.
            </p>
            <Button type="submit">Save</Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
