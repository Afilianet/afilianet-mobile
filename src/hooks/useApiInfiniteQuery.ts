import { useInfiniteQuery } from "@tanstack/react-query";
import { isApiError } from "../api/errors";
import type { PaginatedResponse } from "../types/api";

const NON_RETRYABLE = new Set(["unauthorized", "forbidden", "validation", "not_found"]);

/** The server answered, but not with a readable page. Not an ApiError: lists show their generic «No pudimos cargar esto.». */
export class UnreadablePageError extends Error {
  constructor() {
    super("The server's response is not a readable page.");
    this.name = "UnreadablePageError";
  }
}

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
  options?: { enabled?: boolean; retry?: (failureCount: number, error: unknown) => boolean },
) {
  return useInfiniteQuery({
    queryKey,
    queryFn: async ({ pageParam }) => {
      const page = await queryFn(pageParam);
      // A 200 that is not the paginator envelope (e.g. an HTML page from a
      // proxy: the API client yields null for a body that is not JSON) is a
      // failed load, shown as one with its retry -- never stored as a page,
      // where it would break the list's rendering.
      if (!page || typeof page !== "object" || !Array.isArray(page.data)) throw new UnreadablePageError();
      return page;
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const current = lastPage.meta?.current_page;
      const last = lastPage.meta?.last_page;
      if (current === undefined || last === undefined || current >= last) return undefined;
      return current + 1;
    },
    retry: (failureCount, error) => {
      if (options?.retry) return options.retry(failureCount, error);
      if (isApiError(error) && NON_RETRYABLE.has(error.kind)) return false;
      return failureCount < 2;
    },
    enabled: options?.enabled,
  });
}
