import { render } from "@testing-library/react-native";
import type { AffiliateProfile } from "../types/api";
import { AffiliateRow } from "./AffiliateRow";

const REAL: AffiliateProfile = {
  id: "aff-1",
  affiliate_code: "AFF100",
  status: "active",
  user: { id: "u-1", first_name: "Ana", last_name: "Real" },
  joined_at: null,
  activated_at: null,
  metadata: null,
  created_at: "2026-01-01T00:00:00Z",
};

describe("AffiliateRow and the synthetic marker (API #142)", () => {
  it("a synthetic row shows the server's label, also to screen readers", async () => {
    const view = await render(
      <AffiliateRow
        affiliate={{ ...REAL, affiliate_code: "SYN000001", synthetic: { data_kind: "synthetic", label: "Registros sintéticos de prueba", note: "…" } }}
        onPress={() => {}}
      />,
    );
    expect(view.getByTestId("affiliate-synthetic")).toBeTruthy();
    expect(view.getByText("Registros sintéticos de prueba")).toBeTruthy();
    expect(view.getByRole("button").props.accessibilityLabel).toContain("Registros sintéticos de prueba");
  });

  it("a marker without its label still says it is synthetic", async () => {
    const view = await render(<AffiliateRow affiliate={{ ...REAL, synthetic: { data_kind: "synthetic" } }} />);
    expect(view.getByText("Registros sintéticos de prueba")).toBeTruthy();
  });

  it("a real row carries no label, even with a SYN-looking code", async () => {
    const view = await render(<AffiliateRow affiliate={{ ...REAL, affiliate_code: "SYN000002" }} onPress={() => {}} />);
    expect(view.queryByTestId("affiliate-synthetic")).toBeNull();
    expect(view.getByRole("button").props.accessibilityLabel).not.toContain("sintético");
  });
});
