import { render } from "@testing-library/react-native";
import { AuthContext, type AuthContextValue } from "../../../auth/AuthContext";
import LoginScreen from "../../../app/(auth)/login";

function renderLogin(overrides: Partial<AuthContextValue> = {}) {
  const value: AuthContextValue = {
    status: "signedOut",
    user: null,
    error: null,
    signIn: jest.fn(),
    signOut: jest.fn(),
    ...overrides,
  };
  return render(
    <AuthContext.Provider value={value}>
      <LoginScreen />
    </AuthContext.Provider>,
  );
}

describe("LoginScreen", () => {
  it("has no development token-paste fallback, in this (dev) test environment or otherwise", async () => {
    const { queryByText, queryByPlaceholderText } = await renderLogin();

    expect(queryByText(/access token/i)).toBeNull();
    expect(queryByText(/sign in with token/i)).toBeNull();
    expect(queryByPlaceholderText(/1\|abcdef/i)).toBeNull();
  });

  it("only exposes email and password fields", async () => {
    const { getByPlaceholderText } = await renderLogin();

    expect(getByPlaceholderText("you@example.com")).toBeTruthy();
    expect(getByPlaceholderText("••••••••")).toBeTruthy();
  });
});
