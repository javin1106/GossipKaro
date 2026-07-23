export const getUserSocketRoom = (userId) => `user:${userId}`;

export const getAuthorizedGroupSocketRoom = (socket, groupId) => {
  const normalizedGroupId =
    typeof groupId === "string" ? groupId : groupId?.toString();

  const isAuthorized = Boolean(
    normalizedGroupId &&
      socket.joinedGroups?.has(normalizedGroupId) &&
      socket.rooms?.has(normalizedGroupId),
  );

  return isAuthorized ? normalizedGroupId : null;
};
