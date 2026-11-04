import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { MemberProfileInput, ProfileFieldError } from "./memberApi";

/**
 * Unsaved profile edits, held outside the inputs.
 *
 * This slice is what makes two requirements true:
 *
 *   FR-026  switching tabs must not discard typed values. Only the active panel is rendered,
 *           so if the edits lived in the inputs they would vanish on every switch. They live
 *           here instead, and a tab is just a view onto them.
 *
 *   FR-032  a lapsed session must not cost the member their work. Edits are mirrored to
 *           sessionStorage, so re-authenticating in the same tab finds them still there.
 *
 * sessionStorage rather than localStorage, deliberately: a draft profile contains personal
 * data, and it should not outlive the browser tab on a shared machine.
 */

const DRAFT_KEY = "mpss.member_profile_draft";

type MemberProfileState = {
  /** Only the fields the member has actually changed, so a save sends just those. */
  draft: MemberProfileInput;
  /** `updated_at` from the read the draft is based on, for concurrency detection. */
  baseUpdatedAt: string | null;
  /** Server-reported failures from the last save, keyed by field. */
  fieldErrors: ProfileFieldError[];
};

function loadDraft(): { draft: MemberProfileInput; baseUpdatedAt: string | null } {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return { draft: {}, baseUpdatedAt: null };
    const parsed = JSON.parse(raw) as {
      draft?: MemberProfileInput;
      baseUpdatedAt?: string | null;
    };
    return { draft: parsed.draft ?? {}, baseUpdatedAt: parsed.baseUpdatedAt ?? null };
  } catch {
    // A private window, cleared site data, or a blocked accessor. An unavailable draft is
    // not an error — the form simply starts from the saved profile.
    return { draft: {}, baseUpdatedAt: null };
  }
}

function persistDraft(state: MemberProfileState) {
  try {
    if (Object.keys(state.draft).length === 0) {
      sessionStorage.removeItem(DRAFT_KEY);
      return;
    }
    sessionStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ draft: state.draft, baseUpdatedAt: state.baseUpdatedAt })
    );
  } catch {
    // Storage being unavailable must not break editing, so this is best-effort.
  }
}

const restored = loadDraft();

const initialState: MemberProfileState = {
  draft: restored.draft,
  baseUpdatedAt: restored.baseUpdatedAt,
  fieldErrors: []
};

const memberProfileSlice = createSlice({
  name: "memberProfile",
  initialState,
  reducers: {
    /** Records the version the current draft is based on, taken from the profile read. */
    setDraftBase(state, action: PayloadAction<string | null>) {
      state.baseUpdatedAt = action.payload;
      persistDraft(state);
    },

    /** Merges one field's new value into the draft. */
    updateDraftField(
      state,
      action: PayloadAction<{ field: keyof MemberProfileInput; value: unknown }>
    ) {
      const { field, value } = action.payload;
      (state.draft as Record<string, unknown>)[field] = value;
      // Correcting a field clears its error, so stale messages do not linger while the
      // member works through the list.
      state.fieldErrors = state.fieldErrors.filter((e) => !e.field.startsWith(String(field)));
      persistDraft(state);
    },

    /** Merges several fields at once, for a conditional rule that clears its dependents. */
    updateDraftFields(state, action: PayloadAction<Partial<MemberProfileInput>>) {
      Object.assign(state.draft, action.payload);
      const changed = Object.keys(action.payload);
      state.fieldErrors = state.fieldErrors.filter(
        (e) => !changed.some((field) => e.field.startsWith(field))
      );
      persistDraft(state);
    },

    setFieldErrors(state, action: PayloadAction<ProfileFieldError[]>) {
      state.fieldErrors = action.payload;
    },

    /** Called after a successful save: the draft is now the saved state. */
    clearDraft(state) {
      state.draft = {};
      state.fieldErrors = [];
      persistDraft(state);
    },

    /** Discards unsaved edits without saving them. */
    discardDraft(state) {
      state.draft = {};
      state.fieldErrors = [];
      state.baseUpdatedAt = null;
      persistDraft(state);
    }
  }
});

export const {
  setDraftBase,
  updateDraftField,
  updateDraftFields,
  setFieldErrors,
  clearDraft,
  discardDraft
} = memberProfileSlice.actions;

export const memberProfileReducer = memberProfileSlice.reducer;
