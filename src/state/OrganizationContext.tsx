import { createContext, useContext } from "react";
import type { ApiError } from "../api/errors";
import type { Organization } from "../types/api";

export type OrganizationStatus = "idle" | "loading" | "ready" | "error";

export interface OrganizationContextValue {
  status: OrganizationStatus;
  organizations: Organization[];
  activeOrganization: Organization | null;
  error: ApiError | null;
  selectOrganization: (organizationId: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export const OrganizationContext = createContext<OrganizationContextValue | null>(null);

export function useOrganization(): OrganizationContextValue {
  const value = useContext(OrganizationContext);
  if (!value) {
    throw new Error("useOrganization must be used within an OrganizationProvider");
  }
  return value;
}
