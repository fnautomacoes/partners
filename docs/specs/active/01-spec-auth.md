---
feature: "JWT Authentication with refresh token rotation"
status: code-complete
owner: riseon
priority: P0
github_issue: ""
created: 2026-06-09
---

# Feature: JWT Authentication

## 1. Context & Motivation

The PacoTicket Partners system needs secure authentication to protect partner data and enforce role-based access (SuperAdmin vs Partner). Without authentication, no other feature can be built. The system requires JWT tokens in httpOnly cookies to prevent XSS attacks, refresh token rotation to detect session hijacking, and rate limiting to prevent brute-force attacks.

## 2. User Stories (prioritized)

### US1 — Login (P1)

**As a** registered user (SuperAdmin or Partner), **I want** to log in with my email and password, **so that** I can access my portal.

**Independent test:** Submit valid credentials via POST /api/auth/login, verify httpOnly cookies are set and GET /api/auth/me returns user data.

**Acceptance Scenarios:**
1. **Given** valid credentials, **When** user submits login, **Then** access_token and refresh_token cookies are set, response contains user role
2. **Given** invalid credentials, **When** user submits login, **Then** 401 returned, no cookies set
3. **Given** 10 failed attempts from same IP in 15 min, **When** user submits login, **Then** 429 returned

### US2 — Session validation (P1)

**As a** logged-in user, **I want** the frontend to validate my session on page load, **so that** I'm redirected appropriately.

**Independent test:** With valid access_token cookie, GET /api/auth/me returns user data with role and partnerId.

**Acceptance Scenarios:**
1. **Given** valid access_token, **When** GET /api/auth/me, **Then** returns {success: true, data: {userId, role, partnerId}}
2. **Given** expired/invalid token, **When** GET /api/auth/me, **Then** returns 401

### US3 — Token refresh (P2)

**As a** user with an expired access token, **I want** my session to refresh automatically, **so that** I don't have to log in again within 7 days.

**Independent test:** With expired access_token but valid refresh_token, POST /api/auth/refresh returns new token pair.

**Acceptance Scenarios:**
1. **Given** valid refresh_token, **When** POST /api/auth/refresh, **Then** new access_token and refresh_token issued, old refresh_token invalidated
2. **Given** reused refresh_token (already rotated), **When** POST /api/auth/refresh, **Then** 401 returned (hijack detection)

### US4 — Password reset (P2)

**As a** user who forgot my password, **I want** to request a reset link, **so that** I can regain access.

**Independent test:** POST /api/auth/forgot-password always returns 200; valid token allows password change via POST /api/auth/reset-password.

**Acceptance Scenarios:**
1. **Given** any email (existing or not), **When** POST /api/auth/forgot-password, **Then** always returns 200 (no email enumeration)
2. **Given** valid reset token, **When** POST /api/auth/reset-password with new password, **Then** password updated, token marked used, all sessions revoked
3. **Given** expired/used token, **When** POST /api/auth/reset-password, **Then** 400 returned

### US5 — Logout (P2)

**As a** logged-in user, **I want** to log out, **so that** my session is terminated.

**Independent test:** POST /api/auth/logout clears cookies and invalidates refresh token in database.

**Acceptance Scenarios:**
1. **Given** valid session, **When** POST /api/auth/logout, **Then** cookies cleared, refresh_token deleted from DB

## 3. Non-Goals

- OAuth / social login — not required for this B2B system
- Multi-factor authentication (MFA) — future enhancement
- "Remember me" checkbox — all sessions use same 7-day refresh expiry
- User registration — only SuperAdmin creates users
- Email verification on signup — users are created by admin with known emails

## 4. Functional Requirements

- **FR-001**: System MUST authenticate users via email + password and return JWT tokens in httpOnly cookies
- **FR-002**: Access token MUST expire in 8 hours; refresh token MUST expire in 7 days
- **FR-003**: System MUST rotate refresh tokens on each use (delete old, issue new)
- **FR-004**: System MUST detect refresh token reuse and return 401 (indicates stolen token)
- **FR-005**: System MUST rate limit login attempts to 10 per IP per 15 minutes
- **FR-006**: System MUST hash passwords with bcrypt cost 12
- **FR-007**: System MUST store only SHA-256 hash of refresh tokens and reset tokens (not plaintext)
- **FR-008**: Password reset tokens MUST expire in 15 minutes and be single-use
- **FR-009**: POST /api/auth/forgot-password MUST always return 200 regardless of email existence
- **FR-010**: Password change (reset or change-password) MUST revoke all existing sessions for that user
- **FR-011**: GET /api/auth/me MUST return userId, email, role, and partnerId (null for SuperAdmin)
- **FR-012**: Cookies MUST use httpOnly, sameSite=Strict, secure (in production)

## 5. Key Entities

- **User** — {id, email, passwordHash, role, createdAt, updatedAt}. Role is SUPERADMIN or PARTNER.
- **RefreshToken** — {id, userId, tokenHash, expiresAt, createdAt}. One-to-many with User.
- **PasswordResetToken** — {id, userId, tokenHash, expiresAt, usedAt, createdAt}. Single-use.

