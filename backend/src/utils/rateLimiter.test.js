import assert from "node:assert/strict";
import test from "node:test";
import { createRateLimiter } from "./rateLimiter.js";

test("allows requests up to the configured limit", async () => {
  let currentTime = 1000;
  const limiter = createRateLimiter(null, { now: () => currentTime });
  const options = {
    scope: "test",
    identifier: "user-1",
    limit: 2,
    windowSeconds: 10,
  };

  const first = await limiter.consume(options);
  const second = await limiter.consume(options);
  const third = await limiter.consume(options);

  assert.equal(first.allowed, true);
  assert.equal(first.remaining, 1);
  assert.equal(second.allowed, true);
  assert.equal(second.remaining, 0);
  assert.equal(third.allowed, false);

  currentTime = 11000;
  const nextWindow = await limiter.consume(options);
  assert.equal(nextWindow.allowed, true);
  assert.equal(nextWindow.remaining, 1);
});

test("keeps independent counters for different identities", async () => {
  const limiter = createRateLimiter(null, { now: () => 1000 });
  const baseOptions = {
    scope: "test",
    limit: 1,
    windowSeconds: 10,
  };

  await limiter.consume({ ...baseOptions, identifier: "user-1" });
  const otherUser = await limiter.consume({
    ...baseOptions,
    identifier: "user-2",
  });

  assert.equal(otherUser.allowed, true);
});
