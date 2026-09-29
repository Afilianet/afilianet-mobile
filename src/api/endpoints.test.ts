import { apiRequest } from "./client";
import {
  acceptReferralInvitation,
  fetchPublicReferral,
  fetchMyCompliance,
  requestEvidenceUpload,
  fetchLivenessCredentials,
  triggerFaceMatchProcessing,
  signIn,
  signOutRequest,
  startReferralInvitation,
} from "./endpoints";

jest.mock("./client", () => ({
  apiRequest: jest.fn(),
}));

const mockedApiRequest = apiRequest as jest.Mock;

describe("signIn", () => {
  beforeEach(() => {
    mockedApiRequest.mockReset();
  });

  it("posts to /api/v1/auth/login without auth/org headers and returns the flat response", async () => {
    mockedApiRequest.mockResolvedValue({ token: "abc123", user: { id: "user-1" } });

    const result = await signIn("person@example.com", "hunter2");

    expect(mockedApiRequest).toHaveBeenCalledWith("/api/v1/auth/login", {
      method: "POST",
      body: { email: "person@example.com", password: "hunter2" },
      skipAuth: true,
      skipOrganization: true,
    });
    // Not unwrapped from a {data: ...} envelope -- the login endpoint is flat.
    expect(result).toEqual({ token: "abc123", user: { id: "user-1" } });
  });
});

describe("signOutRequest", () => {
  beforeEach(() => {
    mockedApiRequest.mockReset();
  });

  it("posts to /api/v1/auth/logout and skips the global unauthorized handler", async () => {
    mockedApiRequest.mockResolvedValue({ message: "Logged out." });

    await signOutRequest();

    expect(mockedApiRequest).toHaveBeenCalledWith("/api/v1/auth/logout", {
      method: "POST",
      skipOrganization: true,
      skipUnauthorizedHandling: true,
    });
  });
});

describe("public referral registration", () => {
  beforeEach(() => mockedApiRequest.mockReset());

  it("uses the organization scope and never sends a stored user's credentials", async () => {
    mockedApiRequest.mockResolvedValueOnce({ data: { affiliate_code: "AFF100" } });
    mockedApiRequest.mockResolvedValueOnce({ data: { token: "invite" } });
    mockedApiRequest.mockResolvedValueOnce({ data: { token: "session", user: { id: "u1" } } });

    await fetchPublicReferral("org-1", "AFF100");
    await startReferralInvitation("org-1", "AFF100");
    await acceptReferralInvitation("invite", {
      first_name: "Ana",
      last_name: "López",
      email: "ana@example.com",
      password: "strongpass1",
    });

    expect(mockedApiRequest.mock.calls[0]).toEqual([
      "/api/v1/organizations/org-1/referrals/AFF100",
      { skipAuth: true, skipOrganization: true, skipUnauthorizedHandling: true },
    ]);
    expect(mockedApiRequest.mock.calls[1]).toEqual([
      "/api/v1/organizations/org-1/referrals/AFF100/invitations",
      { method: "POST", body: {}, skipAuth: true, skipOrganization: true, skipUnauthorizedHandling: true },
    ]);
    expect(mockedApiRequest.mock.calls[2]).toEqual([
      "/api/v1/invitations/invite/accept",
      {
        method: "POST",
        body: { first_name: "Ana", last_name: "López", email: "ana@example.com", password: "strongpass1" },
        skipAuth: true,
        skipOrganization: true,
        skipUnauthorizedHandling: true,
      },
    ]);
  });
});

describe("assisted verification request scope", () => {
  beforeEach(() => {
    mockedApiRequest.mockReset();
    mockedApiRequest.mockResolvedValue({ data: {} });
  });

  it("binds document uploads and AWS credentials to the assisted affiliate explicitly", async () => {
    await requestEvidenceUpload("document-step", { evidence_type: "id_document_front", mime_type: "image/jpeg", size: 100 }, "enrollment-a");
    await fetchLivenessCredentials("liveness-step", "enrollment-a");
    expect(mockedApiRequest.mock.calls[0][1].headers).toEqual({ "X-Assisted-Enrollment-ID": "enrollment-a" });
    expect(mockedApiRequest.mock.calls[1][1].headers).toEqual({ "X-Assisted-Enrollment-ID": "enrollment-a" });
  });

  it("never carries an assisted header into a subsequent self request or another affiliate", async () => {
    await fetchMyCompliance("enrollment-a");
    await fetchMyCompliance();
    await triggerFaceMatchProcessing("face-step", "enrollment-b");
    expect(mockedApiRequest.mock.calls[0][1].headers).toEqual({ "X-Assisted-Enrollment-ID": "enrollment-a" });
    expect(mockedApiRequest.mock.calls[1][1].headers).toBeUndefined();
    expect(mockedApiRequest.mock.calls[2][1].headers).toEqual({ "X-Assisted-Enrollment-ID": "enrollment-b" });
  });
});
