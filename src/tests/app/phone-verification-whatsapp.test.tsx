import { act, fireEvent, render, within } from "@testing-library/react-native";
import { useEffect, useState } from "react";
import { configureApiClient } from "../../api/client";
import { fetchMe } from "../../api/endpoints";
import { AuthContext, type AuthContextValue } from "../../auth/AuthContext";
import VerifyAccountScreen from "../../app/verify-account";
import type { User } from "../../types/api";

/**
 * Phone verification by SMS or WhatsApp (API #79 @ bad03c0) against simulated
 * HTTP: the real client and access functions, only global fetch is replaced.
 * The session re-reads GET /me like AuthProvider, so "Verificado" can only
 * come from the server's user.
 */
jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn(), replace: jest.fn(), push: jest.fn() }) }));
jest.mock("../../auth/pendingReferral", () => ({ usePendingReferral: () => null, pendingReferralPath: () => "/" }));
jest.mock("../../config/env", () => ({ config: { apiBaseUrl: "https://api.test", apiTimeoutMs: 5000 } }));
// These journeys need a build that offers WhatsApp (API #79 deployed); the default build offers SMS only.
jest.mock("../../config/phoneChannels", () => ({ whatsappCodeChannelEnabled: true }));

const originalFetch = global.fetch;
const fetchMock = jest.fn();

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
}
function deferred() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((done) => (resolve = done));
  return { promise, resolve };
}

const ANA: User = {
  id: "user-ana",
  first_name: "Ana",
  last_name: "Pérez",
  email: "ana@example.com",
  phone: "+525512345678",
  status: "active",
  email_verified_at: "2026-10-01T00:00:00Z",
  phone_verified_at: null,
  last_login_at: null,
  created_at: "2026-10-01T00:00:00Z",
};
const BETO: User = { ...ANA, id: "user-beto", first_name: "Beto", email: null, email_verified_at: null, phone: "+525587654321" };
const VERIFIED_AT = "2026-10-21T18:00:00Z";
const CODE = "482915";

const QUEUED = (channel: "sms" | "whatsapp", retryAfter = 60) => json({ retry_after: retryAfter, expires_in: 600, delivery: "queued", channel }, 202);
const ME = (user: User) => json({ data: user });

let switchUser: (user: User | null) => void;

/** A minimal session: refreshUser = GET /me, ignored if the account changed meanwhile (as AuthProvider does). */
function Session({ initial }: { initial: User }) {
  const [user, setUser] = useState<User | null>(initial);
  useEffect(() => {
    switchUser = setUser;
  }, []);
  const value: AuthContextValue = {
    status: user ? "signedIn" : "signedOut",
    user,
    error: null,
    signIn: jest.fn(),
    register: jest.fn(),
    registerFromReferral: jest.fn(),
    async refreshUser() {
      const asked = user?.id;
      const me = await fetchMe();
      let current: string | undefined;
      setUser((now) => {
        current = now?.id;
        return now?.id === asked ? me : now;
      });
      return current === asked ? me : null;
    },
    onboardingRoute: null,
    consumeOnboardingRoute: jest.fn(),
    signOut: jest.fn(),
  };
  return (
    <AuthContext.Provider value={value}>
      <VerifyAccountScreen />
    </AuthContext.Provider>
  );
}

type Screen = Awaited<ReturnType<typeof render>>;

