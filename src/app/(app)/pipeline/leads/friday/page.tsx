import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/guards";
import { getFridayAdminData } from "@/server/friday";
import { formatSession } from "@/lib/friday-schedule";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AttendanceButtons, CheckZoomButton, CopyMonthlyListButton, RunJobsButton, SyncButton } from "@/components/leads/friday-controls";

type Person = Awaited<ReturnType<typeof getFridayAdminData>>["upcoming"][number];

function PeopleTable({ people, attendance }: { people: Person[]; attendance: boolean }) {
  if (people.length === 0) return <p className="text-sm text-muted-foreground">Nobody yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[32rem] text-sm">
        <thead>
          <tr className="text-left text-xs text-muted-foreground">
            <th className="pb-2 font-normal">Name</th>
            <th className="pb-2 font-normal">Role</th>
            <th className="pb-2 font-normal">Contact</th>
            <th className="pb-2 font-normal">Status</th>
            {attendance && <th className="pb-2 font-normal">Attendance</th>}
          </tr>
        </thead>
        <tbody>
          {people.map((p) => (
            <tr key={p.id} className="border-t align-middle">
              <td className="py-2 pr-3 font-medium">{p.name}</td>
              <td className="py-2 pr-3">{p.role ?? "—"}</td>
              <td className="py-2 pr-3 text-xs text-muted-foreground">
                {p.email}
                <br />
                {p.phone}
              </td>
              <td className="py-2 pr-3">
                <div className="flex flex-wrap gap-1">
                  <Badge variant={p.status === "attended" ? "success" : p.status === "no_show" ? "warning" : "secondary"}>
                    {p.status === "attended" ? "Attended" : p.status === "no_show" ? "No-show" : "Registered"}
                  </Badge>
                  {p.noShows > 0 && <Badge variant="outline">{p.noShows} no-show{p.noShows === 1 ? "" : "s"}</Badge>}
                  {p.emailOnly && <Badge variant="outline">Email only</Badge>}
                  {p.unsubscribed && <Badge variant="outline">Unsubscribed</Badge>}
                </div>
              </td>
              {attendance && (
                <td className="py-2">
                  <AttendanceButtons leadId={p.id} status={p.status} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function FridayZoomPage() {
  const user = await requireUser();
  if (!user.isAdmin && user.baseRole !== "loan_officer") redirect("/pipeline");
  const data = await getFridayAdminData();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Friday Zoom</h1>
          <p className="text-sm text-muted-foreground">
            See It, Send It, Get Paid. Registrations, attendance and the follow-up emails run on their own.{" "}
            <Link href="/pipeline/leads" className="underline">
              Back to leads
            </Link>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CopyMonthlyListButton count={data.monthlyCount} />
          <RunJobsButton />
        </div>
      </div>

      <CheckZoomButton />

      {!data.zoomConnected && (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Zoom isn&apos;t connected yet, so signups don&apos;t get personal join links and attendance can&apos;t sync. Add the Zoom
          credentials in Vercel to turn that on. You can still mark attendance by hand below.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Next session — {formatSession(data.next)}</CardTitle>
          <p className="text-xs text-muted-foreground">{data.upcoming.length} registered</p>
        </CardHeader>
        <CardContent>
          <PeopleTable people={data.upcoming} attendance={false} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">Last session — {formatSession(data.last)}</CardTitle>
            <p className="text-xs text-muted-foreground">
              {data.lastSynced ? "Attendance came from Zoom." : "Attendance is pulled from Zoom after the session. You can also set it by hand."}
            </p>
          </div>
          {data.zoomConnected && <SyncButton day={data.last} />}
        </CardHeader>
        <CardContent>
          <PeopleTable people={data.previous} attendance />
        </CardContent>
      </Card>
    </div>
  );
}
