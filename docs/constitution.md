<!--
template_version: 2.0.0
-->
# PacoTicket Parceiros Constitution

> Immutable principles that govern every feature, bug fix, and refactor in this repository.
> Every spec in `docs/specs/` **must** pass the Constitution Check before implementation.
> Changing this file requires explicit approval.

**Version:** 1.1.0 | **Ratified:** 2026-06-09 | **Last amended:** 2026-06-09 (/spec:install scan — added P7–P10)

<!--
  Versioning (aligned with spec-kit convention):
  - MAJOR  → backward-incompatible principle removal or redefinition
  - MINOR  → new principle added, or materially expanded guidance
  - PATCH  → wording, typo, non-semantic clarification
  Bump MAJOR/MINOR whenever P1-P6 below are edited substantively.
-->

---

<!--
  P1-P6 below are UNIVERSAL principles shipped with the spec-plan plugin.
  They apply to any stack/domain and cover the main failure modes of
  AI-assisted spec-driven development. Keep them.

  Add your project-specific principles starting at P7 (examples:
  multi-tenancy, framework-first, design system fidelity, feature flags,
  compliance gates, performance budgets). See the constitution.example.md
  reference file next to this one for inspiration from a real project.
-->

## P1 — Spec Before Code

**Rule:** Non-trivial changes MUST begin with a spec in `docs/specs/active/` that passes the Constitution Check (§7 of every spec) before any code is written. Non-trivial means: a new feature (new entity, new route group, new page or flow), a bug fix that touches more than 3 files or crosses architectural layers, or a refactor that changes a public contract (API shape, DB schema, shared type). Trivial work is exempt: typo fixes, 1-file bug fixes, dependency bumps, copy/label changes.

**Why:** Without an up-front spec, AI agents and humans drift toward scope that was never agreed. Re-work cost compounds.

**Violation example:** Implementing a new `POST /invoices/bulk-import` endpoint directly because "it's just one route" — without writing a spec that states who asked for it, what the success criteria are, and what is explicitly out of scope.

---

## P2 — Verification Before Claim

**Rule:** "Done" MUST be backed by tool-verified evidence. Before marking work complete: tests green with output pasted, a database query (or equivalent read against the system of record) confirming writes, and a real interaction exercising the golden path AND at least one edge case (browser click-through, `curl` with auth, CLI invocation). "Should work", "looks correct", and "passes typecheck" are NOT verification.

**Why:** AI agents and humans alike hallucinate success. Untested assumptions compound into regressions that are expensive to unwind.

**Violation example:** "The migration looks correct, moving on." — without running it, without querying the resulting schema, without a single row inserted to prove the new column behaves.

---

## P3 — Anti-Drift

**Rule:** Code and spec MUST change together. A bug fix that contradicts `FR-003` requires updating `FR-003` in the spec AND appending a line to the spec's §10 Decisions Log FIRST, then changing the code. A new requirement discovered during implementation requires stopping, adding `FR-NNN` (or a new User Story) to the spec, obtaining approval, and only then writing code.

**Why:** A spec that disagrees with its code is worse than no spec at all: the next session's agent will "correct" the code back to the stale spec, silently reverting the fix. This pattern is documented across every spec-driven tool (Thoughtworks SDD article, spec-kit issue tracker).

**Violation example:** Quietly changing `invoiceService.compute()` to round differently while leaving `FR-007` unchanged in the spec.

---

## P4 — Concise Specs

**Rule:** Every spec MUST be reviewable end-to-end in under 5 minutes and MUST NOT exceed 250 lines. Every spec MUST contain at least one explicit Non-Goal (§3) and Success Criteria (§6) with measurable numbers (time, percentage, count). Features that do not fit under 250 lines MUST be split into independently testable sub-features, each with its own spec.

