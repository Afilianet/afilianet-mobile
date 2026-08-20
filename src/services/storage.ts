import * as SecureStore from "expo-secure-store";

/**
 * Thin wrapper around Expo SecureStore. Used for the auth token and the
 * last-selected organization id -- never AsyncStorage, per the security
 * requirement that auth-adjacent data stays in the OS keychain/keystore.
 */
export const secureStorage = {
  async get(key: string): Promise<string | null> {
    return SecureStore.getItemAsync(key);
  },
  async set(key: string, value: string): Promise<void> {
    await SecureStore.setItemAsync(key, value);
  },
  async remove(key: string): Promise<void> {
    await SecureStore.deleteItemAsync(key);
  },
};
