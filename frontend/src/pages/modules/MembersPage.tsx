import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { Button } from "../../components/ui/Button";
import { composeFullName } from "../../features/member/fullName";
import { useAppSelector } from "../../hooks/storeHooks";
import {
  useCreateMemberAccountMutation,
  useGetMemberAccountsQuery,
  useGetMemberPhotoQuery,
  useResetMemberPasswordMutation,
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
 */

const PAGE_SIZE = 25;


const activeFilterOptions = [
  { value: "all", label: "All accounts" },
  { value: "active", label: "Active only" },
  { value: "inactive", label: "Inactive only" }
];

/**
 * Described rather than re-implemented. The authoritative rule is `validateMemberPassword`
 * on the server, which returns the message naming whichever rule failed; duplicating the
 * check here would be a second implementation free to drift from it.
 */
const PASSWORD_RULE =
  "At least 8 characters. Under 12 must mix three of: lower case, upper case, digits, symbols.";

/** FR-034a. The shared composition, so the list and the profile agree. */
export function memberFullName(member: MemberAccount): string {
  return composeFullName(member);
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
        className="h-10 w-10 rounded-full object-cover"
      />
    );
  }

  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface text-xs font-semibold text-textMuted">
      {initials(member) || "—"}
    </div>
  );
}

function contactNumber(primary: string | null, secondary: string | null) {
  return primary || secondary || "—";
}

const EMPTY_FORM = { its_no: "", member_name: "", password: "" };

/**
 * Creates one account: ITS number, full name, password.
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
    <Card>
      <form className="space-y-3" onSubmit={onSubmit}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="text-lg font-semibold">Add member</div>
          <div className="text-xs text-textMuted">
            Zone, party and the rest of the profile are filled in by the member.
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Input
            label="ITS No"
            value={form.its_no}
            onChange={(e) => set("its_no", e.target.value)}
            inputMode="numeric"
            autoComplete="off"
            placeholder="e.g. 40480241"
            helperText="6 to 20 digits"
            required
          />
          <Input
            label="Full Name"
            value={form.member_name}
            onChange={(e) => set("member_name", e.target.value)}
            autoComplete="off"
            placeholder="First Prefix, Name, Father Name, Surname"
            maxLength={150}
            required
          />
          <div>
            <Input
              label="Password"
              type={showPassword ? "text" : "password"}
              value={form.password}
              onChange={(e) => set("password", e.target.value)}
              autoComplete="new-password"
              helperText={PASSWORD_RULE}
              required
            />
            <button
              type="button"
              className="mt-1 text-xs font-semibold text-primary underline"
              onClick={() => setShowPassword((v) => !v)}
            >
              {showPassword ? "Hide password" : "Show password"}
            </button>
          </div>
        </div>

        <div className="rounded-input border border-border bg-surface p-2 text-xs text-textMuted">
          The member signs in with this password once and must then set their own. Note it
          down before saving — it cannot be read back, and this page cannot reset it.
          {isZonalHead ? (
            <>
              {" "}
              <strong>They will not appear in your list yet.</strong>{" "}
              A new account has no zone until the member chooses one in their own profile.
            </>
          ) : null}
        </div>

        {formError ? (
          <div
            role="alert"
            className="rounded-input border border-danger bg-danger/5 p-2 text-sm text-danger"
          >
            {formError}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={createState.isLoading}>
            {createState.isLoading ? "Creating..." : "Create member"}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}

/**
 * Resets one member's password (FR-005a).
 *
 * A panel above the table rather than a control in the row. The row is narrow, and more
 * importantly this is not a small action: it signs the member out everywhere, clears any
 * lockout and forces a change at their next sign-in. Naming the member at the top of a
 * panel makes it much harder to reset the wrong one than a button in the fifth column of
 * row forty would.
 *
 * The password can be revealed, for the same reason the Add form allows it: the
 * administrator has to read this value out to the member, and a typo they cannot see is a
 * member who simply cannot sign in.
 */
