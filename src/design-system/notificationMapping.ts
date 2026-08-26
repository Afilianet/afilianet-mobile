import type { NotificationType } from "../types/api";
import type { IconName } from "./icons/Icon";
import type { BadgeTone } from "./theme";

export interface NotificationTypeMeta {
  category: string;
  icon: IconName;
  tone: BadgeTone;
}

const FALLBACK: NotificationTypeMeta = { category: "Notification", icon: "campana", tone: "neutral" };

/**
 * The single place notification type -> icon/category/tone is decided.
 * Mirrors app/Modules/Notifications/Enums/NotificationType.php's exact 14
 * cases -- never hardcode this per-component. `tone` follows the same
 * official semantic rule used throughout statusMapping.ts (approved/paid ->
 * success, action-needed/in-review/requested/processing -> warning,
 * rejected/reversed/failed -> danger, cancelled -> neutral).
 */
const NOTIFICATION_TYPE_META: Record<NotificationType, NotificationTypeMeta> = {
  compliance_started: { category: "Compliance", icon: "cumplimiento", tone: "neutral" },
  compliance_action_required: { category: "Compliance", icon: "cumplimiento", tone: "warning" },
  compliance_manual_review: { category: "Compliance", icon: "cumplimiento", tone: "warning" },
  compliance_approved: { category: "Compliance", icon: "cumplimiento", tone: "success" },
  compliance_rejected: { category: "Compliance", icon: "cumplimiento", tone: "danger" },
  affiliate_activated: { category: "Account", icon: "check", tone: "success" },
  invitation_accepted: { category: "Network", icon: "afiliados", tone: "success" },
  commission_earned: { category: "Commission", icon: "comision", tone: "success" },
  commission_reversed: { category: "Commission", icon: "comision", tone: "danger" },
  payout_requested: { category: "Payout", icon: "monedero", tone: "warning" },
  payout_processing: { category: "Payout", icon: "monedero", tone: "warning" },
  payout_paid: { category: "Payout", icon: "monedero", tone: "success" },
  payout_failed: { category: "Payout", icon: "monedero", tone: "danger" },
  payout_cancelled: { category: "Payout", icon: "monedero", tone: "neutral" },
};

/** Falls back safely (generic bell, neutral tone) for a type this app doesn't recognize -- never throws, never guesses. */
export function notificationTypeMeta(type: string): NotificationTypeMeta {
  return (NOTIFICATION_TYPE_META as Record<string, NotificationTypeMeta>)[type] ?? FALLBACK;
}
