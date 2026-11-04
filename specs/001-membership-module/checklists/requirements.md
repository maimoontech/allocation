# Specification Quality Checklist: Member Login and 12-Tab Member Profile

**Purpose**: Validate specification completeness and quality before proceeding to planning  
**Created**: 2026-10-29  
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Validation Record

Two rounds were run. Everything below is the evidence behind the ticks above.

### Round 1 — three items failed

**"No [NEEDS CLARIFICATION] markers remain" — initially at risk.**
The request left five things open: Tab 11's two frequency lists and its method list ("propose
options for approval"), Tab 12's `Since` format ("confirm the desired format"), and Tab 8's
count-versus-years rule ("flag any ambiguity for review rather than guessing"). Rather than
carry markers, each was given a concrete proposal recorded in Assumptions 6 to 9 and made
enforceable by a requirement — Tab 8's rule by **FR-073**, Tab 11's lists by **FR-082** and
**FR-083**, Tab 12's format by **FR-087**. A named proposal you can accept or correct is more
useful to review than an open question. **Now passes: zero markers in the spec.**

**"Requirements are testable and unambiguous" — failed on four requirements.**
Draft wording for the lookup lists said they should reuse "the existing table", repeating the
request's assumption. Inspection found Sharaf, Asbaq/Halqa, Moze and Title do not exist, and
that the Miqaat data the system holds is the scheduling calendar rather than a repeatable
attendance master. A requirement to reuse a non-existent table cannot be tested. Rewritten as
**FR-092** (reuse what genuinely exists: Zones, Parties, Mohallahs) and **FR-093** to **FR-096**
(establish the rest as maintained lists, draft-marked). **Now passes.**

**"Edge cases are identified" — failed, incomplete.**
The first pass covered only input validation. Four further cases were added after inspecting
how the system actually behaves: a single ITS Number legitimately identifying both a Party and
a member; a session lapsing mid-form; the same member editing in two places at once; and
re-provisioning a roster over an account whose member has already chosen a password. The
first and last are the ones most likely to cause real harm, and each now has a matching
requirement — **FR-011**, **FR-012**, **FR-032** and **FR-005**. **Now passes.**

### Round 2 — all items pass, with two deliberate exceptions noted

Both exceptions are recorded rather than silently waved through, so you can overrule them.

**FR-028** requires values to be "validated by the server before it is stored, independently of
any check made in the browser". That names a tier of the system. It is kept deliberately: the
request asks specifically for backend validation, and "validate the input" alone would be
satisfied by a browser-only check, which is exactly the failure mode being guarded against.
The requirement is about where trust sits, not about technology choice.

**Assumption 3** states that photographs are held inside the database and served through an
authenticated request. That is a technical decision, and it sits in Assumptions precisely
because that section exists to record decisions taken in order to specify the feature. It is
recorded there, and not as a requirement, so that the requirements themselves — **FR-088** to
**FR-091** — stay about what must be true of a photograph rather than where the bytes live.

### Coverage check

Every field in all twelve tabs of `Documentation/claude_membership_module_prompt.md` was
walked through against the spec. All are covered, and the four whose treatment deviates from
a literal reading of the request are:

| Request | Specification | Why |
|---|---|---|
| Sharaf from "the existing Sharaf table" | FR-067 — a maintained list, newly created | No Sharaf table exists |
| Halqa from "the existing Asbaq table" | FR-079 — a maintained list, newly created | No Asbaq table exists |
| Miqaat from "the existing Miqaat table" | FR-070 — a new `places` list, and Tab 8 renamed **Places Visited** | The field means *places the member has visited*, confirmed by the project owner. `miqaats` is the scheduling calendar of majlis sessions, so it is not the same kind of thing. The word is dropped from the module to prevent confusion |
| Moze "text or existing lookup, if available" | FR-077 — a maintained list | No Moze lookup exists; the request allowed either |

## Notes

- All items pass. No item remains incomplete, so the spec is ready for `/sp.clarify` or `/sp.plan`.
- The eighteen entries under **Assumptions** need your sign-off. They are not blocking, but items 5 to 18 are proposals rather than confirmed decisions, and correcting any of them changes the requirements rather than the implementation. (Items 17 and 18 were added when Tab 8 was corrected from Miqaat to Places Visited.)
- `.specify/memory/constitution.md` is still an unfilled template, so there were no project principles to validate this spec against. Worth running `/sp.constitution` before implementation begins.
