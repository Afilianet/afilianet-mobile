import { secureStorage } from "../services/storage";

const TOKEN_KEY = "afilianet_auth_token";

export const tokenStorage = {
  getToken(): Promise<string | null> {
    return secureStorage.get(TOKEN_KEY);
  },
  setToken(token: string): Promise<void> {
    return secureStorage.set(TOKEN_KEY, token);
  },
  clearToken(): Promise<void> {
    return secureStorage.remove(TOKEN_KEY);
  },
};
