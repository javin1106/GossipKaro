# GossipKaro

GossipKaro is a real-time group chat app with a React frontend, an Express backend, Socket.IO live messaging, JWT authentication, and MongoDB persistence.

The app is currently structured as two separate projects:

- `backend/` - Express API, MongoDB models, JWT auth, Socket.IO server
- `frontend/` - Vite + React chat UI

It is not deployed yet. Run it locally with the commands below.

## Features

- Register and login with JWT auth
- Verify new accounts with Redis-backed OTP
- Create chat groups
- Join groups using invite codes or invite links
- WhatsApp-inspired responsive chat UI
- View your groups and active group details
- View all members in a group
- Send and receive messages in real time with Socket.IO
- Reply to specific messages
- Edit and soft-delete your own messages
- Share images and small files up to 2MB
- Typing indicators
- Online presence per group
- Unread message badges
- Emoji message composer
- Message reactions
- Leave groups
- Automatic group member refresh when users join or leave

## Tech Stack

### Frontend

- React 18
- Vite
- Socket.IO Client
- Lucide React icons

### Backend

- Node.js
- Express 5
- Socket.IO
- Redis and Socket.IO Redis adapter for horizontal scaling
- MongoDB + Mongoose
- JWT
- bcryptjs
- cookie-parser
- cors

## Project Structure

```text
GossipKaro/
├── backend/
│   ├── src/
│   │   ├── app.js
│   │   ├── server.js
│   │   ├── socket.js
│   │   ├── config/
│   │   ├── controllers/
│   │   ├── middleware/
│   │   ├── models/
│   │   ├── routes/
│   │   ├── scripts/
│   │   └── utils/
│   ├── package.json
│   └── package-lock.json
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   ├── styles.css
│   │   └── lib/
│   ├── index.html
│   ├── vite.config.js
│   ├── package.json
│   └── package-lock.json
├── scripts/
│   └── dev.js
├── .env
├── package.json
└── README.md
```

## Local Setup

### 1. Install Dependencies

From the project root:

```powershell
npm --prefix backend install
npm --prefix frontend install
```

### 2. Configure Environment Variables

Create or update `.env` in the project root:

```env
PORT=5000
MONGO_URI=mongodb+srv://USERNAME:PASSWORD@HOST/gossipkaro?retryWrites=true&w=majority

ACCESS_TOKEN_SECRET=your_access_token_secret
ACCESS_TOKEN_EXPIRY=1d
REFRESH_TOKEN_SECRET=your_refresh_token_secret
REFRESH_TOKEN_EXPIRY=10d

CORS_ORIGIN=http://localhost:5173,http://127.0.0.1:5173

# Required for OTP email delivery
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=javin.chutani@gmail.com
SMTP_PASS=your_google_app_password
SMTP_FROM=GossipKaro <javin.chutani@gmail.com>

# Optional. Enable when running more than one backend instance.
REDIS_URL=redis://localhost:6379
REDIS_REQUIRED=false

# Optional OTP tuning
OTP_SECRET=your_otp_hmac_secret
OTP_TTL_SECONDS=600
OTP_MAX_ATTEMPTS=5
```

Important MongoDB note: include the database name in the URI, for example `/gossipkaro`. If you omit it, MongoDB may use the default `test` database.

Redis is optional for local development. Without `REDIS_URL`, the app runs in single-instance mode and OTPs use an in-memory fallback. SMTP is still required to deliver OTPs by email. With `REDIS_URL`, Socket.IO uses Redis pub/sub so events reach users connected to other backend instances, presence uses Redis sets, and registration OTPs use Redis TTL keys.

### 3. Run the App

From the project root:

```powershell
npm run dev
```

