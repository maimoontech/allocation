import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { Button } from "../../components/ui/Button";
import {
  useCreateMemberLookupMutation,
  useDeleteMemberLookupMutation,
  useGetMemberLookupListQuery,
  useUpdateMemberLookupMutation,
  type LookupRow
} from "../../features/member/memberLookupAdminApi";

const activeOptions = [
  { value: "1", label: "Active" },
  { value: "0", label: "Inactive" }
];

/** Pulls the server's message out of an RTK Query rejection, which nests it two deep. */
function messageFrom(err: unknown, fallback: string): string {
  const data = (err as { data?: { message?: unknown } } | undefined)?.data;
  const message = data?.message;
  return typeof message === "string" && message ? message : fallback;
}

/**
 * Add, correct, reorder, deactivate and delete the values in one member dropdown list.
 *
 * Two things here are deliberate and worth not "simplifying" later:
 *
 * **Delete is only offered for a value nothing points at.** The server refuses the rest, but
 * the button is hidden too, because for five of these ten lists the foreign key is
 * ON DELETE SET NULL — the database would allow the delete and silently blank that answer on
 * every member who had chosen it. Showing a Delete button that is going to be refused teaches
 * an admin to expect failure; showing the usage count and Inactive instead tells them what to
 * do.
 *
 * **Draft is a real control, not decoration.** The seeded starter values are marked draft and
 * members see `DRAFT — NEEDS REVIEW` next to them. Clearing the flag here is the act of
 * signing one off, so it needs to be one click from the list.
 */
