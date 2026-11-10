import { act, fireEvent, render, within } from "@testing-library/react-native";
import { configureApiClient } from "../../api/client";
import { AuthContext, type AuthContextValue } from "../../auth/AuthContext";
import VerifyAccountScreen from "../../app/verify-account";
import type { User } from "../../types/api";

/**
 * Which channels the phone card offers (API phone-otp-whatsapp-v2, proposed
 * GET /auth/phone-verification/channels), against simulated HTTP: the real
 * client and access functions, only global fetch is replaced.
 *
 * WhatsApp needs BOTH the build switch and the server saying it is available.
 * Anything else -- switch off, endpoint missing, a failed read -- is SMS only.
 */
jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn(), replace: jest.fn(), push: jest.fn() }) }));
jest.mock("../../auth/pendingReferral", () => ({ usePendingReferral: () => null, pendingReferralPath: () => "/" }));
jest.mock("../../config/env", () => ({ config: { apiBaseUrl: "https://api.test", apiTimeoutMs: 5000 } }));
let mockWhatsappAllowed = true;
jest.mock("../../config/phoneChannels", () => ({
  get whatsappCodeChannelEnabled() {
    return mockWhatsappAllowed;
  },
}));

const originalFetch = global.fetch;
const fetchMock = jest.fn();
const CHANNELS_URL = "https://api.test/api/v1/auth/phone-verification/channels";
const SEND_URL = "https://api.test/api/v1/auth/phone-verification";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
const offer = (sms: boolean, whatsapp: boolean, extra: Record<string, unknown> = {}) => ({
  channels: [
    { channel: "sms", available: sms },
    { channel: "whatsapp", available: whatsapp },
  ],
  retry_after: 60,
  expires_in: 600,
  ...extra,
});
const QUEUED = (channel: "sms" | "whatsapp") => json({ retry_after: 60, expires_in: 600, delivery: "queued", channel }, 202);

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

function auth(user: User): AuthContextValue {
  return {
    status: "signedIn",
    user,
    error: null,
    signIn: jest.fn(),
    register: jest.fn(),
    registerFromReferral: jest.fn(),
    refreshUser: jest.fn().mockResolvedValue(user),
    onboardingRoute: null,
    consumeOnboardingRoute: jest.fn(),
    signOut: jest.fn(),
  };
}

type Screen = Awaited<ReturnType<typeof render>>;

async function renderVerify(user: User = ANA) {
  let screen!: Screen;
  await act(async () => {
    screen = await render(
      <AuthContext.Provider value={auth(user)}>
        <VerifyAccountScreen />
      </AuthContext.Provider>,
    );
  });
  return screen;
}
const phoneCard = (screen: Screen) => within(screen.getByTestId("verify-phone"));
const calls = (url: string) => fetchMock.mock.calls.filter(([called]) => called === url);
const sentChannels = () => calls(SEND_URL).map(([, init]) => JSON.parse(init.body).channel);

beforeEach(() => {
  mockWhatsappAllowed = true;
  fetchMock.mockReset();
  global.fetch = fetchMock as typeof fetch;
  configureApiClient({ getToken: () => "session-token", getOrganizationId: () => "org-1" });
});
afterEach(() => {
  jest.useRealTimers();
  global.fetch = originalFetch;
  configureApiClient({ getToken: () => null, getOrganizationId: () => null });
});

describe("Build switch off (every build today)", () => {
  it("never asks the server and offers SMS only, without a selector or the word WhatsApp", async () => {
    mockWhatsappAllowed = false;
    const screen = await renderVerify();

    expect(calls(CHANNELS_URL)).toHaveLength(0);
    expect(phoneCard(screen).getByText("Enviar código por SMS")).toBeTruthy();
    expect(phoneCard(screen).queryByText("¿Cómo quieres recibir el código?")).toBeNull();
    expect(phoneCard(screen).queryByText(/WhatsApp/)).toBeNull();
  });

  it("does not offer WhatsApp even if a server would", async () => {
    mockWhatsappAllowed = false;
    fetchMock.mockResolvedValue(json(offer(true, true)));
    const screen = await renderVerify();

    expect(phoneCard(screen).queryByText(/WhatsApp/)).toBeNull();
  });
});

