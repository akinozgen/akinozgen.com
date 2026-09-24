import { describe, expect, it } from "vitest";
import { borderGraph } from "../src/index.ts";

const graph = borderGraph();
const reachable = (start: string, end: string, via: string[]): boolean =>
  graph.isComplete(start, end, via);

describe("border data", () => {
  it("puts every playable region in a component it can be routed within", () => {
    const playable = graph.playableRegions();
    expect(playable.length).toBeGreaterThan(160);
    for (const region of playable) {
      const component = graph.componentOf(region.id);
      expect(component.length).toBeGreaterThan(1);
      const other = component.find((id) => id !== region.id)!;
      expect(graph.solve(region.id, other).cost).toBeLessThan(Infinity);
    }
  });

  it("splits the world where no land route exists", () => {
    const sizes = graph.components().map((c) => c.length);
    expect(sizes.length).toBeGreaterThanOrEqual(2);
    // Afro-Eurasia is one landmass; the Americas are another.
    expect(graph.componentOf("france")).toContain("china");
    expect(graph.componentOf("france")).not.toContain("brazil");
    expect(graph.componentOf("brazil")).toContain("canada");
    expect(graph.componentOf("brazil")).toContain("greenland");
  });

  it("resolves the route the puzzle designer intended", () => {
    // Nepal -> Sweden: the short way north, not the long way through Iran.
    const solution = graph.solve("nepal", "sweden");
    expect(solution.cost).toBe(3);
    expect(solution.path).toEqual(["china", "russia", "finland"]);
  });
});

describe("exclaves do not create borders", () => {
  it("does not route Poland into mainland Russia through Kaliningrad", () => {
    expect(reachable("poland", "north-korea", ["russia"])).toBe(false);
    expect(reachable("finland", "north-korea", ["russia"])).toBe(true);
  });

  it("does not route Turkey into Azerbaijan proper through Nakhchivan", () => {
    expect(reachable("turkey", "russia", ["azerbaijan"])).toBe(false);
    // Nakhchivan does border Iran, so that link is real.
    expect(reachable("turkey", "iran", ["azerbaijan"])).toBe(true);
  });

  it("does not route the Congo into Namibia through Cabinda", () => {
    expect(reachable("republic-of-the-congo", "namibia", ["angola"])).toBe(false);
    expect(
      reachable("republic-of-the-congo", "namibia", [
        "democratic-republic-of-the-congo",
        "angola",
      ]),
    ).toBe(true);
  });

  it("does not route Spain into Morocco through Ceuta or Melilla", () => {
    // Ceuta and Melilla do touch Morocco, and Travle allows a route to begin
    // or end in an exclave — so the two count as neighbours at the endpoints.
    // What must not happen is a route crossing from Europe into Africa through
    // them, because no land joins them to mainland Spain.
    expect(graph.isComplete("france", "morocco", ["spain"])).toBe(false);
    expect(graph.solve("france", "morocco").cost).toBeGreaterThan(8);
    expect(graph.solve("france", "morocco").path).not.toContain("spain");
  });
});

describe("bridges and tunnels", () => {
  it("crosses the Bosphorus within Turkey", () => {
    expect(reachable("greece", "georgia", ["turkey"])).toBe(true);
  });

  it("crosses Denmark's belts and the Øresund", () => {
    expect(reachable("germany", "sweden", ["denmark"])).toBe(true);
  });

  it("crosses the Channel Tunnel", () => {
    expect(reachable("ireland", "belgium", ["united-kingdom", "france"])).toBe(true);
  });

  it("joins Greenland to Canada at Hans Island", () => {
    expect(reachable("greenland", "united-states-of-america", ["canada"])).toBe(true);
  });

  it("reaches Croatia's southern tip over the Pelješac Bridge", () => {
    expect(reachable("slovenia", "montenegro", ["croatia"])).toBe(true);
  });
});

describe("island hopping", () => {
  it("connects Indonesia's islands but not other archipelagos", () => {
    expect(reachable("malaysia", "papua-new-guinea", ["indonesia"])).toBe(true);
    expect(reachable("thailand", "brunei", ["malaysia"])).toBe(true);
    expect(graph.region("philippines").isolated).toBe(true);
    expect(graph.region("japan").isolated).toBe(true);
  });

  it("joins Northern Ireland to Great Britain", () => {
    expect(reachable("ireland", "france", ["united-kingdom"])).toBe(true);
  });
});

describe("surprising borders", () => {
  it("keeps Morocco and Mauritania apart", () => {
    // Western Sahara divides them, so they always cost a guess in between.
    expect(graph.solve("morocco", "mauritania").cost).toBe(1);
    expect(graph.solve("western-sahara", "morocco").cost).toBe(0);
    expect(graph.solve("western-sahara", "mauritania").cost).toBe(0);
  });

  it("keeps the Russia–North Korea border", () => {
    expect(graph.solve("russia", "north-korea").cost).toBe(0);
  });

  it("splits French Guiana off from France", () => {
    expect(graph.solve("french-guiana", "brazil").cost).toBe(0);
    expect(graph.solve("french-guiana", "suriname").cost).toBe(0);
    // Naming France must not teleport a route from South America to Europe.
    expect(reachable("brazil", "belgium", ["france"])).toBe(false);
  });

  it("keeps enclaves attached to their host", () => {
    expect(graph.solve("lesotho", "botswana").path).toEqual(["south-africa"]);
    expect(graph.solve("san-marino", "france").path).toEqual(["italy"]);
    expect(graph.solve("vatican", "france").path).toEqual(["italy"]);
  });
});

describe("neighbours", () => {
  it("lists every country a route could step into", () => {
    expect(graph.neighbours("portugal")).toEqual(["spain"]);
    expect(graph.neighbours("france")).toContain("belgium");
    expect(graph.neighbours("france")).toContain("united-kingdom"); // the tunnel counts
    expect(graph.neighbours("france")).not.toContain("brazil"); // French Guiana is its own region
  });

  it("counts a neighbour reached only through an exclave", () => {
    expect(graph.neighbours("spain")).toContain("morocco");
    expect(graph.neighbours("russia")).toContain("poland"); // Kaliningrad
  });

  it("gives an island nothing to step into", () => {
    expect(graph.neighbours("iceland")).toEqual([]);
  });
});