export function MemberLookupEditPage() {
  const { entity = "" } = useParams<{ entity: string }>();

  const listQuery = useGetMemberLookupListQuery(entity, { skip: !entity });
  const [createValue, createState] = useCreateMemberLookupMutation();
  const [updateValue, updateState] = useUpdateMemberLookupMutation();
  const [deleteValue, deleteState] = useDeleteMemberLookupMutation();

  const [editing, setEditing] = useState<LookupRow | null>(null);
  const [name, setName] = useState("");
  const [displayOrder, setDisplayOrder] = useState("0");
  const [isActive, setIsActive] = useState("1");
  const [banner, setBanner] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [showInactive, setShowInactive] = useState(true);

  const isBusy = createState.isLoading || updateState.isLoading || deleteState.isLoading;

  const rows = useMemo(() => {
    const all = listQuery.data?.rows ?? [];
    return showInactive ? all : all.filter((r) => r.is_active === 1);
  }, [listQuery.data, showInactive]);

  function resetForm() {
    setEditing(null);
    setName("");
    setDisplayOrder("0");
    setIsActive("1");
  }

  function startEdit(row: LookupRow) {
    setBanner(null);
    setEditing(row);
    setName(row.name);
    setDisplayOrder(String(row.display_order));
    setIsActive(String(row.is_active));
  }

  async function onSubmit() {
    setBanner(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setBanner({ kind: "error", text: "Enter a name." });
      return;
    }

    const order = Number(displayOrder);
    if (!Number.isInteger(order) || order < 0) {
      setBanner({ kind: "error", text: "Display order must be a whole number, 0 or more." });
      return;
    }

    const payload = {
      entity,
      name: trimmed,
      display_order: order,
      is_active: (isActive === "1" ? 1 : 0) as 0 | 1
    };

    try {
      if (editing) {
        await updateValue({ ...payload, id: editing.id }).unwrap();
        setBanner({ kind: "ok", text: `"${trimmed}" updated.` });
      } else {
        await createValue(payload).unwrap();
        setBanner({ kind: "ok", text: `"${trimmed}" added.` });
      }
      resetForm();
    } catch (err) {
      setBanner({ kind: "error", text: messageFrom(err, "Could not save that value.") });
    }
  }

  async function onToggleDraft(row: LookupRow) {
    setBanner(null);
    try {
      await updateValue({
        entity,
        id: row.id,
        is_draft: (row.is_draft === 1 ? 0 : 1) as 0 | 1
      }).unwrap();
      setBanner({
        kind: "ok",
        text:
          row.is_draft === 1
            ? `"${row.name}" marked as reviewed. Members no longer see a draft warning on it.`
            : `"${row.name}" marked as a draft again.`
      });
    } catch (err) {
      setBanner({ kind: "error", text: messageFrom(err, "Could not update that value.") });
    }
  }

  async function onDelete(row: LookupRow) {
    setBanner(null);
    if (!window.confirm(`Delete "${row.name}"? This cannot be undone.`)) return;
    try {
      await deleteValue({ entity, id: row.id }).unwrap();
      setBanner({ kind: "ok", text: `"${row.name}" deleted.` });
      if (editing?.id === row.id) resetForm();
    } catch (err) {
      // The server refuses a value that is in use and explains what to do instead.
      setBanner({ kind: "error", text: messageFrom(err, "Could not delete that value.") });
    }
  }

  if (listQuery.isLoading) {
    return <div className="p-2 text-sm text-textMuted">Loading...</div>;
  }

  if (listQuery.isError || !listQuery.data) {
    return (
      <div className="space-y-3">
        <Link to="/member-lookups" className="text-sm underline">
          Back to all lists
        </Link>
        <Card>
          <div className="text-sm text-danger">
            Could not load this list. It may not exist.{" "}
            <button type="button" className="underline" onClick={() => listQuery.refetch()}>
              Try again
            </button>
          </div>
        </Card>
      </div>
    );
  }

  const { label, used_for: usedFor } = listQuery.data;
  const draftCount = (listQuery.data.rows ?? []).filter((r) => r.is_draft === 1).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-2xl font-bold">{label}</div>
        <Link to="/member-lookups" className="text-sm underline">
          Back to all lists
        </Link>
      </div>

      <Card>
        <div className="text-sm text-textMuted">{usedFor}</div>
      </Card>

      {banner ? (
        <div
          className={[
            "rounded-input border p-2 text-sm",
            banner.kind === "ok"
              ? "border-success bg-success/5 text-success"
              : "border-danger bg-danger/5 text-danger"
          ].join(" ")}
        >
          {banner.text}
        </div>
      ) : null}

      <Card>
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="text-lg font-bold">{editing ? `Edit "${editing.name}"` : "Add a value"}</div>
          {editing ? (
            <Button variant="ghost" onClick={resetForm} disabled={isBusy}>
              Cancel
            </Button>
          ) : null}
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Input
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={150}
            helperText="Exactly as members should see it."
          />
          <Input
            label="Display Order"
            type="number"
            min={0}
            value={displayOrder}
            onChange={(e) => setDisplayOrder(e.target.value)}
            helperText="Lower numbers first; equal numbers sort by name."
          />
          {/* `Select` has no helperText prop, unlike `Input`. The hint sits outside the
              control rather than being added to the shared primitive — which also keeps it
              out of the accessible name. */}
          <div>
            <Select
              label="Status"
              value={isActive}
              onChange={(e) => setIsActive(e.target.value)}
              options={activeOptions}
            />
            <div className="mt-1 text-xs text-textMuted">
              Inactive values stay on existing profiles but are not offered again.
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={onSubmit} disabled={isBusy}>
            {editing ? "Save changes" : "Add value"}
          </Button>
          <Button variant="ghost" onClick={() => listQuery.refetch()} disabled={isBusy}>
            Refresh
          </Button>
        </div>
      </Card>

      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-lg font-bold">
            {listQuery.data.rows.length} {listQuery.data.rows.length === 1 ? "value" : "values"}
            {draftCount > 0 ? (
              <span className="ml-2 text-sm font-normal text-warning">
                {draftCount} awaiting review
              </span>
            ) : null}
          </div>
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
            />
            Show inactive
          </label>
        </div>

        {listQuery.data.rows.length === 0 ? (
          <div className="rounded-input border border-dashed border-border p-4 text-sm text-textMuted">
            This list is empty, so the member profile field that uses it is currently
            unusable. Add the values above and members can complete it straight away.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="py-2 pr-3 font-semibold">Name</th>
                  <th className="py-2 pr-3 text-right font-semibold">Order</th>
                  <th className="py-2 pr-3 font-semibold">Status</th>
                  <th className="py-2 pr-3 font-semibold">Review</th>
                  <th className="py-2 pr-3 text-right font-semibold">In use</th>
                  <th className="py-2 font-semibold" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-border/60">
                    <td className="py-2 pr-3">
                      {row.name}
                      {row.is_draft === 1 ? (
                        <span className="ml-2 text-xs font-semibold text-warning">DRAFT</span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3 text-right">{row.display_order}</td>
                    <td className="py-2 pr-3">
                      {row.is_active === 1 ? (
                        "Active"
                      ) : (
                        <span className="text-textMuted">Inactive</span>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      <Button
                        variant="ghost"
                        className="px-2 py-1 text-xs"
                        onClick={() => onToggleDraft(row)}
                        disabled={isBusy}
                      >
                        {row.is_draft === 1 ? "Mark reviewed" : "Mark draft"}
                      </Button>
                    </td>
                    <td className="py-2 pr-3 text-right">
                      {row.in_use > 0 ? (
                        <span title="Member records using this value">{row.in_use}</span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-2 text-right whitespace-nowrap">
                      <Button
                        variant="ghost"
                        className="px-2 py-1 text-xs"
                        onClick={() => startEdit(row)}
                        disabled={isBusy}
                      >
                        Edit
                      </Button>
                      {/* Offered only when nothing points at it — see the note at the top. */}
                      {row.in_use === 0 ? (
                        <Button
                          variant="ghost"
                          className="px-2 py-1 text-xs text-danger"
                          onClick={() => onDelete(row)}
                          disabled={isBusy}
                        >
                          Delete
                        </Button>
                      ) : (
                        <span
                          className="px-2 py-1 text-xs text-textMuted"
                          title={`Used by ${row.in_use} member ${
                            row.in_use === 1 ? "record" : "records"
                          }. Set it to Inactive instead.`}
                        >
                          In use
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
