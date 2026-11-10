/**
 * Build ceiling for WhatsApp as a phone verification code channel.
 *
 * WhatsApp is offered only when BOTH hold:
 * - this build allows it (EXPO_PUBLIC_PHONE_WHATSAPP === "1"), and
 * - the server says it can send through it right now
 *   (GET /auth/phone-verification/channels, API phone-otp-whatsapp-v2).
 *
 * Unset or "0" keeps today's behavior: SMS only, and the channels endpoint is
 * never called. An API without that endpoint (404/405) also means SMS only, so
 * WhatsApp never appears just because a build allows it.
 */
export const whatsappCodeChannelEnabled = process.env.EXPO_PUBLIC_PHONE_WHATSAPP === "1";
