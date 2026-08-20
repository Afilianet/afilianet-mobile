import * as SecureStore from "expo-secure-store";
import { tokenStorage } from "./tokenStorage";

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

describe("tokenStorage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("stores the token under a namespaced key", async () => {
    await tokenStorage.setToken("abc123");
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith("afilianet_auth_token", "abc123");
  });

  it("reads the token back", async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue("abc123");
    await expect(tokenStorage.getToken()).resolves.toBe("abc123");
  });

  it("clears the token", async () => {
    await tokenStorage.clearToken();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith("afilianet_auth_token");
  });
});
