# GossipKaro

GossipKaro is a real-time group chat app with a React frontend, an Express backend, Socket.IO live messaging, JWT authentication, and MongoDB persistence.

The app is currently structured as two separate projects:

- `backend/` - Express API, MongoDB models, JWT auth, Socket.IO server
- `frontend/` - Vite + React chat UI

It is not deployed yet. Run it locally with the commands below.

## Features

- Register and login with JWT auth
- Create chat groups
- Join groups using invite codes or invite links
- WhatsApp-inspired responsive chat UI
- View your groups and active group details
- View all members in a group
- Send and receive messages in real time with Socket.IO
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

# Optional. Enable when running more than one backend instance.
REDIS_URL=redis://localhost:6379
REDIS_REQUIRED=false
```

Important MongoDB note: include the database name in the URI, for example `/gossipkaro`. If you omit it, MongoDB may use the default `test` database.

Redis is optional for local development. Without `REDIS_URL`, the app runs in single-instance mode. With `REDIS_URL`, Socket.IO uses Redis pub/sub so events reach users connected to other backend instances.

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
| `send-message` | `{ groupId, content }` | Send a group message |
| `react-message` | `{ groupId, messageId, emoji }` | Toggle a reaction on a message |
| `mark-read` | `{ groupId }` | Mark a group as read for unread counts |
| `typing` | `{ groupId }` | Notify other users that you are typing |
| `stop-typing` | `{ groupId }` | Notify other users that you stopped typing |

### Server to Client

| Event | Payload | Description |
| --- | --- | --- |
| `new-message` | `message` | Receive a new message |
| `message-reaction-updated` | `{ groupId, messageId, reactions }` | Sync message reactions |
| `unread-count-updated` | `{ groupId, unreadCount }` | Sync unread count after read state changes |
| `online-users` | `{ groupId, userIds }` | Initial online users for a group |
| `presence-updated` | `{ groupId, userId, isOnline }` | User online/offline changes |
| `user-typing` | `{ username, userId }` | A user started typing |
| `user-stopped-typing` | `{ userId }` | A user stopped typing |
| `group-members-updated` | `{ groupId }` | Refresh group member details |
| `error` | `{ message }` | Socket error message |

## Current Frontend Flow

1. User registers or logs in.
2. Access token and user profile are stored in local storage.
3. Frontend connects to Socket.IO using the access token.
4. User can create a group or join with an invite code.
5. Selecting a group fetches fresh group details and recent messages.
6. Messages are sent and received through Socket.IO.
7. Inactive groups show unread badges until opened.
8. Online presence is tracked from active socket connections.
9. Users can add emojis to messages and react to existing messages.
10. The Members button shows the current group members and admins.

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

MongoDB remains the source of truth for users, groups, messages, reactions, and read receipts. Redis is used for ephemeral real-time coordination, not permanent chat history.

Production note: when scaling Socket.IO behind a load balancer, use sticky sessions for long-polling or force WebSocket transport. The Redis adapter synchronizes events across servers, but connection routing still needs to be handled correctly.

## Author

Javin Chutani

GitHub: [@javin1106](https://github.com/javin1106)

## License

ISC
