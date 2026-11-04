import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useAppSelector } from "../../hooks/storeHooks";
import {
  useCreateMemberAccountMutation,
  useGetMemberAccountsQuery,
  useGetMemberPhotoQuery,
  useSetMemberActiveMutation,
  type CreatedMemberAccount,
  type MemberAccount
} from "../../features/member/memberAdminApi";

/**
 * Administrator and Zonal Head view of member ACCOUNTS (FR-006, FR-007).
 *
 * Shows the identifying details needed to recognise a person — photograph, ITS number, name
 * parts, zone and party posting, and contact numbers — plus creation and the
 * activate/deactivate action, whose label carries the account's current state. The rest of
 * the twelve-tab profile, including every health value, stays private to the member
 * (FR-065, FR-101).
 *
 * One page for both roles, because they do the same job with the same fields. The server
 * decides what a Zonal Head may see and touch; this page only adjusts its wording.
 *
 * Laid out like a Dynamics 365 entity grid: a command bar, a view selector as the title, a
 * dense grid with a record-count footer, and a quick-create panel that slides in from the
 * right. The Fluent palette lives in `d365` below rather than the shared theme, so no other
 * page changes.
 */

const PAGE_SIZE = 25;

const PREFIX_PLACEHOLDER = "None";

const activeFilterOptions = [
  { value: "all", label: "All member accounts" },
  { value: "active", label: "Active member accounts" },
  { value: "inactive", label: "Inactive member accounts" }
];

/** Fluent 2 tokens, as Tailwind arbitrary values. */
const d365 = {
  font: "font-['Segoe_UI','Segoe_UI_Web_(West_European)',-apple-system,system-ui,sans-serif]",
  focus:
    "focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#0f6cbd]",
  field:
    "w-full rounded-[4px] border border-[#d1d1d1] border-b-[#616161] bg-white px-2.5 py-[5px] text-sm text-[#242424] placeholder:text-[#707070] hover:border-[#c7c7c7] hover:border-b-[#575757] focus:border-b-2 focus:border-b-[#0f6cbd] focus:outline-none"
};

/**
 * Described rather than re-implemented. The authoritative rule is `validateMemberPassword`
 * on the server, which returns the message naming whichever rule failed; duplicating the
 * check here would be a second implementation free to drift from it.
 */
const PASSWORD_RULE =
  "At least 8 characters. Under 12 must mix three of: lower case, upper case, digits, symbols.";

export function memberFullName(member: MemberAccount): string {
  return [member.first_prefix, member.name, member.father_name, member.surname]
    .filter((part) => part && part !== PREFIX_PLACEHOLDER)
    .join(" ")
    .trim();
}

