import { useEffect, useState } from "react";
import { driveSync } from "../sync/drive";
import type { DriveUser } from "../sync/driveSync";

export interface AuthUserState {
  user: DriveUser | null;
}

/**
 * React-facing view of who is connected to Drive. The first report is
 * synchronous, so there is no "loading" state to render around.
 */
export function useAuthUser(): AuthUserState {
  const [user, setUser] = useState<DriveUser | null>(null);

  useEffect(() => driveSync.onAuthChange(setUser), []);

  return { user };
}
