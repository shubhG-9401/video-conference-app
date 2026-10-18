const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Store room metadata: { [roomId]: { hostId: string, users: { [socketId]: { userId, userName, isMuted, isVideoOff, isHandRaised } } } }
const rooms = new Map();

// API to generate random clean room ID
app.get('/api/new-room', (req, res) => {
  const segment = () => Math.random().toString(36).substring(2, 6);
  const roomId = `${segment()}-${segment()}-${segment()}`;
  res.json({ roomId });
});

// Serve room page for /room/:roomId or /meeting
app.get('/room/:roomId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'room.html'));
});

app.get('/meeting', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'room.html'));
});

// Fallback to home
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Socket.io WebRTC Signaling & Room Management
io.on('connection', (socket) => {
  let currentRoomId = null;
  let currentUser = null;

  socket.on('join-room', ({ roomId, userId, userName, isAudioEnabled, isVideoEnabled }) => {
    currentRoomId = roomId;
    currentUser = {
      socketId: socket.id,
      userId,
      userName: userName || `Participant ${socket.id.substring(0, 4)}`,
      isMuted: !isAudioEnabled,
      isVideoOff: !isVideoEnabled,
      isHandRaised: false,
      isHost: false,
      joinedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    socket.join(roomId);

    if (!rooms.has(roomId)) {
      rooms.set(roomId, {
        hostId: socket.id,
        users: new Map()
      });
      currentUser.isHost = true;
    }

    const room = rooms.get(roomId);
    room.users.set(socket.id, currentUser);

    // List of existing users currently in the room (excluding this new participant)
    const existingUsers = [];
    room.users.forEach((user, sockId) => {
      if (sockId !== socket.id) {
        existingUsers.push(user);
      }
    });

    // Notify the user about their join confirmation and current room state
    socket.emit('room-joined', {
      self: currentUser,
      hostId: room.hostId,
      existingUsers
    });

    // Notify all existing users in the room that a new user has joined
    socket.to(roomId).emit('user-connected', {
      user: currentUser
    });

    console.log(`[JOIN] ${currentUser.userName} (${socket.id}) joined room: ${roomId}. Total: ${room.users.size}`);
  });

  // WebRTC Signaling: Offer
  socket.on('send-offer', ({ targetSocketId, callerUserId, callerName, sdp }) => {
    io.to(targetSocketId).emit('receive-offer', {
      callerSocketId: socket.id,
      callerUserId,
      callerName,
      sdp
    });
  });

  // WebRTC Signaling: Answer
  socket.on('send-answer', ({ targetSocketId, responderUserId, sdp }) => {
    io.to(targetSocketId).emit('receive-answer', {
      responderSocketId: socket.id,
      responderUserId,
      sdp
    });
  });

  // WebRTC Signaling: ICE Candidate relay
  socket.on('send-ice-candidate', ({ targetSocketId, candidate }) => {
    io.to(targetSocketId).emit('receive-ice-candidate', {
      senderSocketId: socket.id,
      candidate
    });
  });

  // Media state changes (Mute / Unmute / Video toggle / Hand raise)
  socket.on('update-user-status', (statusUpdates) => {
    if (!currentRoomId || !rooms.has(currentRoomId)) return;
    const room = rooms.get(currentRoomId);
    const user = room.users.get(socket.id);
    if (user) {
      Object.assign(user, statusUpdates);
      io.in(currentRoomId).emit('user-status-updated', {
        socketId: socket.id,
        status: statusUpdates
      });
    }
  });

  // Screen share state notification
  socket.on('screen-share-status', ({ isSharing }) => {
    if (!currentRoomId) return;
    socket.to(currentRoomId).emit('user-screen-share', {
      socketId: socket.id,
      isSharing
    });
  });

  // Host Action: Mute All
  socket.on('mute-all', () => {
    if (!currentRoomId || !rooms.has(currentRoomId)) return;
    const room = rooms.get(currentRoomId);
    if (room.hostId === socket.id) {
      socket.to(currentRoomId).emit('host-muted-all');
    }
  });

  // In-Meeting Chat
  socket.on('send-chat', ({ message, targetSocketId = null }) => {
    if (!currentRoomId || !rooms.has(currentRoomId)) return;
    const room = rooms.get(currentRoomId);
    const sender = room.users.get(socket.id);
    if (!sender) return;

    const chatPayload = {
      id: Math.random().toString(36).substring(2, 9),
      senderSocketId: socket.id,
      senderName: sender.userName,
      message,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isPrivate: !!targetSocketId
    };

    if (targetSocketId) {
      // Private message
      io.to(targetSocketId).emit('receive-chat', chatPayload);
      socket.emit('receive-chat', { ...chatPayload, isSelfCopy: true });
    } else {
      // Broadcast to room
      io.in(currentRoomId).emit('receive-chat', chatPayload);
    }
  });

  // Emojis / Floating reactions
  socket.on('send-reaction', ({ emoji }) => {
    if (!currentRoomId) return;
    io.in(currentRoomId).emit('receive-reaction', {
      socketId: socket.id,
      userName: currentUser ? currentUser.userName : 'Someone',
      emoji
    });
  });

  // Disconnect handler
  socket.on('disconnect', () => {
    if (currentRoomId && rooms.has(currentRoomId)) {
      const room = rooms.get(currentRoomId);
      const departingUser = room.users.get(socket.id);
      room.users.delete(socket.id);

      // Notify others in room
      io.in(currentRoomId).emit('user-disconnected', {
        socketId: socket.id,
        userName: departingUser ? departingUser.userName : 'A participant'
      });

      console.log(`[LEAVE] User ${socket.id} left room ${currentRoomId}. Remaining: ${room.users.size}`);

      // If room is empty, remove it; else if host left, assign new host
      if (room.users.size === 0) {
        rooms.delete(currentRoomId);
      } else if (room.hostId === socket.id) {
        const nextHostSocketId = room.users.keys().next().value;
        room.hostId = nextHostSocketId;
        const nextHost = room.users.get(nextHostSocketId);
        if (nextHost) nextHost.isHost = true;
        io.in(currentRoomId).emit('host-changed', {
          newHostId: nextHostSocketId,
          userName: nextHost ? nextHost.userName : 'New Host'
        });
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 Video Conference App (Zoom Clone) is running!`);
  console.log(`📡 Local URL: http://localhost:${PORT}`);
  console.log(`====================================================`);
});
