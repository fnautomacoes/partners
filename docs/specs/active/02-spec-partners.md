---
feature: "Partner Management CRUD"
status: code-complete
owner: riseon
priority: P0
github_issue: ""
created: 2026-06-09
---

# Feature: Partner Management

## 1. Context & Motivation

SuperAdmins need to create, view, edit, and deactivate partner accounts. Partners are the resellers who bring clients to PacoTicket. Each partner has a linked User account for login. Without partner management, no clients can be registered and no commissions tracked. This is the second foundational feature after authentication.

## 2. User Stories (prioritized)

### US1 — List partners (P1)

**As a** SuperAdmin, **I want** to see a list of all partners with their status, client count, and pending commission, **so that** I can monitor the partner network.

**Independent test:** GET /api/partners returns array of partners with calculated fields (activeClients, pendingCommission, tier).

**Acceptance Scenarios:**
1. **Given** 3 partners exist, **When** SuperAdmin calls GET /api/partners, **Then** returns all 3 with status, activeClients count, tier name
2. **Given** no partners exist, **When** SuperAdmin calls GET /api/partners, **Then** returns empty array

### US2 — Create partner (P1)

**As a** SuperAdmin, **I want** to create a new partner with their contact info and permissions, **so that** they can start using the system.

**Independent test:** POST /api/partners creates User + Partner records, returns the new partner data.

**Acceptance Scenarios:**
1. **Given** valid partner data, **When** SuperAdmin submits, **Then** User created with role=PARTNER, Partner created linked to User, returns partner data
2. **Given** email already exists, **When** SuperAdmin submits, **Then** 409 Conflict returned
3. **Given** missing required fields, **When** SuperAdmin submits, **Then** 400 returned with validation errors

### US3 — View partner details (P2)

**As a** SuperAdmin, **I want** to view a single partner's full profile including their clients and commission history, **so that** I can assess their performance.

**Independent test:** GET /api/partners/:id returns partner with nested data.

**Acceptance Scenarios:**
1. **Given** partner exists, **When** GET /api/partners/:id, **Then** returns partner with tier, permissions, metadata
2. **Given** partner does not exist, **When** GET /api/partners/:id, **Then** 404 returned

### US4 — Edit partner (P2)

**As a** SuperAdmin, **I want** to update a partner's contact info and permissions, **so that** I can adjust their capabilities.

**Independent test:** PUT /api/partners/:id updates fields and returns updated partner.

**Acceptance Scenarios:**
1. **Given** valid update data, **When** SuperAdmin submits PUT, **Then** Partner updated, updatedAt refreshed
2. **Given** partner does not exist, **When** PUT /api/partners/:id, **Then** 404 returned

### US5 — Deactivate partner (P2)

**As a** SuperAdmin, **I want** to deactivate a partner (soft delete), **so that** they can no longer log in but their history is preserved.

**Independent test:** DELETE /api/partners/:id sets status=INACTIVE, does not delete records.

**Acceptance Scenarios:**
1. **Given** active partner, **When** DELETE /api/partners/:id, **Then** Partner.status=INACTIVE, clients preserved
2. **Given** inactive partner, **When** DELETE, **Then** no change, returns success

### US6 — Partner dashboard (P2)

**As a** Partner, **I want** to see my dashboard with my tier, client count, and pending commission, **so that** I can track my performance.

**Independent test:** GET /api/partners/me/dashboard returns dashboard data for current partner (from JWT).

**Acceptance Scenarios:**
1. **Given** logged-in partner with 5 clients, **When** GET /api/partners/me/dashboard, **Then** returns tier, activeClients=5, pendingCommission

## 3. Non-Goals

- Partner self-registration — only SuperAdmin creates partners
- Partner hierarchy (sub-partners) — flat structure only
- Partner-to-partner transfers — clients stay with original partner
- Bulk partner import — manual creation only
- Partner API keys — authentication via login only

## 4. Functional Requirements

