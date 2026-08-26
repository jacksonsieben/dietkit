import type {
  Cursor,
  PullPage,
  PushResult,
  PushRow,
  SyncTransport,
} from "./transport";
import { PULL_LIMIT } from "./transport";

/**
 * The transport a device actually uses: `POST /api/sync` (#95).
 *
 * Thin on purpose. Every rule that matters — what wins a conflict, what a
 * tombstone means, when a cursor moves — is in `repository.ts` above it and in
 * `src/lib/db/sync.ts` below it. This is the wire, and the less judgement it
 * has the fewer places those rules can disagree.
 *
 * It sends no account id, because there is no account id to send: the session
 * cookie decides whose rows these are (see `../../app/api/sync/route.ts`).
 * `credentials: "same-origin"` is the default for a same-origin request and is
 * written out anyway — it is the whole authentication story for this endpoint.
 */

export class SyncRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "SyncRequestError";
  }
}

interface HttpTransportOptions {
  /** Overridden in tests. Relative so it follows whatever origin is serving. */
  readonly endpoint?: string;
  readonly fetch?: typeof globalThis.fetch;
}

export function createHttpTransport(
  options: HttpTransportOptions = {},
): SyncTransport {
  const endpoint = options.endpoint ?? "/api/sync";
  const call = options.fetch ?? globalThis.fetch.bind(globalThis);

  async function post<T>(body: unknown): Promise<T> {
    const response = await call(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      // The body is the route's own sentence when there is one. A gateway that
      // returned HTML gets the status alone rather than a page of markup in a
      // thrown message.
      const message = await response
        .json()
        .then((parsed: { error?: string }) => parsed.error)
        .catch(() => undefined);

      throw new SyncRequestError(
        response.status,
        message ?? `Sync failed with ${response.status}.`,
      );
    }

    return (await response.json()) as T;
  }

  return {
    push(rows: PushRow[]): Promise<PushResult> {
      return post<PushResult>({ action: "push", rows });
    },

    pull(cursor: Cursor | null, limit = PULL_LIMIT): Promise<PullPage> {
      return post<PullPage>({ action: "pull", cursor, limit });
    },
  };
}
