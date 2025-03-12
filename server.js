const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  pingTimeout: 30000,
  pingInterval: 5000
});

app.use(express.static(path.join(__dirname, 'build')));

app.get('*', (req, res) => {
  res.send('Server is connected');
});

const users = {};
const rooms = {};

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on('join', (userData) => {
    console.log(`User ${userData.name} joined with ID: ${socket.id}`);
    
    if (!userData || !userData.name) {
      console.error('Invalid user data:', userData);
      return;
    }
    
    users[socket.id] = { 
      id: socket.id, 
      name: userData.name,
      inCall: false,
      lastActivity: Date.now()
    };
    
    socket.emit('all-users', Object.values(users).filter(user => user.id !== socket.id));
    socket.broadcast.emit('user-joined', users[socket.id]);

    socket.pingInterval = setInterval(() => {
      if (users[socket.id]) {
        users[socket.id].lastActivity = Date.now();
      }
    }, 30000);
  });

  socket.on('call-user', ({ userToCall, signalData, from, name }) => {
    console.log(`Call request from ${name} to ${userToCall}`);
    
    if (!userToCall || !from || !signalData) {
      console.error('Invalid call data:', { userToCall, from });
      return;
    }
    
    if (users[userToCall] && !users[userToCall].inCall) {
      const roomId = `${from}-${userToCall}-${Date.now()}`;
      rooms[roomId] = { 
        participants: [from, userToCall],
        createdAt: Date.now() 
      };
      
      users[from].inCall = true;
      users[userToCall].inCall = true;
      
      io.to(userToCall).emit('call-incoming', {
        signal: signalData,
        from,
        name,
        roomId
      });
      
      updateUserStatuses();
    } else {
      socket.emit('call-unavailable', { 
        userToCall, 
        reason: users[userToCall] ? 'User is in another call' : 'User is offline' 
      });
    }
  });

  socket.on('answer-call', ({ to, signal, roomId }) => {
    console.log(`Call answered by ${socket.id} to ${to}`);
    
    if (!to || !signal || !roomId || !rooms[roomId]) {
      console.error('Invalid answer call data:', { to, roomId });
      return;
    }
    
    io.to(to).emit('call-accepted', {
      signal,
      answeredBy: socket.id,
      roomId
    });
  });

  socket.on('end-call', ({ roomId }) => {
    if (!roomId || !rooms[roomId]) {
      console.error('Invalid end call data:', { roomId });
      return;
    }

    console.log(`Call ended in room ${roomId}`);
    
    const participants = [...rooms[roomId].participants];
    
    participants.forEach(userId => {
      if (users[userId]) {
        users[userId].inCall = false;
      }
    });
    
    delete rooms[roomId];
    
    participants.forEach(userId => {
      if (userId !== socket.id) {
        io.to(userId).emit('call-ended');
      }
    });
    
    updateUserStatuses();
  });

  socket.on('decline-call', ({ from }) => {
    if (!from) {
      console.error('Invalid decline call data:', { from });
      return;
    }
    
    console.log(`Call declined by ${socket.id}`);
    io.to(from).emit('call-declined', { by: socket.id });
  });

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

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    
    if (socket.pingInterval) {
      clearInterval(socket.pingInterval);
    }
    
    for (const roomId in rooms) {
      if (rooms[roomId] && rooms[roomId].participants && 
          rooms[roomId].participants.includes(socket.id)) {
        rooms[roomId].participants.forEach(userId => {
          if (userId !== socket.id && users[userId]) {
            users[userId].inCall = false;
            io.to(userId).emit('call-ended', { reason: 'User disconnected' });
          }
        });
        
        delete rooms[roomId];
      }
    }
    
    const disconnectedUser = users[socket.id];
    delete users[socket.id];
    
    if (disconnectedUser) {
      socket.broadcast.emit('user-left', socket.id);
    }
    
    updateUserStatuses();
  });

  function updateUserStatuses() {
    const userStatuses = Object.values(users).map(user => ({
      id: user.id,
      name: user.name,
      inCall: user.inCall
    }));
    
    io.emit('user-statuses', userStatuses);
  }
  
  socket.on('error', (error) => {
    console.error(`Socket error for ${socket.id}:`, error);
  });
});

setInterval(() => {
  const now = Date.now();
  
  for (const roomId in rooms) {
    if (now - rooms[roomId].createdAt > 2 * 60 * 60 * 1000) {
      console.log(`Cleaning up stale room: ${roomId}`);
      
      if (rooms[roomId].participants) {
        rooms[roomId].participants.forEach(userId => {
          if (users[userId]) {
            users[userId].inCall = false;
          }
        });
      }
      
      delete rooms[roomId];
    }
  }
  
  io.emit('user-statuses', Object.values(users).map(user => ({
    id: user.id,
    name: user.name,
    inCall: user.inCall
  })));
}, 30 * 60 * 1000);

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});