function ResetPasswordPanel({
  member,
  onDone,
  onClose
}: {
  member: MemberAccount;
  onDone: (member: MemberAccount) => void;
  onClose: () => void;
}) {
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetPassword, state] = useResetMemberPasswordMutation();

  const name = memberFullName(member) || member.member_name || member.its_no;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await resetPassword({ id: member.id, password }).unwrap();
      setPassword("");
      onDone(member);
      onClose();
    } catch (err: unknown) {
      // Surfaced verbatim: the server names the rule that failed, and "could not reset"
      // would throw that away.
      const message = (err as { data?: { message?: string } } | undefined)?.data?.message;
      setError(typeof message === "string" && message ? message : "Could not reset the password.");
    }
  }

  return (
    <Card>
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="text-sm font-semibold">
          Reset password for {name} ({member.its_no})
        </div>

        <div className="rounded-input border border-warning bg-warning/5 p-2 text-xs text-warning">
          This signs the member out everywhere and clears any sign-in lockout. They will have
          to change this password the next time they sign in, so tell it to them directly.
        </div>

        {error ? (
          <div className="rounded-input border border-danger bg-danger/5 p-2 text-sm text-danger">
            {error}
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Input
              label="New Password"
              type={show ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              helperText={PASSWORD_RULE}
              autoComplete="new-password"
            />
            <button
              type="button"
              className="mt-1 text-xs underline"
              onClick={() => setShow((v) => !v)}
            >
              {show ? "Hide password" : "Show password"}
            </button>
          </div>
        </div>

        <div className="flex gap-2">
          <Button type="submit" disabled={state.isLoading}>
            {state.isLoading ? "Resetting..." : "Reset password"}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose} disabled={state.isLoading}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function MembersPage() {
  const role = useAppSelector((s) => s.auth.user?.role);
  const isZonalHead = role === "zonal_head";

  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [created, setCreated] = useState<CreatedMemberAccount[]>([]);
  const [resetTarget, setResetTarget] = useState<MemberAccount | null>(null);
  const [resetDone, setResetDone] = useState<string | null>(null);

  const queryArg = useMemo(
    () => ({
      q: search.trim() || undefined,
      is_active: activeFilter === "all" ? undefined : activeFilter === "active",
      page,
      page_size: PAGE_SIZE
    }),
    [search, activeFilter, page]
  );

  const { data, isLoading, isFetching, error } = useGetMemberAccountsQuery(queryArg);
  const [setMemberActive, setActiveState] = useSetMemberActiveMutation();

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

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
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-2xl font-bold">Members</div>
        <div className="flex items-center gap-3">
          <div className="text-sm text-textMuted">
            {isLoading ? "Loading..." : `${total} account${total === 1 ? "" : "s"}`}
          </div>
          {!showAddForm ? (
            <Button onClick={() => setShowAddForm(true)}>Add member</Button>
          ) : null}
        </div>
      </div>

      {resetTarget ? (
        <ResetPasswordPanel
          member={resetTarget}
          onDone={(member) =>
            setResetDone(
              `${memberFullName(member) || member.member_name || member.its_no} (${member.its_no})`
            )
          }
          onClose={() => setResetTarget(null)}
        />
      ) : null}

      {resetDone ? (
        <div className="rounded-input border border-primary bg-primary/5 p-3 text-sm">
          Password reset for <span className="font-semibold">{resetDone}</span>. They must
          change it at their next sign-in.
        </div>
      ) : null}

      {showAddForm ? (
        <AddMemberForm
          isZonalHead={isZonalHead}
          onCreated={(account) => setCreated((prev) => [account, ...prev])}
          onClose={() => setShowAddForm(false)}
        />
      ) : null}

      {/* Kept on screen after the form closes. For a Zonal Head this is the ONLY confirmation
          the account exists, since a member with no zone yet is outside their list. */}
      {created.length ? (
        <div className="rounded-input border border-primary bg-primary/5 p-3 text-sm">
          <div className="font-semibold">
            Created {created.length} member{created.length === 1 ? "" : "s"} just now
          </div>
          <ul className="mt-1 space-y-0.5">
            {created.map((account) => (
              <li key={account.id}>
                <span className="font-semibold">{account.its_no}</span> — {account.member_name}
                <span className="text-textMuted"> · must change password at first sign-in</span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="mt-2 text-xs font-semibold text-primary underline"
            onClick={() => setCreated([])}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      <Card>
        <div className="space-y-3">
          <div className="text-sm text-textMuted">
            {isZonalHead
              ? "This list shows members posted to your zone. A member appears here once they have chosen your zone in their own profile, so an account you have just created is not listed yet."
              : "Accounts can be added here one at a time, or from a roster under Import/Export."}{" "}
            The member&apos;s health and other profile answers stay private to them.
          </div>

          {/* Asked twice why these columns were blank. They are blank because the member has
              not filled them: nothing on this page can set them, so saying where they come
              from is more use than another dash. */}
          <div className="rounded-input border border-border bg-surface p-2 text-xs text-textMuted">
            Zone, Party, WhatsApp and Mobile numbers are entered by the member in their own
            profile — contact numbers on the <strong>Personal</strong> tab, Zone and Party on
            the <strong>Hizb</strong> tab. Each shows a dash until the member saves it, and it
            cannot be filled in from here.
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Search"
              placeholder="ITS No or name"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
            <Select
              label="Status"
              value={activeFilter}
              onChange={(e) => {
                setActiveFilter(e.target.value);
                setPage(1);
              }}
              options={activeFilterOptions}
            />
          </div>
        </div>
      </Card>

      {error ? (
        <div
          role="alert"
          className="rounded-input border border-danger bg-danger/5 p-2 text-sm text-danger"
        >
          Could not load member accounts.
        </div>
      ) : null}

      {actionError ? (
        <div
          role="alert"
          className="rounded-input border border-danger bg-danger/5 p-2 text-sm text-danger"
        >
          {actionError}
        </div>
      ) : null}

      <Card>
        {isLoading ? (
          <div className="p-2 text-sm text-textMuted">Loading accounts...</div>
        ) : items.length === 0 ? (
          <div className="p-2 text-sm text-textMuted">
            {isZonalHead
              ? "No members are posted to your zone yet. A member you create appears here after they choose your zone in their profile."
              : "No member accounts match. Add one above, or upload a roster under Import/Export."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase text-textMuted">
                  <th className="px-2 py-2">Picture</th>
                  <th className="px-2 py-2">ITS No</th>
                  <th className="px-2 py-2">Name</th>
                  <th className="px-2 py-2">Zone</th>
                  <th className="px-2 py-2">Party</th>
                  <th className="px-2 py-2">WhatsApp No.</th>
                  <th className="px-2 py-2">Mobile No.</th>
                  <th className="px-2 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {items.map((member) => (
                  <tr key={member.id} className="border-b border-border last:border-0">
                    <td className="px-2 py-2">
                      <MemberThumb member={member} />
                    </td>
                    <td className="px-2 py-2 font-semibold">{member.its_no}</td>
                    <td className="px-2 py-2">{memberFullName(member) || member.member_name || "—"}</td>
                    <td className="px-2 py-2">{member.zone_name || "—"}</td>
                    <td className="px-2 py-2">{member.party_name || "—"}</td>
                    <td className="px-2 py-2">
                      {contactNumber(member.whatsapp_no_1, member.whatsapp_no_2)}
                    </td>
                    <td className="px-2 py-2">
                      {contactNumber(member.mobile_no_1, member.mobile_no_2)}
                    </td>
                    <td className="px-2 py-2 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {/* FR-047a. Both roles read the twelve tabs; only an administrator
                            can save, which the profile page learns from the server. */}
                        <Link
                          to={`/members/${member.id}/profile`}
                          className="whitespace-nowrap text-sm underline"
                        >
                          View profile
                        </Link>
                        {/* FR-005a. Administrators only — the server refuses a Zonal Head,
                            and offering a button that gets refused is worse than no button. */}
                        {!isZonalHead ? (
                          <button
                            type="button"
                            className="whitespace-nowrap text-sm underline"
                            onClick={() => {
                              setResetDone(null);
                              setResetTarget(member);
                            }}
                          >
                            Reset password
                          </button>
                        ) : null}
                        <Button
                          variant={member.is_active ? "danger" : "primary"}
                          disabled={setActiveState.isLoading}
                          onClick={() => onToggle(member)}
                        >
                          {member.is_active ? "Deactivate" : "Activate"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {lastPage > 1 ? (
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="secondary"
            disabled={page <= 1 || isFetching}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <div className="text-sm text-textMuted">
            Page {page} of {lastPage}
          </div>
          <Button
            variant="secondary"
            disabled={page >= lastPage || isFetching}
            onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
          >
            Next
          </Button>
        </div>
      ) : null}
    </div>
  );
}
