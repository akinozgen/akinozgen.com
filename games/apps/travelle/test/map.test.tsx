import { cleanup, waitFor } from "@testing-library/react";
import { render } from "./helpers.tsx";
import { afterEach, describe, expect, it } from "vitest";
import { MapView } from "../src/components/MapView.tsx";

afterEach(cleanup);

describe("the map", () => {
  it("pins a country too small to draw and leaves the rest as shapes", async () => {
    // Portugal to China spans Eurasia, so the Vatican cannot cover a pixel.
    render(
      <MapView
        shown={[
          { regionId: "portugal", tone: "start", label: "Portugal" },
          { regionId: "china", tone: "end", label: "China" },
          { regionId: "vatican", tone: "detour", label: "Vatican" },
        ]}
      />,
    );

    await waitFor(() => {
      expect(document.querySelector('.shape[data-region="china"]')?.getAttribute("d")?.length)
        .toBeGreaterThan(100);
      expect(document.querySelector(".marker--detour")?.className.baseVal).toContain("is-tiny");
      expect(document.querySelector(".marker--end")?.className.baseVal).not.toContain("is-tiny");
    });
  });
});