function initials(member: MemberAccount): string {
  const source = [member.name, member.surname].filter(Boolean).join(" ") || member.its_no;
  return source
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

/** Dynamics colours an initials avatar from the record, so the same person keeps one colour. */
const AVATAR_COLOURS = [
  "bg-[#ebf3fc] text-[#0f6cbd]",
  "bg-[#f1faf1] text-[#0e700e]",
  "bg-[#fdf6f3] text-[#bc4b09]",
  "bg-[#f9f0fc] text-[#8764b8]",
  "bg-[#e9f5f6] text-[#00666d]",
  "bg-[#fdf3f4] text-[#a4262c]"
];

function avatarColour(seed: string) {
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLOURS[hash % AVATAR_COLOURS.length];
}

function MemberThumb({ member }: { member: MemberAccount }) {
  const { data: blob } = useGetMemberPhotoQuery(member.id, { skip: !member.has_photo });
  const [entry, setEntry] = useState<{ blob: Blob; url: string } | null>(null);

  useEffect(() => {
    if (!blob) return;

    const url = URL.createObjectURL(blob);
    setEntry({ blob, url });
    return () => URL.revokeObjectURL(url);
  }, [blob]);

  const url = blob && entry?.blob === blob ? entry.url : null;

  if (url) {
    return (
      <img
        src={url}
        alt={`${memberFullName(member) || member.its_no} photograph`}
        className="h-8 w-8 rounded-full object-cover"
      />
    );
  }

  return (
    <div
      className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold ${avatarColour(member.its_no)}`}
    >
      {initials(member) || "—"}
    </div>
  );
}

function contactNumber(primary: string | null, secondary: string | null) {
  return primary || secondary || "—";
}

/** A blank value, drawn quieter than real data so filled cells stand out. */
function Cell({ value }: { value: string | null | undefined }) {
  return value ? <>{value}</> : <span className="text-[#a0a0a0]">—</span>;
}

/* ---------- Fluent icons (20px regular), inline so nothing new is installed ---------- */

function Icon({ d, className = "" }: { d: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className={`h-4 w-4 shrink-0 fill-current ${className}`}
    >
      <path d={d} />
    </svg>
  );
}

const ICON = {
  add: "M10 2.5a.5.5 0 0 1 .5.5v6.5H17a.5.5 0 0 1 0 1h-6.5V17a.5.5 0 0 1-1 0v-6.5H3a.5.5 0 0 1 0-1h6.5V3a.5.5 0 0 1 .5-.5Z",
  refresh:
    "M15.65 4.35A7.5 7.5 0 1 0 17.5 10a.5.5 0 0 0-1 0 6.5 6.5 0 1 1-1.9-4.6H12a.5.5 0 0 0 0 1h3.5a.5.5 0 0 0 .5-.5V2.5a.5.5 0 0 0-1 0v1.85Z",
  search:
    "M8.5 3a5.5 5.5 0 0 1 4.23 9.02l4.12 4.13a.5.5 0 0 1-.63.76l-.07-.06-4.13-4.12A5.5 5.5 0 1 1 8.5 3Zm0 1a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9Z",
  info: "M10 2a8 8 0 1 1 0 16 8 8 0 0 1 0-16Zm0 1a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm0 6a.5.5 0 0 1 .5.5v4a.5.5 0 0 1-1 0v-4A.5.5 0 0 1 10 9Zm0-2.75a.75.75 0 1 1 0 1.5.75.75 0 0 1 0-1.5Z",
  error:
    "M10 2a8 8 0 1 1 0 16 8 8 0 0 1 0-16Zm0 1a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm0 9.5a.75.75 0 1 1 0 1.5.75.75 0 0 1 0-1.5Zm0-6.5a.5.5 0 0 1 .5.5v4.5a.5.5 0 0 1-1 0V6.5A.5.5 0 0 1 10 6Z",
  success:
    "M10 2a8 8 0 1 1 0 16 8 8 0 0 1 0-16Zm0 1a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm3.36 4.15a.5.5 0 0 1 .06.63l-.06.07-4 4a.5.5 0 0 1-.64.06l-.07-.06-2-2a.5.5 0 0 1 .64-.76l.07.06L9 10.79l3.65-3.64a.5.5 0 0 1 .71 0Z",
  dismiss:
    "m4.09 4.22.06-.07a.5.5 0 0 1 .63-.06l.07.06L10 9.29l5.15-5.14a.5.5 0 0 1 .63-.06l.07.06c.18.17.2.44.06.63l-.06.07L10.71 10l5.14 5.15c.18.17.2.44.06.63l-.06.07a.5.5 0 0 1-.63.06l-.07-.06L10 10.71l-5.15 5.14a.5.5 0 0 1-.63.06l-.07-.06a.5.5 0 0 1-.06-.63l.06-.07L9.29 10 4.15 4.85a.5.5 0 0 1-.06-.63l.06-.07-.06.07Z",
  block:
    "M10 2a8 8 0 1 1 0 16 8 8 0 0 1 0-16Zm5.06 3.65L5.65 15.06A7 7 0 0 0 15.06 5.65ZM10 3a7 7 0 0 0-5.06 11.35l9.41-9.41A6.97 6.97 0 0 0 10 3Z",
  play: "M7.6 3.2A1 1 0 0 0 6 4v12a1 1 0 0 0 1.6.8l8-6a1 1 0 0 0 0-1.6l-8-6ZM7 4l8 6-8 6V4Z",
  chevronLeft:
    "M12.35 15.85a.5.5 0 0 1-.7 0L6.16 10.4a.55.55 0 0 1 0-.78l5.49-5.46a.5.5 0 1 1 .7.7L7.2 10l5.16 5.15c.2.2.2.5 0 .7Z",
  chevronRight:
    "M7.65 4.15c.2-.2.5-.2.7 0l5.49 5.46c.21.22.21.57 0 .78l-5.49 5.46a.5.5 0 0 1-.7-.7L12.8 10 7.65 4.85a.5.5 0 0 1 0-.7Z"
};

/* ---------- Building blocks ---------- */

type CommandProps = {
  icon: string;
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
};

/** A command-bar button: icon and label, no fill until hovered. */
function Command({ icon, children, onClick, disabled }: CommandProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-8 items-center gap-1.5 rounded-[4px] px-2 text-sm text-[#242424] hover:bg-[#f5f5f5] active:bg-[#e0e0e0] disabled:cursor-not-allowed disabled:text-[#bdbdbd] disabled:hover:bg-transparent ${d365.focus}`}
    >
      <Icon d={icon} className="text-[#0f6cbd]" />
      {children}
    </button>
  );
}

