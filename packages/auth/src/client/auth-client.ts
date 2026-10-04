import { createAuthClient } from "better-auth/react";
import { phoneNumberClient } from "better-auth/client/plugins";

export function createClient(baseURL: string) {
  return createAuthClient({
    baseURL,
    plugins: [phoneNumberClient()],
  });
}
