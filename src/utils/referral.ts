import { config, type AppEnvironment } from "../config/env";

// Public HTTPS landing is deployed in staging. Other environments keep the
// installed-app link until their own web registration host is available.
export function buildReferralUrl(organizationId: string, affiliateCode: string, environment: AppEnvironment = config.appEnv): string {
  const base = environment === "staging" ? "https://staging-admin.afilianet.mx/join" : "afilianetmobile://join";
  return `${base}/${encodeURIComponent(organizationId)}/${encodeURIComponent(affiliateCode)}`;
}

/**
 * WhatsApp share link (https://wa.me/?text=...): opens WhatsApp - or its web
 * fallback - with the message prefilled; the user still picks the chat and
 * presses send. Nothing is sent by Afilianet and no provider is involved.
 */
export function buildWhatsappShareUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

/**
 * Only an HTTPS link is tappable inside a WhatsApp chat; the installed-app
 * scheme used outside staging (afilianetmobile://) is not, so offering
 * "share by WhatsApp" there would hand the invitee a dead link.
 */
export function isLinkTappableInChats(url: string): boolean {
  return url.startsWith("https://");
}

const SHAREABLE_STATUSES = new Set(["active", "pending"]);

export function canShareReferral(affiliateStatus: string): boolean {
  return SHAREABLE_STATUSES.has(affiliateStatus);
}


/** Read a shared link locally; navigation still uses our scoped registration route. */
export function parseRegistrationReferral(input: string): { code: string; organizationId?: string } | null {
  const text = input.trim();
  if (/^[A-Za-z0-9_-]{1,64}$/.test(text)) return { code: text };
  try {
    const url = new URL(text);
    const parts = [url.hostname, ...url.pathname.split("/")].filter(Boolean);
    const joinIndex = parts.lastIndexOf("join");
    if (joinIndex < 0 || parts.length !== joinIndex + 3) return null;
    const organizationId = decodeURIComponent(parts[joinIndex + 1]);
    const code = decodeURIComponent(parts[joinIndex + 2]);
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(code) || !/^[A-Za-z0-9_-]{1,64}$/.test(organizationId)) return null;
    return { organizationId, code };
  } catch {
    return null;
  }
}
