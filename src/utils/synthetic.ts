import { strings } from "../i18n";
import type { AffiliateProfile } from "../types/api";

/**
 * The label to show for a synthetic demo/test affiliate, or null for a real
 * one. The API's marker (API #142) is the only source: the app never guesses
 * from a code or a name, so a real person is never labelled fictitious.
 */
export function syntheticLabel(affiliate: Pick<AffiliateProfile, "synthetic">): string | null {
  const marker = affiliate.synthetic;
  if (!marker || marker.data_kind !== "synthetic") return null;
  return marker.label?.trim() || strings.network.syntheticFallback;
}
