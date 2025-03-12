const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

// Initialize express app
const app = express();
app.use(cors());

// Create HTTP server using Express app
const server = http.createServer(app);

// Create Socket.io server with CORS settings
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  pingTimeout: 30000, // Increase ping timeout for better connection stability
  pingInterval: 5000  // More frequent pings to detect disconnections faster
});

// Serve static files if we have a production build
app.use(express.static(path.join(__dirname, 'build')));

// Always serve index.html for any GET request that isn't a file
// This is needed for client-side routing in SPA
app.get('*', (req, res) => {
  res.send('Server is connected');
});

// Keep track of active users and rooms
const users = {};
const rooms = {};

// Socket.io connection event handler
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // When a user joins, store their ID and broadcast to other users
  socket.on('join', (userData) => {
    console.log(`User ${userData.name} joined with ID: ${socket.id}`);
    
    // Validate user data
    if (!userData || !userData.name) {
      console.error('Invalid user data:', userData);
      return;
    }
    
    // Store user information
    users[socket.id] = { 
      id: socket.id, 
      name: userData.name,
      inCall: false,
      lastActivity: Date.now()
    };
    
    // Notify the joining user of all existing users
    socket.emit('all-users', Object.values(users).filter(user => user.id !== socket.id));
    
    // Notify other users about the new user
    socket.broadcast.emit('user-joined', users[socket.id]);

    // Setup regular pings to check connection
    socket.pingInterval = setInterval(() => {
      if (users[socket.id]) {
        users[socket.id].lastActivity = Date.now();
      }
    }, 30000);
  });

  // Handle call requests
  socket.on('call-user', ({ userToCall, signalData, from, name }) => {
    console.log(`Call request from ${name} to ${userToCall}`);
    
    // Validate call data
    if (!userToCall || !from || !signalData) {
      console.error('Invalid call data:', { userToCall, from });
      return;
    }
    
    // If user exists and not in another call
    if (users[userToCall] && !users[userToCall].inCall) {
      // Create a unique room for this call
      const roomId = `${from}-${userToCall}-${Date.now()}`;
      rooms[roomId] = { 
        participants: [from, userToCall],
        createdAt: Date.now() 
      };
      
      // Mark users as in call
      users[from].inCall = true;
      users[userToCall].inCall = true;
      
      // Forward the call request to the intended recipient
      io.to(userToCall).emit('call-incoming', {
        signal: signalData,
        from,
        name,
        roomId
      });
      
      // Notify other users to update their available users list
      updateUserStatuses();
    } else {
      // User is unavailable
      socket.emit('call-unavailable', { 
        userToCall, 
        reason: users[userToCall] ? 'User is in another call' : 'User is offline' 
      });
    }
  });

  // Handle call acceptance
  socket.on('answer-call', ({ to, signal, roomId }) => {
    console.log(`Call answered by ${socket.id} to ${to}`);
    
    // Validate answer data
    if (!to || !signal || !roomId || !rooms[roomId]) {
      console.error('Invalid answer call data:', { to, roomId });
      return;
    }
    
    // Forward the answer to the caller
    io.to(to).emit('call-accepted', {
      signal,
      answeredBy: socket.id,
      roomId
    });
  });

  // Handle call ending
  socket.on('end-call', ({ roomId }) => {
    if (!roomId || !rooms[roomId]) {
      console.error('Invalid end call data:', { roomId });
      return;
    }

    console.log(`Call ended in room ${roomId}`);
    
    // Store participants before deleting the room
    const participants = [...rooms[roomId].participants];
    
    // Free up both users
    participants.forEach(userId => {
      if (users[userId]) {
        users[userId].inCall = false;
      }
    });
    
    // Remove the room
    delete rooms[roomId];
    
    // Notify all participants that the call has ended
    participants.forEach(userId => {
      if (userId !== socket.id) {
        io.to(userId).emit('call-ended');
      }
    });
    
    // Update all clients with new user statuses
    updateUserStatuses();
  });

  // Handle call decline
  socket.on('decline-call', ({ from }) => {
    if (!from) {
      console.error('Invalid decline call data:', { from });
      return;
    }
    
    console.log(`Call declined by ${socket.id}`);
    io.to(from).emit('call-declined', { by: socket.id });
  });

  // Handle ICE candidates exchange
  socket.on('ice-candidate', ({ to, candidate }) => {
    if (!to || !candidate) {
      console.error('Invalid ICE candidate data:', { to });
      return;
    }
    
    io.to(to).emit('ice-candidate', {
      from: socket.id,
      candidate
    });
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    
    // Clear ping interval
    if (socket.pingInterval) {
      clearInterval(socket.pingInterval);
    }
    
    // Find any active calls this user was in
    for (const roomId in rooms) {
      if (rooms[roomId] && rooms[roomId].participants && 
          rooms[roomId].participants.includes(socket.id)) {
        // Notify other participants that the call ended
        rooms[roomId].participants.forEach(userId => {
          if (userId !== socket.id && users[userId]) {
            users[userId].inCall = false;
            io.to(userId).emit('call-ended', { reason: 'User disconnected' });
          }
        });
        
        // Remove the room
        delete rooms[roomId];
      }
    }
    
    // Remove user from users list
    const disconnectedUser = users[socket.id];
    delete users[socket.id];
    
    // Notify other users about the disconnection
    if (disconnectedUser) {
      socket.broadcast.emit('user-left', socket.id);
    }
    
    // Update all clients with new user statuses
    updateUserStatuses();
  });

  // Helper function to update all clients with current user statuses
  function updateUserStatuses() {
    // Create a clean copy of user data to broadcast
    const userStatuses = Object.values(users).map(user => ({
      id: user.id,
      name: user.name,
      inCall: user.inCall
    }));
    
    io.emit('user-statuses', userStatuses);
  }
  
  // Periodically clean up stale rooms
  socket.on('error', (error) => {
    console.error(`Socket error for ${socket.id}:`, error);
  });
});

// Periodically clean up stale rooms
setInterval(() => {
  const now = Date.now();
  
  // Clean up rooms that are older than 2 hours
  for (const roomId in rooms) {
    if (now - rooms[roomId].createdAt > 2 * 60 * 60 * 1000) {
      console.log(`Cleaning up stale room: ${roomId}`);
      
      // Free up any users that might still be in this room
      if (rooms[roomId].participants) {
        rooms[roomId].participants.forEach(userId => {
          if (users[userId]) {
            users[userId].inCall = false;
          }
        });
      }
      
      // Remove the room
      delete rooms[roomId];
    }
  }
  
  // Update all clients with current user statuses
  io.emit('user-statuses', Object.values(users).map(user => ({
    id: user.id,
    name: user.name,
    inCall: user.inCall
  })));
}, 30 * 60 * 1000); // Run every 30 minutes

// Define the port for the server
const PORT = process.env.PORT || 5000;

// Start the server
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});