import { config, type AppEnvironment } from "../config/env";

// Public HTTPS landing is deployed in staging. Other environments keep the
// installed-app link until their own web registration host is available.
export function buildReferralUrl(organizationId: string, affiliateCode: string, environment: AppEnvironment = config.appEnv): string {
  const base = environment === "staging" ? "https://staging-admin.afilianet.mx/join" : "afilianetmobile://join";
  return `${base}/${encodeURIComponent(organizationId)}/${encodeURIComponent(affiliateCode)}`;
}

const SHAREABLE_STATUSES = new Set(["active", "pending"]);

export function canShareReferral(affiliateStatus: string): boolean {
  return SHAREABLE_STATUSES.has(affiliateStatus);
}
