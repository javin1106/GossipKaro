import { useEffect, useMemo, useRef, useState } from "react";
import {
  Avatar,
  Button,
  Chip,
  Input,
  Label,
  Modal as HeroModal,
  Surface,
  Tabs,
  TextField,
  Tooltip,
} from "@heroui/react";
import {
  ArrowLeft,
  Check,
  Copy,
  Download,
  DoorOpen,
  Edit3,
  Eye,
  EyeOff,
  File as FileIcon,
  Image as ImageIcon,
  KeyRound,
  Link as LinkIcon,
  Loader2,
  LogOut,
  MessageCircle,
  Paperclip,
  Plus,
  Reply,
  Send,
  ShieldCheck,
  Smile,
  Sparkles,
  Trash2,
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
import { reducePresenceEvent } from "./lib/presence.js";

const TOKEN_KEY = "gossipkaro.token";
const USER_KEY = "gossipkaro.user";
const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;
const TYPING_EMIT_INTERVAL_MS = 1500;
const EMOJI_OPTIONS = ["😀", "😂", "😍", "🔥", "👏", "🙏", "💯", "🎉", "❤️", "👍", "😎", "🤝"];
const REACTION_OPTIONS = ["👍", "❤️", "😂", "🔥", "👏", "😮"];

function getSenderName(sender, fallback = "Unknown") {
  if (typeof sender === "object" && sender) {
    return sender.username || sender.email || fallback;
  }

  return fallback;
}

function AppAvatar({ name, className = "", color = "default", size = "md" }) {
  return (
    <Avatar className={className} color={color} size={size}>
      <Avatar.Fallback>{getInitials(name)}</Avatar.Fallback>
    </Avatar>
  );
}

function IconAction({ label, children, placement = "top", ...buttonProps }) {
  return (
    <Tooltip delay={350} closeDelay={100}>
      <Button {...buttonProps} isIconOnly aria-label={label}>
        {children}
      </Button>
      <Tooltip.Content placement={placement} showArrow>
        {label}
      </Tooltip.Content>
    </Tooltip>
  );
}

function formatFileSize(size = 0) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function hasUsableAttachment(attachment) {
  if (!attachment) return false;

  return Boolean(
    attachment.fileName ||
      attachment.dataUrl ||
      attachment.mimeType ||
      (attachment.size !== undefined &&
        attachment.size !== null &&
        Number.isFinite(Number(attachment.size))),
  );
}

function fallbackMessageView(message) {
  const hasAttachment = hasUsableAttachment(message.attachment);

  return {
    content: message.isDeleted ? "This message was deleted" : message.content || "",
    attachmentDataUrl: hasAttachment ? message.attachment?.dataUrl || "" : "",
    attachmentLocked: false,
    attachmentFailed: false,
    locked: false,
    failed: false,
    reply: buildReplyView(message.replyTo),
  };
}

function buildReplyView(replyTo) {
  if (!replyTo) return null;

  const senderName = getSenderName(replyTo.sender);

  if (replyTo.isDeleted) {
    return {
      senderName,
      content: "Deleted message",
      locked: false,
      failed: false,
    };
  }

  return {
    senderName,
    content: replyTo.content || replyTo.attachment?.fileName || "Attachment",
    locked: false,
    failed: false,
  };
}

function getReplyPreview(message, view) {
  if (!message) return "";
  if (message.isDeleted) return "Deleted message";
  return view?.content || message.content || message.attachment?.fileName || "Attachment";
}

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
  const [otpChallenge, setOtpChallenge] = useState(null);
  const [passwordResetChallenge, setPasswordResetChallenge] = useState(null);
  const [replyTarget, setReplyTarget] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null);
  const [fileDraft, setFileDraft] = useState(null);

  const socketRef = useRef(null);
  const activeGroupRef = useRef("");
  const messageLoadRef = useRef("");
  const typingTimerRef = useRef(null);
  const lastTypingEmitRef = useRef(0);
  const autoJoinRef = useRef(false);
  const fileInputRef = useRef(null);
  const presenceStateRef = useRef({});

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

    presenceStateRef.current = {};
    setOnlineUsersByGroup({});

    const socket = io(SOCKET_URL, {
      auth: { token: auth.token },
      withCredentials: true,
    });

    socketRef.current = socket;
    setConnectionState("connecting");

    socket.on("connect", () => setConnectionState("online"));
    socket.on("disconnect", () => {
      setConnectionState("offline");
      presenceStateRef.current = {};
      setOnlineUsersByGroup({});
    });
    socket.on("connect_error", (error) => {
      setConnectionState("offline");
      showNotice(error.message || "Socket connection failed", "error");
    });

    socket.on("session-revoked", () => {
      clearAuth(false);
      showNotice("Your password changed. Log in again", "info");
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

    socket.on("message-updated", (message) => {
      const messageGroupId = getEntityId(message.group);
      if (messageGroupId !== activeGroupRef.current) return;

      setMessages((current) =>
        current.map((item) => (item._id === message._id ? message : item)),
      );
    });

    socket.on("message-deleted", ({ groupId, messageId }) => {
      if (groupId !== activeGroupRef.current) return;

      setMessages((current) =>
        current.map((message) => {
          if (message._id === messageId) {
            return {
              ...message,
              content: "[deleted]",
              attachment: null,
              reactions: [],
              isDeleted: true,
              deletedAt: new Date().toISOString(),
            };
          }

          if (getEntityId(message.replyTo) === messageId) {
            return {
              ...message,
              replyTo: {
                ...message.replyTo,
                content: "[deleted]",
                attachment: null,
                isDeleted: true,
              },
            };
          }

          return message;
        }),
      );
    });

    socket.on("unread-count-updated", ({ groupId, unreadCount }) => {
      setGroups((current) =>
        current.map((group) => (group._id === groupId ? { ...group, unreadCount } : group)),
      );
    });

    const applyPresenceEvent = (groupId, event) => {
      if (!groupId) return;

      const current = presenceStateRef.current[groupId] || {
        userIds: [],
        revision: 0,
      };
      const next = reducePresenceEvent(current, event);
      if (next === current) return;

      presenceStateRef.current[groupId] = next;
      setOnlineUsersByGroup((groups) => ({
        ...groups,
        [groupId]: next.userIds,
      }));
    };

    socket.on("online-users", ({ groupId, userIds, revision }) => {
      applyPresenceEvent(groupId, {
        type: "snapshot",
        userIds,
        revision,
      });
    });

    socket.on(
      "presence-updated",
      ({ groupId, userId, isOnline, revision }) => {
        applyPresenceEvent(groupId, {
          type: "delta",
          userId,
          isOnline,
          revision,
        });
      },
    );

    socket.on("group-members-updated", async ({ groupId }) => {
      await fetchGroups(auth.token);

      if (groupId === activeGroupRef.current) {
        const group = await fetchGroupDetails(groupId, auth.token);
        const memberIds = new Set(
          (group?.members || []).map((member) => getEntityId(member)),
        );
        const currentPresence = presenceStateRef.current[groupId];

        if (currentPresence) {
          const userIds = currentPresence.userIds.filter((id) =>
            memberIds.has(id),
          );
          presenceStateRef.current[groupId] = {
            ...currentPresence,
            userIds,
          };
          setOnlineUsersByGroup((current) => ({
            ...current,
            [groupId]: userIds,
          }));
        }
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
    presenceStateRef.current = {};
    setShowEmojiPicker(false);
    setReplyTarget(null);
    setEditingMessage(null);
    setFileDraft(null);
    setOtpChallenge(null);
    setPasswordResetChallenge(null);
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

    const form = new FormData(event.currentTarget);
    const password = form.get("password");

    if (authMode === "register" && password !== form.get("confirmPassword")) {
      showNotice("Passwords do not match", "error");
      return;
    }

    setActionLoading(authMode);

    const payload =
      authMode === "login"
        ? {
            email: form.get("email")?.trim(),
            password,
          }
        : {
            username: form.get("username")?.trim(),
            email: form.get("email")?.trim(),
            password,
          };

    try {
      const response = await apiRequest(`/api/auth/${authMode}`, {
        method: "POST",
        body: payload,
      });

      if (authMode === "register") {
        setOtpChallenge({
          email: response.data.email,
        });
        showNotice("OTP sent to your email", "success");
        return;
      }

      const nextAuth = {
        token: response.data.accessToken,
        user: response.data.user,
      };

      saveAuth(nextAuth);
      await fetchGroups(nextAuth.token);
      showNotice(authMode === "login" ? "Welcome back" : "Account ready", "success");
    } catch (error) {
      if (authMode === "login" && error.message?.toLowerCase().includes("verify")) {
        setOtpChallenge({
          email: payload.email,
        });
      }

      showNotice(error.message, "error");
    } finally {
      setActionLoading("");
    }
  }

  async function verifyOtp(event) {
    event.preventDefault();
    if (!otpChallenge?.email) return;

    setActionLoading("verify-otp");

    const form = new FormData(event.currentTarget);
    const otp = form.get("otp")?.trim();

    try {
      const response = await apiRequest("/api/auth/verify-otp", {
        method: "POST",
        body: {
          email: otpChallenge.email,
          otp,
        },
      });

      const nextAuth = {
        token: response.data.accessToken,
        user: response.data.user,
      };

      saveAuth(nextAuth);
      setOtpChallenge(null);
      await fetchGroups(nextAuth.token);
      showNotice("Account verified", "success");
    } catch (error) {
      showNotice(error.message, "error");
    } finally {
      setActionLoading("");
    }
  }

  async function resendOtp() {
    if (!otpChallenge?.email) return;

    setActionLoading("resend-otp");

    try {
      await apiRequest("/api/auth/resend-otp", {
        method: "POST",
        body: { email: otpChallenge.email },
      });

      showNotice("OTP resent to your email", "success");
    } catch (error) {
      showNotice(error.message, "error");
    } finally {
      setActionLoading("");
    }
  }

  function startPasswordReset() {
    setOtpChallenge(null);
    setPasswordResetChallenge({ stage: "request", email: "" });
    setNotice(null);
  }

  async function requestPasswordReset(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = form.get("email")?.trim();

    setActionLoading("forgot-password");

    try {
      const response = await apiRequest("/api/auth/forgot-password", {
        method: "POST",
        body: { email },
      });

      setPasswordResetChallenge({
        stage: "reset",
        email: response.data?.email || email,
      });
      showNotice(response.message, "success");
    } catch (error) {
      showNotice(error.message, "error");
    } finally {
      setActionLoading("");
    }
  }

  async function resetPassword(event) {
    event.preventDefault();
    if (!passwordResetChallenge?.email) return;

    const form = new FormData(event.currentTarget);
    const password = form.get("password");

    if (password !== form.get("confirmPassword")) {
      showNotice("Passwords do not match", "error");
      return;
    }

    setActionLoading("reset-password");

    try {
      await apiRequest("/api/auth/reset-password", {
        method: "POST",
        body: {
          email: passwordResetChallenge.email,
          otp: form.get("otp")?.trim(),
          password,
        },
      });

      setPasswordResetChallenge(null);
      setAuthMode("login");
      showNotice("Password updated. You can now log in", "success");
    } catch (error) {
      showNotice(error.message, "error");
    } finally {
      setActionLoading("");
    }
  }

  async function resendPasswordReset() {
    if (!passwordResetChallenge?.email) return;

    setActionLoading("resend-reset");

    try {
      const response = await apiRequest("/api/auth/forgot-password", {
        method: "POST",
        body: { email: passwordResetChallenge.email },
      });
      showNotice(response.message, "success");
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
    setMessageDraft("");
    setReplyTarget(null);
    setEditingMessage(null);
    setFileDraft(null);
    setShowEmojiPicker(false);
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

      const groupId = response.data._id;

      await fetchGroups(auth.token, groupId);
      setModal(null);
      await selectGroup(groupId);
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

      const leftGroupId = activeGroupId;
      setActiveGroupId("");
      setMessages([]);
      setReplyTarget(null);
      setEditingMessage(null);
      setFileDraft(null);
      delete presenceStateRef.current[leftGroupId];
      setOnlineUsersByGroup((current) => {
        const next = { ...current };
        delete next[leftGroupId];
        return next;
      });
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

    const now = Date.now();
    if (now - lastTypingEmitRef.current >= TYPING_EMIT_INTERVAL_MS) {
      socketRef.current.emit("typing", { groupId: activeGroupId });
      lastTypingEmitRef.current = now;
    }

    window.clearTimeout(typingTimerRef.current);
    typingTimerRef.current = window.setTimeout(() => {
      socketRef.current?.emit("stop-typing", { groupId: activeGroupId });
      lastTypingEmitRef.current = 0;
    }, 1100);
  }

  function clearComposer() {
    setMessageDraft("");
    setReplyTarget(null);
    setEditingMessage(null);
    setFileDraft(null);
    setShowEmojiPicker(false);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function handleFileSelect(event) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    if (file.size > MAX_ATTACHMENT_BYTES) {
      showNotice("Files must be 2MB or smaller", "error");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setFileDraft({
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
        dataUrl: reader.result,
      });
    };
    reader.onerror = () => showNotice("Could not read file", "error");
    reader.readAsDataURL(file);
  }

  function startReply(message) {
    if (message.isDeleted) return;
    setReplyTarget(message);
    setEditingMessage(null);
  }

  function startEditMessage(message) {
    if (message.isDeleted || message.messageType !== "text") return;

    const view = fallbackMessageView(message);

    setEditingMessage(message);
    setReplyTarget(null);
    setFileDraft(null);
    setMessageDraft(view.content || "");
  }

  function deleteMessage(message) {
    if (!activeGroupId || !socketRef.current?.connected || message.isDeleted) return;
    if (!window.confirm("Delete this message?")) return;

    socketRef.current.emit("delete-message", {
      groupId: activeGroupId,
      messageId: message._id,
    });

    if (replyTarget?._id === message._id || editingMessage?._id === message._id) {
      clearComposer();
    }
  }

  async function sendMessage(event) {
    event.preventDefault();
    const content = messageDraft.trim();

    if ((!content && !fileDraft) || !activeGroupId) return;

    if (!socketRef.current?.connected) {
      showNotice("Realtime connection is offline", "error");
      return;
    }

    setActionLoading("send-message");

    try {
      const outgoingContent = content || fileDraft?.fileName || "Attachment";

      if (editingMessage) {
        socketRef.current.emit("edit-message", {
          groupId: activeGroupId,
          messageId: editingMessage._id,
          content: outgoingContent,
        });
      } else {
        let attachment = null;

        if (fileDraft) {
          attachment = {
            fileName: fileDraft.fileName,
            mimeType: fileDraft.mimeType,
            size: fileDraft.size,
            dataUrl: fileDraft.dataUrl,
          };
        }

        socketRef.current.emit("send-message", {
          groupId: activeGroupId,
          content: outgoingContent,
          replyTo: replyTarget?._id,
          messageType: fileDraft?.mimeType?.startsWith("image/") ? "image" : fileDraft ? "file" : "text",
          attachment,
        });
      }

      socketRef.current.emit("stop-typing", { groupId: activeGroupId });
      clearComposer();
    } catch {
      showNotice("Could not send the message", "error");
    } finally {
      setActionLoading("");
    }
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
          otpChallenge={otpChallenge}
          passwordResetChallenge={passwordResetChallenge}
          loading={
            actionLoading === "login" ||
            actionLoading === "register" ||
            actionLoading === "verify-otp" ||
            actionLoading === "forgot-password" ||
            actionLoading === "reset-password"
          }
          resendLoading={
            actionLoading === "resend-otp" || actionLoading === "resend-reset"
          }
          onModeChange={setAuthMode}
          onSubmit={handleAuthSubmit}
          onVerifyOtp={verifyOtp}
          onResendOtp={resendOtp}
          onCancelOtp={() => setOtpChallenge(null)}
          onForgotPassword={startPasswordReset}
          onRequestPasswordReset={requestPasswordReset}
          onResetPassword={resetPassword}
          onResendPasswordReset={resendPasswordReset}
          onCancelPasswordReset={() => setPasswordResetChallenge(null)}
          onChangeResetEmail={() =>
            setPasswordResetChallenge({ stage: "request", email: "" })
          }
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
              <AppAvatar
                className="profile-avatar"
                color="default"
                name={auth.user?.username || auth.user?.email}
              />
              <div>
                <p>{auth.user?.username || "GossipKaro"}</p>
                <Chip
                  className="connection-chip"
                  color={connectionState === "online" ? "success" : "warning"}
                  size="sm"
                  variant="soft"
                >
                  {connectionState}
                </Chip>
              </div>
            </div>
            <IconAction
              className="icon-button danger"
              type="button"
              label="Logout"
              variant="danger"
              onClick={handleLogout}
              isDisabled={actionLoading === "logout"}
            >
              {actionLoading === "logout" ? <Loader2 className="spin" /> : <LogOut />}
            </IconAction>
          </div>

          <div className="sidebar-actions">
            <Button className="primary-button" type="button" variant="primary" onClick={() => setModal("create")}>
              <Plus size={18} />
              New Group
            </Button>
            <Button className="secondary-button" type="button" variant="secondary" onClick={() => setModal("join")}>
              <UserPlus size={18} />
              Join
            </Button>
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
                <Button
                  className={`group-row ${group._id === activeGroupId ? "active" : ""}`}
                  type="button"
                  variant="tertiary"
                  key={group._id}
                  onClick={() => selectGroup(group._id)}
                >
                  <AppAvatar
                    className="group-avatar"
                    color={group._id === activeGroupId ? "success" : "accent"}
                    name={group.groupName}
                  />
                  <span className="group-main">
                    <strong>{group.groupName}</strong>
                    <small>{group.description || `${group.members?.length || 0} members`}</small>
                  </span>
                  <span className="group-meta">
                    {group.unreadCount > 0 ? (
                      <Chip className="unread-badge" color="success" size="sm" variant="primary">
                        {group.unreadCount}
                      </Chip>
                    ) : (
                      <span className="group-date">{formatGroupDate(group.updatedAt)}</span>
                    )}
                  </span>
                </Button>
              ))
            )}
          </div>
        </aside>

        <section className="chat-panel">
          {activeGroup ? (
            <>
              <header className="chat-header">
                <div className="chat-title">
                  <AppAvatar
                    className="group-avatar large"
                    color="success"
                    name={activeGroup.groupName}
                    size="lg"
                  />
                  <div>
                    <h1>{activeGroup.groupName}</h1>
                    <p>
                      {activeGroup.members?.length || 0} members
                      {activeOnlineUserIds.length > 0 ? ` · ${activeOnlineUserIds.length} online` : ""}
                    </p>
                  </div>
                </div>

                <div className="chat-actions">
                  <Button className="icon-text-button" type="button" variant="secondary" onClick={() => setModal("members")}>
                    <Users size={18} />
                    Members
                  </Button>
                  <Button
                    className="icon-text-button"
                    type="button"
                    variant="secondary"
                    onClick={generateInvite}
                    isDisabled={actionLoading === "invite"}
                  >
                    {actionLoading === "invite" ? (
                      <Loader2 className="spin" size={18} />
                    ) : (
                      <LinkIcon size={18} />
                    )}
                    Invite
                  </Button>
                  <IconAction
                    className="icon-button danger"
                    type="button"
                    label="Leave group"
                    placement="bottom"
                    variant="danger"
                    onClick={leaveGroup}
                    isDisabled={actionLoading === "leave"}
                  >
                    {actionLoading === "leave" ? <Loader2 className="spin" /> : <DoorOpen />}
                  </IconAction>
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
                      onReply={startReply}
                      onEdit={startEditMessage}
                      onDelete={deleteMessage}
                    />
                  ))
                )}
              </div>

              <div className="typing-line">
                {typingNames.length > 0 ? `${typingNames.join(", ")} typing...` : ""}
              </div>

              <div className="composer-shell">
                {replyTarget ? (
                  <div className="composer-context">
                    <Reply size={17} />
                    <div>
                      <strong>
                        Replying to {getSenderName(replyTarget.sender, "message")}
                      </strong>
                      <span>
                        {getReplyPreview(replyTarget, fallbackMessageView(replyTarget))}
                      </span>
                    </div>
                    <IconAction
                      className="icon-button subtle"
                      type="button"
                      label="Cancel reply"
                      variant="tertiary"
                      onClick={() => setReplyTarget(null)}
                    >
                      <X />
                    </IconAction>
                  </div>
                ) : null}

                {editingMessage ? (
                  <div className="composer-context edit">
                    <Edit3 size={17} />
                    <div>
                      <strong>Editing message</strong>
                      <span>{getReplyPreview(editingMessage, fallbackMessageView(editingMessage))}</span>
                    </div>
                    <IconAction
                      className="icon-button subtle"
                      type="button"
                      label="Cancel edit"
                      variant="tertiary"
                      onClick={clearComposer}
                    >
                      <X />
                    </IconAction>
                  </div>
                ) : null}

                {fileDraft ? (
                  <div className="file-draft">
                    <div className="file-draft-icon">
                      {fileDraft.mimeType.startsWith("image/") ? <ImageIcon /> : <FileIcon />}
                    </div>
                    <div>
                      <strong>{fileDraft.fileName}</strong>
                      <span>{formatFileSize(fileDraft.size)}</span>
                    </div>
                    <IconAction
                      className="icon-button subtle"
                      type="button"
                      label="Remove file"
                      variant="tertiary"
                      onClick={() => setFileDraft(null)}
                    >
                      <X />
                    </IconAction>
                  </div>
                ) : null}

                <form className="composer" onSubmit={sendMessage}>
                  <div className="emoji-wrap">
                    <IconAction
                      className="icon-button"
                      type="button"
                      label="Add emoji"
                      placement="top"
                      variant="tertiary"
                      onClick={() => setShowEmojiPicker((current) => !current)}
                    >
                      <Smile />
                    </IconAction>
                    {showEmojiPicker ? (
                      <div className="emoji-picker">
                        {EMOJI_OPTIONS.map((emoji) => (
                          <Button
                            isIconOnly
                            type="button"
                            key={emoji}
                            variant="tertiary"
                            aria-label={`Add ${emoji}`}
                            onClick={() => addEmoji(emoji)}
                          >
                            {emoji}
                          </Button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <IconAction
                    className="icon-button composer-tool"
                    type="button"
                    label="Attach file"
                    variant="tertiary"
                    onClick={() => fileInputRef.current?.click()}
                    isDisabled={Boolean(editingMessage)}
                  >
                    <Paperclip />
                  </IconAction>
                  <input
                    ref={fileInputRef}
                    className="file-input"
                    type="file"
                    accept="image/*,.pdf,.txt,.csv,.json,.md,.doc,.docx"
                    onChange={handleFileSelect}
                  />
                  <Input
                    className="message-input"
                    value={messageDraft}
                    onChange={handleDraftChange}
                    placeholder={editingMessage ? "Edit message" : "Message"}
                    aria-label="Message"
                  />
                  <IconAction
                    className="send-button"
                    type="submit"
                    label="Send message"
                    variant="primary"
                    isDisabled={actionLoading === "send-message"}
                  >
                    {actionLoading === "send-message" ? <Loader2 className="spin" size={20} /> : <Send size={20} />}
                  </IconAction>
                </form>
              </div>
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
        <AppModal title="New Group" onClose={() => setModal(null)}>
          <form className="modal-form" onSubmit={createGroup}>
            <TextField fullWidth isRequired name="groupName">
              <Label>Group name</Label>
              <Input autoFocus maxLength={50} placeholder="Weekend plans" />
            </TextField>
            <TextField fullWidth name="description">
              <Label>Description</Label>
              <Input maxLength={200} placeholder="What is this group about?" />
            </TextField>
            <div className="modal-actions">
              <Button className="secondary-button" type="button" variant="secondary" onClick={() => setModal(null)}>
                Cancel
              </Button>
              <Button
                className="primary-button"
                type="submit"
                variant="primary"
                isDisabled={actionLoading === "create-group"}
              >
                {actionLoading === "create-group" ? <Loader2 className="spin" size={18} /> : <Plus size={18} />}
                Create
              </Button>
            </div>
          </form>
        </AppModal>
      )}

      {modal === "join" && (
        <AppModal title="Join Group" onClose={() => setModal(null)}>
          <form className="modal-form" onSubmit={joinGroup}>
            <TextField defaultValue={pendingInviteCode} fullWidth isRequired name="inviteCode">
              <Label>Invite code</Label>
              <Input autoFocus placeholder="Enter invite code" />
            </TextField>
            <div className="modal-actions">
              <Button className="secondary-button" type="button" variant="secondary" onClick={() => setModal(null)}>
                Cancel
              </Button>
              <Button
                className="primary-button"
                type="submit"
                variant="primary"
                isDisabled={actionLoading === "join-group"}
              >
                {actionLoading === "join-group" ? <Loader2 className="spin" size={18} /> : <UserPlus size={18} />}
                Join
              </Button>
            </div>
          </form>
        </AppModal>
      )}

      {modal === "invite" && inviteResult && (
        <AppModal title="Invite" onClose={() => setModal(null)}>
          <div className="invite-box">
            <div>
              <span>Code</span>
              <strong>{inviteResult.code}</strong>
            </div>
            <IconAction
              className="icon-button"
              type="button"
              label="Copy code"
              variant="tertiary"
              onClick={() => copyInvite(inviteResult.code)}
            >
              <Copy />
            </IconAction>
          </div>
          <div className="invite-box">
            <div>
              <span>Link</span>
              <strong>{inviteResult.url}</strong>
            </div>
            <IconAction
              className="icon-button"
              type="button"
              label="Copy link"
              variant="tertiary"
              onClick={() => copyInvite(inviteResult.url)}
            >
              <Copy />
            </IconAction>
          </div>
        </AppModal>
      )}

      {modal === "members" && activeGroup && (
        <AppModal title={`${activeGroup.groupName} Members`} onClose={() => setModal(null)}>
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
                  <AppAvatar className="member-avatar" name={memberName} size="sm" />
                  <div>
                    <strong>{memberName}</strong>
                    {typeof member === "object" && member?.email ? (
                      <span>
                        {member.email}
                        {activeOnlineUserIds.includes(memberId) ? " · Online" : ""}
                      </span>
                    ) : null}
                  </div>
                  {isAdmin ? <Chip color="accent" size="sm" variant="soft">Admin</Chip> : null}
                </div>
              );
            })}
          </div>
        </AppModal>
      )}

      <Notice notice={notice} />
    </>
  );
}

