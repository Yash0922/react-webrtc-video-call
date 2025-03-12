# React WebRTC Video Call Application

A simple video calling application built with React, WebRTC, and Socket.io that allows users to make peer-to-peer video calls.

## Features

- Real-time video calling
- Peer-to-peer connection using WebRTC
- User authentication with display names
- List of online users
- Incoming call notifications
- Responsive design

## Technology Stack

- **Frontend**: React.js
- **Backend**: Node.js with Express
- **Real-time Communication**: Socket.io (signaling server)
- **Peer Connection**: WebRTC (using simple-peer library)

## Project Structure

```
react-webrtc-video-call/
├── public/
│   └── index.html
├── src/
│   ├── App.js      # Main React component
│   └── App.css     # Styling
├── server.js       # Node.js signaling server
└── package.json    # Project dependencies
```

## Setup Instructions

### Prerequisites

- Node.js (v14 or higher)
- NPM (v6 or higher)

### Installation

1. Clone the repository or download the project files

2. Install dependencies:
   ```
   npm install
   ```

3. Start the development server and React app concurrently:
   ```
   npm run dev
   ```
   
   This will start:
   - The React app on http://localhost:3000
   - The Socket.io signaling server on http://localhost:5000

### Building for Production

To create a production build:

```
npm run build
```

## How It Works

### Signaling Process

1. **Connection**: Users connect to the signaling server via Socket.io
2. **Discovery**: The server keeps track of connected users and broadcasts updates
3. **Call Initiation**: When a user calls another user, the server relays the offer
4. **Negotiation**: WebRTC connection parameters (SDP) are exchanged through the server
5. **Connection**: Once negotiation is complete, video/audio streams flow directly between peers (P2P)

### WebRTC Flow

1. User A creates a peer connection as the initiator
2. User A generates an offer and sends it to User B via the signaling server
3. User B receives the offer and creates a peer connection (not as initiator)
4. User B generates an answer and sends it back to User A
5. Both peers exchange ICE candidates to establish the optimal connection path
6. Once connected, media streams flow directly between peers without going through the server

## Performance Optimizations

- Uses WebRTC's peer-to-peer architecture to minimize server load
- Implements proper cleanup of media streams and socket connections
- Employs React hooks for efficient state management
- Handles various edge cases like user disconnection and call rejection

## Browser Compatibility

This application works on modern browsers that support WebRTC:
- Chrome (Desktop & Android)
- Firefox (Desktop & Android)
- Safari (Desktop & iOS)
- Edge (Chromium-based)

## Known Limitations

- May not work behind symmetric NATs without TURN server implementation
- Currently optimized for 1-to-1 video calls only (not group calls)
- No persistent user accounts or call history

## Future Enhancements

- Add TURN server support for improved NAT traversal
- Implement screen sharing functionality
- Add text chat capabilities
- Support for group video calls
- End-to-end encryption
- Call recording options