This starts both servers:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:5000`

You can also run them separately:

```powershell
npm run dev:backend
npm run dev:frontend
```

## Available Scripts

Root scripts:

```text
npm run dev           Start backend and frontend together
npm run dev:backend   Start only the backend
npm run dev:frontend  Start only the frontend
npm run build         Build the frontend
npm run start         Start the backend in production mode
```

Backend scripts:

```text
npm --prefix backend run dev
npm --prefix backend start
```

Frontend scripts:

```text
npm --prefix frontend run dev
npm --prefix frontend run build
npm --prefix frontend run preview
```

## API Endpoints

### Auth

```text
POST /api/auth/register
POST /api/auth/verify-otp
POST /api/auth/resend-otp
POST /api/auth/login
POST /api/auth/refresh
GET  /api/auth/me
POST /api/auth/logout
```

### Groups

```text
POST /api/groups/create
GET  /api/groups
GET  /api/groups/:groupId
GET  /api/groups/:groupId/messages
POST /api/groups/:groupId/leave
```

### Invites

```text
POST /api/invites/create
POST /api/invites/join/:code
```

### Messages

```text
POST /api/messages/send
```

### Health

```text
GET /health
```

## Socket.IO Events

Socket connections require a JWT token:

```js
const socket = io("http://localhost:5000", {
  auth: { token },
});
```

### Client to Server

| Event | Payload | Description |
| --- | --- | --- |
| `join-group` | `groupId` | Join a group room |
| `send-message` | `{ groupId, content, replyTo?, messageType?, attachment? }` | Send a text, reply, image, or file message |
| `edit-message` | `{ groupId, messageId, content }` | Edit your own text message |
| `delete-message` | `{ groupId, messageId }` | Soft-delete your own message |
| `react-message` | `{ groupId, messageId, emoji }` | Toggle a reaction on a message |
| `mark-read` | `{ groupId }` | Mark a group as read for unread counts |
| `typing` | `{ groupId }` | Notify other users that you are typing |
| `stop-typing` | `{ groupId }` | Notify other users that you stopped typing |

### Server to Client

| Event | Payload | Description |
| --- | --- | --- |
| `new-message` | `message` | Receive a new message |
| `message-updated` | `message` | Sync an edited message |
| `message-deleted` | `{ groupId, messageId }` | Sync a soft-deleted message |
| `message-reaction-updated` | `{ groupId, messageId, reactions }` | Sync message reactions |
| `unread-count-updated` | `{ groupId, unreadCount }` | Sync unread count after read state changes |
| `online-users` | `{ groupId, userIds }` | Initial online users for a group |
| `presence-updated` | `{ groupId, userId, isOnline }` | User online/offline changes |
| `user-typing` | `{ username, userId }` | A user started typing |
| `user-stopped-typing` | `{ userId }` | A user stopped typing |
| `group-members-updated` | `{ groupId }` | Refresh group member details |
| `error` | `{ message }` | Socket error message |

## Current Frontend Flow

1. User registers with username, email, and password.
2. Backend creates an unverified account and stores a hashed OTP in Redis with TTL.
3. User verifies the OTP, then the backend marks the account verified and issues JWT tokens.
4. Access token and user profile are stored in local storage.
5. Frontend connects to Socket.IO using the access token.
6. User can create a group or join with an invite code.
7. Selecting a group fetches fresh group details and recent messages.
8. Messages are sent and received through Socket.IO.
9. Users can reply to messages, react with emojis, edit their own text messages, and soft-delete their own messages.
10. Image/file attachments are read in the browser as data URLs, validated, sent through Socket.IO, and persisted with the message.
11. Inactive groups show unread badges until opened.
12. Online presence is tracked from active socket connections.
13. The Members button shows the current group members and admins.

## OTP Verification Flow

GossipKaro uses Redis for temporary registration OTP state:

1. `POST /api/auth/register` creates or updates an unverified account.
2. Backend generates a 6-digit OTP and stores only an HMAC hash in Redis.
3. Redis stores the OTP key with a TTL, defaulting to 10 minutes.
4. `POST /api/auth/verify-otp` compares the submitted OTP hash, deletes it on success, verifies the user, and returns JWT tokens.
5. `POST /api/auth/resend-otp` replaces the old OTP with a fresh one and resets the TTL.

For local development without `REDIS_URL`, the OTP store falls back to in-memory storage, but OTP delivery still happens through the configured SMTP account. The OTP is never returned in the API response or shown in the UI.

## Scaling Flow

The app can run in two modes:

### Single Backend Instance

```text
Browser sockets -> one Node.js server -> MongoDB
```

In this mode, Socket.IO rooms and online presence can live in server memory.

### Multiple Backend Instances

```text
Browser sockets -> Load Balancer -> Node server 1
                              -> Node server 2
                              -> Node server 3

Node servers -> Redis Pub/Sub
Node servers -> MongoDB
```

When `REDIS_URL` is configured:

- Socket.IO uses the Redis adapter.
- A room event emitted on one server is published through Redis.
- Other servers receive that event and forward it to their connected sockets.
- Online presence is stored in Redis sets instead of only local memory.

MongoDB remains the source of truth for users, groups, messages, reactions, and read receipts. Redis is used for ephemeral real-time coordination, online presence, and short-lived OTP verification state, not permanent chat history.

Production note: when scaling Socket.IO behind a load balancer, use sticky sessions for long-polling or force WebSocket transport. The Redis adapter synchronizes events across servers, but connection routing still needs to be handled correctly.

## Author

Javin Chutani

GitHub: [@javin1106](https://github.com/javin1106)

## License

ISC
