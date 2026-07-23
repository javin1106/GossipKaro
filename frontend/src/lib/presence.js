const normalizeUserId = (value) => {
  if (typeof value === "string") return value;
  if (!value) return "";
  return value._id?.toString?.() || value.id?.toString?.() || "";
};

const normalizeRevision = (value, fallback = 0) => {
  const revision = Number(value);
  return Number.isSafeInteger(revision) && revision >= 0 ? revision : fallback;
};

const uniqueUserIds = (values = []) =>
  Array.from(new Set(values.map(normalizeUserId).filter(Boolean)));

export const reducePresenceEvent = (
  current = { userIds: [], revision: 0 },
  event = {},
) => {
  const currentRevision = normalizeRevision(current.revision);
  const incomingRevision = normalizeRevision(event.revision);

  if (incomingRevision < currentRevision) {
    return current;
  }

  if (event.type === "snapshot") {
    return {
      userIds: uniqueUserIds(event.userIds),
      revision: incomingRevision,
    };
  }

  const userId = normalizeUserId(event.userId);
  if (!userId) return current;

  const currentIds = uniqueUserIds(current.userIds);
  const userIds = event.isOnline
    ? uniqueUserIds([...currentIds, userId])
    : currentIds.filter((id) => id !== userId);

  return { userIds, revision: incomingRevision };
};
