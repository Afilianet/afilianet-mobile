import { useRef } from "react";
import { newClientRequestId } from "../api/privacy";

/**
 * The `client_request_id` of one attempt (API #91, contract §6): the same id
 * for every retry of the same input, so a lost or uncertain answer never
 * creates twice; a new one as soon as the input changes.
 */
export function useAttemptId(): (inputKey: string) => string {
  const attempt = useRef<{ key: string; id: string } | null>(null);
  return (inputKey: string) => {
    if (attempt.current?.key !== inputKey) attempt.current = { key: inputKey, id: newClientRequestId() };
    return attempt.current.id;
  };
}
