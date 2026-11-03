/**
 * WhatsApp for the phone verification code is offered only when the build
 * says the server sends it (API #79 deployed with WHATSAPP_ENABLED and Meta
 * configured). The API has no endpoint to ask which channels it offers, and an
 * API without #79 silently sends SMS instead, so by default only SMS is shown.
 */
export const whatsappCodeChannelEnabled = process.env.EXPO_PUBLIC_PHONE_WHATSAPP === "1";
