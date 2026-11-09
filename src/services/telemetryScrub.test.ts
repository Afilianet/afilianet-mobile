import { FILTERED, scrubBreadcrumb, scrubEvent, scrubSpan, scrubText, scrubUrl } from "./telemetryScrub";

// Recognizable fictitious values: none of them may survive scrubbing.
const INVITATION_TOKEN = "invFICTICIO9f8e7d6c5b4a3210";
const STAFF_TOKEN = "staffFICTICIO0123456789abcdef";
const REFERRAL_CODE = "REFFICTICIO1";
const ORGANIZATION_ID = "0000f1c7-feed-4bad-8000-00000000c0de";
const EMAIL = "ana.ficticia@example.test";
const PHONE = "+52 55 0000 1234";
const SEARCH = "Farmacia FICTICIA";
const API = "https://staging-api.afilianet.mx";

describe("scrubUrl: the real Mobile routes", () => {
  it.each([
    [`${API}/api/v1/invitations/${INVITATION_TOKEN}/accept`, `${API}/api/v1/invitations/:token/accept`],
    [`${API}/api/v1/staff-invitations/${STAFF_TOKEN}`, `${API}/api/v1/staff-invitations/:token`],
    [`${API}/api/v1/staff-invitations/${STAFF_TOKEN}/accept`, `${API}/api/v1/staff-invitations/:token/accept`],
    [`${API}/api/v1/organizations/${ORGANIZATION_ID}/referrals/${REFERRAL_CODE}`, `${API}/api/v1/organizations/:id/referrals/:code`],
    [`${API}/api/v1/organizations/${ORGANIZATION_ID}/referrals/${REFERRAL_CODE}/invitations`, `${API}/api/v1/organizations/:id/referrals/:code/invitations`],
    [`${API}/api/v1/registration/referrals/${REFERRAL_CODE}`, `${API}/api/v1/registration/referrals/:code`],
    [`${API}/api/v1/registration/organizations?q=${encodeURIComponent(SEARCH)}&page=1`, `${API}/api/v1/registration/organizations?${FILTERED}`],
    [`${API}/api/v1/affiliates/me/sponsored?per_page=20&page=1&search=${encodeURIComponent(EMAIL)}`, `${API}/api/v1/affiliates/me/sponsored?${FILTERED}`],
    [`${API}/api/v1/notifications/${ORGANIZATION_ID}/read`, `${API}/api/v1/notifications/:id/read`],
    [`${API}/api/v1/auth/reset-password`, `${API}/api/v1/auth/reset-password`],
    [`${API}/api/v1/auth/forgot-password`, `${API}/api/v1/auth/forgot-password`],
    // In-app routes (expo-router), scheme from app.json.
    [`afilianetmobile://join/${ORGANIZATION_ID}/${REFERRAL_CODE}`, "afilianetmobile://join/:id/:code"],
    [`/join/${ORGANIZATION_ID}/${REFERRAL_CODE}`, "/join/:id/:code"],
    [`/staff-invite/${STAFF_TOKEN}`, "/staff-invite/:token"],
    [`/network-affiliate/${ORGANIZATION_ID}`, "/network-affiliate/:id"],
    [`https://user:${STAFF_TOKEN}@example.test/path#${EMAIL}`, "https://example.test/path"],
  ])("%s", (raw, expected) => {
    expect(scrubUrl(raw)).toBe(expected);
  });

  it("keeps routes without identifiers as they are", () => {
    expect(scrubUrl(`${API}/api/v1/me/organizations`)).toBe(`${API}/api/v1/me/organizations`);
    expect(scrubUrl("/api/v1/wallet/MXN/payout-eligibility")).toBe("/api/v1/wallet/MXN/payout-eligibility");
  });
});

