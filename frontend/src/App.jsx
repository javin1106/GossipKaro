import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Copy,
  DoorOpen,
  Link as LinkIcon,
  Loader2,
  LogOut,
  MessageCircle,
  Plus,
  Send,
  ShieldCheck,
  Smile,
  Sparkles,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { io } from "socket.io-client";
import { apiRequest, SOCKET_URL } from "./lib/api.js";
import {
  formatGroupDate,
  formatMessageTime,
  getEntityId,
  getInitials,
  normalizeUser,
} from "./lib/format.js";

const TOKEN_KEY = "gossipkaro.token";
const USER_KEY = "gossipkaro.user";
const EMOJI_OPTIONS = ["😀", "😂", "😍", "🔥", "👏", "🙏", "💯", "🎉", "❤️", "👍", "😎", "🤝"];
const REACTION_OPTIONS = ["👍", "❤️", "😂", "🔥", "👏", "😮"];

function readStoredAuth() {
  const token = localStorage.getItem(TOKEN_KEY);
  const rawUser = localStorage.getItem(USER_KEY);

  if (!token || !rawUser) {
    return { token: "", user: null };
  }

  try {
    return { token, user: normalizeUser(JSON.parse(rawUser)) };
  } catch {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    return { token: "", user: null };
  }
}

