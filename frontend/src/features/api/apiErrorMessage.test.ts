import { describe, expect, it } from "vitest";
import { apiErrorMessage } from "./apiErrorMessage";

/**
 * Written after "Could not save the topic." was reported as the whole of what a page said
 * when the route was not on the server at all. The message was true and useless: it pointed
 * at saving while the problem was a deploy.
 *
 * So the cases that carry no server message each get named, and the one the server DID send
 * still wins over all of them.
 */
describe("apiErrorMessage", () => {
  it("prefers what the server said", () => {
    const err = { status: 400, data: { success: false, message: "A topic with that key exists." } };
    expect(apiErrorMessage(err, "fallback")).toBe("A topic with that key exists.");
  });

  it("ignores an empty server message rather than showing a blank", () => {
    expect(apiErrorMessage({ status: 500, data: { message: "   " } }, "fallback")).toBe("fallback");
  });

  /** The case that prompted this: an unknown /api path answered with HTML. */
  it("says the backend needs redeploying when the body was not JSON and the status was 404", () => {
    const err = { status: "PARSING_ERROR", originalStatus: 404, data: "<!doctype html>" };
    expect(apiErrorMessage(err, "Could not save the topic.")).toMatch(/redeployed/i);
  });

  it("says the same for a plain 404", () => {
    expect(apiErrorMessage({ status: 404, data: {} }, "fallback")).toMatch(/redeployed/i);
  });

  it("distinguishes an unreadable reply from a missing route", () => {
    const err = { status: "PARSING_ERROR", originalStatus: 500, data: "<html>" };
    expect(apiErrorMessage(err, "fallback")).toMatch(/could not read/i);
    expect(apiErrorMessage(err, "fallback")).not.toMatch(/redeployed/i);
  });

  it("names a network failure as one", () => {
    expect(apiErrorMessage({ status: "FETCH_ERROR", error: "TypeError" }, "fallback")).toMatch(
      /reach the server/i
    );
  });

  it("explains 401 and 403 in the reader's terms", () => {
    expect(apiErrorMessage({ status: 401, data: {} }, "fallback")).toMatch(/sign in again/i);
    expect(apiErrorMessage({ status: 403, data: {} }, "fallback")).toMatch(/permission/i);
  });

  it("falls back for anything it cannot place", () => {
    expect(apiErrorMessage({ status: 500, data: {} }, "fallback")).toBe("fallback");
    expect(apiErrorMessage(undefined, "fallback")).toBe("fallback");
    expect(apiErrorMessage("boom", "fallback")).toBe("fallback");
  });
});
