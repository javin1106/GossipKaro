import assert from "node:assert/strict";
import test from "node:test";
import { reducePresenceEvent } from "./presence.js";

test("ignores a stale snapshot received after a newer online delta", () => {
  const afterDelta = reducePresenceEvent(
    { userIds: ["user-1"], revision: 3 },
    {
      type: "delta",
      userId: "user-2",
      isOnline: true,
      revision: 4,
    },
  );

  const afterStaleSnapshot = reducePresenceEvent(afterDelta, {
    type: "snapshot",
    userIds: ["user-1"],
    revision: 3,
  });

  assert.deepEqual(afterStaleSnapshot, {
    userIds: ["user-1", "user-2"],
    revision: 4,
  });
});

test("applies an authoritative newer snapshot", () => {
  const result = reducePresenceEvent(
    { userIds: ["user-1", "user-2"], revision: 4 },
    {
      type: "snapshot",
      userIds: ["user-1"],
      revision: 5,
    },
  );

  assert.deepEqual(result, { userIds: ["user-1"], revision: 5 });
});

test("removes an offline user without duplicating other users", () => {
  const result = reducePresenceEvent(
    { userIds: ["user-1", "user-2", "user-2"], revision: 8 },
    {
      type: "delta",
      userId: "user-2",
      isOnline: false,
      revision: 9,
    },
  );

  assert.deepEqual(result, { userIds: ["user-1"], revision: 9 });
});
