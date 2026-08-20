import { apiRequest } from "./client";
import { signIn, signOutRequest } from "./endpoints";

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
