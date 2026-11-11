import { useEffect, useMemo, useState } from "react";
import { composeFullName } from "../../features/member/fullName";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";
import {
  useGetPartyMemberPhotoQuery,
  useGetPartyMembersQuery,
  type PartyMember
} from "../../features/party/partyMemberApi";

/**
 * The party's own members.
 *
 * Scoped by the server: the party id comes from the signed-in token, so this page cannot be
 * widened by editing the URL. It shows a name, an ITS number and the uploaded photograph —
 * nothing from the twelve-tab profile, no contact details, no health values, no account state.
 */

const PAGE_SIZE = 25;

/**
 * FR-034a. This page already composed the name the way the requirement now states, which is
 * why the other three were brought to match it rather than the other way round. It delegates
 * so there is one definition and not a fourth.
 */
export function fullName(member: PartyMember): string {
  return composeFullName(member);
}

function initials(member: PartyMember): string {
  const source = [member.name, member.surname].filter(Boolean).join(" ") || member.its_no;
  return source
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function MemberThumb({ member }: { member: PartyMember }) {
  const { data: blob } = useGetPartyMemberPhotoQuery(member.id, {
    skip: !member.has_photo
  });
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
        alt={`${fullName(member) || member.its_no} photograph`}
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

export function PartyMembersPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const queryArg = useMemo(
    () => ({ q: search.trim() || undefined, page, page_size: PAGE_SIZE }),
    [search, page]
  );

  const { data, isLoading, isFetching, error } = useGetPartyMembersQuery(queryArg);

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-2xl font-bold">Members</div>
        <div className="text-sm text-textMuted">
          {isLoading ? "Loading..." : `${total} member${total === 1 ? "" : "s"}`}
        </div>
      </div>

      <Card>
        <Input
          label="Search"
          placeholder="ITS No or name"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
      </Card>

      {error ? (
        <div
          role="alert"
          className="rounded-input border border-danger bg-danger/5 p-2 text-sm text-danger"
        >
          Could not load your party members.
        </div>
      ) : null}

      <Card>
        {isLoading ? (
          <div className="p-2 text-sm text-textMuted">Loading members...</div>
        ) : items.length === 0 ? (
          <div className="p-2 text-sm text-textMuted">
            No members of your party match. Members appear here once their profile records
            your party.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[22rem] text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase text-textMuted">
                  <th className="px-2 py-2">Photo</th>
                  <th className="px-2 py-2">ITS No</th>
                  <th className="px-2 py-2">Name</th>
                </tr>
              </thead>
              <tbody>
                {items.map((member) => (
                  <tr key={member.id} className="border-b border-border last:border-0">
                    <td className="px-2 py-2">
                      <MemberThumb member={member} />
                    </td>
                    <td className="px-2 py-2 font-semibold">{member.its_no}</td>
                    <td className="px-2 py-2">{fullName(member) || "—"}</td>
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
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            Previous
          </Button>
          <div className="text-sm text-textMuted">
            Page {page} of {lastPage}
          </div>
          <Button
            variant="secondary"
            disabled={page >= lastPage || isFetching}
            onClick={() => setPage((current) => Math.min(lastPage, current + 1))}
          >
            Next
          </Button>
        </div>
      ) : null}
    </div>
  );
}
