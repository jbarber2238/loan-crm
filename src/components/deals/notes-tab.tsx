import { addDealNote, resolveDealNote } from "@/server/actions/deals";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

interface Note {
  id: string;
  body: string;
  source: "user" | "ai" | "system";
  resolved: boolean;
  createdAt: Date;
  author?: { name: string | null } | null;
}

export function NotesTab({ dealId, notes }: { dealId: string; notes: Note[] }) {
  const addNote = addDealNote.bind(null, dealId);
  const sorted = [...notes].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6">
          <form action={addNote} className="space-y-3">
            <Textarea name="body" rows={3} placeholder="Add a note..." required />
            <Button type="submit">Add note</Button>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {sorted.map((note) => {
          const resolveNote = resolveDealNote.bind(null, dealId, note.id);
          return (
            <Card key={note.id}>
              <CardContent className="pt-4 space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Badge variant={note.source === "user" ? "outline" : "secondary"}>
                      {note.source === "ai" ? "AI" : note.source === "system" ? "System" : (note.author?.name ?? "User")}
                    </Badge>
                    <span>{note.createdAt.toLocaleString()}</span>
                  </div>
                  {note.source === "ai" && !note.resolved && (
                    <form action={resolveNote}>
                      <Button type="submit" size="sm" variant="ghost">
                        Dismiss
                      </Button>
                    </form>
                  )}
                  {note.source === "ai" && note.resolved && (
                    <span className="text-[10px]">Dismissed</span>
                  )}
                </div>
                <p className="text-sm whitespace-pre-wrap">{note.body}</p>
              </CardContent>
            </Card>
          );
        })}
        {sorted.length === 0 && (
          <p className="text-sm text-muted-foreground">No notes yet.</p>
        )}
      </div>
    </div>
  );
}