type FluentButtonProps = {
  appearance?: "primary" | "secondary";
  type?: "button" | "submit";
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
};

function FluentButton({
  appearance = "secondary",
  type = "button",
  disabled,
  onClick,
  children
}: FluentButtonProps) {
  const look =
    appearance === "primary"
      ? "border-transparent bg-[#0f6cbd] text-white hover:bg-[#115ea3] active:bg-[#0c3b5e]"
      : "border-[#d1d1d1] bg-white text-[#242424] hover:bg-[#f5f5f5] hover:border-[#c7c7c7] active:bg-[#e0e0e0]";

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-8 min-w-[96px] items-center justify-center rounded-[4px] border px-3 text-sm font-semibold disabled:cursor-not-allowed disabled:border-[#e0e0e0] disabled:bg-[#f0f0f0] disabled:text-[#bdbdbd] ${look} ${d365.focus}`}
    >
      {children}
    </button>
  );
}

type Intent = "info" | "error" | "success";

const messageBarLook: Record<Intent, { box: string; icon: string; glyph: string }> = {
  info: { box: "bg-[#f5f5f5] border-[#e0e0e0]", icon: "text-[#616161]", glyph: ICON.info },
  error: { box: "bg-[#fdf3f4] border-[#eeacb2]", icon: "text-[#c50f1f]", glyph: ICON.error },
  success: { box: "bg-[#f1faf1] border-[#9fd89f]", icon: "text-[#107c10]", glyph: ICON.success }
};

/** Fluent message bar: one band, icon first, optional dismiss on the right. */
function MessageBar({
  intent,
  children,
  onDismiss,
  role
}: {
  intent: Intent;
  children: ReactNode;
  onDismiss?: () => void;
  role?: "alert" | "status";
}) {
  const look = messageBarLook[intent];
  return (
    <div
      role={role}
      className={`flex items-start gap-2 rounded-[4px] border px-3 py-2 text-[13px] leading-5 text-[#242424] ${look.box}`}
    >
      <Icon d={look.glyph} className={`mt-0.5 ${look.icon}`} />
      <div className="min-w-0 flex-1">{children}</div>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          className={`-mr-1 rounded-[4px] p-1 text-[#424242] hover:bg-black/5 ${d365.focus}`}
        >
          Dismiss
        </button>
      ) : null}
    </div>
  );
}

