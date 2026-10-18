import { useEffect, useState } from "react";
import { onAuthChange, type User } from "../firebase/auth";

export interface AuthUserState {
  user: User | null;
  /** True until the initial auth state has resolved. */
  loading: boolean;
}

/** React-facing view of Firebase auth state, analogous to a Dexie live query. */
export function useAuthUser(): AuthUserState {
  const [state, setState] = useState<AuthUserState>({ user: null, loading: true });

  useEffect(() => {
    return onAuthChange(
      (user) => setState({ user, loading: false }),
      (error) =>
        console.error("Auth failed to initialize", {
          name: error instanceof Error ? error.name : "unknown",
        }),
    );
  }, []);

  return state;
}
