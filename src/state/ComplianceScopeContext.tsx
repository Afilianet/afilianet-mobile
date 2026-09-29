import { createContext, useContext } from "react";

/** Scope belongs to one mounted verification screen; never to the global HTTP client. */
export const AssistedComplianceContext = createContext<string | undefined>(undefined);

export function useAssistedComplianceId(): string | undefined {
  return useContext(AssistedComplianceContext);
}

/** Keeps the original self keys stable while isolating every assisted affiliate. */
export function scopedComplianceKey(key: readonly unknown[], assistedId?: string): readonly unknown[] {
  return assistedId ? [...key, "assisted", assistedId] : key;
}

/** Existing self calls keep their original argument list (also useful for test doubles). */
export function assistedScopeArgs(assistedId?: string): [] | [string] {
  return assistedId ? [assistedId] : [];
}
