---
feature: "[Feature name in one line]"
status: draft  # draft | in-progress | done
owner: [your-name]
priority: P0  # P0 (blocker) | P1 (next sprint) | P2 (backlog)
github_issue: "#NNN"
created: YYYY-MM-DD
---

# Feature: [Name]

<!--
  Target: reviewable in under 5 minutes, under 250 lines total.
  If you're writing more, SPLIT into sub-features.
  Delete any section that genuinely does not apply, but keep the headings order.
-->

## 1. Context & Motivation

[2-4 sentences. What problem, why now, who asked. No implementation talk.]

## 2. User Stories (prioritized)

<!--
  Each story must be INDEPENDENTLY TESTABLE — implementing just US1 should
  deliver real user value on its own. Order P1 → P2 → P3.
-->

### US1 — [Short title] (P1)

**As a** [role], **I want** [capability], **so that** [outcome].

**Independent test:** [How you would verify this one story works in isolation, without the others.]

**Acceptance Scenarios:**
1. **Given** [initial state], **When** [action], **Then** [expected outcome]
2. **Given** [initial state], **When** [action], **Then** [expected outcome]

### US2 — [Short title] (P2)

**As a** [role], **I want** [capability], **so that** [outcome].

**Independent test:** [...]

**Acceptance Scenarios:**
1. **Given** [...], **When** [...], **Then** [...]

## 3. Non-Goals

<!--
  Explicit list of things the feature will NOT do.
  What is NOT built is as important as what is built — this prevents scope
  creep from both humans and AI agents.
-->

- [Explicit exclusion, e.g. "Bulk import — handled in a future sub-feature"]
- [Explicit exclusion]

## 4. Functional Requirements

<!-- Greppable stable IDs. Use FR-001, FR-002, ... Use NEEDS CLARIFICATION for open questions. -->

- **FR-001**: System MUST [capability]
- **FR-002**: System MUST [capability]
- **FR-003**: Users MUST be able to [interaction]
- **FR-004**: [NEEDS CLARIFICATION: open question]

## 5. Key Entities

<!-- Only if the feature involves new data. Skip this section otherwise. -->

- **EntityName** — {main fields}. Relationship with [other entity].

## 6. Success Criteria

<!--
  Measurable and tech-agnostic. If you can't put a number, it's not a success criterion —
  it's a hope.
-->

- **SC-001**: [Measurable outcome, e.g. "90% of operations complete in under 30 seconds"]
- **SC-002**: [Measurable outcome]

## 7. Constitution Check

<!--
  /spec:spec AUTO-GENERATES the checklist below by reading every principle
  (P1..PN) from docs/constitution.md, drafting evidence for each, then ticking:
    - [x] when evidence cites a real FR-NNN / SC-NNN / §9 item / §3 Non-Goal
    - [ ] + AskUserQuestion popup (in CLI) when evidence is ambiguous — user
      picks: tick / refine evidence / amend constitution / redesign feature
    - [ ] [NEEDS CLARIFICATION: <q>] when no evidence is possible at all

  By the time the spec is written, every line should be `[x]` with concrete
  evidence — that's the §7 gate that /spec:plan, /spec:tasks, /spec:exec check.

  Manual fill (rare): - [x] **Pn <name>:** <evidence in this spec>
  Never leave "[Principle name]" placeholders — those are instructions.
-->

- [ ] **P1 [Principle name]:** [evidence in this spec]
- [ ] **P2 [Principle name]:** [evidence in this spec]
- [ ] **P3 [Principle name]:** [evidence in this spec]
- [ ] **PN [Principle name]:** [evidence in this spec]

## 8. Technical Plan

<!--
  Inline (not a separate file). Keep it tight: what to change, where, which
  existing patterns to copy. Reference file paths with line numbers when useful.
  This section is filled by /spec:plan after the spec is reviewed.
-->

**Stack touches:**
- [layer] — [what changes]

**Migration:** [CLI commands the human will run, if any]

**Reference patterns to copy (do not re-invent):**
- [path/to/existing-file:lines]

## 9. Verification

<!--
  Evidence, not assumption. These boxes mirror the `verification` object in
  the sibling NN.tasks.json (source of truth). /spec:exec ticks a box only
  when its JSON entry is status:"done" with evidence. Lint/typecheck commands
  auto-detected by /spec:exec — see the spec-driven skill.
-->

- [ ] Lint clean
- [ ] Typecheck clean
- [ ] Manual test — golden path: [describe the exact click-path]
- [ ] Manual test — edge cases: [list: empty state, error, permission denied, etc.]
- [ ] DB / data verification: [exact query or check]
- [ ] Regression: these adjacent features still work — [list]

## 10. Decisions Log

<!-- Append as the feature progresses. One line per decision. -->

- YYYY-MM-DD: [decision] because [rationale]
