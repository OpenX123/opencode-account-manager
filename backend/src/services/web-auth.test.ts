import assert from "node:assert/strict";
import { createSession, LoginLimiter, passwordHash, verifyPassword, verifySession } from "./web-auth.js";

const salt = "test-salt";
const hash = passwordHash("correct horse", salt);
assert.equal(verifyPassword("correct horse", salt, hash), true);
assert.equal(verifyPassword("wrong", salt, hash), false);

const token = createSession("ocam", "session-secret", 1_000);
assert.equal(verifySession(token, "ocam", "session-secret", 2_000), true);
assert.equal(verifySession(token, "ocam", "wrong-secret", 2_000), false);

const limiter = new LoginLimiter(2, 1_000);
limiter.fail("client", 1_000);
assert.equal(limiter.blocked("client", 1_001), false);
limiter.fail("client", 1_001);
assert.equal(limiter.blocked("client", 1_002), true);
assert.equal(limiter.blocked("client", 2_001), false);

console.log("web-auth checks passed");
