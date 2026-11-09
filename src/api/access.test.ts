import {
  acceptReferralAsCurrentUser,
  accessErrorMessage,
  registerAccount,
  requestPasswordRecovery,
  requestPhoneVerification,
  resetPasswordWithPhoneCode,
  signInWith,
  unavailablePhoneChannel,
  verifyPhone,
} from "./access";
import { configureApiClient } from "./client";
import { ApiError } from "./errors";

jest.mock("../config/env", () => ({ config: { apiBaseUrl: "https://api.test", apiTimeoutMs: 5000 } }));

const originalFetch = global.fetch;
const fetchMock = jest.fn();
const USER = { id: "u-1", first_name: "Ana", last_name: "Pérez", email: null, phone: "+525512345678", email_verified_at: null, phone_verified_at: null };

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
}

function lastCall() {
  const [url, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
  return { url, init, body: init.body ? JSON.parse(init.body) : undefined, headers: init.headers as Record<string, string> };
}

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as typeof fetch;
  configureApiClient({ getToken: () => "session-token", getOrganizationId: () => "org-id" });
});

afterAll(() => {
  global.fetch = originalFetch;
});

describe("sign-in and registration", () => {
  it("signs in with the canonical {identifier, password} contract, anonymously and without organization", async () => {
    fetchMock.mockResolvedValueOnce(json({ token: "t", user: USER }));
    await signInWith("+525512345678", "secret123");
    const call = lastCall();
    expect(call.url).toBe("https://api.test/api/v1/auth/login");
    expect(call.body).toEqual({ identifier: "+525512345678", password: "secret123" });
    expect(call.headers.Authorization).toBeUndefined();
    expect(call.headers["X-Organization-ID"]).toBeUndefined();
  });

  it("sends an email as the identifier plus the compatible email alias, so it works before and after API #50", async () => {
    fetchMock.mockResolvedValueOnce(json({ token: "t", user: USER }));
    await signInWith("ana@example.com", "secret123");
    expect(lastCall().body).toEqual({ identifier: "ana@example.com", email: "ana@example.com", password: "secret123" });
  });

  it("registers directly with no referral and no organization header", async () => {
    fetchMock.mockResolvedValueOnce(json({ token: "t", user: USER }, 201));
    await registerAccount({ first_name: "Ana", last_name: "Pérez", phone: "+525512345678", password: "secret123", password_confirmation: "secret123" });
    const call = lastCall();
    expect(call.url).toBe("https://api.test/api/v1/auth/register");
    expect(call.body).not.toHaveProperty("referral_code");
    expect(call.body).not.toHaveProperty("email");
    expect(call.headers["X-Organization-ID"]).toBeUndefined();
  });
});

