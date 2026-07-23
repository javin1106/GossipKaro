import assert from "node:assert/strict";
import test from "node:test";
import {
  getAuthorizedGroupSocketRoom,
  getUserSocketRoom,
} from "./socketRooms.js";

test("builds a private room for all sockets belonging to a user", () => {
  assert.equal(getUserSocketRoom("user-1"), "user:user-1");
});

test("authorizes only groups tracked and currently joined by the socket", () => {
  const socket = {
    joinedGroups: new Set(["group-1", "group-2"]),
    rooms: new Set(["socket-1", "group-1"]),
  };

  assert.equal(
    getAuthorizedGroupSocketRoom(socket, "group-1"),
    "group-1",
  );
  assert.equal(getAuthorizedGroupSocketRoom(socket, "group-2"), null);
  assert.equal(getAuthorizedGroupSocketRoom(socket, "group-3"), null);
});
