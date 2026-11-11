import * as Clipboard from "expo-clipboard";
import { act, fireEvent, render } from "@testing-library/react-native";
import { Linking } from "react-native";
import { AuthContext, type AuthContextValue } from "../../auth/AuthContext";
import LoginScreen from "../../app/(auth)/login";
import PrivacyScreen from "../../app/privacy";
import { PublicPrivacyLinks } from "../../components/privacy/PublicPrivacyLinks";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { configureApiClient } from "../../api/client";

/**
 * Public privacy destinations (Google Play): fixed afilianet.mx pages and the
 * privacy email, reachable without a session and without the API.
 */
jest.mock("expo-clipboard", () => ({ setStringAsync: jest.fn().mockResolvedValue(true) }));
jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn(), canGoBack: () => true, replace: jest.fn() }) }));
jest.mock("../../auth/pendingReferral", () => ({ usePendingReferral: () => null }));
jest.mock("../../config/env", () => ({ config: { apiBaseUrl: "https://api.test", apiTimeoutMs: 5000 } }));

const DELETION = "https://afilianet.mx/eliminar-cuenta";
const PRIVACY = "https://afilianet.mx/privacidad";
const MAILTO = "mailto:servicioalcliente@afilianet.mx?subject=Privacidad%20Afilianet";
const originalFetch = global.fetch;
const mockedCopy = Clipboard.setStringAsync as jest.Mock;
let open: jest.SpyInstance;

beforeEach(() => {
  mockedCopy.mockClear();
  open = jest.spyOn(Linking, "openURL").mockResolvedValue(true as never);
});
afterEach(() => {
  open.mockRestore();
  global.fetch = originalFetch;
});

async function press(screen: Awaited<ReturnType<typeof render>>, label: string) {
  await act(async () => {
    fireEvent.press(screen.getByText(label));
  });
}

describe("PublicPrivacyLinks", () => {
  it("opens only the fixed destinations, with no token or account data in them", async () => {
    const screen = await render(<PublicPrivacyLinks mail privacy deletion />);
    await press(screen, "Escribir a privacidad");
    await press(screen, "Cómo eliminar tu cuenta");
    await press(screen, "Aviso de privacidad");

    expect(open.mock.calls.map(([url]) => url)).toEqual([MAILTO, DELETION, PRIVACY]);
    expect(screen.queryByTestId("public-privacy-open-failed")).toBeNull();
  });

  it("buttons are labelled and say where they lead", async () => {
    const screen = await render(<PublicPrivacyLinks mail privacy deletion />);

    expect(screen.getByRole("button", { name: "Escribir a privacidad" }).props.accessibilityHint).toMatch(/aplicación de correo.*No envía nada/);
    expect(screen.getByRole("button", { name: "Cómo eliminar tu cuenta" }).props.accessibilityHint).toMatch(/afilianet\.mx/);
    expect(screen.getByRole("button", { name: "Aviso de privacidad" }).props.accessibilityHint).toMatch(/afilianet\.mx/);
  });

  it("no mail app: says nothing was sent, offers to copy the address and the public page", async () => {
    open.mockRejectedValue(new Error("No activity found"));
    const screen = await render(<PublicPrivacyLinks mail deletion />);
    await press(screen, "Escribir a privacidad");

    const message = screen.getByTestId("public-privacy-open-failed");
    expect(message.props.accessibilityRole).toBe("alert");
    expect(message.props.children).toContain("No se envió ninguna solicitud");
    expect(message.props.children).toContain("servicioalcliente@afilianet.mx");
    expect(message.props.children).toContain(DELETION);

    await press(screen, "Copiar correo");
    expect(mockedCopy).toHaveBeenCalledWith("servicioalcliente@afilianet.mx");
    expect(screen.getByText("Correo copiado.")).toBeTruthy();
  });

  it("copy failing too: no false «copied», the address stays visible and selectable", async () => {
    open.mockRejectedValue(new Error("No activity found"));
    mockedCopy.mockRejectedValueOnce(new Error("clipboard"));
    const screen = await render(<PublicPrivacyLinks mail deletion />);
    await press(screen, "Escribir a privacidad");
    await press(screen, "Copiar correo");

    expect(screen.queryByText("Correo copiado.")).toBeNull();
    expect(screen.getByTestId("privacy-contact-email").props.selectable).toBe(true);
  });

  it("no browser: shows the addresses to type, without a copy-email offer", async () => {
    open.mockRejectedValue(new Error("No activity found"));
    const screen = await render(<PublicPrivacyLinks privacy deletion />);
    await press(screen, "Cómo eliminar tu cuenta");

    const message = screen.getByTestId("public-privacy-open-failed");
    expect(message.props.children).toContain(DELETION);
    expect(message.props.children).toContain(PRIVACY);
    expect(screen.queryByText("Copiar correo")).toBeNull();
  });

  it("a later success clears the failure message", async () => {
    open.mockRejectedValueOnce(new Error("No activity found"));
    const screen = await render(<PublicPrivacyLinks deletion />);
    await press(screen, "Cómo eliminar tu cuenta");
    expect(screen.getByTestId("public-privacy-open-failed")).toBeTruthy();
    await press(screen, "Cómo eliminar tu cuenta");
    expect(screen.queryByTestId("public-privacy-open-failed")).toBeNull();
  });
});

describe("Without a session", () => {
  it("Login offers the public notice and the deletion procedure, opened in the browser", async () => {
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;
    const value = {
      status: "signedOut", user: null, error: null, signIn: jest.fn(), registerFromReferral: jest.fn(), register: jest.fn(),
      refreshUser: jest.fn(), onboardingRoute: null, consumeOnboardingRoute: jest.fn(), signOut: jest.fn(),
    } as AuthContextValue;
    const screen = await render(
      <AuthContext.Provider value={value}>
        <LoginScreen />
      </AuthContext.Provider>,
    );
    await press(screen, "Aviso de privacidad");
    await press(screen, "Cómo eliminar tu cuenta");

    expect(open.mock.calls.map(([url]) => url)).toEqual([PRIVACY, DELETION]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("Aviso de privacidad in the app", () => {
  it("keeps the public version and the deletion procedure when the API fails", async () => {
    global.fetch = (async () => new Response(JSON.stringify({ message: "Unavailable" }), { status: 503, headers: { "Content-Type": "application/json" } })) as typeof fetch;
    configureApiClient({ getToken: () => null, getOrganizationId: () => null });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const screen = await render(
      <QueryClientProvider client={client}>
        <PrivacyScreen />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("El aviso no está disponible por el momento.")).toBeTruthy();
    await press(screen, "Ver la versión pública del aviso");
    await press(screen, "Cómo eliminar tu cuenta");
    expect(open.mock.calls.map(([url]) => url)).toEqual([PRIVACY, DELETION]);
  });
});