**Why:** Verbose specs create false confidence — humans skim them, agents skim them, delivered code drifts from intent. The spec-plan plugin deliberately rejects the multi-file / ~1000-line spec style popularized by early spec-kit defaults (see Martin Fowler's SDD critique).

**Violation example:** An 1,100-line spec titled "Billing Overhaul" covering 9 pages at once; a spec whose Success Criterion is "users are happy".

---

## P5 — No Tech Debt Shortcuts

**Rule:** The following are forbidden without an explicit, documented, approved exception: `--no-verify` on commit, `--no-gpg-sign`, `@ts-ignore` / `as any` / `eslint-disable` used to silence errors instead of fixing them, editing a migration that has already been deployed (always create a new one), removing `AIDEV-*` anchor comments without human approval, using `--unsafe` on linters/formatters to bypass checks. When a hook or check fails, fix the root cause — never skip the gate.

**Why:** Shortcuts look like progress for one session and become technical bankruptcy over months. See the "Don't Live With Broken Windows" principle from The Pragmatic Programmer: tolerated rot accelerates further rot.

**Violation example:** Adding `// @ts-ignore` over a type error instead of narrowing the type; editing `0007_add_column.sql` in place instead of creating `0024_fix_column.sql`; committing with `--no-verify` because "the hook is flaky".

---

## P6 — Simplicity First

**Rule:** Every change MUST choose the simplest solution that meets the stated requirements. Introducing a new abstraction, new third-party dependency, new design pattern, or new file layer requires explicit justification in the spec's §8 Technical Plan (what is reused first, why reuse is insufficient, what the new thing buys). Reuse before creation: grep for existing utilities, components, helpers, or repository functions before proposing new ones.

**Why:** AI agents tend to reinvent components that already exist in the codebase — each reinvention fragments the surface area, multiplies testing cost, and drifts the design. Simplicity is cheaper to maintain and easier to verify.

**Violation example:** Writing a bespoke `formatCurrency()` helper when `packages/shared/src/format/currency.ts` already exports one; pulling in `date-fns` to add two days to a Date when the project already uses `dayjs`.

---

<!--
  ADD YOUR PROJECT-SPECIFIC PRINCIPLES BELOW, STARTING AT P7.

  Good project-specific principles are:
  - Concrete (someone can tell at a glance whether code obeys it)
  - Universal within YOUR codebase (applies to ALL features, not just one module)
  - Testable (a reviewer can verify it during code review)
  - Have a named violation example

  Examples of good project-specific principles:
  - "Multi-Tenant Isolation" — every query filters by tenant id
  - "Layered Architecture" — route → service → repository, no cross-cutting
  - "Framework-First" — report upstream bugs, don't mask with local workarounds
  - "Design System Fidelity" — UI comes from a single component library
  - "Feature-Flagged by Default" — new modules ship behind a flag

  Bad principles (avoid):
  - "Write good code" — not testable
  - "Use TypeScript" — a tool choice, not a principle
  - "Be a team player" — not about code
-->

## P7 — Partner Isolation

**Rule:** Every query filtering by `partnerId` MUST extract that value from the JWT token (`$request->user['partnerId']`), NEVER from request body, query params, or route params.

**Why:** Partners must never access each other's data. Accepting `partnerId` from user input creates a critical privilege escalation vulnerability — any partner could impersonate another by sending a different UUID.

**Violation example:** `$partnerId = $request->body['partnerId'];` — allows an attacker to access or modify another partner's clients, commissions, and leads.

---

## P8 — Frozen Production Schema

**Rule:** The database schema MUST NOT be altered. No `ALTER TABLE`, no `DROP`, no column renames. All seed scripts MUST use `INSERT ... ON CONFLICT DO NOTHING` to be idempotent. Table/column names use camelCase with double quotes (Prisma convention).

**Why:** The database is in production with live data. Schema changes risk data loss or corruption. The Prisma-generated camelCase naming convention must be preserved for existing queries to work.

**Violation example:** Running `ALTER TABLE "Client" ADD COLUMN foo TEXT` directly, or a seed script that uses `TRUNCATE` or `DELETE FROM` before inserting.

---

## P9 — Immutable API Response Contract

**Rule:** Every API endpoint MUST return exactly one of these shapes: `{"success": true, "data": ...}` or `{"success": false, "error": "ERROR_CODE", "message": "..."}`. No exceptions.

**Why:** The frontend SPA is already coded against this contract. Changing it would break all existing API consumers and require coordinated frontend updates across all portals.

**Violation example:** Returning `{"ok": true, "result": ...}` or bare JSON data without the `success` wrapper.

---

## P10 — External API Fault Tolerance

**Rule:** Failures in external APIs (PacoTicket, SMTP, Gotenberg) MUST NOT cancel local database operations. When the PacoTicket API fails: complete the local write (e.g., create Client), log the error in `ActivityLog`, leave external reference NULL (`pacoticketId`), and return success to the frontend.

**Why:** External services are unreliable. A PacoTicket outage should not prevent partners from registering clients. The local record is the source of truth; external sync can be retried later.

**Violation example:** Rolling back a `Client` insert because the PacoTicket API returned 500; throwing an error to the user when email sending fails during password reset.

---

## Governance

- **Amendment process:** Pull request that edits this file. [Designated approver] approves or rejects. Version bump follows the SemVer rules noted at the top.
- **Enforcement:** Every spec in `docs/specs/active/` includes a **Constitution Check** checklist (§7) that references P1-PN. Unchecked items block implementation.
- **Drift:** If code changes contradict a principle, the spec AND this constitution MUST be updated in the same change — never the code alone.
- **Relation to CLAUDE.md / AGENTS.md:** `CLAUDE.md` (or `AGENTS.md`) is the developer / agent onboarding reference — how the stack is laid out, which commands to run, where files live. This constitution is the set of rules that survive even a full rewrite of `CLAUDE.md`.

---

## Decisions Log

- 2026-06-09: /spec:install scan added P7 (Partner Isolation), P8 (Frozen Production Schema), P9 (Immutable API Response Contract), P10 (External API Fault Tolerance) based on CLAUDE.md and handoff.md conventions.