async function renderVerify(user: User = ANA) {
  let screen!: Screen;
  await act(async () => {
    screen = await render(<Session initial={user} />);
  });
  return screen;
}
async function press(screen: Screen, text: string) {
  await act(async () => {
    fireEvent.press(screen.getByText(text));
  });
}
async function choose(screen: Screen, channel: "SMS" | "WhatsApp") {
  await act(async () => {
    fireEvent.press(screen.getByLabelText(`Recibir el código por ${channel}`));
  });
}
async function typeCode(screen: Screen, code = CODE) {
  await act(async () => {
    fireEvent.changeText(screen.getByLabelText("Código de verificación"), code);
  });
}
const phoneCard = (screen: Screen) => within(screen.getByTestId("verify-phone"));
const requests = (path: string) => fetchMock.mock.calls.filter(([url]) => url === `https://api.test${path}`);
const sentChannels = () => requests("/api/v1/auth/phone-verification").map(([, init]) => JSON.parse(init.body).channel);
const sendButtonDisabled = (screen: Screen, label: string) =>
  Boolean(screen.getByRole("button", { name: label }).props.accessibilityState?.disabled);

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as typeof fetch;
  // An active organization exists, but account verification never sends it (#67: account-level).
  configureApiClient({ getToken: () => "session-token", getOrganizationId: () => "org-1" });
});
afterEach(() => {
  jest.useRealTimers();
  global.fetch = originalFetch;
  configureApiClient({ getToken: () => null, getOrganizationId: () => null });
});

describe("Choosing the channel", () => {
  it("WhatsApp: asks for that channel, says the send was requested (not delivered), and only GET /me makes it verified", async () => {
    const screen = await renderVerify();
    expect(screen.getByText("¿Cómo quieres recibir el código?")).toBeTruthy();
    expect(screen.getByLabelText("Recibir el código por SMS").props.accessibilityState.checked).toBe(true);

    await choose(screen, "WhatsApp");
    fetchMock.mockResolvedValueOnce(QUEUED("whatsapp"));
    await press(screen, "Enviar código por WhatsApp");

    expect(sentChannels()).toEqual(["whatsapp"]);
    const [, init] = requests("/api/v1/auth/phone-verification")[0];
    expect(init.headers["X-Organization-ID"]).toBeUndefined();
    expect(screen.getByText("Pedimos el envío de un código por WhatsApp al •••• 5678. Si no llega en unos minutos, pide otro.")).toBeTruthy();
    expect(screen.getByText("El código vence en 10 min.")).toBeTruthy();
    expect(screen.getByText("Podrás pedir otro código en 60 s")).toBeTruthy();
    expect(screen.getByText("La espera es la misma para SMS y WhatsApp.")).toBeTruthy();
    expect(phoneCard(screen).getByText("Pendiente")).toBeTruthy();

    await typeCode(screen, "482 915");
    fetchMock
      .mockResolvedValueOnce(json({ user: { ...ANA, phone_verified_at: VERIFIED_AT } }))
      .mockResolvedValueOnce(ME({ ...ANA, phone_verified_at: VERIFIED_AT }));
    await press(screen, "Verificar celular");

    expect(JSON.parse(requests("/api/v1/auth/verify-phone")[0][1].body)).toEqual({ code: CODE });
    expect(requests("/api/v1/me")).toHaveLength(1);
    expect(phoneCard(screen).getByText("Verificado")).toBeTruthy();
    expect(screen.getByText("Tu celular quedó verificado.")).toBeTruthy();
  });

  it("SMS stays the default and is sent as channel sms", async () => {
    const screen = await renderVerify();
    fetchMock.mockResolvedValueOnce(QUEUED("sms"));
    await press(screen, "Enviar código por SMS");

    expect(sentChannels()).toEqual(["sms"]);
    expect(screen.getByText("Pedimos el envío de un código por SMS al •••• 5678. Si no llega en unos minutos, pide otro.")).toBeTruthy();
  });

  it("an API without #79 answers without a channel: the screen says SMS, never WhatsApp", async () => {
    const screen = await renderVerify();
    await choose(screen, "WhatsApp");
    fetchMock.mockResolvedValueOnce(json({ retry_after: 60, expires_in: 600 }, 202));
    await press(screen, "Enviar código por WhatsApp");

    expect(screen.getByText("Pedimos el envío de un código por SMS al •••• 5678. Si no llega en unos minutos, pide otro.")).toBeTruthy();
    expect(screen.getByText("El servidor todavía solo envía códigos por SMS, así que lo pidió por SMS.")).toBeTruthy();
    expect(screen.queryByText(/por WhatsApp al/)).toBeNull();
  });
});

