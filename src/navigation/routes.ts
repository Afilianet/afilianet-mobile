import { releaseFeatures } from "../config/release";
import { surveysPreviewEnabled } from "../features/surveys/flags";

export const routes = {
  register: "/(auth)/register",
  login: "/(auth)/login",
  invitation: "/(auth)/invitation",
  forgotPassword: "/(auth)/forgot-password",
  verifyAccount: "/verify-account",
  home: "/(app)",
  network: "/(app)/network",
  sales: "/(app)/sales",
  wallet: "/(app)/wallet",
  profile: "/(app)/profile",
  organizationPicker: "/organization-picker",
  referral: "/referral",
  commissions: "/commissions",
  payouts: "/payouts",
  compliance: "/compliance",
  notifications: "/notifications",
  notificationSettings: "/notification-settings",
  platformNotifications: "/platform-notifications",
  noOrganization: "/no-organization",
  surveys: "/surveys",
  signOutPending: "/sign-out-pending",
} as const;

// The only screen values afilianet-api's notification listeners ever put in
// a notification's payload (app/Modules/Notifications/Listeners/Notify*.php)
// -- a short label, never a route or URL. Mapping through this fixed table
// (rather than trusting/interpolating the string directly) is what makes an
// unrecognized or tampered value fail safely to "no navigation" instead of
// an arbitrary destination.
const NOTIFICATION_SCREEN_ROUTES: Record<string, string> = {
  compliance: routes.compliance,
  profile: routes.profile,
  network: routes.network,
  commissions: routes.commissions,
  payouts: routes.payouts,
  notifications: routes.notifications,
  "platform-notifications": routes.platformNotifications,
  surveys: routes.surveys,
};

/** Returns the whitelisted destination for a notification's payload.screen, or null if absent/unrecognized. */
export function notificationDestination(screen: string | undefined): string | null {
  if (!screen) return null;
  if (!releaseFeatures.commerce && (screen === "commissions" || screen === "payouts")) return null;
  if (screen === "surveys" && !surveysPreviewEnabled) return null;
  return NOTIFICATION_SCREEN_ROUTES[screen] ?? null;
}

// A function, not a flat path: this is a top-level route (like referral/
// organization-picker) rather than nested under (app)/network/ -- Expo
// Router would otherwise have to resolve *both* the (app) group's
// network.tsx (URL "/network") and a nested network/[uuid] directory
// against the same "/network" URL segment, which risks an ambiguous route
// registration between a file and a same-named directory. A distinct
// top-level segment sidesteps that entirely.
export function networkAffiliateDetail(affiliateUuid: string): string {
  return `/network-affiliate/${affiliateUuid}`;
}

export function payoutRequest(currency: string): string {
  return `/payout-request/${currency}`;
}

// Singular top-level segment, for the same file-vs-directory reason as
// networkAffiliateDetail above: notifications.tsx already owns "/notifications".
export function notificationDetail(notificationId: string): string {
  return `/notification/${notificationId}`;
}

/** A staff invitation to join another organization as owner/admin/manager -
 * distinct from `/join/[organizationId]/[code]`, which is the unrelated
 * affiliate-referral/registration flow. */
export function staffInvite(token: string): string {
  return `/staff-invite/${encodeURIComponent(token)}`;
}

const SURVEY_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** null for an id that is not a plain identifier (e.g. a tampered push payload). */
export function surveyDetail(surveyId: string): string | null {
  return SURVEY_ID.test(surveyId) ? `/surveys/${surveyId}` : null;
}

/** Inside the Encuestas section (its own stack under the tab bar), so leaving it keeps the bar and its safe exit. */
export function surveyResponse(draftId: string): string {
  return `/surveys/response/${encodeURIComponent(draftId)}`;
}
