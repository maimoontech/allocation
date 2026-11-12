import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { HelpChatWidget } from "./HelpChatWidget";
import { renderWithProviders } from "../../test-utils";

/**
 * The Need Help chat (FR-110).
 *
 * The flow is the requirement, in this order: ask, answer, rate out of five, "Do you need
 * further help?", and on No the thank-you and the window closes. The tests below walk it,
 * and — more usefully — assert that each step is NOT reachable before its turn. Stars
 * before an answer, or a second question while the first is unrated, are the failures a
 * handful of booleans would have allowed.
 */

const ANSWER = "Zone and Hizb are on the Hizb tab. Choose your Zone first.";

let asked: unknown[] = [];
let rated: unknown[] = [];
let askFailure: { status: number; message: string } | null = null;

function envelope(data: unknown, status = 200, message = "OK"): Response {
  return new Response(JSON.stringify({ success: status < 400, data, message }), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

beforeEach(() => {
  asked = [];
  rated = [];
  askFailure = null;

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const isRequest = typeof Request !== "undefined" && input instanceof Request;
      const url = isRequest ? input.url : String(input);
      const method = (isRequest ? input.method : init?.method) ?? "GET";
      const raw = isRequest ? await input.clone().text() : String(init?.body ?? "{}");

      if (url.includes("/help-chats") && method.toUpperCase() === "POST") {
        asked.push(JSON.parse(raw || "{}"));
        if (askFailure) return envelope(null, askFailure.status, askFailure.message);
        return envelope({ id: 7, reply: ANSWER, topic: "zone_party", answered: true });
      }
      if (url.includes("/help-chats/") && method.toUpperCase() === "PATCH") {
        rated.push({ url, ...JSON.parse(raw || "{}") });
        return envelope({ id: 7, star_rating: JSON.parse(raw).star_rating });
      }
      return envelope({});
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function openChat() {
  renderWithProviders(<HelpChatWidget />);
  fireEvent.click(screen.getByRole("button", { name: "Need Help" }));
}

async function ask(question = "which zone do I pick?") {
  openChat();
  fireEvent.change(screen.getByLabelText("Your question"), { target: { value: question } });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await waitFor(() => expect(screen.getByText(ANSWER)).toBeInTheDocument());
}

describe("HelpChatWidget", () => {
  it("shows a Need Help button and nothing else until it is clicked", () => {
    renderWithProviders(<HelpChatWidget />);

    expect(screen.getByRole("button", { name: "Need Help" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Need Help" })).not.toBeInTheDocument();
  });

  it("opens the chat window on click", () => {
    openChat();

    expect(screen.getByRole("dialog", { name: "Need Help" })).toBeInTheDocument();
    expect(screen.getByLabelText("Your question")).toBeInTheDocument();
  });

  it("sends the question and shows the agent's reply", async () => {
    await ask("which zone do I pick?");

    expect(asked).toEqual([{ question: "which zone do I pick?" }]);
    expect(screen.getByText("which zone do I pick?")).toBeInTheDocument();
  });

  it("will not send an empty question", () => {
    openChat();

    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Your question"), { target: { value: "   " } });
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    expect(asked).toHaveLength(0);
  });

  /** The order is the requirement: no stars until there is something to rate. */
  it("offers no rating before an answer", () => {
    openChat();

    expect(screen.queryByRole("group", { name: "Rate this answer" })).not.toBeInTheDocument();
  });

  it("asks for a five-star rating once answered", async () => {
    await ask();

    const stars = screen.getByRole("group", { name: "Rate this answer" });
    expect(stars).toBeInTheDocument();
    for (const n of [1, 2, 3, 4, 5]) {
      expect(screen.getByRole("button", { name: `${n} ${n === 1 ? "star" : "stars"}` })).toBeInTheDocument();
    }
  });

  it("sends the chosen rating against that chat", async () => {
    await ask();

    fireEvent.click(screen.getByRole("button", { name: "4 stars" }));

    await waitFor(() => expect(rated).toHaveLength(1));
    expect((rated[0] as { url: string }).url).toContain("/help-chats/7");
    expect(rated[0]).toMatchObject({ star_rating: 4 });
  });

  it("asks about further help only after a rating", async () => {
    await ask();
    expect(screen.queryByText("Do you need further help?")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "5 stars" }));

    await waitFor(() =>
      expect(screen.getByText("Do you need further help?")).toBeInTheDocument()
    );
  });

  it("returns to the question box on Yes, keeping the conversation", async () => {
    await ask();
    fireEvent.click(screen.getByRole("button", { name: "5 stars" }));
    await waitFor(() => expect(screen.getByText("Do you need further help?")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Yes" }));

    expect(screen.getByLabelText("Your question")).toBeInTheDocument();
    // The previous exchange is still on screen — it is usually what they are re-reading.
    expect(screen.getByText(ANSWER)).toBeInTheDocument();
  });

  it("thanks the member on No and closes the window", async () => {
    await ask();
    fireEvent.click(screen.getByRole("button", { name: "5 stars" }));
    await waitFor(() => expect(screen.getByText("Do you need further help?")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "No" }));

    expect(screen.getByText("Thanks from Anjuman e Zakereen Hussain AS.")).toBeInTheDocument();

    // The thank-you is readable before the window goes.
    await waitFor(
      () => expect(screen.queryByRole("dialog", { name: "Need Help" })).not.toBeInTheDocument(),
      { timeout: 4000 }
    );
    expect(screen.getByRole("button", { name: "Need Help" })).toBeInTheDocument();
  });

  it("starts fresh when reopened after closing", async () => {
    await ask();
    fireEvent.click(screen.getByRole("button", { name: "5 stars" }));
    await waitFor(() => expect(screen.getByText("Do you need further help?")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "No" }));
    await waitFor(
      () => expect(screen.getByRole("button", { name: "Need Help" })).toBeInTheDocument(),
      { timeout: 4000 }
    );

    fireEvent.click(screen.getByRole("button", { name: "Need Help" }));

    expect(screen.queryByText(ANSWER)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Your question")).toBeInTheDocument();
  });

  it("surfaces the server's message when the question is refused", async () => {
    askFailure = { status: 400, message: "Please type a question." };
    openChat();
    fireEvent.change(screen.getByLabelText("Your question"), { target: { value: "hello" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(screen.getByText("Please type a question.")).toBeInTheDocument());
    // Still on the question step, so they can correct it rather than being stuck.
    expect(screen.getByLabelText("Your question")).toBeInTheDocument();
  });
});
