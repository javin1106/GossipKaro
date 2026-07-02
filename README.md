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
- View your groups and active group details
- View all members in a group
- Send and receive messages in real time with Socket.IO
- Typing indicators
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
```

Important MongoDB note: include the database name in the URI, for example `/gossipkaro`. If you omit it, MongoDB may use the default `test` database.

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
| `typing` | `{ groupId }` | Notify other users that you are typing |
| `stop-typing` | `{ groupId }` | Notify other users that you stopped typing |

### Server to Client

| Event | Payload | Description |
| --- | --- | --- |
| `new-message` | `message` | Receive a new message |
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
7. The Members button shows the current group members and admins.

## MongoDB Reset Notes

If MongoDB throws an old duplicate index error like:

```text
E11000 duplicate key error collection: test.users index: phoneNumber_1 dup key: { phoneNumber: null }
```

That means the database still has an old `phoneNumber_1` unique index from an older schema. For local/dev data, you can drop the old `users` collection or drop the old dev database. Mongoose will recreate collections and current indexes when the app writes data again.

## Deployment Status

Deployment has not been done yet.

Recommended future deployment shape:

- Frontend: Vercel or Cloudflare Pages
- Backend: Render or Railway
- Database: MongoDB Atlas

The backend should be deployed as a long-running Node web service because it uses Socket.IO.

## Author

Javin Chutani

GitHub: [@javin1106](https://github.com/javin1106)

## License

ISC