describe("phone verification", () => {
  it("reports the server's resend wait and expiry", async () => {
    // Contract (API #50): 202 {retry_after, expires_in}, flat.
    fetchMock.mockResolvedValueOnce(json({ retry_after: 45, expires_in: 600 }, 202));
    await expect(requestPhoneVerification()).resolves.toEqual({ retryAfterSeconds: 45, expiresInSeconds: 600, channel: "sms" });
    expect(lastCall().body).toEqual({ channel: "sms" });
    expect(lastCall().headers.Authorization).toBe("Bearer session-token");
    expect(lastCall().headers["X-Organization-ID"]).toBeUndefined();
  });

  it("API #79: asks for WhatsApp and reports the channel the API says it queued", async () => {
    fetchMock.mockResolvedValueOnce(json({ retry_after: 60, expires_in: 600, delivery: "queued", channel: "whatsapp" }, 202));
    await expect(requestPhoneVerification("whatsapp")).resolves.toEqual({ retryAfterSeconds: 60, expiresInSeconds: 600, channel: "whatsapp" });
    expect(lastCall().url).toBe("https://api.test/api/v1/auth/phone-verification");
    expect(lastCall().body).toEqual({ channel: "whatsapp" });
  });

  it("an API without #79 ignores the channel and answers without one: the code went by SMS, never reported as WhatsApp", async () => {
    fetchMock.mockResolvedValueOnce(json({ retry_after: 60, expires_in: 600 }, 202));
    await expect(requestPhoneVerification("whatsapp")).resolves.toMatchObject({ channel: "sms" });
  });

  it("429: the wait comes from the body's retry_after (before the Retry-After header); the 429 has no reason", async () => {
    fetchMock.mockResolvedValueOnce(json({ message: "Too Many Attempts.", retry_after: 42 }, 429, { "Retry-After": "50" }));
    const error = (await requestPhoneVerification("whatsapp").catch((cause) => cause)) as ApiError;
    expect(error.kind).toBe("rate_limited");
    expect(error.retryAfterSeconds).toBe(42);
    expect(error.reason).toBeUndefined();
  });

  it("429 without any wait from the API: none is made up", async () => {
    fetchMock.mockResolvedValueOnce(json({ message: "Too Many Attempts." }, 429));
    const error = (await requestPhoneVerification().catch((cause) => cause)) as ApiError;
    expect(error.retryAfterSeconds).toBeUndefined();
    expect(accessErrorMessage(error)).toBe("Demasiados intentos. Espera un momento e inténtalo de nuevo.");
  });

  it.each([
    ["whatsapp_unavailable", "whatsapp", "Por ahora no podemos enviar códigos por WhatsApp. No se envió ningún código."],
    ["sms_unavailable", "sms", "Por ahora no podemos enviar mensajes SMS. Inténtalo más tarde."],
  ])("503 %s: names the channel that cannot send; no retry_after in that body", async (reason, channel, message) => {
    fetchMock.mockResolvedValueOnce(json({ message: "Unavailable.", reason }, 503));
    const error = await requestPhoneVerification(channel as "sms" | "whatsapp").catch((cause) => cause);
    expect(unavailablePhoneChannel(error)).toBe(channel);
    expect((error as ApiError).retryAfterSeconds).toBeUndefined();
    expect(accessErrorMessage(error)).toBe(message);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("422 errors.channel: the channel was refused, in this app's Spanish", async () => {
    fetchMock.mockResolvedValueOnce(json({ message: "The selected channel is invalid.", errors: { channel: ["The selected channel is invalid."] } }, 422));
    const error = await requestPhoneVerification("whatsapp").catch((cause) => cause);
    expect(accessErrorMessage(error)).toBe("Ese medio no está disponible para enviar el código. Elige otro.");
  });

  it("returns the server's user, never a locally-built verified one", async () => {
    // Contract (API #50): 200 {user}, flat.
    fetchMock.mockResolvedValueOnce(json({ user: { ...USER, phone_verified_at: "2026-10-12T10:00:00Z" } }));
    const user = await verifyPhone("123456");
    expect(lastCall().body).toEqual({ code: "123456" });
    expect(user.phone_verified_at).toBe("2026-10-12T10:00:00Z");
  });

  it.each([
    ["otp_expired", "El código venció. Pide uno nuevo."],
    ["otp_invalid", "El código no es correcto. Revísalo e inténtalo de nuevo."],
    ["otp_attempts_exceeded", "Hiciste demasiados intentos. Pide un código nuevo."],
  ])("maps reason %s to clear Spanish", async (reason, message) => {
    fetchMock.mockResolvedValueOnce(json({ message: "The code is invalid.", errors: { code: ["The code is invalid."] }, reason }, 422));
    const error = await verifyPhone("000000").catch((cause) => cause);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).reason).toBe(reason);
    expect(accessErrorMessage(error)).toBe(message);
  });

  it("uses Retry-After when rate limited", async () => {
    fetchMock.mockResolvedValueOnce(json({ message: "Too Many Attempts." }, 429, { "Retry-After": "37" }));
    const error = await requestPhoneVerification().catch((cause) => cause);
    expect((error as ApiError).retryAfterSeconds).toBe(37);
    expect(accessErrorMessage(error)).toBe("Espera 37 segundos antes de intentarlo de nuevo.");
  });
});

describe("recovery", () => {
  it("requests phone recovery anonymously and resets with the SMS code", async () => {
    fetchMock.mockResolvedValueOnce(json({ message: "ok", retry_after: 60 }));
    await expect(requestPasswordRecovery({ phone: "+525512345678" })).resolves.toEqual({ retryAfterSeconds: 60 });
    expect(lastCall().body).toEqual({ phone: "+525512345678" });
    expect(lastCall().headers.Authorization).toBeUndefined();

    fetchMock.mockResolvedValueOnce(json({ message: "ok" }));
    await resetPasswordWithPhoneCode({ phone: "+525512345678", code: "123456", password: "newpass12", password_confirmation: "newpass12" });
    expect(lastCall().url).toBe("https://api.test/api/v1/auth/reset-password");
    expect(lastCall().body).toMatchObject({ phone: "+525512345678", code: "123456" });
  });
});

describe("later affiliation", () => {
  it("accepts a referral as the signed-in user, without registration fields", async () => {
    fetchMock.mockResolvedValueOnce(json({ data: { user: USER, organization_role: "affiliate", affiliate: {}, token: null } }));
    await acceptReferralAsCurrentUser("invitation/token");
    const call = lastCall();
    expect(call.url).toBe("https://api.test/api/v1/invitations/invitation%2Ftoken/accept");
    expect(call.headers.Authorization).toBe("Bearer session-token");
    expect(call.body).toEqual({});
  });
});

describe("accessErrorMessage", () => {
  it("explains an invitation addressed to someone else", () => {
    expect(accessErrorMessage(new ApiError("validation", "x", 422, undefined, { reason: "invitation_recipient_mismatch" }))).toBe(
      "Esta invitación está dirigida a otro correo o celular. Entra con la cuenta a la que te invitaron.",
    );
  });

  it("says an endpoint the API has not deployed yet is not available, instead of a generic failure", () => {
    expect(accessErrorMessage(new ApiError("not_found", "Not Found", 404))).toBe("Esta opción todavía no está disponible. Inténtalo más tarde.");
    expect(accessErrorMessage(new ApiError("unknown", "Method Not Allowed", 405))).toBe("Esta opción todavía no está disponible. Inténtalo más tarde.");
  });

  it("never shows the API's English validation text", () => {
    const error = new ApiError("validation", "An email or phone number is required.", 422, { email: ["An email or phone number is required."] });
    expect(accessErrorMessage(error)).toBe("Revisa el correo. Puede que ya esté registrado; si es tuyo, inicia sesión.");
  });
});