function getInviteCodeFromLocation() {
  const match = window.location.pathname.match(/^\/join\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : "";
}

export default function App() {
  const [auth, setAuth] = useState(readStoredAuth);
  const [authMode, setAuthMode] = useState("login");
  const [groups, setGroups] = useState([]);
  const [activeGroupId, setActiveGroupId] = useState("");
  const [messages, setMessages] = useState([]);
  const [messageDraft, setMessageDraft] = useState("");
  const [modal, setModal] = useState(null);
  const [inviteResult, setInviteResult] = useState(null);
  const [notice, setNotice] = useState(null);
  const [booting, setBooting] = useState(Boolean(auth.token));
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState("");
  const [connectionState, setConnectionState] = useState("offline");
  const [typingUsers, setTypingUsers] = useState({});
  const [onlineUsersByGroup, setOnlineUsersByGroup] = useState({});
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [pendingInviteCode, setPendingInviteCode] = useState(getInviteCodeFromLocation);

  const socketRef = useRef(null);
  const activeGroupRef = useRef("");
  const messageLoadRef = useRef("");
  const typingTimerRef = useRef(null);
  const autoJoinRef = useRef(false);

  const activeGroup = useMemo(
    () => groups.find((group) => group._id === activeGroupId),
    [activeGroupId, groups],
  );

  const sortedMessages = useMemo(
    () =>
      [...messages].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      ),
    [messages],
  );

  const isAuthed = Boolean(auth.token && auth.user);
  const typingNames = Object.values(typingUsers);
  const activeOnlineUserIds = onlineUsersByGroup[activeGroupId] || [];

  useEffect(() => {
    activeGroupRef.current = activeGroupId;
  }, [activeGroupId]);

  useEffect(() => {
    if (!notice) return undefined;

    const timer = window.setTimeout(() => setNotice(null), 4200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!auth.token) {
      setBooting(false);
      return undefined;
    }

    let cancelled = false;

    async function verifySession() {
      try {
        const payload = await apiRequest("/api/auth/me", { token: auth.token });
        if (cancelled) return;

        const user = normalizeUser(payload.data);
        setAuth((current) => ({ ...current, user }));
        localStorage.setItem(USER_KEY, JSON.stringify(user));
        await fetchGroups(auth.token);
      } catch {
        if (!cancelled) {
          clearAuth(false);
        }
      } finally {
        if (!cancelled) {
          setBooting(false);
        }
      }
    }

    verifySession();
    return () => {
      cancelled = true;
    };
  }, [auth.token]);

  useEffect(() => {
    if (!auth.token) return undefined;

    const socket = io(SOCKET_URL, {
      auth: { token: auth.token },
      withCredentials: true,
    });

    socketRef.current = socket;
    setConnectionState("connecting");

    socket.on("connect", () => setConnectionState("online"));
    socket.on("disconnect", () => setConnectionState("offline"));
    socket.on("connect_error", (error) => {
      setConnectionState("offline");
      showNotice(error.message || "Socket connection failed", "error");
    });

    socket.on("new-message", (message) => {
      const messageGroupId = getEntityId(message.group);
      const activeId = activeGroupRef.current;
      const senderId = getEntityId(message.sender);
      const isOwnMessage = senderId === getEntityId(auth.user);

      if (messageGroupId !== activeId) {
        if (!isOwnMessage) {
          setGroups((current) =>
            current.map((group) =>
              group._id === messageGroupId
                ? { ...group, unreadCount: (group.unreadCount || 0) + 1 }
                : group,
            ),
          );
        }
        return;
      }

      setMessages((current) => {
        if (current.some((item) => item._id === message._id)) {
          return current;
        }

        return [...current, message];
      });
      socket.emit("mark-read", { groupId: messageGroupId });
    });

    socket.on("message-reaction-updated", ({ groupId, messageId, reactions }) => {
      if (groupId !== activeGroupRef.current) return;

      setMessages((current) =>
        current.map((message) =>
          message._id === messageId ? { ...message, reactions } : message,
        ),
      );
    });

    socket.on("unread-count-updated", ({ groupId, unreadCount }) => {
      setGroups((current) =>
        current.map((group) => (group._id === groupId ? { ...group, unreadCount } : group)),
      );
    });

    socket.on("online-users", ({ groupId, userIds }) => {
      setOnlineUsersByGroup((current) => ({
        ...current,
        [groupId]: userIds || [],
      }));
    });

    socket.on("presence-updated", ({ groupId, userId, isOnline }) => {
      setOnlineUsersByGroup((current) => {
        const currentIds = current[groupId] || [];
        const nextIds = isOnline
          ? Array.from(new Set([...currentIds, userId]))
          : currentIds.filter((id) => id !== userId);

        return {
          ...current,
          [groupId]: nextIds,
        };
      });
    });

    socket.on("group-members-updated", async ({ groupId }) => {
      await fetchGroups(auth.token);

      if (groupId === activeGroupRef.current) {
        await fetchGroupDetails(groupId, auth.token);
      }
    });

    socket.on("user-typing", ({ username, userId }) => {
      if (getEntityId(auth.user) === getEntityId(userId)) return;

      setTypingUsers((current) => ({
        ...current,
        [getEntityId(userId) || username]: username,
      }));
    });

    socket.on("user-stopped-typing", ({ userId }) => {
      setTypingUsers((current) => {
        const next = { ...current };
        delete next[getEntityId(userId)];
        return next;
      });
    });

    socket.on("error", (error) => {
      showNotice(error?.message || "Realtime action failed", "error");
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [auth.token]);

  useEffect(() => {
    if (!isAuthed || !pendingInviteCode || autoJoinRef.current) return;

    autoJoinRef.current = true;
    joinGroupByCode(pendingInviteCode, true);
  }, [isAuthed, pendingInviteCode]);

  async function fetchGroups(token = auth.token, selectGroupId = "") {
    if (!token) return [];

    setGroupsLoading(true);
    try {
      const payload = await apiRequest("/api/groups", { token });
      const nextGroups = payload.data || [];
      setGroups(nextGroups);

      const targetGroupId = selectGroupId || activeGroupRef.current;
      if (targetGroupId && !nextGroups.some((group) => group._id === targetGroupId)) {
        setActiveGroupId("");
        setMessages([]);
      }

      return nextGroups;
    } catch (error) {
      showNotice(error.message, "error");
      return [];
    } finally {
      setGroupsLoading(false);
    }
  }

  async function fetchGroupDetails(groupId, token = auth.token) {
    if (!groupId || !token) return null;

    const payload = await apiRequest(`/api/groups/${groupId}`, { token });
    const group = payload.data?.group;

    if (group) {
      setGroups((current) => {
        const exists = current.some((item) => item._id === group._id);

        if (!exists) {
          return [group, ...current];
        }

        return current.map((item) => (item._id === group._id ? group : item));
      });
    }

    return group;
  }

  function saveAuth(nextAuth) {
    const user = normalizeUser(nextAuth.user);
    const token = nextAuth.token || "";

    setAuth({ token, user });
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }

  function clearAuth(showMessage = true) {
    if (socketRef.current) {
      socketRef.current.disconnect();
    }

    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setAuth({ token: "", user: null });
    setGroups([]);
    setMessages([]);
    setActiveGroupId("");
    setMessageDraft("");
    setTypingUsers({});
    setOnlineUsersByGroup({});
    setShowEmojiPicker(false);
    setConnectionState("offline");

    if (showMessage) {
      showNotice("Signed out", "info");
    }
  }

  function showNotice(message, type = "info") {
    setNotice({ message, type });
  }

  async function handleAuthSubmit(event) {
    event.preventDefault();
    setActionLoading(authMode);

    const form = new FormData(event.currentTarget);
    const payload =
      authMode === "login"
        ? {
            email: form.get("email")?.trim(),
            password: form.get("password"),
          }
        : {
            username: form.get("username")?.trim(),
            email: form.get("email")?.trim(),
            password: form.get("password"),
          };

    try {
      const response = await apiRequest(`/api/auth/${authMode}`, {
        method: "POST",
        body: payload,
      });

      const nextAuth = {
        token: response.data.accessToken,
        user: response.data.user,
      };

      saveAuth(nextAuth);
      await fetchGroups(nextAuth.token);
      showNotice(authMode === "login" ? "Welcome back" : "Account ready", "success");
    } catch (error) {
      showNotice(error.message, "error");
    } finally {
      setActionLoading("");
    }
  }

  async function handleLogout() {
    setActionLoading("logout");

    try {
      await apiRequest("/api/auth/logout", {
        method: "POST",
        token: auth.token,
      });
    } catch {
      // Local logout should still happen if the token is already invalid.
    } finally {
      setActionLoading("");
      clearAuth();
    }
  }

  async function selectGroup(groupId) {
    setActiveGroupId(groupId);
    setMessages([]);
    setTypingUsers({});
    setMessagesLoading(true);
    messageLoadRef.current = groupId;

    socketRef.current?.emit("join-group", groupId);

    try {
      await fetchGroupDetails(groupId);

      const payload = await apiRequest(`/api/groups/${groupId}/messages?limit=60`, {
        token: auth.token,
      });

      if (messageLoadRef.current === groupId) {
        setMessages(payload.data?.messages || []);
        socketRef.current?.emit("mark-read", { groupId });
        setGroups((current) =>
          current.map((group) =>
            group._id === groupId ? { ...group, unreadCount: 0 } : group,
          ),
        );
      }
    } catch (error) {
      showNotice(error.message, "error");
    } finally {
      if (messageLoadRef.current === groupId) {
        setMessagesLoading(false);
      }
    }
  }

  async function createGroup(event) {
    event.preventDefault();
    setActionLoading("create-group");

    const form = new FormData(event.currentTarget);
    const groupName = form.get("groupName")?.trim();
    const description = form.get("description")?.trim();

    try {
      const response = await apiRequest("/api/groups/create", {
        method: "POST",
        token: auth.token,
        body: { groupName, description },
      });

      await fetchGroups(auth.token, response.data._id);
      setModal(null);
      await selectGroup(response.data._id);
      showNotice("Group created", "success");
    } catch (error) {
      showNotice(error.message, "error");
    } finally {
      setActionLoading("");
    }
  }

  async function joinGroupByCode(code, fromInviteLink = false) {
    const inviteCode = code?.trim();
    if (!inviteCode) return;

    setActionLoading("join-group");

    try {
      const response = await apiRequest(`/api/invites/join/${encodeURIComponent(inviteCode)}`, {
        method: "POST",
        token: auth.token,
      });

      await fetchGroups(auth.token, response.data?._id);
      setModal(null);
      setPendingInviteCode("");

      if (fromInviteLink) {
        window.history.replaceState({}, "", "/");
      }

      if (response.data?._id) {
        await selectGroup(response.data._id);
      }

      showNotice("Joined group", "success");
    } catch (error) {
      showNotice(error.message, "error");
    } finally {
      setActionLoading("");
      autoJoinRef.current = false;
    }
  }

  async function joinGroup(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await joinGroupByCode(form.get("inviteCode"));
  }

  async function generateInvite() {
    if (!activeGroupId) return;

    setActionLoading("invite");

    try {
      const response = await apiRequest("/api/invites/create", {
        method: "POST",
        token: auth.token,
        body: { groupId: activeGroupId },
      });

      const inviteCode = response.data.code;
      setInviteResult({
        code: inviteCode,
        url: `${window.location.origin}/join/${inviteCode}`,
      });
      setModal("invite");
    } catch (error) {
      showNotice(error.message, "error");
    } finally {
      setActionLoading("");
    }
  }

  async function copyInvite(text) {
    try {
      await navigator.clipboard.writeText(text);
      showNotice("Copied", "success");
    } catch {
      showNotice("Copy failed", "error");
    }
  }

  async function leaveGroup() {
    if (!activeGroupId) return;
    if (!window.confirm(`Leave ${activeGroup?.groupName || "this group"}?`)) return;

    setActionLoading("leave");

    try {
      await apiRequest(`/api/groups/${activeGroupId}/leave`, {
        method: "POST",
        token: auth.token,
      });

      setActiveGroupId("");
      setMessages([]);
      await fetchGroups(auth.token);
      showNotice("Left group", "success");
    } catch (error) {
      showNotice(error.message, "error");
    } finally {
      setActionLoading("");
    }
  }

  function handleDraftChange(event) {
    const value = event.target.value;
    setMessageDraft(value);

    if (!activeGroupId || !socketRef.current?.connected) return;

    socketRef.current.emit("typing", { groupId: activeGroupId });
    window.clearTimeout(typingTimerRef.current);
    typingTimerRef.current = window.setTimeout(() => {
      socketRef.current?.emit("stop-typing", { groupId: activeGroupId });
    }, 1100);
  }

  function sendMessage(event) {
    event.preventDefault();
    const content = messageDraft.trim();

    if (!content || !activeGroupId) return;

    if (!socketRef.current?.connected) {
      showNotice("Realtime connection is offline", "error");
      return;
    }

    socketRef.current.emit("send-message", {
      groupId: activeGroupId,
      content,
    });
    socketRef.current.emit("stop-typing", { groupId: activeGroupId });
    setMessageDraft("");
    setShowEmojiPicker(false);
  }

  function addEmoji(emoji) {
    setMessageDraft((current) => `${current}${emoji}`);
  }

  function reactToMessage(messageId, emoji) {
    if (!activeGroupId || !socketRef.current?.connected) return;

    socketRef.current.emit("react-message", {
      groupId: activeGroupId,
      messageId,
      emoji,
    });
  }

  if (booting) {
    return (
      <main className="splash-screen">
        <div className="brand-mark">
          <MessageCircle size={34} />
        </div>
        <Loader2 className="spin" size={26} />
      </main>
    );
  }

  if (!isAuthed) {
    return (
      <>
        <AuthScreen
          mode={authMode}
          pendingInviteCode={pendingInviteCode}
          loading={actionLoading === "login" || actionLoading === "register"}
          onModeChange={setAuthMode}
          onSubmit={handleAuthSubmit}
        />
        <Notice notice={notice} />
      </>
    );
  }

  return (
    <>
      <main className="app-shell">
        <aside className="sidebar">
          <div className="sidebar-header">
            <div className="user-lockup">
              <div className="avatar">{getInitials(auth.user?.username || auth.user?.email)}</div>
              <div>
                <p>{auth.user?.username || "GossipKaro"}</p>
                <span>{connectionState}</span>
              </div>
            </div>
            <button
              className="icon-button danger"
              type="button"
              title="Logout"
              aria-label="Logout"
              onClick={handleLogout}
              disabled={actionLoading === "logout"}
            >
              {actionLoading === "logout" ? <Loader2 className="spin" /> : <LogOut />}
            </button>
          </div>

          <div className="sidebar-actions">
            <button className="primary-button" type="button" onClick={() => setModal("create")}>
              <Plus size={18} />
              New Group
            </button>
            <button className="secondary-button" type="button" onClick={() => setModal("join")}>
              <UserPlus size={18} />
              Join
            </button>
          </div>

          <div className="section-label">
            <span>Groups</span>
            {groupsLoading ? <Loader2 className="spin" size={16} /> : <span>{groups.length}</span>}
          </div>

          <div className="group-list">
            {groups.length === 0 && !groupsLoading ? (
              <EmptyState icon={<Users />} title="No groups yet" text="Create or join a group." />
            ) : (
              groups.map((group) => (
                <button
                  className={`group-row ${group._id === activeGroupId ? "active" : ""}`}
                  type="button"
                  key={group._id}
                  onClick={() => selectGroup(group._id)}
                >
                  <span className="group-avatar">{getInitials(group.groupName)}</span>
                  <span className="group-main">
                    <strong>{group.groupName}</strong>
                    <small>{group.description || `${group.members?.length || 0} members`}</small>
                  </span>
                  <span className="group-meta">
                    {group.unreadCount > 0 ? (
                      <span className="unread-badge">{group.unreadCount}</span>
                    ) : (
                      <span className="group-date">{formatGroupDate(group.updatedAt)}</span>
                    )}
                  </span>
                </button>
              ))
            )}
          </div>
        </aside>

        <section className="chat-panel">
          {activeGroup ? (
            <>
              <header className="chat-header">
                <div className="chat-title">
                  <div className="group-avatar large">{getInitials(activeGroup.groupName)}</div>
                  <div>
                    <h1>{activeGroup.groupName}</h1>
                    <p>
                      {activeGroup.members?.length || 0} members
                      {activeOnlineUserIds.length > 0 ? ` · ${activeOnlineUserIds.length} online` : ""}
                    </p>
                  </div>
                </div>

                <div className="chat-actions">
                  <button className="icon-text-button" type="button" onClick={() => setModal("members")}>
                    <Users size={18} />
                    Members
                  </button>
                  <button
                    className="icon-text-button"
                    type="button"
                    onClick={generateInvite}
                    disabled={actionLoading === "invite"}
                  >
                    {actionLoading === "invite" ? (
                      <Loader2 className="spin" size={18} />
                    ) : (
                      <LinkIcon size={18} />
                    )}
                    Invite
                  </button>
                  <button
                    className="icon-button danger"
                    type="button"
                    title="Leave group"
                    aria-label="Leave group"
                    onClick={leaveGroup}
                    disabled={actionLoading === "leave"}
                  >
                    {actionLoading === "leave" ? <Loader2 className="spin" /> : <DoorOpen />}
                  </button>
                </div>
              </header>

              <div className="message-list">
                {messagesLoading ? (
                  <EmptyState icon={<Loader2 className="spin" />} title="Loading messages" />
                ) : sortedMessages.length === 0 ? (
                  <EmptyState icon={<MessageCircle />} title="No messages yet" text="Start the chat." />
                ) : (
                  sortedMessages.map((message) => (
                    <MessageBubble
                      key={message._id}
                      message={message}
                      user={auth.user}
                      onReact={reactToMessage}
                    />
                  ))
                )}
              </div>

              <div className="typing-line">
                {typingNames.length > 0 ? `${typingNames.join(", ")} typing...` : ""}
              </div>

              <form className="composer" onSubmit={sendMessage}>
                <div className="emoji-wrap">
                  <button
                    className="icon-button"
                    type="button"
                    title="Add emoji"
                    aria-label="Add emoji"
                    onClick={() => setShowEmojiPicker((current) => !current)}
                  >
                    <Smile />
                  </button>
                  {showEmojiPicker ? (
                    <div className="emoji-picker">
                      {EMOJI_OPTIONS.map((emoji) => (
                        <button type="button" key={emoji} onClick={() => addEmoji(emoji)}>
                          {emoji}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                <input
                  value={messageDraft}
                  onChange={handleDraftChange}
                  placeholder="Message"
                  aria-label="Message"
                />
                <button className="send-button" type="submit" aria-label="Send message" title="Send message">
                  <Send size={20} />
                </button>
              </form>
            </>
          ) : (
            <div className="no-chat">
              <div className="brand-mark muted">
                <MessageCircle size={34} />
              </div>
              <h1>GossipKaro</h1>
              <p>Select a group to open the conversation.</p>
            </div>
          )}
        </section>
      </main>

      {modal === "create" && (
        <Modal title="New Group" onClose={() => setModal(null)}>
          <form className="modal-form" onSubmit={createGroup}>
            <label>
              Group name
              <input name="groupName" required maxLength={50} autoFocus />
            </label>
            <label>
              Description
              <input name="description" maxLength={200} />
            </label>
            <div className="modal-actions">
              <button className="secondary-button" type="button" onClick={() => setModal(null)}>
                Cancel
              </button>
              <button className="primary-button" type="submit" disabled={actionLoading === "create-group"}>
                {actionLoading === "create-group" ? <Loader2 className="spin" size={18} /> : <Plus size={18} />}
                Create
              </button>
            </div>
          </form>
        </Modal>
      )}

      {modal === "join" && (
        <Modal title="Join Group" onClose={() => setModal(null)}>
          <form className="modal-form" onSubmit={joinGroup}>
            <label>
              Invite code
              <input name="inviteCode" required autoFocus defaultValue={pendingInviteCode} />
            </label>
            <div className="modal-actions">
              <button className="secondary-button" type="button" onClick={() => setModal(null)}>
                Cancel
              </button>
              <button className="primary-button" type="submit" disabled={actionLoading === "join-group"}>
                {actionLoading === "join-group" ? <Loader2 className="spin" size={18} /> : <UserPlus size={18} />}
                Join
              </button>
            </div>
          </form>
        </Modal>
      )}

      {modal === "invite" && inviteResult && (
        <Modal title="Invite" onClose={() => setModal(null)}>
          <div className="invite-box">
            <div>
              <span>Code</span>
              <strong>{inviteResult.code}</strong>
            </div>
            <button
              className="icon-button"
              type="button"
              title="Copy code"
              aria-label="Copy code"
              onClick={() => copyInvite(inviteResult.code)}
            >
              <Copy />
            </button>
          </div>
          <div className="invite-box">
            <div>
              <span>Link</span>
              <strong>{inviteResult.url}</strong>
            </div>
            <button
              className="icon-button"
              type="button"
              title="Copy link"
              aria-label="Copy link"
              onClick={() => copyInvite(inviteResult.url)}
            >
              <Copy />
            </button>
          </div>
        </Modal>
      )}

      {modal === "members" && activeGroup && (
        <Modal title={`${activeGroup.groupName} Members`} onClose={() => setModal(null)}>
          <div className="member-list">
            {(activeGroup.members || []).map((member) => {
              const memberId = getEntityId(member);
              const memberName =
                typeof member === "object" && member
                  ? member.username || member.email || "Unknown"
                  : "Unknown";
              const isAdmin = (activeGroup.admins || []).some(
                (admin) => getEntityId(admin) === memberId,
              );

              return (
                <div className="member-row" key={memberId || memberName}>
                  <div className="avatar small">{getInitials(memberName)}</div>
                  <div>
                    <strong>{memberName}</strong>
                    {typeof member === "object" && member?.email ? (
                      <span>
                        {member.email}
                        {activeOnlineUserIds.includes(memberId) ? " · Online" : ""}
                      </span>
                    ) : null}
                  </div>
                  {isAdmin ? <span className="role-pill">Admin</span> : null}
                </div>
              );
            })}
          </div>
        </Modal>
      )}

      <Notice notice={notice} />
    </>
  );
}

function AuthScreen({ mode, pendingInviteCode, loading, onModeChange, onSubmit }) {
  return (
    <main className="auth-page">
      <section className="auth-brand">
        <div className="brand-mark">
          <MessageCircle size={34} />
        </div>
        <h1>GossipKaro</h1>
        <div className="auth-badges" aria-label="Highlights">
          <span>
            <ShieldCheck size={16} />
            Private groups
          </span>
          <span>
            <Sparkles size={16} />
            Live chat
          </span>
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-tabs" role="tablist" aria-label="Authentication">
          <button
            type="button"
            className={mode === "login" ? "active" : ""}
            onClick={() => onModeChange("login")}
          >
            Login
          </button>
          <button
            type="button"
            className={mode === "register" ? "active" : ""}
            onClick={() => onModeChange("register")}
          >
            Register
          </button>
        </div>

        {pendingInviteCode ? (
          <div className="pending-invite">
            <LinkIcon size={16} />
            <span>{pendingInviteCode}</span>
          </div>
        ) : null}

        <form className="auth-form" onSubmit={onSubmit}>
          {mode === "register" ? (
            <label>
              Username
              <input name="username" required minLength={2} autoComplete="username" />
            </label>
          ) : null}
          <label>
            Email
            <input name="email" type="email" required autoComplete="email" />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              required
              minLength={6}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
          </label>
          <button className="primary-button wide" type="submit" disabled={loading}>
            {loading ? <Loader2 className="spin" size={18} /> : <Check size={18} />}
            {mode === "login" ? "Login" : "Create Account"}
          </button>
        </form>
      </section>
    </main>
  );
}

function MessageBubble({ message, user, onReact }) {
  const sender = message.sender;
  const senderId = getEntityId(sender);
  const userId = getEntityId(user);
  const isOwn = senderId === userId;
  const senderName =
    typeof sender === "object" && sender
      ? sender.username || sender.email || "Unknown"
      : isOwn
        ? user?.username || user?.email
        : "Unknown";
  const groupedReactions = (message.reactions || []).reduce((acc, reaction) => {
    if (!acc[reaction.emoji]) {
      acc[reaction.emoji] = [];
    }

    acc[reaction.emoji].push(reaction.user);
    return acc;
  }, {});

  return (
    <article className={`message-bubble ${isOwn ? "own" : ""}`}>
      {!isOwn ? <span className="message-sender">{senderName}</span> : null}
      <p>{message.content}</p>
      <time>{formatMessageTime(message.createdAt)}</time>
      {Object.keys(groupedReactions).length > 0 ? (
        <div className="reaction-row">
          {Object.entries(groupedReactions).map(([emoji, users]) => {
            const reactedByMe = users.some((reactionUser) => getEntityId(reactionUser) === userId);

            return (
              <button
                className={`reaction-chip ${reactedByMe ? "active" : ""}`}
                type="button"
                key={emoji}
                onClick={() => onReact(message._id, emoji)}
              >
                {emoji} {users.length}
              </button>
            );
          })}
        </div>
      ) : null}
      <div className="quick-reactions" aria-label="React to message">
        {REACTION_OPTIONS.map((emoji) => (
          <button type="button" key={emoji} onClick={() => onReact(message._id, emoji)}>
            {emoji}
          </button>
        ))}
      </div>
    </article>
  );
}

function EmptyState({ icon, title, text }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <strong>{title}</strong>
      {text ? <span>{text}</span> : null}
    </div>
  );
}

function Modal({ title, children, onClose }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="modal-panel" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <h2>{title}</h2>
          <button className="icon-button" type="button" title="Close" aria-label="Close" onClick={onClose}>
            <X />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

function Notice({ notice }) {
  if (!notice) return null;

  return (
    <div className={`notice ${notice.type}`}>
      <span>{notice.message}</span>
    </div>
  );
}
