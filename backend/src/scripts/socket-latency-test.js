import { io } from "socket.io-client";

const TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY5NTdjMTNkMDMyZTFmOTU4YWRlMTJlZSIsImVtYWlsIjoiamF2aW4uY2h1dGFuaUBnbWFpbC5jb20iLCJpYXQiOjE3Njk3OTIwODksImV4cCI6MTc2OTg3ODQ4OX0.thk2zLlxypz1hpl0WvXvAOuomtk5zj5uR6bRCJqkjGc"; // Replace with valid token
const GROUP_ID = "697d780c7db2db4e555cd5d4"; // Replace with valid group ID

const socket = io("http://localhost:5000", {
  auth: { token: TOKEN },
});

let start;

// Register listener BEFORE emitting
socket.on("new-message", (msg) => {
  if (msg.content === "Latency test") {
    const latency = Date.now() - start;
    console.log(`📊 Message latency: ${latency}ms`);
    process.exit(0); // Exit after measurement
  }
});

socket.on("connect", () => {
  console.log("✅ Connected:", socket.id);
  socket.emit("join-group", GROUP_ID);

  // Wait a bit for join-group to complete
  setTimeout(() => {
    start = Date.now();
    socket.emit("send-message", {
      groupId: GROUP_ID,
      content: "Latency test",
    });
  }, 100);
});

socket.on("error", (err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});

socket.on("connect_error", (err) => {
  console.error("❌ Connection error:", err.message);
  process.exit(1);
});