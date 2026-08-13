import assert from "node:assert/strict";
import { createAsyncCache } from "./async-cache.js";

let loads = 0;
const read = createAsyncCache(60_000, async () => ++loads);
const [first, joined] = await Promise.all([read(), read()]);
assert.equal(loads, 1);
assert.equal(first.value, 1);
assert.equal(joined.value, 1);
assert.equal((await read()).cached, true);
assert.equal((await read(true)).value, 2);
assert.equal(loads, 2);
console.log("async cache: ok");
