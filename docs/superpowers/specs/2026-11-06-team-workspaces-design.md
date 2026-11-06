# Teams and workspaces

## Goal

One owner runs several businesses and has finance staff per business. Staff of business A must never see
business B. Agreed with the owner, 2026-11-06.

## Model

- **Workspace** = one business (`workspaces`). Its business profile, clients, catalog, payment accounts,
  invoices and recurring schedules carry `workspace_id` (was `user_id`). Deleting a workspace cascades to
  all of them; deleting an account does not touch any workspace.
- **Membership** (`workspace_members`): `owner` or `member`. Every member can do everything in the
  workspace except manage the team (add/remove members, change roles, delete the workspace), which is
  owner-only and enforced in `src/features/workspaces/queries.ts`. A workspace always keeps one owner.
- `invoices.created_by` and `recurring_schedules.created_by` record which member made them.
- The UI language moved from the business profile to the account (`user.ui_locale`).

## Flows

- **Sign-up** creates only the account. An account with no workspace sees `/waiting` (its email, "check
  again", "create my own business"); every app page redirects there. The app stays open to the public.
- **Adding a member**: the owner types the email of an existing account on Settings → Team. Unknown
  emails are refused (`notRegistered`); there are no invitations and owners never create accounts.
- **Switcher** in the sidebar: lists the user's workspaces with their role, switches (cookie
  `workspace`, httpOnly) and creates a new business (which opens its onboarding).
- The active workspace is the cookie's when the user still belongs to it, else their first one
  (`src/lib/workspace.ts`). Every page and action scopes its queries with `requireWorkspace()`.

## Email

- Invoice emails go out from the member who sends them (reply-to, their own verified email).
- Recurring auto emails go out from the member who last saved the schedule; when they have left the
  workspace the invoice stays a draft with `senderMissing`.
- Payment-claim and recurring-draft notifications go to every member with a verified email.

## Migration

`drizzle/0015_workspaces.sql` (hand-written): one workspace per existing user who has a profile, named
after the business, the user as owner; every row moves from `user_id` to that workspace; `created_by`
is the old owner.