function Field({
  label,
  hint,
  required,
  children
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-[#242424]">
        {label}
        {required ? (
          <span aria-hidden="true" className="ml-1 text-[#c50f1f]">
            *
          </span>
        ) : null}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-[#616161]">{hint}</span> : null}
    </label>
  );
}

const EMPTY_FORM = { its_no: "", member_name: "", password: "" };

/**
 * Creates one account: ITS number, full name, password. Shown as a Dynamics quick-create
 * panel over the grid, so the operator keeps their place in the list.
 *
 * The password is shown on request rather than confirmed in a second field. A typo here is
 * expensive — the member cannot sign in, and this page cannot reset a password — so the
 * operator needs to be able to READ what they typed. A confirm field only proves the same
 * typo twice when the value is pasted.
 */
function AddMemberForm({
  isZonalHead,
  onCreated,
  onClose
}: {
  isZonalHead: boolean;
  onCreated: (account: CreatedMemberAccount) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [createMember, createState] = useCreateMemberAccountMutation();

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function set(field: keyof typeof EMPTY_FORM, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setFormError(null);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    const itsNo = form.its_no.trim();
    const memberName = form.member_name.trim();

    // Only the two checks that need no knowledge of the password policy, so the operator is
    // not made to wait on a round trip for an obviously empty field. Everything else,
    // including the password rules, is the server's answer to report.
    if (!/^\d{6,20}$/.test(itsNo)) {
      setFormError("ITS No must be 6 to 20 digits.");
      return;
    }
    if (!memberName) {
      setFormError("Full name is required.");
      return;
    }

    try {
      const created = await createMember({
        its_no: itsNo,
        member_name: memberName,
        password: form.password
      }).unwrap();

      setForm(EMPTY_FORM);
      setShowPassword(false);
      onCreated(created);
    } catch (err: any) {
      // The server names the rule that failed — the ITS format, the password policy, or an
      // ITS number already taken. Showing that beats a generic failure message.
      setFormError(err?.data?.message ?? "Could not create this member. Please try again.");
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-create-title"
        onSubmit={onSubmit}
        className={`relative flex h-full w-full max-w-[440px] flex-col bg-white shadow-[0_0_8px_rgba(0,0,0,0.12),0_32px_64px_rgba(0,0,0,0.14)] motion-safe:animate-[d365-slide_200ms_cubic-bezier(0.1,0.9,0.2,1)] ${d365.font}`}
      >
        <div className="flex items-center justify-between border-b border-[#e0e0e0] px-6 py-4">
          <h2 id="quick-create-title" className="text-xl font-semibold text-[#242424]">
            Quick create: Member
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className={`rounded-[4px] p-1.5 text-[#424242] hover:bg-[#f5f5f5] ${d365.focus}`}
          >
            <Icon d={ICON.dismiss} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          <p className="text-[13px] text-[#616161]">
            Zone, party and the rest of the profile are filled in by the member.
          </p>

          <Field label="ITS No" hint="6 to 20 digits" required>
            <input
              className={d365.field}
              value={form.its_no}
              onChange={(e) => set("its_no", e.target.value)}
              inputMode="numeric"
              autoComplete="off"
              placeholder="e.g. 40480241"
              required
              autoFocus
            />
          </Field>

          <Field label="Full Name" required>
            <input
              className={d365.field}
              value={form.member_name}
              onChange={(e) => set("member_name", e.target.value)}
              autoComplete="off"
              placeholder="First Prefix, Name, Father Name, Surname"
              maxLength={150}
              required
            />
          </Field>

          <div>
            <Field label="Password" hint={PASSWORD_RULE} required>
              <input
                className={d365.field}
                type={showPassword ? "text" : "password"}
                value={form.password}
                onChange={(e) => set("password", e.target.value)}
                autoComplete="new-password"
                required
              />
            </Field>
            <button
              type="button"
              className={`mt-1 rounded-[2px] text-xs font-semibold text-[#0f6cbd] hover:underline ${d365.focus}`}
              onClick={() => setShowPassword((v) => !v)}
            >
              {showPassword ? "Hide password" : "Show password"}
            </button>
          </div>

          <MessageBar intent="info">
            The member signs in with this password once and must then set their own. Note it
            down before saving — it cannot be read back, and this page cannot reset it.
            {isZonalHead ? (
              <>
                {" "}
                <strong>They will not appear in your list yet.</strong>{" "}
                A new account has no zone until the member chooses one in their own profile.
              </>
            ) : null}
          </MessageBar>

          {formError ? (
            <MessageBar intent="error" role="alert">
              {formError}
            </MessageBar>
          ) : null}
        </div>

        <div className="flex gap-2 border-t border-[#e0e0e0] px-6 py-4">
          <FluentButton appearance="primary" type="submit" disabled={createState.isLoading}>
            {createState.isLoading ? "Creating..." : "Create member"}
          </FluentButton>
          <FluentButton onClick={onClose}>Cancel</FluentButton>
        </div>
      </form>
    </div>
  );
}

const headerCell =
  "h-10 border-b border-[#e0e0e0] px-3 text-left text-[13px] font-semibold text-[#424242] whitespace-nowrap";
const bodyCell = "h-11 px-3 text-sm text-[#242424] whitespace-nowrap";

export function MembersPage() {
  const role = useAppSelector((s) => s.auth.user?.role);
  const isZonalHead = role === "zonal_head";

  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [created, setCreated] = useState<CreatedMemberAccount[]>([]);

  const queryArg = useMemo(
    () => ({
      q: search.trim() || undefined,
      is_active: activeFilter === "all" ? undefined : activeFilter === "active",
      page,
      page_size: PAGE_SIZE
    }),
    [search, activeFilter, page]
  );

  const { data, isLoading, isFetching, error, refetch } = useGetMemberAccountsQuery(queryArg);
  const [setMemberActive, setActiveState] = useSetMemberActiveMutation();

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const firstRow = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastRow = Math.min(total, page * PAGE_SIZE);

  async function onToggle(member: MemberAccount) {
    setActionError(null);
    try {
      await setMemberActive({ id: member.id, is_active: !member.is_active }).unwrap();
    } catch {
      setActionError(
        `Could not ${member.is_active ? "deactivate" : "activate"} ${member.its_no}. Please try again.`
      );
    }
  }

  return (
    <div className={`-m-1 overflow-hidden rounded-[4px] bg-[#faf9f8] ${d365.font}`}>
      <style>{`@keyframes d365-slide { from { transform: translateX(40px); opacity: 0 } to { transform: none; opacity: 1 } }`}</style>

      {/* Command bar */}
      <div className="flex flex-wrap items-center gap-0.5 border-b border-[#e0e0e0] bg-white px-2 py-1">
        <Command icon={ICON.add} onClick={() => setShowAddForm(true)}>
          Add member
        </Command>
        <Command icon={ICON.refresh} onClick={() => refetch()} disabled={isFetching}>
          Refresh
        </Command>
      </div>

      <div className="space-y-3 p-4">
        {/* View header: the view selector is the title, the quick find sits opposite */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            <label htmlFor="members-view" className="sr-only">
              View
            </label>
            <select
              id="members-view"
              value={activeFilter}
              onChange={(e) => {
                setActiveFilter(e.target.value);
                setPage(1);
              }}
              className={`cursor-pointer appearance-none rounded-[4px] bg-transparent bg-[url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20'%3E%3Cpath fill='%23242424' d='M15.85 7.65a.5.5 0 0 1 0 .7l-5.5 5.5a.5.5 0 0 1-.7 0l-5.5-5.5a.5.5 0 1 1 .7-.7L10 12.79l5.15-5.14a.5.5 0 0 1 .7 0Z'/%3E%3C/svg%3E")] bg-[length:16px] bg-[right_6px_center] bg-no-repeat py-1 pl-2 pr-8 text-xl font-semibold text-[#242424] hover:bg-[#f0f0f0] ${d365.focus}`}
            >
              {activeFilterOptions.map((o) => (
                <option key={o.value} value={o.value} className="text-sm font-normal">
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="relative w-full sm:w-72">
            <Icon
              d={ICON.search}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#616161]"
            />
            <input
              type="search"
              aria-label="Filter by ITS No or name"
              placeholder="Filter by ITS No or name"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className={`${d365.field} pl-8`}
            />
          </div>
        </div>

        {/* Kept on screen after the form closes. For a Zonal Head this is the ONLY confirmation
            the account exists, since a member with no zone yet is outside their list. */}
        {created.length ? (
          <MessageBar intent="success" role="status" onDismiss={() => setCreated([])}>
            <div className="font-semibold">
              Created {created.length} member{created.length === 1 ? "" : "s"} just now
            </div>
            <ul className="mt-0.5 space-y-0.5">
              {created.map((account) => (
                <li key={account.id}>
                  <span className="font-semibold">{account.its_no}</span> {account.member_name}
                  <span className="text-[#616161]">, must change password at first sign-in</span>
                </li>
              ))}
            </ul>
          </MessageBar>
        ) : null}

        <MessageBar intent="info">
          {isZonalHead
            ? "This list shows members posted to your zone. A member appears here once they have chosen your zone in their own profile, so an account you have just created is not listed yet."
            : "Accounts can be added here one at a time, or from a roster under Import/Export."}{" "}
          The member&apos;s health and other profile answers stay private to them.{" "}
          {/* Asked twice why these columns were blank. They are blank because the member has
              not filled them: nothing on this page can set them, so saying where they come
              from is more use than another dash. */}
          Zone, Party, WhatsApp and Mobile numbers are entered by the member in their own
          profile — contact numbers on <strong>Tab 1 Personal</strong>, Zone and Party on{" "}
          <strong>Tab 3 Hizb</strong>. Each shows a dash until the member saves it, and it
          cannot be filled in from here.
        </MessageBar>

        {error ? (
          <MessageBar intent="error" role="alert">
            Could not load member accounts.
          </MessageBar>
        ) : null}

        {actionError ? (
          <MessageBar intent="error" role="alert">
            {actionError}
          </MessageBar>
        ) : null}

        {/* Grid */}
        <div className="overflow-hidden rounded-[4px] border border-[#e0e0e0] bg-white shadow-[0_0_2px_rgba(0,0,0,0.12),0_1px_2px_rgba(0,0,0,0.14)]">
          {isLoading ? (
            <div className="px-4 py-10 text-center text-sm text-[#616161]">Loading accounts...</div>
          ) : items.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-[#616161]">
              {isZonalHead
                ? "No members are posted to your zone yet. A member you create appears here after they choose your zone in their profile."
                : "No member accounts match. Add one above, or upload a roster under Import/Export."}
            </div>
          ) : (
            <div className={`overflow-x-auto transition-opacity ${isFetching ? "opacity-60" : ""}`}>
              <table className="w-full min-w-[56rem] border-collapse">
                <thead className="bg-white">
                  <tr>
                    <th className={`${headerCell} w-14`}>Picture</th>
                    <th className={headerCell}>ITS No</th>
                    <th className={headerCell}>Name</th>
                    <th className={headerCell}>Zone</th>
                    <th className={headerCell}>Party</th>
                    <th className={headerCell}>WhatsApp No.</th>
                    <th className={headerCell}>Mobile No.</th>
                    <th className={`${headerCell} text-right`}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((member) => (
                    <tr
                      key={member.id}
                      className={`border-b border-[#f0f0f0] last:border-0 hover:bg-[#f5f5f5] ${
                        member.is_active ? "" : "text-[#707070]"
                      }`}
                    >
                      <td className={bodyCell}>
                        <MemberThumb member={member} />
                      </td>
                      <td className={`${bodyCell} font-semibold text-[#0f6cbd] tabular-nums`}>
                        {member.its_no}
                      </td>
                      <td className={bodyCell}>
                        {memberFullName(member) || member.member_name || "—"}
                      </td>
                      <td className={bodyCell}>
                        <Cell value={member.zone_name} />
                      </td>
                      <td className={bodyCell}>
                        <Cell value={member.party_name} />
                      </td>
                      <td className={`${bodyCell} tabular-nums`}>
                        {contactNumber(member.whatsapp_no_1, member.whatsapp_no_2)}
                      </td>
                      <td className={`${bodyCell} tabular-nums`}>
                        {contactNumber(member.mobile_no_1, member.mobile_no_2)}
                      </td>
                      <td className={`${bodyCell} text-right`}>
                        <button
                          type="button"
                          disabled={setActiveState.isLoading}
                          onClick={() => onToggle(member)}
                          className={`inline-flex h-7 items-center gap-1.5 rounded-[4px] px-2 text-[13px] font-semibold hover:bg-[#ebebeb] disabled:cursor-not-allowed disabled:text-[#bdbdbd] ${
                            member.is_active ? "text-[#c50f1f]" : "text-[#0f6cbd]"
                          } ${d365.focus}`}
                        >
                          <Icon d={member.is_active ? ICON.block : ICON.play} />
                          {member.is_active ? "Deactivate" : "Activate"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Footer: record range on the left, paging on the right, as in Dynamics */}
          <div className="flex items-center justify-between gap-2 border-t border-[#e0e0e0] px-3 py-1.5 text-[13px] text-[#424242]">
            <div aria-live="polite">
              {isLoading ? "Loading..." : `Rows: ${firstRow} - ${lastRow} of ${total}`}
            </div>
            {lastPage > 1 ? (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label="Previous"
                  disabled={page <= 1 || isFetching}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className={`rounded-[4px] p-1.5 hover:bg-[#f5f5f5] disabled:cursor-not-allowed disabled:text-[#bdbdbd] disabled:hover:bg-transparent ${d365.focus}`}
                >
                  <Icon d={ICON.chevronLeft} />
                </button>
                <span>
                  Page {page} of {lastPage}
                </span>
                <button
                  type="button"
                  aria-label="Next"
                  disabled={page >= lastPage || isFetching}
                  onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
                  className={`rounded-[4px] p-1.5 hover:bg-[#f5f5f5] disabled:cursor-not-allowed disabled:text-[#bdbdbd] disabled:hover:bg-transparent ${d365.focus}`}
                >
                  <Icon d={ICON.chevronRight} />
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {showAddForm ? (
        <AddMemberForm
          isZonalHead={isZonalHead}
          onCreated={(account) => setCreated((prev) => [account, ...prev])}
          onClose={() => setShowAddForm(false)}
        />
      ) : null}
    </div>
  );
}