describe("Resending and switching channel", () => {
  it("one wait for both channels: switching during it sends nothing; after it, the new channel's code is the only valid one", async () => {
    jest.useFakeTimers();
    const screen = await renderVerify();
    fetchMock.mockResolvedValueOnce(QUEUED("sms"));
    await press(screen, "Enviar código por SMS");

    await choose(screen, "WhatsApp");
    expect(sendButtonDisabled(screen, "Pedir otro código por WhatsApp")).toBe(true);
    await press(screen, "Pedir otro código por WhatsApp");
    expect(sentChannels()).toEqual(["sms"]);

    // The countdown ticks once per second, re-arming after each render.
    for (let second = 0; second < 60; second += 1) {
      await act(async () => {
        jest.advanceTimersByTime(1000);
      });
    }
    expect(screen.queryByText(/Podrás pedir otro código/)).toBeNull();
    fetchMock.mockResolvedValueOnce(QUEUED("whatsapp"));
    await press(screen, "Pedir otro código por WhatsApp");

    expect(sentChannels()).toEqual(["sms", "whatsapp"]);
    expect(screen.getByText("Pedimos el envío de un código por WhatsApp al •••• 5678. Si no llega en unos minutos, pide otro.")).toBeTruthy();
    expect(screen.getByText("Usa el último código que pediste: los anteriores ya no sirven.")).toBeTruthy();
    expect(screen.getByText("Podrás pedir otro código en 60 s")).toBeTruthy();
  });

  it("429 from the shared limit: waits exactly the body's retry_after and says it applies to SMS and WhatsApp", async () => {
    const screen = await renderVerify();
    await choose(screen, "WhatsApp");
    fetchMock.mockResolvedValueOnce(json({ message: "Too Many Attempts.", retry_after: 42 }, 429, { "Retry-After": "42" }));
    await press(screen, "Enviar código por WhatsApp");

    expect(screen.getByText("Espera 42 segundos para pedir otro código, por SMS o por WhatsApp.")).toBeTruthy();
    expect(screen.getByText("Podrás pedir otro código en 42 s")).toBeTruthy();
    // A code sent a moment ago (e.g. at sign-up) may still be valid.
    expect(screen.getByLabelText("Código de verificación")).toBeTruthy();
  });

  it("429 with only the Retry-After header: that wait is used", async () => {
    const screen = await renderVerify();
    fetchMock.mockResolvedValueOnce(json({ message: "Too Many Attempts." }, 429, { "Retry-After": "37" }));
    await press(screen, "Enviar código por SMS");
    expect(screen.getByText("Podrás pedir otro código en 37 s")).toBeTruthy();
  });

  it("429 with no wait at all: no countdown is made up", async () => {
    const screen = await renderVerify();
    fetchMock.mockResolvedValueOnce(json({ message: "Too Many Attempts." }, 429));
    await press(screen, "Enviar código por SMS");
    expect(screen.getByText("Demasiados intentos. Espera un momento e inténtalo de nuevo.")).toBeTruthy();
    expect(screen.queryByText(/Podrás pedir otro código/)).toBeNull();
  });
});

