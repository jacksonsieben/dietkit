import { describe, expect, it } from "vitest";

import { GET } from "./route";

describe("GET /api/health", () => {
  it("reports ok and refuses to be cached", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      status: "ok",
      service: "dietkit",
    });
  });

  it("leaks no personal data", async () => {
    const body = await (await GET()).json();

    expect(Object.keys(body).sort()).toEqual([
      "commit",
      "environment",
      "service",
      "status",
      "time",
    ]);
  });
});
