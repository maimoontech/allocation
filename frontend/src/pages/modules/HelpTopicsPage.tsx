import { useState, type FormEvent } from "react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Textarea } from "../../components/ui/Textarea";
import { apiErrorMessage } from "../../features/api/apiErrorMessage";
import {
  useCreateHelpTopicMutation,
  useDeleteHelpTopicMutation,
  useGetHelpTopicsQuery,
  usePreviewHelpTopicMutation,
  useUpdateHelpTopicMutation,
  type CustomTopic
} from "../../features/member/helpChatApi";

/**
 * Admin → Help Topics (FR-110a).
 *
 * What the Need Help agent knows, in two parts. The built-in topics are shown but not
 * editable: they restate rules the server enforces and are pinned by tests, so a careless
 * edit to one would be a confident wrong answer about a real rule. A topic written here
 * that uses a built-in's key OVERRIDES it, which is the supported way to reword one — and
 * deactivating that topic puts the original back.
 *
 * The Try it box is the part that earns its place. Keyword matching is easy to get wrong in
 * a way that is invisible until a member hits it, so an administrator can type what a member
 * would actually say and see which topic answers, without leaving a real chat behind.
 */

const BLANK = { topic_key: "", label: "", keywords: "", answer: "" };

export function HelpTopicsPage() {
  const { data, isLoading, error } = useGetHelpTopicsQuery();
  const [create] = useCreateHelpTopicMutation();
  const [update] = useUpdateHelpTopicMutation();
  const [remove] = useDeleteHelpTopicMutation();
  const [preview, previewState] = usePreviewHelpTopicMutation();

  const [form, setForm] = useState({ ...BLANK });
  const [editing, setEditing] = useState<CustomTopic | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [tryText, setTryText] = useState("");
  const [tried, setTried] = useState<{ topic: string | null; reply: string } | null>(null);

  const builtIn = data?.built_in ?? [];
  const custom = data?.custom ?? [];

  function startEdit(topic: CustomTopic) {
    setEditing(topic);
    setForm({
      topic_key: topic.topic_key,
      label: topic.label,
      keywords: topic.keywords,
      answer: topic.answer
    });
    setFormError(null);
  }

  function cancelEdit() {
    setEditing(null);
    setForm({ ...BLANK });
    setFormError(null);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setNotice(null);
    try {
      if (editing) {
        await update({
          id: editing.id,
          body: { label: form.label, keywords: form.keywords, answer: form.answer }
        }).unwrap();
        setNotice(`Updated "${form.label}".`);
      } else {
        await create(form).unwrap();
        setNotice(`Added "${form.label}".`);
      }
      cancelEdit();
    } catch (err: unknown) {
      // The server's own words when it has any — it names the rule that failed, a duplicate
      // key or keywords too weak to ever match. When it has none, apiErrorMessage says why
      // rather than leaving "could not save" to be interpreted.
      setFormError(apiErrorMessage(err, "Could not save the topic."));
    }
  }

  async function onTry(event: FormEvent) {
    event.preventDefault();
    if (!tryText.trim()) return;
    try {
      const result = await preview({ question: tryText }).unwrap();
      setTried(result);
    } catch {
      setTried({ topic: null, reply: "Could not try that question." });
    }
  }

  return (
    <div className="space-y-4">
      <div className="text-2xl font-bold">Help Topics</div>

      <Card>
        <div className="text-sm text-textMuted">
          What the Need Help agent can answer. The {builtIn.length} built-in topics below
          describe rules the form itself enforces and cannot be edited here — to reword one,
          write a topic using the same key and it will take over. Topics you add answer
          immediately, with no redeploy.
        </div>
      </Card>

      {notice ? (
        <div className="rounded-input border border-primary bg-primary/5 p-2 text-sm">{notice}</div>
      ) : null}

      {/* ---------------------------------------------------------------- try it --- */}
      <Card>
        <form onSubmit={onTry} className="space-y-2">
          <div className="text-sm font-semibold">Try a question</div>
          <div className="text-xs text-textMuted">
            Type what a member would actually say. Nothing is saved, and no chat is recorded.
          </div>
          <div className="flex gap-2">
            <Input
              aria-label="Question to try"
              value={tryText}
              onChange={(e) => setTryText(e.target.value)}
              placeholder="e.g. why is my bmi blank"
            />
            <Button type="submit" disabled={previewState.isLoading || !tryText.trim()}>
              Try
            </Button>
          </div>
          {tried ? (
            <div
              className={`rounded-input border p-2 text-sm ${
                tried.topic ? "border-border bg-surface" : "border-warning bg-warning/5"
              }`}
            >
              <div className="mb-1 text-xs font-semibold">
                {tried.topic ? `Matched: ${tried.topic}` : "No topic matched"}
              </div>
              <div className="whitespace-pre-line">{tried.reply}</div>
            </div>
          ) : null}
        </form>
      </Card>

      {/* ------------------------------------------------------------ add or edit --- */}
      <Card>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="text-sm font-semibold">
            {editing ? `Edit "${editing.label}"` : "Add a topic"}
          </div>

          {formError ? (
            <div className="rounded-input border border-danger bg-danger/5 p-2 text-sm text-danger">
              {formError}
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Key"
              value={form.topic_key}
              onChange={(e) => setForm({ ...form, topic_key: e.target.value })}
              disabled={editing !== null}
              helperText={
                editing
                  ? "The key cannot change — chats already recorded refer to it."
                  : "Lower-case letters, digits and underscores, e.g. hifz_sanad. Using a built-in key overrides that topic."
              }
            />
            <Input
              label="Label"
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              helperText="Shown to members in the list of subjects."
            />
          </div>

          <Input
            label="Keywords"
            value={form.keywords}
            onChange={(e) => setForm({ ...form, keywords: e.target.value })}
            helperText="Comma separated. Put a * after a word only this topic owns: ashara*, attended, moze"
          />

          <Textarea
            label="Answer"
            value={form.answer}
            onChange={(e) => setForm({ ...form, answer: e.target.value })}
            rows={6}
          />

          <div className="flex gap-2">
            <Button type="submit">{editing ? "Save changes" : "Add topic"}</Button>
            {editing ? (
              <Button type="button" variant="secondary" onClick={cancelEdit}>
                Cancel
              </Button>
            ) : null}
          </div>
        </form>
      </Card>

      {/* ------------------------------------------------------------ your topics --- */}
      <Card>
        <div className="mb-2 text-sm font-semibold">Your topics ({custom.length})</div>
        {isLoading ? (
          <div className="text-sm text-textMuted">Loading...</div>
        ) : error ? (
          <div className="text-sm text-danger">Could not load the topics.</div>
        ) : custom.length === 0 ? (
          <div className="text-sm text-textMuted">
            None yet. The built-in topics below are answering everything.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="py-2 pr-3 font-semibold">Label</th>
                  <th className="py-2 pr-3 font-semibold">Key</th>
                  <th className="py-2 pr-3 font-semibold">Keywords</th>
                  <th className="py-2 pr-3 text-right font-semibold">Used</th>
                  <th className="py-2 pr-3 text-right font-semibold">Rating</th>
                  <th className="py-2 pr-3 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {custom.map((t) => (
                  <tr key={t.id} className="border-b border-border/60 align-top">
                    <td className="py-2 pr-3">
                      {t.label}
                      {!t.is_active ? (
                        <span className="ml-1 text-xs text-textMuted">(off)</span>
                      ) : null}
                      {t.overrides_built_in ? (
                        <span className="ml-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs">
                          overrides built-in
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs">{t.topic_key}</td>
                    <td className="max-w-xs py-2 pr-3 text-textMuted">{t.keywords}</td>
                    <td className="py-2 pr-3 text-right">{t.times_used}</td>
                    <td className="py-2 pr-3 text-right">
                      {t.average_rating == null ? "—" : t.average_rating.toFixed(1)}
                    </td>
                    <td className="py-2 pr-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button type="button" className="text-sm underline" onClick={() => startEdit(t)}>
                          Edit
                        </button>
                        <button
                          type="button"
                          className="text-sm underline"
                          onClick={() => update({ id: t.id, body: { is_active: !t.is_active } })}
                        >
                          {t.is_active ? "Turn off" : "Turn on"}
                        </button>
                        <button
                          type="button"
                          className="text-sm text-danger underline"
                          onClick={() => {
                            if (editing?.id === t.id) cancelEdit();
                            remove(t.id);
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* -------------------------------------------------------- built-in topics --- */}
      <Card>
        <div className="mb-1 text-sm font-semibold">Built-in topics ({builtIn.length})</div>
        <div className="mb-2 text-xs text-textMuted">
          These describe rules the form enforces and are kept in step with it. Write a topic
          using one of these keys to replace its answer.
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="py-2 pr-3 font-semibold">Label</th>
                <th className="py-2 pr-3 font-semibold">Key</th>
                <th className="py-2 pr-3 text-right font-semibold">Asked</th>
                <th className="py-2 pr-3 text-right font-semibold">Rating</th>
              </tr>
            </thead>
            <tbody>
              {builtIn.map((t) => (
                <tr key={t.topic_key} className="border-b border-border/60">
                  <td className="py-2 pr-3">
                    {t.label}
                    {t.overridden ? (
                      <span className="ml-1 rounded-full bg-warning/15 px-2 py-0.5 text-xs text-warning">
                        replaced by yours
                      </span>
                    ) : null}
                  </td>
                  <td className="py-2 pr-3 font-mono text-xs">{t.topic_key}</td>
                  <td className="py-2 pr-3 text-right">{t.times_used}</td>
                  <td className="py-2 pr-3 text-right">
                    {t.average_rating == null ? "—" : t.average_rating.toFixed(1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
