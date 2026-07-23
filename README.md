# GossipKaro 💬🔥

<div align="center">

### Real-time group chat that feels alive.

React + Express + Socket.IO + MongoDB + Redis = fast conversations, live presence, and production-ready scaling.

🌐 **Official Live URL:** https://gossip-karo.vercel.app/

[Live Frontend](https://gossip-karo.vercel.app/) • [Backend Health](https://gossipkaro.onrender.com/health)

</div>

---

## 🌈 Why GossipKaro?

GossipKaro is a full-stack, real-time messaging platform where groups, invites, presence, typing, reactions, and security all work together cleanly. It is built for:

- ⚡ Instant communication with Socket.IO
- 🔐 Secure auth and OTP verification flows
- 🧠 Smart UX details: unread badges, typing, reactions, replies
- 📈 Horizontal scaling with Redis pub/sub
- 🛡️ Defense-first backend with rate limiting and session revocation

If you want a practical, modern chat architecture to learn from or extend, this project is a strong base.

---

## 🧩 Feature Highlights

### 👤 Authentication & Account Safety
- Register + login with JWT-based auth
- Email OTP verification for new users
- Forgot password + reset password via OTP
- Session revocation after password reset
- Cookie hardening options (`httpOnly`, `SameSite`, `Secure`)

### 💬 Chat Experience
- Create and join groups (invite code/link)
- Real-time messaging
- Reply to messages
- Edit and soft-delete your own messages
- Emoji reactions
- Typing indicators
- Unread counters
- Online presence per group
- Member refresh events on join/leave

### 🖼️ Rich Messages
- Text + image + small file sharing (up to 2MB)
- Client-side attachment validation
- Real-time sync across connected users

### 🛡️ Reliability & Security
- Auth and invite rate limits
- Socket event throttling
- Redis-backed shared counters in multi-instance mode
- OTPs are hashed and namespaced (registration vs password reset)
- Production config validation on startup

---

## 🛠️ Tech Stack

### Frontend
- React 19
- Vite
- HeroUI 3
- Tailwind CSS 4
- Socket.IO Client
- Lucide React

### Backend
- Node.js
- Express 5
- Socket.IO
- MongoDB + Mongoose
- Redis + `@socket.io/redis-adapter`
- JWT + bcryptjs
- cookie-parser + cors + nodemailer

### Tooling
- Docker Compose for local Redis
- Nodemon for backend development
- Native Node test runner (`node --test`)

---

## 🗺️ Architecture

```mermaid
flowchart LR
  U[Users] --> F[Frontend: React + Vite]
  F -->|REST| B[Backend: Express API]
  F -->|WebSocket| S[Socket.IO Server]
  B --> M[(MongoDB)]
  S --> M
  B --> R[(Redis)]
  S --> R
  B --> E[SMTP Provider]
```

### Scaling Mode (Multi-Instance)

```mermaid
flowchart TB
  LB[Load Balancer] --> N1[Node Instance 1]
  LB --> N2[Node Instance 2]
  LB --> N3[Node Instance 3]
  N1 <--> RP[(Redis Pub/Sub)]
  N2 <--> RP
  N3 <--> RP
  N1 --> MDB[(MongoDB)]
  N2 --> MDB
  N3 --> MDB
```

---

## 📁 Project Structure

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
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   ├── styles.css
│   │   └── lib/
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
├── scripts/
│   └── dev.js
├── compose.yaml
├── package.json
└── README.md
```

---

## 🚀 Quick Start (Local)

### 1. Install dependencies

From the project root:

```powershell
npm --prefix backend install
npm --prefix frontend install
```

### 2. Configure environment

Create/update `.env` in project root:

```env
PORT=5000
NODE_ENV=development
MONGO_URI=mongodb+srv://USERNAME:PASSWORD@HOST/gossipkaro?retryWrites=true&w=majority

ACCESS_TOKEN_SECRET=your_access_token_secret
ACCESS_TOKEN_EXPIRY=1d
REFRESH_TOKEN_SECRET=your_refresh_token_secret
REFRESH_TOKEN_EXPIRY=10d

CORS_ORIGIN=http://localhost:5173,http://127.0.0.1:5173
COOKIE_SAME_SITE=lax
COOKIE_SECURE=false
TRUST_PROXY=false

# SMTP is required for OTP delivery
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@example.com
SMTP_PASS=your_app_password
SMTP_FROM=GossipKaro <your_email@example.com>

# Optional for local single-instance mode
REDIS_URL=redis://localhost:6379
REDIS_REQUIRED=false

# Optional OTP tuning
OTP_SECRET=your_otp_hmac_secret
OTP_TTL_SECONDS=600
OTP_MAX_ATTEMPTS=5
```

Important:
- Include DB name in `MONGO_URI` (example: `/gossipkaro`)
- Use different, strong JWT secrets in production
- For cross-site deployments: `COOKIE_SAME_SITE=none` and `COOKIE_SECURE=true`

### 3. Start Redis (recommended)

```powershell
docker compose up -d redis
docker compose ps
```

Stop Redis when needed:

```powershell
docker compose stop redis
```

### 4. Run the app

```powershell
npm run dev
```

Local URLs:
- Frontend: http://localhost:5173
- Backend: http://localhost:5000

---

## 📜 Scripts

### Root

```bash
npm run dev           # Run backend + frontend together
npm run dev:backend   # Run backend only
npm run dev:frontend  # Run frontend only
npm run build         # Build frontend
npm run start         # Start backend (prod mode)
```

### Backend

```bash
npm --prefix backend run dev
npm --prefix backend start
npm --prefix backend test
```

### Frontend

```bash
npm --prefix frontend run dev
npm --prefix frontend run build
npm --prefix frontend run preview
npm --prefix frontend test
```

---

## 🧪 Testing

Run backend tests:

```powershell
npm --prefix backend test
```

Run frontend presence utility tests:

```powershell
npm --prefix frontend test
```

---

## 🔌 REST API Overview

### Auth

```text
POST /api/auth/register
POST /api/auth/verify-otp
POST /api/auth/resend-otp
POST /api/auth/forgot-password
POST /api/auth/reset-password
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

---

## ⚡ Socket.IO Contract

Socket connection requires JWT token:

```js
const socket = io("http://localhost:5000", {
  auth: { token },
});
```

### Client -> Server

| Event | Payload | Purpose |
| --- | --- | --- |
| `join-group` | `groupId` | Join group room |
| `send-message` | `{ groupId, content, replyTo?, messageType?, attachment? }` | Send message |
| `edit-message` | `{ groupId, messageId, content }` | Edit own message |
| `delete-message` | `{ groupId, messageId }` | Soft-delete own message |
| `react-message` | `{ groupId, messageId, emoji }` | Toggle reaction |
| `mark-read` | `{ groupId }` | Mark group read |
| `typing` | `{ groupId }` | Typing started |
| `stop-typing` | `{ groupId }` | Typing stopped |

### Server -> Client

| Event | Payload | Purpose |
| --- | --- | --- |
| `new-message` | `message` | New incoming message |
| `message-updated` | `message` | Message edited sync |
| `message-deleted` | `{ groupId, messageId }` | Deletion sync |
| `message-reaction-updated` | `{ groupId, messageId, reactions }` | Reaction sync |
| `unread-count-updated` | `{ groupId, unreadCount }` | Badge updates |
| `online-users` | `{ groupId, userIds }` | Initial presence snapshot |
| `presence-updated` | `{ groupId, userId, isOnline }` | Presence delta |
| `user-typing` | `{ username, userId }` | Typing indicator |
| `user-stopped-typing` | `{ userId }` | Typing cleared |
| `group-members-updated` | `{ groupId }` | Members refresh hint |
| `session-revoked` | `{ reason }` | Force logout after reset |
| `error` | `{ message }` | Socket error feedback |

---

## 🔐 Security Notes

- OTP values are never stored as plain text
- Registration OTP and reset OTP use separate namespaces
- Password reset invalidates active sessions
- API and socket routes are rate-limited/throttled
- Redis enables shared limits and event propagation across instances
- Startup validation blocks unsafe production configs

---

## 🧭 Typical User Journey

1. User signs up with username/email/password
2. Backend generates and emails OTP
3. User verifies OTP and receives auth tokens
4. User creates or joins a group
5. Frontend joins room and fetches messages
6. Real-time messages, reactions, typing, and unread updates begin

---

## 🌍 Deployment Notes

- Frontend can be deployed on Vercel/Netlify
- Backend can run on Render/Railway/Fly/VM
- For multi-instance backend, configure Redis and proper load balancer behavior
- For long-polling transports in scaled mode, sticky sessions are recommended

---

## 🤝 Contributing

Contributions are welcome.

1. Fork this repo
2. Create a feature branch
3. Make your changes
4. Add/adjust tests when needed
5. Open a PR with a clear description

---

## 👨‍💻 Author

Javin Chutani  
GitHub: [@javin1106](https://github.com/javin1106)

---

## 📄 License

ISC

---

<div align="center">

### Built with ❤️, sockets, and a lot of chai-fueled debugging.

If this project helped you, drop a ⭐ on the repo.

</div>

---