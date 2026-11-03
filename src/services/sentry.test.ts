/* eslint-disable @typescript-eslint/no-require-imports -- jest.resetModules() + require() re-evaluates config/env per case. */
type SentrySdk = typeof import("@sentry/react-native");

/**
 * Local harness: the real @sentry/react-native SDK runs with sentryOptions()
 * and an in-memory transport, so envelopes are inspected here and nothing is
 * sent anywhere (the DSN host is .invalid and global fetch fails the test if
 * it is ever pointed at it). All secrets are fictitious.
 */
const INVITATION_TOKEN = "invFICTICIO9f8e7d6c5b4a3210";
const STAFF_TOKEN = "staffFICTICIO0123456789abcdef";
const REFERRAL_CODE = "REFFICTICIO1";
const ORGANIZATION_ID = "0000f1c7-feed-4bad-8000-00000000c0de";
const EMAIL = "ana.ficticia@example.test";
const PHONE = "+52 55 0000 1234";
const SEARCH = "Farmacia FICTICIA";
const SECRETS = [INVITATION_TOKEN, STAFF_TOKEN, REFERRAL_CODE, ORGANIZATION_ID, EMAIL, PHONE, SEARCH, encodeURIComponent(SEARCH)];
const API = "https://staging-api.afilianet.mx";
const FAKE_DSN = "https://ficticio@sentry.invalid/1";

function mockConfig(values: { sentryEnabled: boolean; sentryDsn: string }) {
  jest.doMock("../config/env", () => ({ config: { appEnv: "staging", ...values } }));
}

describe("switch: Sentry starts only with EXPO_PUBLIC_SENTRY_ENABLED=1 and a DSN", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.dontMock("../config/env");
    jest.dontMock("@sentry/react-native");
  });

  it.each([
    [{ sentryEnabled: false, sentryDsn: FAKE_DSN }, false],
    [{ sentryEnabled: true, sentryDsn: "" }, false],
    [{ sentryEnabled: false, sentryDsn: "" }, false],
    [{ sentryEnabled: true, sentryDsn: FAKE_DSN }, true],
  ])("%j → init %s", (values, expected) => {
    mockConfig(values);
    const init = jest.fn();
    const captureException = jest.fn();
    const on = jest.fn();
    jest.doMock("@sentry/react-native", () => ({ init, captureException, getClient: () => ({ on }) }));
    const sentry = require("./sentry");
    sentry.initSentry();
    sentry.captureException(new Error("x"));
    expect(sentry.sentryEnabled).toBe(expected);
    // Without init the native SDK never starts either (io.sentry.auto-init=false).
    expect(init).toHaveBeenCalledTimes(expected ? 1 : 0);
    expect(captureException).toHaveBeenCalledTimes(expected ? 1 : 0);
    expect(on.mock.calls.map(([hook]) => hook)).toEqual(expected ? ["createDsc"] : []);
  });

  it("reads the switch as exactly \"1\"", () => {
    const original = process.env.EXPO_PUBLIC_SENTRY_ENABLED;
    for (const [value, expected] of [["1", true], ["0", false], ["true", false], [undefined, false]] as const) {
      jest.resetModules();
      if (value === undefined) delete process.env.EXPO_PUBLIC_SENTRY_ENABLED;
      else process.env.EXPO_PUBLIC_SENTRY_ENABLED = value;
      expect(require("../config/env").config.sentryEnabled).toBe(expected);
    }
    if (original === undefined) delete process.env.EXPO_PUBLIC_SENTRY_ENABLED;
    else process.env.EXPO_PUBLIC_SENTRY_ENABLED = original;
  });
});