function AuthScreen({
  mode,
  pendingInviteCode,
  otpChallenge,
  passwordResetChallenge,
  loading,
  resendLoading,
  onModeChange,
  onSubmit,
  onVerifyOtp,
  onResendOtp,
  onCancelOtp,
  onForgotPassword,
  onRequestPasswordReset,
  onResetPassword,
  onResendPasswordReset,
  onCancelPasswordReset,
  onChangeResetEmail,
}) {
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

      <Surface className="auth-panel">
        {passwordResetChallenge ? (
          <PasswordResetFlow
            challenge={passwordResetChallenge}
            loading={loading}
            resendLoading={resendLoading}
            onRequest={onRequestPasswordReset}
            onReset={onResetPassword}
            onResend={onResendPasswordReset}
            onCancel={onCancelPasswordReset}
            onChangeEmail={onChangeResetEmail}
          />
        ) : otpChallenge ? (
          <form className="auth-form" onSubmit={onVerifyOtp}>
            <AuthHeading
              icon={<ShieldCheck size={21} />}
              title="Verify your email"
            />
            <div className="pending-invite">
              <ShieldCheck size={16} />
              <span>{otpChallenge.email}</span>
            </div>
            <TextField fullWidth isRequired name="otp">
              <Label>Verification code</Label>
              <Input
                autoComplete="one-time-code"
                autoFocus
                inputMode="numeric"
                maxLength={6}
                pattern="[0-9]{6}"
                placeholder="6-digit code"
              />
            </TextField>
            <Button className="primary-button wide" type="submit" variant="primary" isDisabled={loading}>
              {loading ? <Loader2 className="spin" size={18} /> : <Check size={18} />}
              Verify Account
            </Button>
            <div className="auth-inline-actions">
              <Button
                className="secondary-button"
                type="button"
                variant="secondary"
                onClick={onResendOtp}
                isDisabled={resendLoading}
              >
                {resendLoading ? <Loader2 className="spin" size={18} /> : <Sparkles size={18} />}
                Resend OTP
              </Button>
              <Button className="secondary-button" type="button" variant="secondary" onClick={onCancelOtp}>
                Back
              </Button>
            </div>
          </form>
        ) : (
          <>
            {pendingInviteCode ? (
              <div className="pending-invite">
                <LinkIcon size={16} />
                <span>{pendingInviteCode}</span>
              </div>
            ) : null}
            <Tabs
              className="auth-tabs"
              selectedKey={mode}
              onSelectionChange={(key) => onModeChange(String(key))}
            >
              <Tabs.ListContainer>
                <Tabs.List aria-label="Authentication">
                  <Tabs.Tab id="login">
                    Login
                    <Tabs.Indicator />
                  </Tabs.Tab>
                  <Tabs.Tab id="register">
                    Register
                    <Tabs.Indicator />
                  </Tabs.Tab>
                </Tabs.List>
              </Tabs.ListContainer>
              <Tabs.Panel id="login">
                <CredentialsForm
                  loading={loading}
                  mode="login"
                  onForgotPassword={onForgotPassword}
                  onSubmit={onSubmit}
                />
              </Tabs.Panel>
              <Tabs.Panel id="register">
                <CredentialsForm
                  loading={loading}
                  mode="register"
                  onSubmit={onSubmit}
                />
              </Tabs.Panel>
            </Tabs>
          </>
        )}
      </Surface>
    </main>
  );
}

