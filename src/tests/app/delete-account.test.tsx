import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render } from "@testing-library/react-native";
import { configureApiClient } from "../../api/client";
import DeleteAccountScreen from "../../app/delete-account";

/**
 * «Eliminar mi cuenta» against simulated HTTP (the real client; only fetch is
 * replaced). Google Play requires an in-app deletion path, and the privacy
 * notice promises the privacy channel even when the in-app option is off.
 */
jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }) }));
jest.mock("../../config/env", () => ({ config: { apiBaseUrl: "https://api.test", apiTimeoutMs: 5000 } }));

const originalFetch = global.fetch;
const DELETION = "https://api.test/api/v1/account/deletion-request";
const NOTICE = "https://api.test/api/v1/privacy/notice";
const CONTACT = "servicioalcliente@afilianet.mx";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

let noticeResponse: () => Response;
let postResponse: () => Response;
const calls: { url: string; method: string; body?: unknown }[] = [];

beforeEach(() => {
  calls.length = 0;
  noticeResponse = () => json({ data: { contact_email: CONTACT } });
  postResponse = () => json({ data: { id: "folio-1", status: "received", requested_at: "2026-11-10T12:00:00Z", completed_at: null } }, 202);
  global.fetch = (async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (url === NOTICE) return noticeResponse();
    if (url === DELETION && method === "GET") return json({ data: null });
    if (url === DELETION && method === "POST") return postResponse();
    return json({ message: "Not Found." }, 404);
  }) as typeof fetch;
  configureApiClient({ getToken: () => "session-token", getOrganizationId: () => "org-1" });
});
afterEach(() => {
  global.fetch = originalFetch;
  configureApiClient({ getToken: () => null, getOrganizationId: () => null });
});

type Screen = Awaited<ReturnType<typeof render>>;

async function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let screen!: Screen;
  await act(async () => {
    screen = await render(
      <QueryClientProvider client={client}>
        <DeleteAccountScreen />
      </QueryClientProvider>,
    );
  });
  return screen;
}

async function request(screen: Screen) {
  await act(async () => {
    fireEvent.changeText(screen.getByLabelText("Contraseña actual"), "secreta-123");
    fireEvent.changeText(screen.getByLabelText("Escribe ELIMINAR"), "ELIMINAR");
  });
  await act(async () => {
    fireEvent.press(screen.getByText("Solicitar eliminación"));
  });
}

describe("Delete account", () => {
  it("sends the request with the password and ELIMINAR and shows the folio, saying the account is not deleted yet", async () => {
    const screen = await renderScreen();
    await request(screen);

    const post = calls.find((call) => call.url === DELETION && call.method === "POST");
    expect(post?.body).toEqual({ password: "secreta-123", confirmation: "ELIMINAR" });
    expect(screen.getByText("Folio: folio-1")).toBeTruthy();
    expect(screen.getByText(/Tu cuenta todavía no se ha eliminado/)).toBeTruthy();
  });

  it("shows the API's response deadline (API #155) as the time to answer, never as a deletion date", async () => {
    postResponse = () =>
      json({ data: { id: "folio-2", status: "received", requested_at: "2026-11-10T12:00:00Z", completed_at: null, response_deadline: { days: 20, kind: "hábiles" } } }, 202);
    const screen = await renderScreen();
    await request(screen);

    expect(screen.getByTestId("deletion-response-deadline").props.children).toBe(
      "Te responderemos en un plazo de hasta 20 días hábiles. Responder no significa que tu cuenta ya se haya eliminado.",
    );
    // Nothing about an acknowledgement email: the API does not say whether it was sent.
    expect(screen.queryByText(/te enviamos|recibirás un correo|acuse/i)).toBeNull();
  });

  it("says nothing about a deadline when the API gives none or an invalid one", async () => {
    postResponse = () =>
      json({ data: { id: "folio-3", status: "received", requested_at: "2026-11-10T12:00:00Z", completed_at: null, response_deadline: { days: "20", kind: "" } } }, 202);
    const screen = await renderScreen();
    await request(screen);

    expect(screen.getByText("Folio: folio-3")).toBeTruthy();
    expect(screen.queryByTestId("deletion-response-deadline")).toBeNull();
  });

  it("always offers the notice's privacy channel as an alternative", async () => {
    const screen = await renderScreen();

    expect((await screen.findByTestId("deletion-privacy-channel")).props.children.join("")).toContain(`También puedes pedir la eliminación escribiendo a ${CONTACT}`);
  });

  it("503 (requests off on the server): says nothing was registered and points to the privacy channel, never a generic server error", async () => {
    postResponse = () => json({ message: "La solicitud de eliminación no está disponible por el momento." }, 503);
    const screen = await renderScreen();
    await request(screen);

    expect(screen.getByText("Por ahora no podemos recibir la solicitud desde la app. No se registró ninguna solicitud.")).toBeTruthy();
    expect(screen.getByTestId("deletion-privacy-channel").props.children.join("")).toContain(`Puedes pedir la eliminación escribiendo a ${CONTACT}`);
    expect(screen.queryByText(/Folio:/)).toBeNull();
  });

  it("503 and the notice cannot be read: still points to the privacy contact in the notice, without inventing an address", async () => {
    noticeResponse = () => json({ message: "Unavailable" }, 503);
    postResponse = () => json({ message: "Unavailable" }, 503);
    const screen = await renderScreen();
    await request(screen);

    expect(screen.getByTestId("deletion-privacy-channel").props.children).toBe("Puedes pedir la eliminación al contacto de privacidad que aparece en el Aviso de privacidad.");
    expect(screen.queryByText(/@/)).toBeNull();
  });

  it("422: wrong password, nothing else changes", async () => {
    postResponse = () => json({ message: "The given data was invalid." }, 422);
    const screen = await renderScreen();
    await request(screen);

    expect(screen.getByText("No pudimos verificar tu contraseña. Revisa tus datos.")).toBeTruthy();
    expect(screen.getByTestId("deletion-privacy-channel").props.children.join("")).toContain("También puedes");
  });
});
