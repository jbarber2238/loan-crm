# Manna read-only MCP connector

A read-only window onto the loan pipeline for Claude (claude.ai custom connector). Claude can
look at loans, client needs and recent activity. It cannot create, change, delete or send
anything, and it never sees SSNs, bank or account numbers, dates of birth, or what is inside a
document (document names and review status only).

## Connect it to claude.ai

1. Be signed in to the CRM as an **admin** in the same browser.
2. In Claude: **Settings → Connectors → Add custom connector** (on a Team or Enterprise plan an
   Owner adds it under Organization settings → Connectors first).
3. Name: `Manna CRM`. URL:

   ```
   https://mannalendingco.com/mcp
   ```

4. Click **Connect**. You'll land on the CRM's consent screen (signing in with Google if needed).
   Check the address it says it will send you back to is `claude.ai`, then press **Approve**.

Only active admins can approve. If the person who approved is later made a non-admin or
deactivated, the connection stops working immediately.

## Revoke access

* **Settings → Integrations → Claude connector (read-only)** lists every connected app with a
  **Disconnect** button (and **Disconnect all**). It takes effect on the next request.
* From Claude: remove the connector under Settings → Connectors. That calls `/oauth/revoke`.
* Emergency, from the database: `update mcp_oauth_tokens set revoked_at = now() where revoked_at is null;`
* Deactivating a user, or taking away their admin rights, also cuts off everything they approved.

Access tokens last 1 hour; refresh tokens last 30 days and rotate on every use (replaying an old
one revokes the whole connection).

## Audit log

Every `tools/call` is written to `mcp_audit_log` (user, tool, arguments, time, then ok/error and
duration) **before** the tool runs; if the log can't be written, the call is refused. The last
15 requests show on the Integrations card. Unknown or write-style tool names (for example
`update_loan`) are logged and rejected.

```sql
select created_at, u.name, tool, arguments, ok, error
from mcp_audit_log l left join "user" u on u.id = l.user_id
order by created_at desc limit 50;
```

## Tools (all read-only, paginated where they list)

| Tool | What it returns |
| --- | --- |
| `list_open_loans(stage?, assigned_to?)` | Loan id/number, borrower, property, loan type (DSCR, Fix and flip, Ground up, Bridge), lender, stage, target close, loan officer, processor, last activity. |
| `get_loan(loan_id)` | The above plus stage history, conditions, every client need (documents by name and status), team, referral partner, key dates. `loan_id` can be the uuid or the loan number. |
| `list_outstanding_needs(loan_id?, older_than_hours?, assigned_to?)` | Open needs, oldest first: who requested it, who owes it, requested at, last reminder, last borrower activity, what it blocks, age in hours. |
| `list_recent_activity(since, loan_id?)` | Stage changes, needs added/accepted, uploads, borrower submissions, notes, logged emails, newest first (90 days max). |
| `pipeline_summary()` | Counts by stage, open loans idle 3+ days, needs older than 48h by owner, loans closing in the next 10 days. |

"Open loan" means New through Clear to Close, the same definition the pipeline totals use. Archived
and deleted loans are never shown. "Outstanding" needs are not-sent, awaiting, in-review and
rejected-not-resent; accepted, unused and on-hold needs are left out.

"Last activity" is the newest of: stage change, note, non-automated email, borrower activity,
document upload, need added/accepted, condition added/cleared, key-date event. Automatic
reminders and digests deliberately do not count, so a loan that is only being nagged still shows as idle.

## Data model additions

Added to `deal_client_needs` (all nullable, so nothing existing changes):

* `requested_by_user_id`: who asked for the need. Filled in for needs added by a person from now
  on. Older needs show the person who first sent it to the borrower, marked
  `requested_by_source: "inferred_from_first_sender"`, or `unknown`.
* `responsible_party`: `borrower | processor | title | insurance | lender`.
* `blocks`: `underwriting | closing | none`.

When the last two are empty (every need today, since nothing in the CRM edits them yet) the
connector works them out and says so with `owed_by_inferred` / `blocks_inferred`:

* Owed by: a document waiting in review, a rejection not yet re-sent, or a request not yet sent is
  the **processor's**. Otherwise a name containing title/escrow → title; insurance/hazard/flood/binder →
  insurance; lender/underwriting → lender; anything else → borrower.
* Blocks: title/insurance/closing/payoff/wire-type items → closing; anything else → underwriting
  while the loan is before Conditional Approval, closing after.

New tables: `mcp_oauth_clients`, `mcp_oauth_codes`, `mcp_oauth_tokens`, `mcp_audit_log`.

## How it is built

* `app/mcp/route.ts`: Streamable HTTP (stateless, JSON responses) using the official
  `@modelcontextprotocol/sdk`. `GET`/`DELETE` return 405.
* OAuth 2.1: `/.well-known/oauth-protected-resource[/mcp]`, `/.well-known/oauth-authorization-server`,
  `/oauth/register` (dynamic client registration), `/oauth/authorize` (the consent page, behind the
  CRM's normal Google sign-in), `/oauth/token`, `/oauth/revoke`. PKCE `S256` is required, tokens are
  bound to the `/mcp` resource, and the only scope is `mcp:read`.
* Codes, tokens and client secrets are stored as SHA-256 hashes.
* Clients can only register redirect URLs on `claude.ai`, `claude.com` or localhost (add more,
  comma-separated, with `MCP_OAUTH_REDIRECT_HOSTS`). The consent page can't be framed.
* All tool queries run in a Postgres `READ ONLY` transaction with a 15s timeout, and `data.ts`
  selects explicit columns (never document contents, answers or form payloads). Free text is also
  scrubbed for SSN-, account-number- and birth-date-looking values.
* `APP_URL` must be the public origin (it already is for the CRM's emails); it becomes the OAuth issuer.

## Tests and the Inspector

```bash
npx vitest run src/server/mcp src/lib/__tests__/safe-redirect.test.ts
```

Try it with the MCP Inspector (Transport: Streamable HTTP, URL `https://mannalendingco.com/mcp`,
then **Open Auth Settings → Guided OAuth Flow**), or from a terminal once you have a token:

```bash
npx @modelcontextprotocol/inspector --cli https://mannalendingco.com/mcp --transport http \
  --header "Authorization: Bearer <access token>" --method tools/list
```