function AuthHeading({ icon, title }) {
  return (
    <div className="auth-heading">
      <span>{icon}</span>
      <h2>{title}</h2>
    </div>
  );
}

function PasswordField({
  autoComplete,
  label,
  minLength = 8,
  name,
  placeholder,
}) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <TextField fullWidth isRequired name={name} type={isVisible ? "text" : "password"}>
      <Label>{label}</Label>
      <div className="password-input-wrap">
        <Input
          autoComplete={autoComplete}
          maxLength={72}
          minLength={minLength}
          placeholder={placeholder}
        />
        <IconAction
          className="password-toggle"
          label={isVisible ? "Hide password" : "Show password"}
          placement="left"
          type="button"
          variant="secondary"
          onClick={() => setIsVisible((current) => !current)}
        >
          {isVisible ? <EyeOff size={18} /> : <Eye size={18} />}
        </IconAction>
      </div>
    </TextField>
  );
}

function PasswordResetFlow({
  challenge,
  loading,
  resendLoading,
  onRequest,
  onReset,
  onResend,
  onCancel,
  onChangeEmail,
}) {
  if (challenge.stage === "request") {
    return (
      <form className="auth-form" onSubmit={onRequest}>
        <AuthHeading icon={<KeyRound size={21} />} title="Reset password" />
        <TextField fullWidth isRequired name="email" type="email">
          <Label>Email</Label>
          <Input autoComplete="email" autoFocus placeholder="you@example.com" />
        </TextField>
        <Button className="primary-button wide" type="submit" variant="primary" isDisabled={loading}>
          {loading ? <Loader2 className="spin" size={18} /> : <Check size={18} />}
          Send Reset Code
        </Button>
        <Button className="secondary-button wide" type="button" variant="secondary" onClick={onCancel}>
          <ArrowLeft size={18} />
          Back to Login
        </Button>
      </form>
    );
  }

  return (
    <form className="auth-form" onSubmit={onReset}>
      <AuthHeading icon={<KeyRound size={21} />} title="Choose new password" />
      <div className="pending-invite">
        <ShieldCheck size={16} />
        <span>{challenge.email}</span>
      </div>
      <TextField fullWidth isRequired name="otp">
        <Label>Reset code</Label>
        <Input
          autoComplete="one-time-code"
          autoFocus
          inputMode="numeric"
          maxLength={6}
          pattern="[0-9]{6}"
          placeholder="6-digit code"
        />
      </TextField>
      <PasswordField
        autoComplete="new-password"
        label="New password"
        name="password"
        placeholder="8 or more characters"
      />
      <PasswordField
        autoComplete="new-password"
        label="Confirm new password"
        name="confirmPassword"
        placeholder="Repeat your password"
      />
      <Button className="primary-button wide" type="submit" variant="primary" isDisabled={loading}>
        {loading ? <Loader2 className="spin" size={18} /> : <Check size={18} />}
        Update Password
      </Button>
      <div className="auth-inline-actions">
        <Button
          className="secondary-button"
          type="button"
          variant="secondary"
          onClick={onResend}
          isDisabled={resendLoading}
        >
          {resendLoading ? <Loader2 className="spin" size={18} /> : <Sparkles size={18} />}
          Resend Code
        </Button>
        <Button className="secondary-button" type="button" variant="secondary" onClick={onChangeEmail}>
          Change Email
        </Button>
      </div>
    </form>
  );
}

