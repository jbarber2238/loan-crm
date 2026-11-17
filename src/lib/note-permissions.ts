/**
 * Who may reword a deal note: the person who wrote it. Not even an admin can edit someone else's note (admins can
 * delete it instead). A note nobody wrote (no author: older notes, borrower intake answers, system and AI notes)
 * belongs to no one, so an admin can edit it.
 */
export function canEditDealNote(note: { authorUserId: string | null }, user: { id: string; isAdmin: boolean }): boolean {
  return note.authorUserId ? note.authorUserId === user.id : user.isAdmin;
}
