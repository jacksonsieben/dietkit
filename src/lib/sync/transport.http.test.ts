import { describe, expect, it } from "vitest";

import { syncResponse } from "./endpoint";
import { createMemoryTransport } from "./transport.fixture";
import { SyncRequestError, createHttpTransport } from "./transport.http";
import type { MemoryTransport } from "./transport.fixture";
import type { SyncTransport } from "./transport";

/**
 * The wire, joined to the endpoint with no network in between (#95).
 *
 * `fetch` is replaced by a call straight into `syncResponse`, so a push made by
 * a device really is parsed by the route's parser and really does come back
 * through `JSON.parse`. That is the part worth testing here: the round trip is
 * where a `Date` quietly becomes a string, an `undefined` disappears and a
 * shape that type-checks on both sides still fails to line up.
 */

interface Wired {
  readonly transport: SyncTransport;
  readonly server: MemoryTransport;
  /** Every body the endpoint was asked to answer, in order. */
  readonly requests: unknown[];
}

function wire(respond?: (body: unknown) => Response | undefined): Wired {
  const server = createMemoryTransport();
  const requests: unknown[] = [];

  const transport = createHttpTransport({
    endpoint: "/api/sync",
    async fetch(_input, init) {
      const body: unknown = JSON.parse(String(init?.body));
      requests.push(body);
      return respond?.(body) ?? (await syncResponse(server, body));
    },
  });

  return { transport, server, requests };
}

describe("the http transport", () => {
  it("pushes a row and pulls it back through JSON", async () => {
    const { transport } = wire();

    const pushed = await transport.push([
      {
        collection: "weight",
        recordId: "rec-1",
        ciphertext: "sealed",
        nonce: "AAAAAAAAAAAAAAAA",
        baseRev: 0,
        deleted: false,
      },
    ]);
    expect(pushed.accepted).toEqual([
      { collection: "weight", recordId: "rec-1", rev: 1 },
    ]);

    const page = await transport.pull(null);
    expect(page.rows[0]).toMatchObject({ recordId: "rec-1", deleted: false });

    // The cursor survives the round trip well enough to be handed straight
    // back. It is the one value a device stores from a response and replays
    // into the next request, so a field lost in serialisation would show up as
    // a device that re-reads its whole account forever.
    const again = await transport.pull(page.cursor);
    expect(again.rows).toEqual([]);
    expect(again.cursor).toEqual(page.cursor);
  });

  it("names no account, in either direction", async () => {
    const { transport, requests } = wire();

    await transport.push([]);
    await transport.pull(null);

    // The session decides whose rows these are. If a body ever carried an
    // account id, a signed-in device could ask for somebody else's by typing
    // one — so there is no such field, and this is the test that says so.
    for (const body of requests) {
      expect(JSON.stringify(body)).not.toMatch(/account/i);
    }
  });

  it("carries the route's own sentence out of a refusal", async () => {
    const { transport } = wire();

    await expect(
      transport.push([
        {
          collection: "audit" as never,
          recordId: "rec-1",
          ciphertext: "sealed",
          nonce: "AAAAAAAAAAAAAAAA",
          baseRev: 0,
          deleted: false,
        },
      ]),
    ).rejects.toThrow(new SyncRequestError(400, "A row is malformed."));
  });

  it("survives a gateway that answers with something other than JSON", async () => {
    const { transport } = wire(
      () =>
        // A platform 502, a captive portal, an auth redirect to an HTML page.
        // The status is the only thing worth reporting, and a page of markup in a
        // thrown message would bury it.
        new Response("<html>Bad gateway</html>", { status: 502 }),
    );

    await expect(transport.pull(null)).rejects.toMatchObject({
      status: 502,
      message: "Sync failed with 502.",
    });
  });

  it("reports being signed out as itself, not as a broken sync", async () => {
    const { transport } = wire(
      () =>
        new Response(JSON.stringify({ error: "Sign in to sync." }), {
          status: 401,
        }),
    );

    // The caller has to be able to tell "your session expired" from "the server
    // is unhappy", because only one of them is fixed by signing in again.
    await expect(transport.pull(null)).rejects.toMatchObject({
      status: 401,
      message: "Sign in to sync.",
    });
  });
});
