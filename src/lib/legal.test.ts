import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import ptBR from "../../messages/pt-BR.json";
import {
  CFN_REFERENCE,
  LEGAL_EFFECTIVE_DATE,
  LEGAL_ROUTES,
  legalEffectiveDate,
} from "./legal";

const ROOT = path.resolve(import.meta.dirname, "../..");

/**
 * The notices are a launch blocker (#10, docs/DECISIONS.md § D3), and the way a
 * launch blocker fails is never that somebody argues against it — it is that a
 * route gets renamed, or a footer gets rewritten, and the pages stay on disk
 * with nothing pointing at them. These checks are about reachability more than
 * about content.
 */
describe("legal notices", () => {
  it("has a page for every notice", () => {
    for (const route of LEGAL_ROUTES) {
      const page = path.join(ROOT, "src/app/[locale]", route.href, "page.tsx");
      expect(fs.existsSync(page), `${route.href} has no page.tsx`).toBe(true);
    }
  });

  it("has a label in the catalogue for every notice", () => {
    for (const route of LEGAL_ROUTES) {
      expect(ptBR.Legal, `Legal.${route.label} is missing`).toHaveProperty(
        route.label,
      );
    }
  });

  it("links all three from the footer, which every screen renders", () => {
    // Onboarding and settings do not exist yet, so the layout footer is the only
    // thing that reaches every screen. Reading the source rather than rendering
    // it: what this guards against is the nav being dropped in a redesign.
    //
    // The assertion is on the iteration, not on the import — a footer that
    // imports the list and renders none of it is exactly the failure here, and
    // matching the bare name would have called that a pass.
    const footer = fs.readFileSync(
      path.join(ROOT, "src/components/SourceFooter.tsx"),
      "utf8",
    );

    expect(footer).toContain("LEGAL_ROUTES.map(");
  });

  it("states the same effective date whichever zone the reader is in", () => {
    // `new Date("2026-08-26")` is UTC midnight, so formatting it in São Paulo
    // prints the 25th. The notices claim a date they took effect; printing the
    // day before is a small error that undermines a document whose only asset
    // is being believed.
    const formatted = new Intl.DateTimeFormat("en-CA", {
      timeZone: "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(legalEffectiveDate());

    expect(formatted).toBe(LEGAL_EFFECTIVE_DATE);
  });

  it("names the law the health disclaimer's position rests on", () => {
    // § D10 is a positioning decision with a statute behind it. If the copy ever
    // loses the citation, the disclaimer degrades into a generic "consult a
    // professional" line that says nothing specific to Brazil.
    expect(ptBR.Health.notPrescriptionBody).toContain("{law}");
    expect(ptBR.Health.notPrescriptionBody).toContain("{council}");
    expect(CFN_REFERENCE.law).toMatch(/8\.234\/1991/);
  });
});