function CredentialsForm({ loading, mode, onForgotPassword, onSubmit }) {
  return (
    <form className="auth-form" onSubmit={onSubmit}>
      <AuthHeading
        icon={mode === "login" ? <MessageCircle size={21} /> : <UserPlus size={21} />}
        title={mode === "login" ? "Welcome back" : "Create your account"}
      />
      {mode === "register" ? (
        <TextField fullWidth isRequired name="username">
          <Label>Username</Label>
          <Input autoComplete="username" maxLength={30} minLength={2} placeholder="Your display name" />
        </TextField>
      ) : null}
      <TextField fullWidth isRequired name="email" type="email">
        <Label>Email</Label>
        <Input autoComplete="email" placeholder="you@example.com" />
      </TextField>
      <PasswordField
        autoComplete={mode === "login" ? "current-password" : "new-password"}
        label="Password"
        minLength={mode === "login" ? 1 : 8}
        name="password"
        placeholder={mode === "login" ? "Your password" : "8 or more characters"}
      />
      {mode === "register" ? (
        <PasswordField
          autoComplete="new-password"
          label="Confirm password"
          name="confirmPassword"
          placeholder="Repeat your password"
        />
      ) : (
        <Button
          className="text-button forgot-password-button"
          type="button"
          variant="secondary"
          onClick={onForgotPassword}
        >
          Forgot password?
        </Button>
      )}
      <Button className="primary-button wide" type="submit" variant="primary" isDisabled={loading}>
        {loading ? <Loader2 className="spin" size={18} /> : <Check size={18} />}
        {mode === "login" ? "Login" : "Send OTP"}
      </Button>
    </form>
  );
}

