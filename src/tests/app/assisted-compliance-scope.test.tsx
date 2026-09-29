import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { PropsWithChildren } from "react";
import { fetchMyCompliance } from "../../api/endpoints";
import { useCompliance } from "../../hooks/useCompliance";
import { AssistedComplianceContext } from "../../state/ComplianceScopeContext";

jest.mock("../../state/OrganizationContext", () => ({
  useOrganization: () => ({ activeOrganization: { id: "org-a" } }),
}));
jest.mock("../../api/endpoints", () => ({
  fetchMyCompliance: jest.fn(),
}));

it("keeps sponsor and assisted affiliate cases isolated even while both screens are mounted", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  (fetchMyCompliance as jest.Mock).mockImplementation(async (id?: string) => ({ id: id ?? "sponsor-case" }));
  const wrapper = (id?: string) => function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>
      <AssistedComplianceContext.Provider value={id}>{children}</AssistedComplianceContext.Provider>
    </QueryClientProvider>;
  };
  let own!: Awaited<ReturnType<typeof renderHook<ReturnType<typeof useCompliance>, unknown>>>;
  let assisted!: Awaited<ReturnType<typeof renderHook<ReturnType<typeof useCompliance>, unknown>>>;
  await act(async () => {
    own = await renderHook(() => useCompliance(), { wrapper: wrapper() });
    assisted = await renderHook(() => useCompliance(), { wrapper: wrapper("enrollment-a") });
  });
  await waitFor(() => expect(own.result.current.data?.id).toBe("sponsor-case"));
  await waitFor(() => expect(assisted.result.current.data?.id).toBe("enrollment-a"));
  await act(async () => { await assisted.result.current.refetch(); });
  expect(own.result.current.data?.id).toBe("sponsor-case");
  expect(client.getQueryData(["compliance", "me", "org-a"])).toEqual({ id: "sponsor-case" });
  expect(client.getQueryData(["compliance", "me", "org-a", "assisted", "enrollment-a"])).toEqual({ id: "enrollment-a" });
  client.clear();
});
