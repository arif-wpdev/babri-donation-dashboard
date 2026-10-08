# Login and Admin UI Simplification Plan

Status: **Phases 1–4 implementation complete; operational retirement pending owner confirmation**
Scope: Separate everyday sign-in from account provisioning, onboarding, migration, and recovery administration. Preserve existing security controls and avoid changing auth policy unless a phase explicitly requires it.

## Current behavior and constraints

- Login UI: `src/app/login/login-form.tsx` contains phone/password login, OTP, passkey, recovery, password reset, Super Admin phone bootstrap, Employee/Org Admin phone onboarding, and legacy Org Admin migration UI.
- Employee and phone-only Org Admin daily sign-in uses their registered phone, with trusted-mobile passkey or registered-phone OTP.
- Legacy Org Admins retain password + verification until they explicitly migrate; migration needs a verified phone, active passkey, password confirmation, and ready MFA configuration.
- Super Admin stays password-secured and may use the existing trusted-device passkey path or registered-phone OTP fallback.
- Account/security actions currently live in security settings and existing APIs. Do not expose any admin data publicly while moving UI.
- Next.js version has project-specific breaking changes. Read the relevant guide under `node_modules/next/dist/docs/` before implementation.
- Never push changes without explicit approval in the same conversation. Database/Supabase changes need the target project, region, and credentials confirmed first.

## Phase 1 — Simplify everyday login

Goal: The login page should focus on signing in only.

- Show phone input and only show password when the account/flow requires it (Super Admin and legacy password-backed Org Admin).
- Provide two compact actions: **Login with Biometric** and **Login with OTP**. Clarify that browser/device support may determine availability; no biometric prompt until explicit tap.
- Trusted mobile: passkey first; keep visible registered-phone OTP fallback after failed/canceled passkey.
- Desktop/new device: send OTP only to the verified phone stored on the account; after successful OTP allow passkey registration as currently supported.
- Super Admin: retain password-first flow; its passkey and OTP fallback must continue to work.
- Remove setup, phone-bootstrap, migration, and recovery management panels from the everyday login surface; do not delete their APIs or flows.
- Preserve generic errors, rate limits, same-origin checks, one-time tickets, and current session guarantees.
- Acceptance: no unrelated setup panels on login; Employee, new Org Admin, legacy Org Admin, Super Admin, OTP, passkey, and fallback paths all work.

## Phase 2 — Create protected `/admin` information architecture

Status: **Implemented**

Goal: Give administrative actions a dedicated, understandable location.

- Add `/admin` routes behind server-side auth and role checks; never rely only on hidden UI/proxy redirects.
- Super Admin area: organization-scoped Org Admin provisioning, account status, verified-phone bootstrap/recovery, and migration readiness.
- Org Admin area: team/employee provisioning and permitted account-management tasks only.
- Employee: no `/admin` access.
- Onboarding may be reachable from a public setup link, but it must not expose admin data; every OTP must match a pre-registered number and one-time invite state.
- Acceptance: Super Admin can perform cross-org administration; Org Admin is restricted to its active org; Employee is denied. Test API and page access independently.

Implementation notes:

- `/admin` is gated by Proxy and authoritative server-side role/session checks. Super Admin sees organization provisioning and cross-org readiness; Org Admin sees only team tools for its active organization.
- `/api/admin/accounts` returns minimal status DTOs and never returns password hashes. Org Admin account queries are restricted to `ORG_USER` records in the caller's organization.
- Org Admin provisioning is Super Admin-only; employee invitations are scoped to an active organization and require an Org Admin to target its own org (or a Super Admin to select one). Setup links enter `/setup`, where the existing OTP + mandatory passkey enrollment checks the pre-registered phone and one-time enrollment state.
- Existing organization detail/sync and team deletion boundaries now explicitly reject employee/cross-org access and re-check active organizations.

## Phase 3 — Move existing onboarding/recovery UX safely

Status: **Implemented**

Goal: Preserve all essential setup and support flows after removing them from login.

- Move first-time employee and passwordless Org Admin phone OTP + mandatory passkey setup to clear onboarding screens linked from `/admin` provisioning results or a generic setup entry point.
- Move legacy Org Admin phone verification and explicit migration to `/admin`/security guidance. Do not silently migrate an account or remove its password.
- Super Admin initial phone bootstrap is now on the data-minimal `/setup/admin` surface; it keeps email + current password proof and SMS OTP and remains distinct from employee/admin passwordless setup.
- Move password reset and recovery-code management to appropriate screens. Passwordless users must not regain a password through the legacy reset path.
- Keep lock screen OTP/passkey unlock separate from sign-in recovery.
- Acceptance: each flow has a clear link, survives reload/expiry, cannot change roles/orgs, and cannot mint a session before required factors.