function MessageBubble({ message, user, onReact, onReply, onEdit, onDelete }) {
  const sender = message.sender;
  const senderId = getEntityId(sender);
  const userId = getEntityId(user);
  const isOwn = senderId === userId;
  const senderName = getSenderName(
    sender,
    isOwn ? user?.username || user?.email || "You" : "Unknown",
  );
  const display = fallbackMessageView(message);
  const canManage = isOwn && !message.isDeleted;
  const hasAttachment = hasUsableAttachment(message.attachment);
  const showMessageText =
    display.content &&
    (!hasAttachment ||
      message.isDeleted ||
      display.content !== message.attachment.fileName);
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
      {display.reply ? (
        <div className={`message-reply-preview ${display.reply.locked || display.reply.failed ? "locked" : ""}`}>
          <strong>{display.reply.senderName}</strong>
          <span>{display.reply.content}</span>
        </div>
      ) : null}
      <MessageAttachment
        attachment={message.attachment}
        dataUrl={display.attachmentDataUrl}
        messageType={message.messageType}
      />
      {showMessageText ? (
        <p className={message.isDeleted ? "deleted-text" : display.locked || display.failed ? "locked-text" : ""}>
          {display.content}
        </p>
      ) : null}
      <div className="message-meta">
        {message.isEdited && !message.isDeleted ? <span>edited</span> : null}
        <time>{formatMessageTime(message.createdAt)}</time>
      </div>
      {!message.isDeleted && Object.keys(groupedReactions).length > 0 ? (
        <div className="reaction-row">
          {Object.entries(groupedReactions).map(([emoji, users]) => {
            const reactedByMe = users.some((reactionUser) => getEntityId(reactionUser) === userId);

            return (
              <Button
                className={`reaction-chip ${reactedByMe ? "active" : ""}`}
                type="button"
                key={emoji}
                size="sm"
                variant={reactedByMe ? "secondary" : "tertiary"}
                onClick={() => onReact(message._id, emoji)}
              >
                {emoji} {users.length}
              </Button>
            );
          })}
        </div>
      ) : null}
      {!message.isDeleted ? (
        <div className="quick-reactions" aria-label="Message actions">
          <div className="reaction-buttons">
            {REACTION_OPTIONS.map((emoji) => (
              <Button
                isIconOnly
                className="quick-reaction-button"
                type="button"
                key={emoji}
                size="sm"
                variant="tertiary"
                aria-label={`React with ${emoji}`}
                onClick={() => onReact(message._id, emoji)}
              >
                {emoji}
              </Button>
            ))}
          </div>
          <div className="message-tools">
            <IconAction
              className="message-tool"
              type="button"
              label="Reply"
              size="sm"
              variant="tertiary"
              onClick={() => onReply(message)}
            >
              <Reply size={14} />
            </IconAction>
            {canManage && message.messageType === "text" ? (
              <IconAction
                className="message-tool"
                type="button"
                label="Edit"
                size="sm"
                variant="tertiary"
                onClick={() => onEdit(message)}
              >
                <Edit3 size={14} />
              </IconAction>
            ) : null}
            {canManage ? (
              <IconAction
                className="message-tool danger"
                type="button"
                label="Delete"
                size="sm"
                variant="danger-soft"
                onClick={() => onDelete(message)}
              >
                <Trash2 size={14} />
              </IconAction>
            ) : null}
          </div>
        </div>
      ) : null}
    </article>
  );
}

