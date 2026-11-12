/**
 * A message worth showing for a failed request.
 *
 * WHY THIS EXISTS
 *   "Could not save the topic." was a dead end. It is what every page falls back to when the
 *   rejection carries no `message`, and the commonest reason for that is not a bug in the
 *   page at all — it is the route not being there: a backend that has not been redeployed,
 *   or a static host answering an unknown /api path with its index.html. The reader is then
 *   looking at a message about saving while the actual problem is a deploy.
 *
 *   So the cases that produce no message are named instead of being collapsed into one
 *   sentence. Anything the server did say is still preferred over all of it — the server
 *   knows which rule was broken and the page does not.
 */

type RtkError = {
  status?: number | string;
  originalStatus?: number;
  error?: string;
  data?: unknown;
};

/** The API envelope is `{ success, message, data }`; RTK puts that whole body on `data`. */
function serverMessage(err: RtkError): string | null {
  const body = err.data;
  if (typeof body !== "object" || body === null) return null;
  const message = (body as Record<string, unknown>).message;
  return typeof message === "string" && message.trim() !== "" ? message : null;
}

export function apiErrorMessage(error: unknown, fallback: string): string {
  if (typeof error !== "object" || error === null) return fallback;
  const err = error as RtkError;

  const fromServer = serverMessage(err);
  if (fromServer) return fromServer;

  // The body was not JSON. Almost always an unknown path answered by something that is not
  // the API — a stale backend, or a static host returning its index.html.
  if (err.status === "PARSING_ERROR") {
    return err.originalStatus === 404
      ? "This feature is not on the server yet. The backend needs to be redeployed."
      : "The server sent a reply this page could not read.";
  }

  if (err.status === "FETCH_ERROR") {
    return "Could not reach the server. Check your connection and try again.";
  }

  const status = typeof err.status === "number" ? err.status : err.originalStatus;
  if (status === 404) {
    return "This feature is not on the server yet. The backend needs to be redeployed.";
  }
  if (status === 401) return "Your session has expired. Please sign in again.";
  if (status === 403) return "You do not have permission to do that.";

  return fallback;
}