Implementation notes:

- `/setup` is now a public generic invite setup entry, while provisioned setup links continue to prefill the known phone. Enrollment APIs still check the registered phone, pending invite, OTP challenge, active organization, and mandatory first passkey.
- `/setup/admin` remains data-minimal and provides password-proven Super Admin/legacy admin phone bootstrap.
- `/admin/security` now hosts Org Admin phone/security management and explicit legacy migration; migration keeps the password until the authenticated endpoint atomically verifies readiness and revokes sessions/tickets.
- `/recover/password` and `/recover/account` expose legacy password reset and one-time recovery-code sign-in. Password reset now rejects passwordless accounts at both request and verification, while recovery codes retain existing single-use ticket/session safeguards.
- Employee mobile-lock OTP/passkey UI and APIs remain separate and unchanged.

## Phase 4 — Compatibility, migration visibility, and retirement criteria

Status: **Implemented in code; legacy route retirement intentionally not enabled**

Goal: Existing accounts stay usable during rollout; provide measurable completion before removing legacy paths.

- Super Admin user list shows status derived from safe fields only: legacy password account and blockers, phone unverified, passkey missing, ready to migrate, disabled, or passwordless. Never return password hashes.
- Provide a per-account migration/readiness workflow; legacy Org Admin keeps password login until explicit successful migration.
- Migration requires password proof, registered and verified phone, active passkey, active organization, ready MFA config; atomically null password hash and revoke sessions/tickets.
- Keep reset/recovery available for eligible legacy accounts; after migration, offer recovery codes only with verified phone and active passkey.
- Do not remove legacy routes until owners confirm all accounts are migrated or explicitly exempted and recovery has been exercised.
- Acceptance: before/after tests preserve role and org access, legacy recovery, new passwordless login, revoked credentials, and account disablement.

Implementation notes:

- Super Admin account readiness now returns distinct legacy phone/passkey blockers, migration blockers, recovery eligibility, and disabled status as safe DTO fields. Password hashes remain server-side only.
- Migration remains self-service and requires password proof, verified phone, active passkey, active organization, and MFA/SMS readiness. In one transaction it clears the legacy password and invalidates active sessions, pre-auths, login tickets, and outstanding auth challenges.
- Legacy employee hard-delete UI/API now use reversible disablement. Disabling records `disabledAt`, bumps `passwordChangedAt`, revokes active sessions, consumes pending tickets/pre-auths, and all account-auth entry points reject disabled users; re-enable does not silently restore sessions or revoked passkeys.
- The additive migration `prisma/migrations/20261008150000_user_disablement/migration.sql` and Prisma schema/client support are prepared. The migration has **not** been applied to any database.
- Reset, recovery-code, passwordless, and post-migration eligibility checks are explicit policy helpers and included in the acceptance suite.
- Legacy route retirement is intentionally not automatic: the Admin page reports active legacy account count, but owner-confirmed exemptions and an exercised recovery runbook are operational inputs that source code cannot safely infer. Do not remove legacy routes until those are recorded and confirmed.
- Super Admin can disable/re-enable non-Super-Admin accounts in active orgs and permanently delete only after disablement plus explicit `DELETE` confirmation. Org Admin account controls remain limited to employee status changes inside their org; Org Admin cannot permanently delete accounts.

## Release / validation checklist

1. Review the exact diff and check for unrelated changes/secrets.
2. Run `npx tsc --noEmit`, `npm run test:auth-security`, targeted ESLint, `npm run build`, and `git diff --check`.
3. Test desktop and mobile browsers: passwordless employee/admin, legacy admin, Super Admin, canceled/failed passkey fallback, expired OTP, revoked passkey, and five-minute lock.
4. Confirm deployment configuration and production MFA/SMS/WebAuthn readiness before rollout; do not invent or alter secrets.
5. Confirm target project, region, and credentials before applying the pending account-disablement migration. The code change is additive; no database operation has been run.
6. Commit/push only when explicitly requested.

## Decision to confirm during Phase 1 implementation

The requested two-button wording should remain subordinate to required factors: a Super Admin and legacy password-backed Org Admin must still provide their password before passkey/OTP. The biometric button must not become a passwordless Super Admin credential or bypass the password-secured policy. Present password inline before the two factor buttons for those roles; use phone-only entry for passwordless Employee/new Org Admin accounts.
