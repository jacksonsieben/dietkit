import { describe, expect, it } from "vitest";

import { TABS, activeTab, plateKey } from "./tabs";

describe("activeTab", () => {
  it("lights the day only on the day", () => {
    expect(activeTab("/")).toBe("today");
    expect(activeTab("/dieta")).toBe("diet");
  });

  it("keeps the food screens inside the diet", () => {
    // The whole reason the old first screen was a wall of links: a food search
    // is part of building a plan, not a destination beside it.
    expect(activeTab("/alimentos")).toBe("diet");
    expect(activeTab("/alimentos/meus")).toBe("diet");
    expect(activeTab("/alimentos/grupos")).toBe("diet");
  });

  it("files everything else under Mais rather than lighting nothing", () => {
    expect(activeTab("/perfil")).toBe("more");
    expect(activeTab("/backup")).toBe("more");
    expect(activeTab("/uma/rota/que/nao/existe")).toBe("more");
  });

  it("does not match a route that merely starts with the same letters", () => {
    expect(activeTab("/pesos-antigos")).toBe("more");
  });

  it("ignores a trailing slash", () => {
    expect(activeTab("/dieta/")).toBe("diet");
    expect(activeTab("//")).toBe("today");
  });

  it("keeps a seat for training with nowhere to send anyone yet", () => {
    const training = TABS.find((tab) => tab.id === "training");

    expect(training).toBeDefined();
    expect(training?.href).toBeUndefined();
  });
});

describe("plateKey", () => {
  it("names the screen a route is on", () => {
    expect(plateKey("/dieta")).toBe("diet");
    expect(plateKey("/")).toBe("today");
  });

  it("prefers the deeper plate over the one it nests under", () => {
    // Both `/alimentos` and `/alimentos/meus` match; the sub-route has its own
    // name and inheriting the parent's would put the wrong word on the plate.
    expect(plateKey("/alimentos/meus")).toBe("myFoods");
    expect(plateKey("/alimentos/grupos")).toBe("groups");
  });

  it("has no name for a route it has not been told about", () => {
    expect(plateKey("/algo-novo")).toBeUndefined();
  });

  it("gives every tab with a destination a plate", () => {
    for (const tab of TABS) {
      if (tab.href === undefined) continue;
      expect(plateKey(tab.href)).toBeDefined();
    }
  });
});