describe("A channel that cannot send", () => {
  it("503 whatsapp_unavailable: no code step, no automatic SMS, suggests SMS; the API's later 429 wait is respected and no code step opens", async () => {
    const screen = await renderVerify();
    await choose(screen, "WhatsApp");
    fetchMock.mockResolvedValueOnce(json({ message: "WhatsApp is not available.", reason: "whatsapp_unavailable" }, 503));
    await press(screen, "Enviar código por WhatsApp");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Por ahora no podemos enviar códigos por WhatsApp. No se envió ningún código.")).toBeTruthy();
    expect(screen.getByText("Puedes pedir el código por SMS.")).toBeTruthy();
    expect(screen.queryByLabelText("Código de verificación")).toBeNull();
    expect(screen.queryByText(/Pedimos el envío/)).toBeNull();
    expect(screen.queryByText(/Podrás pedir otro código/)).toBeNull();

    // The route throttle counted the refused request: the API answers 429 with its own wait.
    await choose(screen, "SMS");
    fetchMock.mockResolvedValueOnce(json({ message: "Too Many Attempts.", retry_after: 55 }, 429, { "Retry-After": "55" }));
    await press(screen, "Enviar código por SMS");
    expect(sentChannels()).toEqual(["whatsapp", "sms"]);
    expect(screen.getByText("Podrás pedir otro código en 55 s")).toBeTruthy();
    expect(screen.queryByLabelText("Código de verificación")).toBeNull();
  });

  it("both channels refused: says neither works, and offers email only because the account has one", async () => {
    const screen = await renderVerify();
    fetchMock.mockResolvedValueOnce(json({ message: "SMS is not available.", reason: "sms_unavailable" }, 503));
    await press(screen, "Enviar código por SMS");
    expect(screen.getByText("Puedes pedir el código por WhatsApp.")).toBeTruthy();

    await choose(screen, "WhatsApp");
    fetchMock.mockResolvedValueOnce(json({ message: "WhatsApp is not available.", reason: "whatsapp_unavailable" }, 503));
    await press(screen, "Enviar código por WhatsApp");
    expect(screen.getByText("Por ahora no podemos enviar códigos por SMS ni por WhatsApp. Inténtalo más tarde.")).toBeTruthy();
    expect(screen.getByText("Mientras tanto puedes seguir entrando con tu correo.")).toBeTruthy();
  });

  it("an API without #79 answering sms_unavailable to a WhatsApp request: neither channel works, no loop of suggestions", async () => {
    const screen = await renderVerify();
    await choose(screen, "WhatsApp");
    fetchMock.mockResolvedValueOnce(json({ message: "SMS is not available.", reason: "sms_unavailable" }, 503));
    await press(screen, "Enviar código por WhatsApp");
    expect(screen.getByText("Por ahora no podemos enviar códigos por SMS ni por WhatsApp. Inténtalo más tarde.")).toBeTruthy();
    expect(screen.queryByText(/Puedes pedir el código por/)).toBeNull();
  });

  it("422 errors.channel: the channel was refused before any code existed", async () => {
    const screen = await renderVerify();
    await choose(screen, "WhatsApp");
    fetchMock.mockResolvedValueOnce(json({ message: "Invalid.", errors: { channel: ["The selected channel is invalid."] } }, 422));
    await press(screen, "Enviar código por WhatsApp");
    expect(screen.getByText("Ese medio no está disponible para enviar el código. Elige otro.")).toBeTruthy();
    expect(screen.getByText("Puedes pedir el código por SMS.")).toBeTruthy();
    expect(screen.queryByLabelText("Código de verificación")).toBeNull();
  });

  it("no connection while sending: says so, no code step and no wait", async () => {
    const screen = await renderVerify();
    fetchMock.mockRejectedValueOnce(new TypeError("Network request failed"));
    await press(screen, "Enviar código por SMS");
    expect(screen.getByText("No tienes conexión. Revisa tu conexión e inténtalo de nuevo.")).toBeTruthy();
    expect(screen.queryByLabelText("Código de verificación")).toBeNull();
    expect(screen.queryByText(/Podrás pedir otro código/)).toBeNull();
  });
});

