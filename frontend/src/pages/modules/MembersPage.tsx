import { useEffect, useMemo, useState } from "react";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { Button } from "../../components/ui/Button";
import {
  useGetMemberAccountsQuery,
  useGetMemberPhotoQuery,
  useSetMemberActiveMutation,
  type MemberAccount
} from "../../features/member/memberAdminApi";

/**
 * Administrator view of member ACCOUNTS (FR-006, FR-007).
 *
 * Shows the identifying details an administrator needs — photograph, ITS number, name parts,
 * zone and party posting, and contact numbers — plus the activate/deactivate action, whose
 * label carries the account's current state. The rest of the twelve-tab profile, including
 * every health value, stays private to the member (FR-065, FR-101).
 *
 * Accounts are CREATED through Import/Export, not here, so that one code path hashes
 * passwords (FR-015).
 */

const PAGE_SIZE = 25;

const PREFIX_PLACEHOLDER = "None";

const activeFilterOptions = [
  { value: "all", label: "All accounts" },
  { value: "active", label: "Active only" },
  { value: "inactive", label: "Inactive only" }
];

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

export function MembersPage() {
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [actionError, setActionError] = useState<string | null>(null);

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
        <div className="text-sm text-textMuted">
          {isLoading ? "Loading..." : `${total} account${total === 1 ? "" : "s"}`}
        </div>
      </div>

      <Card>
        <div className="space-y-3">
          <div className="text-sm text-textMuted">
            Member accounts are created from a roster under <strong>Import/Export</strong>.
            This page shows identifying details and account status; the member&apos;s health
            and other profile answers stay private to them.
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
            No member accounts match. Upload a roster under Import/Export to create them.
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
                      <Button
                        variant={member.is_active ? "danger" : "primary"}
                        disabled={setActiveState.isLoading}
                        onClick={() => onToggle(member)}
                      >
                        {member.is_active ? "Deactivate" : "Activate"}
                      </Button>
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
