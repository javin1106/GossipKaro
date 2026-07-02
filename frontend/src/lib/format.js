export function normalizeUser(user) {
  if (!user) return null;

  return {
    ...user,
    id: user.id || user._id,
  };
}

export function getEntityId(entity) {
  if (!entity) return "";
  if (typeof entity === "string") return entity;
  return entity.id || entity._id || "";
}

export function getInitials(name = "") {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const initials = words.slice(0, 2).map((word) => word[0]).join("");
  return initials.toUpperCase() || "GK";
}

export function formatMessageTime(value) {
  if (!value) return "";

  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatGroupDate(value) {
  if (!value) return "";

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}
