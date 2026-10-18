/**
 * The app's single Drive sync client, configured from the environment.
 * Tests build their own with createDriveSync and injected fakes instead.
 */

import { GOOGLE_CLIENT_ID } from "./clientId";
import { createDriveSync } from "./driveSync";

export const driveSync = createDriveSync({
  clientId: GOOGLE_CLIENT_ID,
  fetchImpl: (input, init) => fetch(input, init),
});
