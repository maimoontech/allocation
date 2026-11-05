import { Link } from "react-router-dom";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { useGetMemberLookupIndexQuery } from "../../features/member/memberLookupAdminApi";

/**
 * Index of the membership module's eleven dropdown lists.
 *
 * Five of these — Titles, Sharaf, Halqas, Mozes, Places Visited — were created **empty**,
 * because filling them would have meant inventing religious and organisational terms or place
 * names. Members can complete the rest of their profile without them, but the tabs that depend
 * on them stay unusable until someone who knows the right values enters them. This page makes
 * that state visible rather than leaving it in a spec document: an empty list is called out,
 * and so is a list still carrying seeded values nobody has reviewed.
 */
export function MemberLookupsPage() {
  const indexQuery = useGetMemberLookupIndexQuery();

  const lists = indexQuery.data ?? [];
  const empty = lists.filter((l) => l.total === 0);
  const withDrafts = lists.filter((l) => l.draft > 0);

  return (
    <div className="space-y-4">
      <div className="text-2xl font-bold">Member Dropdown Lists</div>

      <Card>
        <div className="text-sm text-textMuted">
          These are the dropdown options members choose from on their profile. Changes take
          effect immediately — the next member to open the form sees them.
        </div>
      </Card>

      {indexQuery.isLoading ? (
        <div className="p-2 text-sm text-textMuted">Loading...</div>
      ) : indexQuery.isError ? (
        <Card>
          <div className="text-sm text-danger">
            Could not load the lists.{" "}
            <button type="button" className="underline" onClick={() => indexQuery.refetch()}>
              Try again
            </button>
          </div>
        </Card>
      ) : (
        <>
          {empty.length > 0 ? (
            <Card>
              <div className="mb-1 text-sm font-semibold text-warning">
                {empty.length} {empty.length === 1 ? "list is" : "lists are"} still empty
              </div>
              <div className="text-sm text-textMuted">
                Members cannot fill in the tabs that use{" "}
                {empty.map((l) => l.label).join(", ")} until these have values. Everything else
                on their profile still works.
              </div>
            </Card>
          ) : null}

          {withDrafts.length > 0 ? (
            <Card>
              <div className="mb-1 text-sm font-semibold text-warning">
                Values awaiting review
              </div>
              <div className="text-sm text-textMuted">
                {withDrafts.map((l) => `${l.label} (${l.draft})`).join(", ")} contain starter
                values that were suggested, not confirmed. Members currently see them marked{" "}
                <span className="font-semibold">DRAFT — NEEDS REVIEW</span>. Open a list and
                clear the Draft flag on each value you are happy with.
              </div>
            </Card>
          ) : null}

          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="py-2 pr-3 font-semibold">List</th>
                    <th className="py-2 pr-3 font-semibold">Where members see it</th>
                    <th className="py-2 pr-3 text-right font-semibold">Values</th>
                    <th className="py-2 pr-3 text-right font-semibold">Active</th>
                    <th className="py-2 pr-3 text-right font-semibold">Draft</th>
                    <th className="py-2 font-semibold" />
                  </tr>
                </thead>
                <tbody>
                  {lists.map((l) => (
                    <tr key={l.entity} className="border-b border-border/60 align-top">
                      <td className="py-2 pr-3 font-semibold">{l.label}</td>
                      <td className="py-2 pr-3 text-textMuted">{l.used_for}</td>
                      <td className="py-2 pr-3 text-right">
                        {l.total === 0 ? (
                          <span className="font-semibold text-warning">Empty</span>
                        ) : (
                          l.total
                        )}
                      </td>
                      <td className="py-2 pr-3 text-right">{l.active}</td>
                      <td className="py-2 pr-3 text-right">
                        {l.draft > 0 ? (
                          <span className="font-semibold text-warning">{l.draft}</span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-2 text-right">
                        <Link to={`/member-lookups/${l.entity}`}>
                          <Button variant="ghost" className="px-2 py-1 text-xs">
                            {l.total === 0 ? "Add values" : "Manage"}
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