describe("Confirming the code", () => {
  async function codeStep(channel: "SMS" | "WhatsApp" = "WhatsApp") {
    const screen = await renderVerify();
    if (channel === "WhatsApp") await choose(screen, "WhatsApp");
    fetchMock.mockResolvedValueOnce(QUEUED(channel === "SMS" ? "sms" : "whatsapp"));
    await press(screen, `Enviar código por ${channel}`);
    await typeCode(screen);
    return screen;
  }
  const otpError = (reason: string) => json({ message: "Invalid.", errors: { code: ["Invalid."] }, reason }, 422);

  it("wrong code: says so, keeps the code step, never verified", async () => {
    const screen = await codeStep();
    fetchMock.mockResolvedValueOnce(otpError("otp_invalid"));
    await press(screen, "Verificar celular");
    expect(screen.getByText("El código no es correcto. Revísalo e inténtalo de nuevo.")).toBeTruthy();
    expect(screen.getByLabelText("Código de verificación")).toBeTruthy();
    expect(phoneCard(screen).getByText("Pendiente")).toBeTruthy();
    expect(requests("/api/v1/me")).toHaveLength(0);
  });

  it.each([
    ["otp_expired", "El código venció. Pide uno nuevo."],
    ["otp_attempts_exceeded", "Hiciste demasiados intentos. Pide un código nuevo."],
  ])("%s: says why, leaves the dead code, and lets the person ask on either channel once the wait allows", async (reason, message) => {
    const screen = await codeStep();
    fetchMock.mockResolvedValueOnce(otpError(reason));
    await press(screen, "Verificar celular");
    expect(screen.getByText(message)).toBeTruthy();
    expect(screen.queryByLabelText("Código de verificación")).toBeNull();
    expect(screen.queryByText(/Pedimos el envío/)).toBeNull();
    expect(screen.getByLabelText("Recibir el código por SMS")).toBeTruthy();
    expect(phoneCard(screen).getByText("Pendiente")).toBeTruthy();
  });

  it("503 while checking (no channel can check codes): the code stays typed", async () => {
    const screen = await codeStep();
    fetchMock.mockResolvedValueOnce(json({ message: "Unavailable.", reason: "sms_unavailable" }, 503));
    await press(screen, "Verificar celular");
    expect(screen.getByText("Por ahora no podemos comprobar códigos. Tu código sigue escrito: inténtalo más tarde.")).toBeTruthy();
    expect(screen.getByLabelText("Código de verificación").props.value).toBe(CODE);
  });

  it("no connection while checking: says so, keeps the code, never verified", async () => {
    const screen = await codeStep("SMS");
    fetchMock.mockRejectedValueOnce(new TypeError("Network request failed"));
    await press(screen, "Verificar celular");
    expect(screen.getByText("No tienes conexión. Revisa tu conexión e inténtalo de nuevo.")).toBeTruthy();
    expect(screen.getByLabelText("Código de verificación").props.value).toBe(CODE);
    expect(phoneCard(screen).getByText("Pendiente")).toBeTruthy();
  });

  it("code accepted but GET /me still unverified: not shown as verified until «Comprobar estado» reads it from the server", async () => {
    const screen = await codeStep();
    fetchMock.mockResolvedValueOnce(json({ user: { ...ANA, phone_verified_at: VERIFIED_AT } })).mockResolvedValueOnce(ME(ANA));
    await press(screen, "Verificar celular");
    expect(phoneCard(screen).getByText("Pendiente")).toBeTruthy();
    expect(screen.queryByText("Tu celular quedó verificado.")).toBeNull();
    expect(screen.getByText(/todavía no vemos tu celular verificado/)).toBeTruthy();

    fetchMock.mockResolvedValueOnce(ME({ ...ANA, phone_verified_at: VERIFIED_AT }));
    await press(screen, "Comprobar estado");
    expect(phoneCard(screen).getByText("Verificado")).toBeTruthy();
    expect(screen.getByText("Tu celular quedó verificado.")).toBeTruthy();
  });

  it("code accepted but GET /me fails offline: still pending, explains, and can re-check", async () => {
    const screen = await codeStep();
    fetchMock.mockResolvedValueOnce(json({ user: { ...ANA, phone_verified_at: VERIFIED_AT } })).mockRejectedValueOnce(new TypeError("Network request failed"));
    await press(screen, "Verificar celular");
    expect(phoneCard(screen).getByText("Pendiente")).toBeTruthy();
    expect(screen.getByText("No tienes conexión. Revisa tu conexión e inténtalo de nuevo.")).toBeTruthy();
    expect(screen.getByText("Comprobar estado")).toBeTruthy();
  });
});

