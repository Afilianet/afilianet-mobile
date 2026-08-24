import { useInfiniteQuery } from "@tanstack/react-query";
import { isApiError } from "../api/errors";
import type { PaginatedResponse } from "../types/api";

const NON_RETRYABLE = new Set(["unauthorized", "forbidden", "validation", "not_found"]);

/**
 * useInfiniteQuery preconfigured with the same retry policy as useApiQuery,
 * for the backend's standard Laravel paginator envelope (data/meta with
 * current_page/last_page). Page 1 first; getNextPageParam stops once
 * current_page reaches last_page, so "Load more" naturally disables itself
 * instead of ever re-requesting an already-loaded page.
 */
export function useApiInfiniteQuery<T>(
  queryKey: readonly unknown[],
  queryFn: (page: number) => Promise<PaginatedResponse<T>>,
  options?: { enabled?: boolean },
) {
  return useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => queryFn(pageParam),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const current = lastPage.meta?.current_page;
      const last = lastPage.meta?.last_page;
      if (current === undefined || last === undefined || current >= last) return undefined;
      return current + 1;
    },
    retry: (failureCount, error) => {
      if (isApiError(error) && NON_RETRYABLE.has(error.kind)) return false;
      return failureCount < 2;
    },
    enabled: options?.enabled,
  });
}