describe("Build switch on: the server decides", () => {
  it("asks GET /channels once, authenticated and without the organization, and offers both when both are available", async () => {
    fetchMock.mockResolvedValueOnce(json(offer(true, true)));
    const screen = await renderVerify();

    const asked = calls(CHANNELS_URL);
    expect(asked).toHaveLength(1);
    expect(asked[0][1].method).toBe("GET");
    expect(asked[0][1].headers.Authorization).toBe("Bearer session-token");
    expect(asked[0][1].headers["X-Organization-Id"]).toBeUndefined();
    expect(phoneCard(screen).getByText("¿Cómo quieres recibir el código?")).toBeTruthy();
    expect(screen.getByLabelText("Recibir el código por WhatsApp")).toBeTruthy();
  });

  it("accepts the offer wrapped in {data}", async () => {
    fetchMock.mockResolvedValueOnce(json({ data: offer(true, true) }));
    const screen = await renderVerify();

    expect(screen.getByLabelText("Recibir el código por WhatsApp")).toBeTruthy();
  });

  it("WhatsApp unavailable: SMS only, no selector, and nothing about WhatsApp", async () => {
    fetchMock.mockResolvedValueOnce(json(offer(true, false)));
    const screen = await renderVerify();

    expect(phoneCard(screen).getByText("Enviar código por SMS")).toBeTruthy();
    expect(phoneCard(screen).queryByText("¿Cómo quieres recibir el código?")).toBeNull();
    expect(phoneCard(screen).queryByText(/WhatsApp/)).toBeNull();
  });

  it("SMS unavailable: starts on WhatsApp and sends there", async () => {
    fetchMock.mockResolvedValueOnce(json(offer(false, true)));
    const screen = await renderVerify();

    expect(phoneCard(screen).queryByText("¿Cómo quieres recibir el código?")).toBeNull();
    fetchMock.mockResolvedValueOnce(QUEUED("whatsapp"));
    await act(async () => {
      fireEvent.press(phoneCard(screen).getByText("Enviar código por WhatsApp"));
    });
    expect(sentChannels()).toEqual(["whatsapp"]);
  });

  it("nothing available: says so and offers no send button", async () => {
    fetchMock.mockResolvedValueOnce(json(offer(false, false)));
    const screen = await renderVerify();

    expect(phoneCard(screen).getByText("Por ahora no podemos enviar códigos por SMS ni por WhatsApp. Inténtalo más tarde.")).toBeTruthy();
    expect(phoneCard(screen).queryByText(/^Enviar código/)).toBeNull();
    expect(calls(SEND_URL)).toHaveLength(0);
  });

  it("ignores channels it does not know", async () => {
    fetchMock.mockResolvedValueOnce(json({ channels: [{ channel: "sms", available: true }, { channel: "telegram", available: true }] }));
    const screen = await renderVerify();

    expect(phoneCard(screen).getByText("Enviar código por SMS")).toBeTruthy();
    expect(phoneCard(screen).queryByText("¿Cómo quieres recibir el código?")).toBeNull();
  });

  it("shows that it is checking, and offers nothing to press until the server answers", async () => {
    let answer!: (response: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>((done) => (answer = done)));
    const screen = await renderVerify();

    expect(phoneCard(screen).getByText("Revisando cómo podemos enviarte el código…")).toBeTruthy();
    expect(phoneCard(screen).queryByText(/^Enviar código/)).toBeNull();

    await act(async () => {
      answer(json(offer(true, true)));
    });
    expect(phoneCard(screen).queryByText("Revisando cómo podemos enviarte el código…")).toBeNull();
    expect(phoneCard(screen).getByText("Enviar código por SMS")).toBeTruthy();
  });

  it("an API without the endpoint (404) means SMS only: a build switch alone never shows WhatsApp", async () => {
    fetchMock.mockResolvedValueOnce(json({ message: "Not Found." }, 404));
    const screen = await renderVerify();

    expect(phoneCard(screen).getByText("Enviar código por SMS")).toBeTruthy();
    expect(phoneCard(screen).queryByText(/WhatsApp/)).toBeNull();
  });

  it("a failed read (500) also means SMS only, and the send still works", async () => {
    fetchMock.mockResolvedValueOnce(json({ message: "Server Error" }, 500));
    const screen = await renderVerify();

    expect(phoneCard(screen).queryByText(/WhatsApp/)).toBeNull();
    fetchMock.mockResolvedValueOnce(QUEUED("sms"));
    await act(async () => {
      fireEvent.press(phoneCard(screen).getByText("Enviar código por SMS"));
    });
    expect(sentChannels()).toEqual(["sms"]);
  });

  it("starts the API's remaining wait for this account, so reopening the screen does not end in a 429", async () => {
    fetchMock.mockResolvedValueOnce(json(offer(true, true, { resend_available_in: 42 })));
    const screen = await renderVerify();

    expect(phoneCard(screen).getByText(/42/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Enviar código por SMS" }).props.accessibilityState?.disabled).toBe(true);
  });

  it("available on GET but 503 on send: says WhatsApp cannot send, lets them pick SMS, and never resends on its own", async () => {
    fetchMock.mockResolvedValueOnce(json(offer(true, true)));
    const screen = await renderVerify();

    await act(async () => {
      fireEvent.press(screen.getByLabelText("Recibir el código por WhatsApp"));
    });
    fetchMock.mockResolvedValueOnce(json({ reason: "whatsapp_unavailable", message: "WhatsApp unavailable" }, 503));
    await act(async () => {
      fireEvent.press(phoneCard(screen).getByText("Enviar código por WhatsApp"));
    });

    expect(phoneCard(screen).getByText("Por ahora no podemos enviar códigos por WhatsApp. No se envió ningún código.")).toBeTruthy();
    expect(phoneCard(screen).getByText("Puedes pedir el código por SMS.")).toBeTruthy();
    expect(sentChannels()).toEqual(["whatsapp"]);
    expect(screen.getByLabelText("Recibir el código por SMS")).toBeTruthy();
  });

  it("a verified phone never asks for channels", async () => {
    const screen = await renderVerify({ ...ANA, phone_verified_at: "2026-11-10T12:00:00Z" });

    expect(calls(CHANNELS_URL)).toHaveLength(0);
    expect(phoneCard(screen).queryByText(/^Enviar código/)).toBeNull();
  });
});