describe("Account change and late responses", () => {
  it("a send answered after switching account never shows up on the new account (no message, no wait)", async () => {
    const screen = await renderVerify(ANA);
    await choose(screen, "WhatsApp");
    const late = deferred();
    fetchMock.mockReturnValueOnce(late.promise);
    await press(screen, "Enviar código por WhatsApp");

    await act(async () => {
      switchUser(BETO);
    });
    await act(async () => {
      late.resolve(QUEUED("whatsapp"));
    });

    expect(screen.getByText("+52 55 8765 4321")).toBeTruthy();
    expect(screen.queryByText(/Pedimos el envío/)).toBeNull();
    expect(screen.queryByText(/Podrás pedir otro código/)).toBeNull();
    expect(screen.queryByLabelText("Código de verificación")).toBeNull();
    // The new account starts on SMS, with sending available.
    expect(screen.getByLabelText("Recibir el código por SMS").props.accessibilityState.checked).toBe(true);
    expect(sendButtonDisabled(screen, "Enviar código por SMS")).toBe(false);
  });

  it("a code check answered after switching account does not re-read or verify the new account", async () => {
    const screen = await renderVerify(ANA);
    fetchMock.mockResolvedValueOnce(QUEUED("sms"));
    await press(screen, "Enviar código por SMS");
    await typeCode(screen);
    const late = deferred();
    fetchMock.mockReturnValueOnce(late.promise);
    await press(screen, "Verificar celular");

    await act(async () => {
      switchUser(BETO);
    });
    await act(async () => {
      late.resolve(json({ user: { ...ANA, phone_verified_at: VERIFIED_AT } }));
    });

    expect(requests("/api/v1/me")).toHaveLength(0);
    expect(phoneCard(screen).getByText("Pendiente")).toBeTruthy();
    expect(screen.queryByText("Tu celular quedó verificado.")).toBeNull();
  });

  it("GET /me answered after switching account is not applied to the new one", async () => {
    const screen = await renderVerify(ANA);
    fetchMock.mockResolvedValueOnce(QUEUED("sms"));
    await press(screen, "Enviar código por SMS");
    await typeCode(screen);
    const lateMe = deferred();
    fetchMock.mockResolvedValueOnce(json({ user: { ...ANA, phone_verified_at: VERIFIED_AT } })).mockReturnValueOnce(lateMe.promise);
    await press(screen, "Verificar celular");

    await act(async () => {
      switchUser(BETO);
    });
    await act(async () => {
      lateMe.resolve(ME({ ...ANA, phone_verified_at: VERIFIED_AT }));
    });

    expect(screen.getByText("+52 55 8765 4321")).toBeTruthy();
    expect(phoneCard(screen).getByText("Pendiente")).toBeTruthy();
    expect(screen.queryByText("Tu celular quedó verificado.")).toBeNull();
  });

  it("signing out while a send is in flight: nothing is rendered or updated afterwards", async () => {
    const screen = await renderVerify(ANA);
    const late = deferred();
    fetchMock.mockReturnValueOnce(late.promise);
    await press(screen, "Enviar código por SMS");
    await act(async () => {
      switchUser(null);
    });
    await act(async () => {
      late.resolve(QUEUED("sms"));
    });
    expect(screen.queryByTestId("verify-phone")).toBeNull();
  });
});

describe("Privacy", () => {
  it("never logs the code or the full phone number", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((method) => jest.spyOn(console, method).mockImplementation(() => undefined));
    const screen = await renderVerify();
    await choose(screen, "WhatsApp");
    fetchMock.mockResolvedValueOnce(QUEUED("whatsapp"));
    await press(screen, "Enviar código por WhatsApp");
    await typeCode(screen);
    fetchMock.mockResolvedValueOnce(json({ message: "Invalid.", errors: { code: ["Invalid."] }, reason: "otp_invalid" }, 422));
    await press(screen, "Verificar celular");

    const logged = spies.flatMap((spy) => spy.mock.calls.map((args) => args.map(String).join(" "))).join("\n");
    expect(logged).not.toContain(CODE);
    expect(logged).not.toContain("5512345678");
    // The screen only ever shows the masked number next to the request.
    expect(screen.queryByText(/5512345678/)).toBeNull();
    spies.forEach((spy) => spy.mockRestore());
  });
});
