import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { isApiError } from "../api/errors";

const NON_RETRYABLE = new Set(["unauthorized", "forbidden", "validation", "not_found"]);

/**
 * useQuery preconfigured with the app's retry policy: don't retry errors
 * that a retry can't fix (401/403/422/404), do retry a couple of times for
 * timeouts/offline/5xx.
 */
export function useApiQuery<T>(
  queryKey: readonly unknown[],
  queryFn: () => Promise<T>,
  options?: Omit<UseQueryOptions<T>, "queryKey" | "queryFn">,
) {
  return useQuery({
    queryKey,
    queryFn,
    retry: (failureCount, error) => {
      if (isApiError(error) && NON_RETRYABLE.has(error.kind)) return false;
      return failureCount < 2;
    },
    ...options,
  });
}