- **FR-001**: System MUST allow SuperAdmin to list all partners with calculated fields (activeClients, tier, pendingCommission)
- **FR-002**: System MUST allow SuperAdmin to create a partner, which creates both User (role=PARTNER) and Partner records atomically
- **FR-003**: System MUST generate a temporary password for new partners and allow SuperAdmin to see it once
- **FR-004**: System MUST validate email uniqueness when creating partners
- **FR-005**: System MUST allow SuperAdmin to view a single partner's full profile
- **FR-006**: System MUST allow SuperAdmin to update partner contact info (name, phone, document)
- **FR-007**: System MUST allow SuperAdmin to update partner permissions (canSetRecurrence, canSetDueDate)
- **FR-008**: System MUST soft-delete partners by setting status=INACTIVE (not DELETE from database)
- **FR-009**: Deactivated partners MUST NOT be able to log in
- **FR-010**: System MUST calculate partner tier dynamically based on active client count
- **FR-011**: Partners MUST only access their own dashboard via GET /api/partners/me/dashboard
- **FR-012**: GET /api/partners/me/dashboard MUST return tier, activeClients, pendingCommission, recentActivity

## 5. Key Entities

- **Partner** — {id, userId, name, phone, document, status, canSetRecurrence, canSetDueDate, createdAt, updatedAt}. Linked to User via userId. status is ACTIVE or INACTIVE.
- **User** — Existing entity. Partners have role=PARTNER.

## 6. Success Criteria

- **SC-001**: Partner list loads in under 500ms with up to 100 partners
- **SC-002**: 100% of partner creations are atomic (User + Partner created together or neither)
- **SC-003**: 0 partners can access other partners' data (isolation enforced)
- **SC-004**: Deactivated partners receive 401 on login within 1 second of deactivation

## 7. Constitution Check

- [x] **P1 Spec Before Code:** This spec exists before implementation
- [x] **P2 Verification Before Claim:** §9 defines tests for CRUD operations and dashboard
- [x] **P3 Anti-Drift:** Spec is new; no prior code to drift from
- [x] **P4 Concise Specs:** Spec under 250 lines; SC-001 through SC-004 are measurable
- [x] **P5 No Tech Debt Shortcuts:** FR-008 mandates soft delete, no data loss
- [x] **P6 Simplicity First:** §3 Non-Goals exclude hierarchy, bulk import, API keys
- [x] **P7 Partner Isolation:** FR-011 mandates /me/dashboard uses JWT partnerId, FR-012 scopes data
- [x] **P8 Frozen Production Schema:** Uses existing Partner, User tables per handoff.md
- [x] **P9 Immutable API Response Contract:** All endpoints return {success, data/error} per spec
- [x] **P10 External API Fault Tolerance:** No external API calls in partner management

## 8. Technical Plan

**Stack touches:**
- `backend/src/Controllers/` — PartnerController (CRUD + dashboard)
- `backend/src/Services/` — CommissionService (tier calculation)
- `backend/public/` — add partner routes to index.php
- `backend/src/Controllers/AuthController.php` — check Partner.status on login (FR-009)

**New files to create:**
- `backend/src/Controllers/PartnerController.php` — index, show, store, update, destroy, dashboard
- `backend/src/Services/CommissionService.php` — calculateTier(), getPendingCommission()

**Files to modify:**
- `backend/public/index.php` — add 6 partner routes with superadmin/partner middleware
- `backend/src/Controllers/AuthController.php:44-50` — add Partner.status check in login query, reject INACTIVE

**Migration:** None — uses existing Partner, User, Client, Commission tables per handoff.md

**Dependencies:** None

**Reference patterns to copy:**
- `backend/src/Controllers/AuthController.php:24-80` — controller method structure, Request/Response usage
- `backend/src/Core/Middleware.php:34-42` — superadmin middleware pattern
- `backend/src/Helpers/Crypto.php:19-22` — randomHex for temp password generation

## 9. Verification

- [ ] Manual test — golden path: SuperAdmin creates partner, partner logs in
- [ ] Manual test — golden path: SuperAdmin lists partners, sees calculated fields
- [ ] Manual test — golden path: Partner views own dashboard
- [ ] Manual test — edge case: create partner with duplicate email returns 409
- [ ] Manual test — edge case: deactivated partner cannot log in
- [ ] Manual test — edge case: partner cannot access GET /api/partners (SuperAdmin only)
- [ ] DB verification: Partner creation is atomic (User + Partner in transaction)
- [ ] DB verification: Soft delete sets status=INACTIVE, records preserved

## 10. Decisions Log

- 2026-06-09: Partner Management chosen as second feature (depends on Auth, required for Clients)
- 2026-06-09: All 9 implementation tasks completed. §9 verification deferred until environment setup.
