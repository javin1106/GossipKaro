import { io } from "socket.io-client";

// Replace with real token from login
const TOKEN =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY5N2E2NThmNWQ4ODAyZThjODUwNjllZiIsImVtYWlsIjoibmV3dXNlckBleGFtcGxlLmNvbSIsInVzZXJuYW1lIjoibmV3dXNlcjEyMyIsImlhdCI6MTc2OTYyOTE5MywiZXhwIjoxNzY5NzE1NTkzfQ.7PAskTMK0J3KeaooOhab44Bj1IFosUaxKu0jsBMJgow";
const GROUP_ID = "697a6794c2182e38bcd9de58"; // Real group ID from your DB

const socket = io("http://localhost:5000", {
  auth: { token: TOKEN },
});

socket.on("connect", () => {
  console.log("✅ Connected:", socket.id);

  // Test join group
  socket.emit("join-group", GROUP_ID);

  // Test send message
  setTimeout(() => {
    socket.emit("send-message", {
      groupId: GROUP_ID,
      content: "Hello from test script!",
    });
  }, 1000);
});

socket.on("new-message", (msg) => {
  console.log("📩 New message:", msg);
});

socket.on("user-typing", ({ username, userId }) => {
  console.log(`${username} is typing...`);
});

socket.on("user-stopped-typing", ({ userId }) => {
  console.log(`${userId} stopped typing...`);
});

socket.on("error", (err) => {
  console.log("❌ Error:", err);
});