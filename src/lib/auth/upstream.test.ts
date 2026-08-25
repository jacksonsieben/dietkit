import { describe, expect, it } from "vitest";

import { configurationProblem } from "./upstream";

describe("telling a misconfiguration from a wrong password", () => {
  it("names the untrusted-origin refusal, which no user can fix", () => {
    // The real one, verbatim from the preview deployment: the vercel.app
    // domain was not in Neon's trusted domains, so every call answered this.
    expect(
      configurationProblem({
        message: "Invalid origin",
        code: "INVALID_ORIGIN",
        status: 403,
      }),
    ).toBe("INVALID_ORIGIN");
  });

  it("names the missing-origin refusal too", () => {
    expect(
      configurationProblem({
        message: "Missing or null Origin",
        code: "MISSING_OR_NULL_ORIGIN",
        status: 403,
      }),
    ).toBe("MISSING_OR_NULL_ORIGIN");
  });

  it("leaves a wrong password alone, so it keeps its one flat message", () => {
    // The whole point of the flattening: this must not become a distinct
    // outcome, or the screen starts answering "does this address exist".
    expect(
      configurationProblem({
        message: "Invalid email or password",
        code: "INVALID_EMAIL_OR_PASSWORD",
        status: 401,
      }),
    ).toBeNull();
  });

  it("does not guess from the status alone", () => {
    // A banned account is a 403 as well. Reporting that as "the service is
    // unavailable" would be this same mistake pointing the other way.
    expect(configurationProblem({ status: 403 })).toBeNull();
    expect(
      configurationProblem({ code: "USER_BANNED", status: 403 }),
    ).toBeNull();
  });
});
