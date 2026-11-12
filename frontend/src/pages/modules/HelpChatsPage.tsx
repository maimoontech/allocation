import { useState } from "react";
import { Card } from "../../components/ui/Card";
import { Select } from "../../components/ui/Select";
import { Button } from "../../components/ui/Button";
import { useGetHelpChatsQuery } from "../../features/member/helpChatApi";

/**
 * Admin → Help Chats (FR-110).
 *
 * Every question a member asked the Need Help agent, with the reply and the rating.
 *
 * The two numbers at the top are the point of the page. The average rating says whether the
 * answers are landing; **unanswered** says how often the agent had nothing to say at all,
 * which is the one that tells you what to add next. A question with no match is stored with
 * its reply exactly like any other, so the list shows what was asked.
 */
export function HelpChatsPage() {
  const [page, setPage] = useState(1);
  const [rated, setRated] = useState("all");

  const { data, isLoading, isFetching, error } = useGetHelpChatsQuery({ page, rated });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pageSize = data?.page_size ?? 50;
  const lastPage = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <div className="text-2xl font-bold">Help Chats</div>

      <Card>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap gap-6 text-sm">
            <div>
              <div className="text-textMuted">Questions asked</div>
              <div className="text-xl font-semibold">{total}</div>
            </div>
            <div>
              <div className="text-textMuted">Average rating</div>
              <div className="text-xl font-semibold">
                {data?.average_rating == null ? "—" : `${data.average_rating.toFixed(2)} / 5`}
              </div>
            </div>
            <div>
              <div className="text-textMuted">Agent had no answer</div>
              <div className="text-xl font-semibold">{data?.unanswered ?? 0}</div>
            </div>
          </div>

          <div className="w-48">
            <Select
              label="Show"
              value={rated}
              onChange={(e) => {
                setRated(e.target.value);
                setPage(1);
              }}
              options={[
                { value: "all", label: "All chats" },
                { value: "rated", label: "Rated only" },
                { value: "unrated", label: "Not rated" }
              ]}
            />
          </div>
        </div>
      </Card>

      {data?.unanswered ? (
        <div className="rounded-input border border-warning bg-warning/5 p-2 text-sm text-warning">
          {data.unanswered} question{data.unanswered === 1 ? "" : "s"} could not be matched to
          anything the agent knows. Those are the ones worth reading — each is a gap a member
          actually hit.
        </div>
      ) : null}

      <Card>
        {isLoading ? (
          <div className="p-2 text-sm text-textMuted">Loading...</div>
        ) : error ? (
          <div className="p-2 text-sm text-danger">Could not load the help chats.</div>
        ) : items.length === 0 ? (
          <div className="p-2 text-sm text-textMuted">No help chats yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="py-2 pr-3 font-semibold">ITS No</th>
                  <th className="py-2 pr-3 font-semibold">Name</th>
                  <th className="py-2 pr-3 font-semibold">Question</th>
                  <th className="py-2 pr-3 font-semibold">Agent reply</th>
                  <th className="py-2 pr-3 text-right font-semibold">Rating</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.id} className="border-b border-border/60 align-top">
                    <td className="py-2 pr-3 font-semibold">{row.its_no}</td>
                    <td className="py-2 pr-3">{row.member_name || "—"}</td>
                    <td className="py-2 pr-3">
                      {row.question}
                      {row.topic === null ? (
                        <span className="ml-1 rounded-full bg-warning/15 px-2 py-0.5 text-xs text-warning">
                          no match
                        </span>
                      ) : null}
                    </td>
                    <td className="max-w-md py-2 pr-3 text-textMuted">
                      <span className="line-clamp-3 whitespace-pre-line">{row.agent_reply}</span>
                    </td>
                    <td className="py-2 pr-3 text-right">
                      {row.star_rating == null ? (
                        <span className="text-textMuted">not rated</span>
                      ) : (
                        <span aria-label={`${row.star_rating} of 5`}>{row.star_rating} / 5</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {lastPage > 1 ? (
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="secondary"
            disabled={page <= 1 || isFetching}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <span className="text-sm text-textMuted">
            Page {page} of {lastPage}
          </span>
          <Button
            type="button"
            variant="secondary"
            disabled={page >= lastPage || isFetching}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      ) : null}
    </div>
  );
}
