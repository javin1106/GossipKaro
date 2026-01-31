# 💬 GossipKaro

An end-to-end real-time chat application built with Node.js, Express, Socket.IO, and MongoDB. GossipKaro enables users to create groups, invite members, and exchange messages in real-time with features like typing indicators and user authentication.

## ✨ Features

- 🔐 **User Authentication**: Secure JWT-based authentication with bcrypt password hashing
- 👥 **Group Chat**: Create and manage chat groups
- 📨 **Real-time Messaging**: Instant message delivery using Socket.IO
- 💬 **Typing Indicators**: See when other users are typing
- 🎫 **Invite System**: Send and manage group invitations
- 🔒 **Secure**: Authentication middleware for protected routes and socket connections
- 🌐 **CORS Enabled**: Ready for frontend integration

## 🛠️ Tech Stack

- **Backend**: Node.js, Express 5.x
- **Database**: MongoDB with Mongoose ODM
- **Real-time**: Socket.IO 4.x
- **Authentication**: JWT (jsonwebtoken) & bcryptjs
- **Environment Variables**: dotenv

## 📁 Project Structure

```
GossipKaro/
├── src/
│   ├── app.js              # Express app configuration
│   ├── server.js           # Server entry point
│   ├── socket.js           # Socket.IO setup and event handlers
│   ├── config/             # Configuration files (database, etc.)
│   ├── controllers/        # Request handlers
│   ├── middleware/         # Custom middleware (auth, etc.)
│   ├── models/             # Mongoose models (User, Group, Message)
│   ├── routes/             # API routes
│   │   ├── auth.routes.js
│   │   ├── group.routes.js
│   │   ├── invite.routes.js
│   │   └── message.routes.js
│   ├── scripts/            # Utility scripts
│   ├── public/             # Static files
│   └── utils/              # Helper functions
├── package.json
└── .gitignore
```

## 🚀 Getting Started

### Prerequisites

- Node.js (v16 or higher)
- MongoDB (local or cloud instance)
- npm or yarn

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/javin1106/GossipKaro.git
   cd GossipKaro
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   
   Create a `.env` file in the root directory:
   ```env
   PORT=5000
   MONGODB_URI=your_mongodb_connection_string
   ACCESS_TOKEN_SECRET=your_jwt_secret_key
   ```

4. **Start the development server**
   ```bash
   npm run dev
   ```

   The server will start on `http://localhost:5000` (or your specified PORT)

## 📡 API Endpoints

### Authentication
- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login user

### Groups
- `GET /api/groups` - Get all groups for authenticated user
- `POST /api/groups` - Create a new group
- `GET /api/groups/:id` - Get group details
- `PUT /api/groups/:id` - Update group
- `DELETE /api/groups/:id` - Delete group

### Invites
- `POST /api/invites` - Send group invitation
- `GET /api/invites` - Get pending invites
- `PUT /api/invites/:id/accept` - Accept invitation
- `PUT /api/invites/:id/reject` - Reject invitation

### Messages
- `GET /api/messages/:groupId` - Get group messages

### Health Check
- `GET /health` - Server health status

## 🔌 Socket.IO Events

### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `join-group` | `groupId` | Join a specific group room |
| `send-message` | `{ groupId, content }` | Send a message to a group |
| `typing` | `{ groupId }` | Notify that user is typing |
| `stop-typing` | `{ groupId }` | Notify that user stopped typing |

### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `new-message` | `message` | New message received in group |
| `user-typing` | `{ username, userId }` | User started typing |
| `user-stopped-typing` | `{ userId }` | User stopped typing |
| `error` | `{ message }` | Error notification |

### Socket Authentication

Socket connections require JWT authentication via handshake:

```javascript
const socket = io('http://localhost:5000', {
  auth: {
    token: 'your_jwt_token'
  }
});
```

## 🔑 Authentication Flow

1. **Register/Login**: User receives JWT token
2. **Protected Routes**: Include token in `Authorization` header as `Bearer <token>`
3. **Socket Connection**: Pass token in socket handshake auth
4. **Real-time Operations**: All socket events are authenticated

## 🧪 Development

```bash
# Run in development mode with auto-reload
npm run dev
```

## 📦 Dependencies

- **express**: Web framework
- **mongoose**: MongoDB object modeling
- **socket.io**: Real-time bidirectional communication
- **jsonwebtoken**: JWT authentication
- **bcryptjs**: Password hashing
- **dotenv**: Environment variable management

## 👨‍💻 Author

**Javin Chutani**
- GitHub: [@javin1106](https://github.com/javin1106)

## 📄 License

ISC

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to check the [issues page](https://github.com/javin1106/GossipKaro/issues).

## 🌟 Show your support

Give a ⭐️ if you like this project!

---

**Note**: Make sure to keep your `.env` file secure and never commit it to version control. The `.gitignore` file is already configured to exclude sensitive files.