describe("if Sentry is ever switched on: what the real SDK would send", () => {
  const envelopes: unknown[] = [];
  // Required after resetModules so the test drives the same SDK instance that initSentry() set up.
  let Sentry: SentrySdk;
  const originalFetch = global.fetch;
  const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
    if (String(input).includes("sentry.invalid")) throw new Error("the harness must never reach Sentry");
    return new Response("{}", { status: 422, headers: { "Content-Type": "application/json" } });
  });

  beforeAll(() => {
    global.fetch = fetchMock as typeof fetch;
    // Silenced before init, so the SDK still wraps console.log and records it.
    jest.spyOn(console, "log").mockImplementation(() => undefined);
    jest.resetModules();
    mockConfig({ sentryEnabled: true, sentryDsn: FAKE_DSN });
    jest.dontMock("@sentry/react-native");
    // The SDK starts a module-level cleanup interval (AsyncExpiringMap) that would keep Jest alive.
    const realSetInterval = global.setInterval;
    jest.spyOn(global, "setInterval").mockImplementation(((...args: Parameters<typeof setInterval>) => {
      const handle = realSetInterval(...args);
      (handle as { unref?: () => void }).unref?.();
      return handle;
    }) as typeof setInterval);
    Sentry = require("@sentry/react-native");
    const { initSentry } = require("./sentry");
    initSentry({
      // Harness only: no native layer in Jest, every transaction kept so the
      // transaction path is exercised (the app samples 10%).
      enableNative: false,
      tracesSampleRate: 1,
      transport: () => ({
        send: async (envelope: unknown) => {
          envelopes.push(envelope);
          return {};
        },
        flush: async () => true,
      }),
    });
  });

  afterAll(async () => {
    await Sentry.close();
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("an error after requests to token routes carries no token, code, search, contact or user", async () => {
    Sentry.setUser({ id: "user-1", email: EMAIL, ip_address: "{{auto}}" });
    console.log(`debug ${EMAIL} ${PHONE}`);
    // RN's fetch is a whatwg-fetch polyfill over XHR, so the SDK records
    // network breadcrumbs as "xhr" with this shape (Breadcrumbs integration).
    const xhr = (method: string, url: string, extra: Record<string, unknown> = {}) =>
      Sentry.addBreadcrumb({ category: "xhr", type: "http", data: { method, url, status_code: 422, ...extra } });
    xhr("POST", `${API}/api/v1/invitations/${INVITATION_TOKEN}/accept`, { request_body_size: 40, headers: { Authorization: `Bearer ${STAFF_TOKEN}` } });
    xhr("GET", `${API}/api/v1/staff-invitations/${STAFF_TOKEN}`);
    xhr("POST", `${API}/api/v1/organizations/${ORGANIZATION_ID}/referrals/${REFERRAL_CODE}/invitations`);
    xhr("GET", `${API}/api/v1/registration/organizations?q=${encodeURIComponent(SEARCH)}&page=1`);
    xhr("POST", `${API}/api/v1/auth/reset-password`, { body: JSON.stringify({ token: STAFF_TOKEN, email: EMAIL }) });
    Sentry.addBreadcrumb({ category: "navigation", data: { from: "/", to: `/join/${ORGANIZATION_ID}/${REFERRAL_CODE}` } });
    Sentry.addBreadcrumb({ category: "ui.touch", message: `Llamar a ${PHONE}` });
    Sentry.captureException(new Error(`No pudimos aceptar /api/v1/invitations/${INVITATION_TOKEN}/accept para ${EMAIL}`));

    await Sentry.startSpan({ name: `GET ${API}/api/v1/staff-invitations/${STAFF_TOKEN}`, op: "http.client", attributes: { url: `${API}/api/v1/registration/referrals/${REFERRAL_CODE}` } }, async () => {
      await Sentry.startSpan({ name: `GET ${API}/api/v1/registration/organizations?q=${encodeURIComponent(SEARCH)}`, op: "http.client" }, async () => undefined);
    });
    await Sentry.flush();

    const sent = JSON.stringify(envelopes);
    expect(envelopes.length).toBeGreaterThan(0);
    for (const secret of SECRETS) expect(sent).not.toContain(secret);
    // Normalized routes stay, so reports remain groupable.
    expect(sent).toContain("/api/v1/invitations/:token/accept");
    expect(sent).toContain("/api/v1/staff-invitations/:token");
    expect(sent).toContain("/join/:id/:code");
    expect(sent).toContain('"type":"transaction"');
    expect(sent).toContain('"category":"xhr"');
    // No user, no console output, no request bodies or authorization headers.
    expect(sent).not.toContain("user-1");
    expect(sent).not.toContain('"category":"console"');
    expect(sent).not.toMatch(/Bearer [A-Za-z0-9]/);
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("sentry.invalid"))).toBe(false);
  });
});