describe("scrubText", () => {
  it("normalizes URLs and paths quoted in messages and removes contact data and credentials", () => {
    const text = [
      `POST ${API}/api/v1/invitations/${INVITATION_TOKEN}/accept failed`,
      `route /staff-invite/${STAFF_TOKEN}`,
      `for ${EMAIL} or ${PHONE}`,
      `Authorization: Bearer ${STAFF_TOKEN}`,
      `org ${ORGANIZATION_ID}`,
    ].join("\n");
    const scrubbed = scrubText(text);
    for (const secret of [INVITATION_TOKEN, STAFF_TOKEN, EMAIL, PHONE, ORGANIZATION_ID]) expect(scrubbed).not.toContain(secret);
    expect(scrubbed).toContain(`${API}/api/v1/invitations/:token/accept`);
    expect(scrubbed).toContain("/staff-invite/:token");
  });

  it("leaves ordinary messages readable", () => {
    expect(scrubText("Network request failed")).toBe("Network request failed");
    expect(scrubText("Request timed out after 15000 ms (2026-10-26)")).toBe("Request timed out after 15000 ms (2026-10-26)");
  });
});

describe("breadcrumbs, spans and events", () => {
  it("drops console breadcrumbs and scrubs fetch breadcrumbs, including bodies and headers", () => {
    expect(scrubBreadcrumb({ category: "console", message: EMAIL })).toBeNull();
    const crumb = scrubBreadcrumb({
      category: "fetch",
      data: { method: "POST", url: `${API}/api/v1/auth/reset-password?email=${EMAIL}`, status_code: 422, body: { token: STAFF_TOKEN, email: EMAIL }, headers: { Authorization: `Bearer ${STAFF_TOKEN}` } },
    });
    expect(crumb?.data).toEqual({ method: "POST", url: `${API}/api/v1/auth/reset-password?${FILTERED}`, status_code: 422, body: FILTERED, headers: { Authorization: FILTERED } });
  });

  it("scrubs span descriptions and URL attributes", () => {
    const span = scrubSpan({
      span_id: "a1b2c3d4e5f60718", trace_id: "0123456789abcdef0123456789abcdef", start_timestamp: 1, op: "http.client", origin: "auto.http.client.fetch",
      description: `GET ${API}/api/v1/registration/organizations?q=${encodeURIComponent(SEARCH)}`,
      data: { url: `${API}/api/v1/registration/referrals/${REFERRAL_CODE}`, "http.query": `q=${SEARCH}` },
    });
    expect(span.description).toBe(`GET ${API}/api/v1/registration/organizations?${FILTERED}`);
    expect(span.data).toEqual({ url: `${API}/api/v1/registration/referrals/:code`, "http.query": FILTERED });
    expect(span.trace_id).toBe("0123456789abcdef0123456789abcdef");
  });

  it("removes the user, request bodies, headers and the device's own name, keeping Sentry's identifiers", () => {
    const event = scrubEvent({
      event_id: "0123456789abcdef0123456789abcdef",
      user: { id: "u-1", email: EMAIL, ip_address: "203.0.113.7" },
      request: { method: "POST", url: `${API}/api/v1/invitations/${INVITATION_TOKEN}/accept`, data: { password: "x" }, headers: { Authorization: "Bearer x" }, cookies: { a: "b" }, query_string: `q=${SEARCH}` },
      transaction: `/join/${ORGANIZATION_ID}/${REFERRAL_CODE}`,
      contexts: { device: { name: "Galaxy de Ana Ficticia", model: "SM-A065M" }, trace: { trace_id: "0123456789abcdef0123456789abcdef", span_id: "a1b2c3d4e5f60718", data: { url: `${API}/api/v1/staff-invitations/${STAFF_TOKEN}` } } },
      exception: { values: [{ type: "ApiError", value: `No pudimos aceptar ${API}/api/v1/invitations/${INVITATION_TOKEN}/accept para ${EMAIL}` }] },
      extra: { phone: PHONE, note: `llamar a ${PHONE}` },
      tags: { search: SEARCH },
    });
    const json = JSON.stringify(event);
    for (const secret of [INVITATION_TOKEN, STAFF_TOKEN, REFERRAL_CODE, ORGANIZATION_ID, EMAIL, PHONE, SEARCH, "203.0.113.7", "Ana Ficticia", "password"]) {
      expect(json).not.toContain(secret);
    }
    expect(event.user).toBeUndefined();
    expect(event.request).toEqual({ method: "POST", url: `${API}/api/v1/invitations/:token/accept` });
    expect(event.transaction).toBe("/join/:id/:code");
    expect(event.contexts?.device).toEqual({ model: "SM-A065M" });
    expect(event.contexts?.trace?.trace_id).toBe("0123456789abcdef0123456789abcdef");
    expect(event.event_id).toBe("0123456789abcdef0123456789abcdef");
  });
});
