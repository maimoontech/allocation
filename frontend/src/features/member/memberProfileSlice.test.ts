import { beforeEach, describe, expect, it } from "vitest";
import {
  clearDraft,
  discardDraft,
  memberProfileReducer,
  setDraftBase,
  setFieldErrors,
  updateDraftField,
  updateDraftFields
} from "./memberProfileSlice";

/**
 * The slice that makes FR-026 and FR-032 true.
 *
 * Only the active tab panel is rendered, so unsaved values cannot live in the inputs — they
 * live here, and a tab is a view onto them. These tests cover the behaviour the form depends
 * on, including the sessionStorage mirroring that lets a lapsed session be recovered.
 */

const initial = memberProfileReducer(undefined, { type: "@@INIT" });

describe("memberProfileSlice", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("starts with an empty draft", () => {
    expect(initial.draft).toEqual({});
    expect(initial.fieldErrors).toEqual([]);
  });

  it("records one changed field", () => {
    const state = memberProfileReducer(
      initial,
      updateDraftField({ field: "name", value: "Alpha" })
    );
    expect(state.draft).toEqual({ name: "Alpha" });
  });

  // The draft holds ONLY what changed, so a save sends just those fields and cannot
  // accidentally overwrite a field the member never touched.
  it("accumulates changes without carrying untouched fields", () => {
    let state = memberProfileReducer(initial, updateDraftField({ field: "name", value: "A" }));
    state = memberProfileReducer(state, updateDraftField({ field: "surname", value: "B" }));

    expect(state.draft).toEqual({ name: "A", surname: "B" });
    expect(Object.keys(state.draft)).toHaveLength(2);
  });

  it("applies several fields in one update", () => {
    const state = memberProfileReducer(
      initial,
      updateDraftFields({ zone_id: 2, party_id: null })
    );
    expect(state.draft).toEqual({ zone_id: 2, party_id: null });
  });

  it("keeps a null, which is how a field is cleared", () => {
    const state = memberProfileReducer(
      initial,
      updateDraftField({ field: "dob_gregorian", value: null })
    );
    expect(state.draft).toHaveProperty("dob_gregorian", null);
  });

  // Stale messages must not linger while the member works through a list of problems.
  it("clears a field's error when that field changes", () => {
    let state = memberProfileReducer(
      initial,
      setFieldErrors([
        { tab: 1, field: "email", message: "Bad email." },
        { tab: 3, field: "party_id", message: "Wrong zone." }
      ])
    );

    state = memberProfileReducer(
      state,
      updateDraftField({ field: "email", value: "ok@example.test" })
    );

    expect(state.fieldErrors.map((e) => e.field)).toEqual(["party_id"]);
  });

  // Errors on repeatable rows are reported as `titles[0].title_year`, so correcting the row
  // should clear them by prefix.
  it("clears indexed errors by prefix", () => {
    let state = memberProfileReducer(
      initial,
      setFieldErrors([{ tab: 2, field: "titles[0].title_year", message: "Out of range." }])
    );
    state = memberProfileReducer(state, updateDraftField({ field: "titles", value: [] }));

    expect(state.fieldErrors).toEqual([]);
  });

  it("clears the draft after a successful save but keeps the base version", () => {
    let state = memberProfileReducer(initial, setDraftBase("2026-10-30T10:00:00Z"));
    state = memberProfileReducer(state, updateDraftField({ field: "name", value: "A" }));
    state = memberProfileReducer(state, clearDraft());

    expect(state.draft).toEqual({});
    expect(state.baseUpdatedAt).toBe("2026-10-30T10:00:00Z");
  });

  it("drops the base version when the draft is discarded", () => {
    let state = memberProfileReducer(initial, setDraftBase("2026-10-30T10:00:00Z"));
    state = memberProfileReducer(state, updateDraftField({ field: "name", value: "A" }));
    state = memberProfileReducer(state, discardDraft());

    expect(state.draft).toEqual({});
    expect(state.baseUpdatedAt).toBeNull();
  });

  // FR-032: a lapsed session must not cost the member their work.
  describe("sessionStorage mirroring", () => {
    it("persists the draft", () => {
      memberProfileReducer(initial, updateDraftField({ field: "name", value: "Persisted" }));

      const raw = sessionStorage.getItem("mpss.member_profile_draft");
      expect(raw).toBeTruthy();
      expect(JSON.parse(raw!).draft).toEqual({ name: "Persisted" });
    });

    it("removes the stored draft once it is empty", () => {
      const dirty = memberProfileReducer(
        initial,
        updateDraftField({ field: "name", value: "A" })
      );
      expect(sessionStorage.getItem("mpss.member_profile_draft")).toBeTruthy();

      memberProfileReducer(dirty, clearDraft());
      expect(sessionStorage.getItem("mpss.member_profile_draft")).toBeNull();
    });

    // sessionStorage rather than localStorage on purpose: a draft profile holds personal
    // data and should not outlive the browser tab on a shared machine.
    it("uses sessionStorage, not localStorage", () => {
      memberProfileReducer(initial, updateDraftField({ field: "name", value: "A" }));
      expect(localStorage.getItem("mpss.member_profile_draft")).toBeNull();
    });
  });
});
