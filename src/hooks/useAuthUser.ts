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
    const unsubscribe = onAuthChange((user) => setState({ user, loading: false }));
    return unsubscribe;
  }, []);

  return state;
}
