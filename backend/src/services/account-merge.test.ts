import assert from "node:assert/strict";
import type { Account } from "../types.js";
import { encrypt } from "../utils/crypto.js";
import { mergeAccountBackup } from "./account-merge.js";

const cookie = encrypt(JSON.stringify([{ name: "session", value: "ok", domain: ".opencode.ai", path: "/" }]));
const source = [{
  id: "11ad4f1f-9edb-405e-9b11-541cce402981",
  alias: "local",
  email: "USER@example.com",
  username: "user",
  avatarUrl: "",
  encryptedCookies: cookie.encrypted,
  iv: cookie.iv,
  authTag: cookie.authTag,
  lastVerifiedAt: 2,
  createdAt: 1,
  note: "",
  invitedBy: null,
}];

const added = mergeAccountBackup(source, process.env.COOKIE_KEY || "", []);
assert.equal(added.added, 1);
assert.equal(added.failed, 0);

const older: Account = { ...added.accounts[0], alias: "remote", lastVerifiedAt: 3 };
const skipped = mergeAccountBackup(source, process.env.COOKIE_KEY || "", [older]);
assert.deepEqual({ added: skipped.added, updated: skipped.updated, skipped: skipped.skipped }, { added: 0, updated: 0, skipped: 1 });
assert.equal(skipped.accounts[0].alias, "remote");
assert.deepEqual(mergeAccountBackup(source, "wrong-key", []), { accounts: [], added: 0, updated: 0, skipped: 0, failed: 1 });
console.log("account merge: ok");
