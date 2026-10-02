import { Redirect } from "expo-router";
import type { ReactNode } from "react";
import { releaseFeatures } from "../config/release";
import { routes } from "../navigation/routes";

/** Do not mount deferred screens or their queries, including via deep links. */
export function CommercialFeatureGate({ children }: { children: ReactNode }) {
  return releaseFeatures.commerce ? children : <Redirect href={routes.home} />;
}