## 6. Success Criteria

- **SC-001**: Login with valid credentials completes in under 500ms (95th percentile)
- **SC-002**: 100% of refresh token rotations invalidate the previous token
- **SC-003**: 0 plaintext tokens or passwords stored in database
- **SC-004**: Rate limiter blocks 11th login attempt from same IP within 15 minutes
- **SC-005**: Password reset flow works end-to-end within 2 minutes of email receipt

## 7. Constitution Check

- [x] **P1 Spec Before Code:** This spec exists and will be reviewed before implementation begins
- [x] **P2 Verification Before Claim:** §9 defines curl tests for login, /me, refresh, and reset flows
- [x] **P3 Anti-Drift:** Spec is the first artifact; no prior code to drift from
- [x] **P4 Concise Specs:** Spec is under 250 lines; SC-001 through SC-005 are measurable
- [x] **P5 No Tech Debt Shortcuts:** FR-006 mandates bcrypt cost 12; FR-007 mandates hashed storage
- [x] **P6 Simplicity First:** §3 Non-Goals exclude OAuth, MFA, registration — minimal viable auth
- [x] **P7 Partner Isolation:** FR-011 returns partnerId from JWT for downstream partner-scoped queries
- [x] **P8 Frozen Production Schema:** Uses existing User, RefreshToken, PasswordResetToken tables per handoff.md
- [x] **P9 Immutable API Response Contract:** FR-011 specifies {success, data} shape; all endpoints follow contract
- [x] **P10 External API Fault Tolerance:** Auth has no external API dependencies; email failure in forgot-password still returns 200 (FR-009)

## 8. Technical Plan

**Stack touches:**
- `backend/src/Core/` — foundational classes (Database, Router, Request, Response, Middleware)
- `backend/src/Controllers/` — AuthController with 7 endpoints
- `backend/src/Services/` — JwtService, RateLimiter, MailService
- `backend/src/Helpers/` — Crypto utilities
- `backend/public/` — entry point with route registration
- `frontend/` — login.html, reset-password.html, shared auth JS

**New files to create:**
- `backend/src/Core/Database.php` — PDO singleton, PostgreSQL connection
- `backend/src/Core/Router.php` — method+path dispatch, middleware chain
- `backend/src/Core/Request.php` — JSON body parsing, cookies, query params, user context
- `backend/src/Core/Response.php` — json(), cookie(), status code helpers
- `backend/src/Core/Middleware.php` — JWT validation, role check, attach user to Request
- `backend/src/Controllers/AuthController.php` — login, refresh, me, logout, changePassword, forgotPassword, resetPassword
- `backend/src/Services/JwtService.php` — encode/decode with firebase/php-jwt, cookie helpers
- `backend/src/Services/RateLimiter.php` — Redis counter per IP, 10/15min window (FR-005)
- `backend/src/Services/MailService.php` — PHPMailer wrapper for reset emails
- `backend/src/Helpers/Crypto.php` — sha256(), randomHex(32) for token generation
- `backend/public/index.php` — autoload, Router init, route definitions, dispatch
- `backend/config/env.php` — getenv() wrappers with defaults
- `backend/composer.json` — firebase/php-jwt, phpmailer/phpmailer, predis/predis
- `frontend/login.html` — login form, Tailwind styled
- `frontend/reset-password.html` — token from URL, new password form
- `frontend/js/auth.js` — login submit, apiRequest() with 401 interceptor, sessionStorage

**Files to modify:** None (greenfield)

**Migration:** None — tables exist per handoff.md (User, RefreshToken, PasswordResetToken)

**Dependencies (require approval):**
- `firebase/php-jwt` ^6.0 — JWT encode/decode (industry standard)
- `phpmailer/phpmailer` ^6.9 — SMTP email sending
- `predis/predis` ^2.0 — Redis client for rate limiting

**Reference patterns:** None available (first feature). Follow CLAUDE.md §5.1-5.4 conventions.

## 9. Verification

- [ ] Lint clean
- [ ] Manual test — golden path: login as SuperAdmin, verify /me returns role=SUPERADMIN
- [ ] Manual test — golden path: login as Partner, verify /me returns role=PARTNER and partnerId
- [ ] Manual test — edge case: wrong password returns 401
- [ ] Manual test — edge case: 11th login attempt from same IP returns 429
- [ ] Manual test — edge case: reused refresh token returns 401
- [ ] Manual test — edge case: expired reset token returns 400
- [ ] DB verification: SELECT * FROM "RefreshToken" shows hashed tokens only
- [ ] DB verification: After password reset, old refresh tokens for user are deleted

## 10. Decisions Log

- 2026-06-09: Auth chosen as first feature because all other features depend on authentication
- 2026-06-09: All 19 implementation tasks completed. §9 verification deferred until environment setup (DB, Redis, web server).
