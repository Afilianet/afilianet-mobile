import { QueryClient, QueryClientProvider, useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { act, render } from "@testing-library/react-native";
import { Text } from "react-native";
import { SectionCard } from "./SectionCard";
import { PaginatedSectionCard } from "./PaginatedSectionCard";

let queryClient: QueryClient;

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

afterEach(() => {
  queryClient.clear();
});

function DisabledSection({ enabled }: { enabled: boolean }) {
  const query = useQuery({ queryKey: ["disabled-demo"], queryFn: () => Promise.resolve("data"), enabled });
  return (
    <SectionCard title="Demo" query={query} isEmpty={() => false} enabled={enabled} disabledTitle="Selecciona una organización.">
      {(data) => <Text>{data}</Text>}
    </SectionCard>
  );
}

function DisabledPaginatedSection({ enabled }: { enabled: boolean }) {
  const query = useInfiniteQuery({
    queryKey: ["disabled-paginated-demo"],
    queryFn: () => Promise.resolve({ data: [{ id: "1" }], meta: { current_page: 1, last_page: 1, per_page: 25, total: 1 } }),
    initialPageParam: 1,
    getNextPageParam: () => undefined,
    enabled,
  });
  return (
    <PaginatedSectionCard
      title="Demo"
      query={query}
      enabled={enabled}
      disabledTitle="Selecciona una organización."
      renderItem={() => null}
    />
  );
}

describe("SectionCard: disabled vs loading", () => {
  it("renders the disabled message, never a permanent skeleton, when enabled=false", async () => {
    let result!: Awaited<ReturnType<typeof render>>;
    await act(async () => {
      result = await render(
        <QueryClientProvider client={queryClient}>
          <DisabledSection enabled={false} />
        </QueryClientProvider>,
      );
    });
    expect(result.queryByText("Selecciona una organización.")).toBeTruthy();
  });

  it("still renders real data normally when enabled=true (default), unaffected by the new prop", async () => {
    let result!: Awaited<ReturnType<typeof render>>;
    await act(async () => {
      result = await render(
        <QueryClientProvider client={queryClient}>
          <DisabledSection enabled={true} />
        </QueryClientProvider>,
      );
    });
    expect(await result.findByText("data")).toBeTruthy();
  });
});

describe("PaginatedSectionCard: disabled vs loading", () => {
  it("renders the disabled message, never a permanent skeleton, when enabled=false", async () => {
    let result!: Awaited<ReturnType<typeof render>>;
    await act(async () => {
      result = await render(
        <QueryClientProvider client={queryClient}>
          <DisabledPaginatedSection enabled={false} />
        </QueryClientProvider>,
      );
    });
    expect(result.queryByText("Selecciona una organización.")).toBeTruthy();
  });
});
