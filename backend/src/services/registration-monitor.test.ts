import assert from "node:assert/strict";
import { isOpenCodeUrl } from "./registration-monitor.js";
import { dedupeAccounts } from "../routes/invite.js";

assert.equal(isOpenCodeUrl("https://auth.opencode.ai/google/callback"), true);
assert.equal(
  isOpenCodeUrl(
    "https://accounts.google.com/v3/signin/speedbump/workspacetermsofservice?app_domain=https%3A%2F%2Fauth.opencode.ai"
  ),
  false
);

assert.deepEqual(
  dedupeAccounts(
    [
      { email: "new@example.com", password: "one" },
      { email: "NEW@example.com", password: "two" },
      { email: "old@example.com", password: "three" },
    ],
    ["OLD@example.com"]
  ),
  {
    accounts: [{ email: "new@example.com", password: "one", recoveryEmail: undefined }],
    skippedExisting: 1,
    skippedDuplicate: 1,
  }
);