function MessageAttachment({ attachment, dataUrl, messageType }) {
  if (!hasUsableAttachment(attachment)) return null;

  const title = attachment.fileName || "Attachment";
  const isImage = messageType === "image" && dataUrl?.startsWith("data:image/");

  if (!dataUrl) {
    return (
      <div className="attachment-card muted">
        <FileIcon size={18} />
        <div>
          <strong>{title}</strong>
          <span>{attachment.size ? formatFileSize(attachment.size) : "File"}</span>
        </div>
      </div>
    );
  }

  if (isImage) {
    return (
      <a className="image-attachment" href={dataUrl} download={title}>
        <img src={dataUrl} alt={title} />
      </a>
    );
  }

  return (
    <a className="attachment-card" href={dataUrl} download={title}>
      <FileIcon size={18} />
      <div>
        <strong>{title}</strong>
        <span>{formatFileSize(attachment.size)}</span>
      </div>
      <Download size={17} />
    </a>
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

function AppModal({ title, children, onClose }) {
  return (
    <HeroModal>
      <HeroModal.Backdrop
        isOpen
        isDismissable
        variant="blur"
        onOpenChange={(isOpen) => {
          if (!isOpen) onClose();
        }}
      >
        <HeroModal.Container placement="center" size="md">
          <HeroModal.Dialog className="app-modal">
            <HeroModal.CloseTrigger aria-label="Close dialog" onPress={onClose}>
              <X size={18} />
            </HeroModal.CloseTrigger>
            <HeroModal.Header>
              <HeroModal.Heading>{title}</HeroModal.Heading>
            </HeroModal.Header>
            <HeroModal.Body>{children}</HeroModal.Body>
          </HeroModal.Dialog>
        </HeroModal.Container>
      </HeroModal.Backdrop>
    </HeroModal>
  );
}

function Notice({ notice }) {
  if (!notice) return null;

  return (
    <div className={`notice ${notice.type}`} role={notice.type === "error" ? "alert" : "status"}>
      <span>{notice.message}</span>
    </div>
  );
}
