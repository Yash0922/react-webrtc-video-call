// src/App.js
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import Peer from 'simple-peer';
import './App.css';

// Main App component
function App() {
  // State variables
  const [name, setName] = useState('');
  const [joined, setJoined] = useState(false);
  const [users, setUsers] = useState([]);
  const [stream, setStream] = useState(null);
  const [callData, setCallData] = useState(null);
  const [callAccepted, setCallAccepted] = useState(false);
  const [calling, setCalling] = useState(false);
  const [receivingCall, setReceivingCall] = useState(false);
  const [caller, setCaller] = useState('');
  const [callStatus, setCallStatus] = useState('');
  const [roomId, setRoomId] = useState(null);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [screen, setScreen] = useState(null);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');

  // Refs
  const socketRef = useRef();
  const localVideoRef = useRef();
  const remoteVideoRef = useRef();
  const peerRef = useRef();
  const localStreamRef = useRef();

  // Connect to socket server on component mount
  useEffect(() => {
    // Connect to the signaling server
    const serverUrl =  'http://localhost:5000';
    socketRef.current = io(serverUrl);
    
    setConnectionStatus('connecting');

    socketRef.current.on('connect', () => {
      console.log('Connected to signaling server');
      setConnectionStatus('connected');
    });

    socketRef.current.on('connect_error', (error) => {
      console.error('Connection error:', error);
      setConnectionStatus('error');
    });

    // Socket event handlers
    socketRef.current.on('all-users', (allUsers) => {
      console.log('All users:', allUsers);
      setUsers(allUsers);
    });

    socketRef.current.on('user-joined', (user) => {
      console.log('User joined:', user);
      setUsers(prevUsers => [...prevUsers, user]);
    });

    socketRef.current.on('user-left', (userId) => {
      console.log('User left:', userId);
      setUsers(prevUsers => prevUsers.filter(user => user.id !== userId));
      
      // If in a call with the user who left, end the call
      if (callData && callData.from === userId) {
        handleEndCall('User disconnected');
      }
    });

    socketRef.current.on('user-statuses', (updatedUsers) => {
      setUsers(updatedUsers.filter(user => user.id !== socketRef.current.id));
    });

    socketRef.current.on('call-incoming', (data) => {
      console.log('Incoming call from:', data.name);
      setReceivingCall(true);
      setCaller(data.name);
      setCallData(data);
      setRoomId(data.roomId);
    });

    socketRef.current.on('call-accepted', (data) => {
      console.log('Call accepted');
      setCallAccepted(true);
      setCalling(false);
      setCallStatus('connected');
      setRoomId(data.roomId);
      
      // Add the remote stream to the peer connection
      peerRef.current.signal(data.signal);
    });

    socketRef.current.on('call-unavailable', ({ userToCall, reason }) => {
      console.log(`Call to ${userToCall} unavailable: ${reason}`);
      setCalling(false);
      setCallStatus(`Call failed: ${reason}`);
      
      // Reset call status after a few seconds
      setTimeout(() => setCallStatus(''), 3000);
    });

    socketRef.current.on('call-declined', ({ by }) => {
      console.log(`Call declined by user ${by}`);
      setCalling(false);
      setCallStatus('Call declined');
      
      // Reset call status after a few seconds
      setTimeout(() => setCallStatus(''), 3000);
    });

    socketRef.current.on('call-ended', ({ reason } = {}) => {
      handleEndCall(reason || 'Call ended by the other user');
    });

    socketRef.current.on('ice-candidate', ({ from, candidate }) => {
      console.log('Received ICE candidate');
      if (peerRef.current) {
        peerRef.current.signal({ candidate });
      }
    });

    // Cleanup function
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }
      if (peerRef.current) {
        peerRef.current.destroy();
      }
    };
  }, []);

  // Get media stream when user joins
  const getMediaStream = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });
      
      console.log('Got media stream');
      setStream(mediaStream);
      localStreamRef.current = mediaStream;
      
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = mediaStream;
      }
      
      return mediaStream;
    } catch (error) {
      console.error('Error accessing media devices:', error);
      alert(`Cannot access camera or microphone: ${error.message}`);
      return null;
    }
  };

  // Set local video stream when available
  useEffect(() => {
    if (stream && localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
    }
  }, [stream]);

  // Handle joining the room
  const joinRoom = async () => {
    if (!name) return alert('Please enter your name');

    const mediaStream = await getMediaStream();
    if (!mediaStream) return;

    // Join the room
    socketRef.current.emit('join', { name });
    setJoined(true);
  };

  // Function to call another user
  const callUser = async (userId) => {
    console.log('Calling user:', userId);
    
    // Ensure we have a stream
    let currentStream = stream;
    if (!currentStream) {
      currentStream = await getMediaStream();
      if (!currentStream) return;
    }
    
    setCalling(true);
    setCallStatus('Calling...');

    // Create a new peer connection (as initiator)
    const peer = new Peer({
      initiator: true,
      trickle: true,
      stream: currentStream
    });

    // Handle peer events
    peer.on('signal', (signalData) => {
      console.log('Generated signal data (caller)');
      
      // Send signal data to the user being called
      socketRef.current.emit('call-user', {
        userToCall: userId,
        signalData,
        from: socketRef.current.id,
        name
      });
    });

    peer.on('stream', (remoteStream) => {
      console.log('Received remote stream (caller)');
      
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream;
      }
    });

    peer.on('error', (err) => {
      console.error('Peer error (caller):', err);
      handleEndCall('Connection error');
    });

    // Handle connection status
    peer.on('connect', () => {
      console.log('Peer connection established (caller)');
      setCallStatus('Connected');
    });

    peer.on('close', () => {
      console.log('Peer connection closed (caller)');
      handleEndCall('Connection closed');
    });

    peerRef.current = peer;
  };

  // Function to answer an incoming call
  const answerCall = useCallback(async () => {
    console.log('Answering call');
    
    // Ensure we have a stream
    let currentStream = stream;
    if (!currentStream) {
      currentStream = await getMediaStream();
      if (!currentStream) return;
    }
    
    setCallAccepted(true);
    setReceivingCall(false);
    setCallStatus('Connecting...');

    // Create a new peer connection (not as initiator)
    const peer = new Peer({
      initiator: false,
      trickle: true,
      stream: currentStream
    });

    // Handle peer events
    peer.on('signal', (signalData) => {
      console.log('Generated signal data (answerer)');
      
      // Send signal data back to the caller
      socketRef.current.emit('answer-call', {
        signal: signalData,
        to: callData.from,
        roomId
      });
    });

    peer.on('stream', (remoteStream) => {
      console.log('Received remote stream (answerer)');
      
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream;
      }
    });

    peer.on('error', (err) => {
      console.error('Peer error (answerer):', err);
      handleEndCall('Connection error');
    });

    // Handle connection status
    peer.on('connect', () => {
      console.log('Peer connection established (answerer)');
      setCallStatus('Connected');
    });

    peer.on('close', () => {
      console.log('Peer connection closed (answerer)');
      handleEndCall('Connection closed');
    });

    // Signal to the peer with the caller's signal data
    peer.signal(callData.signal);
    peerRef.current = peer;
  }, [callData, stream, roomId]);

  // Function to decline incoming call
  const declineCall = () => {
    setReceivingCall(false);
    setCaller('');
    
    // Notify the caller that the call was declined
    if (callData) {
      socketRef.current.emit('decline-call', { from: callData.from });
    }
    
    setCallData(null);
    setRoomId(null);
  };

  // Function to end the current call
  // Function to end the current call
const handleEndCall = (reason = 'Call ended') => {
  console.log(reason);

  setCallAccepted(false);
  setCalling(false);
  setReceivingCall(false);
  setCaller('');
  setCallData(null);
  setCallStatus(reason);

  // Notify the server that the call has ended
  if (roomId) {
    socketRef.current.emit('end-call', { roomId });
    setRoomId(null);
  }

  // Stop screen sharing if active
  if (isScreenSharing && screen) {
    screen.getTracks().forEach(track => track.stop());
    setScreen(null);
    setIsScreenSharing(false);
  }

  // Safely close the peer connection without calling removeAllListeners
  if (peerRef.current) {
    try {
      // Instead of removeAllListeners(), manually clean up the important events
      // This avoids the error with process not being defined
      const events = ['signal', 'connect', 'data', 'stream', 'track', 'error', 'close'];
      
      // For each known event type, remove listeners if the peer has an event emitter
      if (peerRef.current._events) {
        events.forEach(event => {
          if (peerRef.current._events[event]) {
            peerRef.current._events[event] = null;
          }
        });
      }
      
      // Now safely destroy the peer
      peerRef.current.destroy();
    } catch (err) {
      console.error('Error cleaning up peer:', err);
    } finally {
      peerRef.current = null;
    }
  }

  // Reset remote video
  if (remoteVideoRef.current) {
    remoteVideoRef.current.srcObject = null;
  }

  // Reset call status after a few seconds
  setTimeout(() => setCallStatus(''), 3000);
};
  
  // Toggle audio
  const toggleAudio = () => {
    if (stream) {
      stream.getAudioTracks().forEach(track => {
        track.enabled = !audioEnabled;
      });
      setAudioEnabled(!audioEnabled);
    }
  };

  // Toggle video
  const toggleVideo = () => {
    if (stream) {
      stream.getVideoTracks().forEach(track => {
        track.enabled = !videoEnabled;
      });
      setVideoEnabled(!videoEnabled);
    }
  };

  // Toggle screen sharing
  const toggleScreenShare = async () => {
    if (!isScreenSharing) {
      try {
        // Get screen sharing stream
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true
        });
        
        setScreen(screenStream);
        
        // Replace video track in the peer connection
        if (peerRef.current) {
          const videoTrack = screenStream.getVideoTracks()[0];
          
          const senders = peerRef.current._pc.getSenders();
          const sender = senders.find(s => s.track.kind === 'video');
          
          if (sender) {
            sender.replaceTrack(videoTrack);
          }
          
          // Show screen share in local video
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = screenStream;
          }
          
          setIsScreenSharing(true);
          
          // Listen for the end of screen sharing
          videoTrack.onended = () => {
            stopScreenSharing();
          };
        }
      } catch (error) {
        console.error('Error sharing screen:', error);
      }
    } else {
      stopScreenSharing();
    }
  };

  // Stop screen sharing
  const stopScreenSharing = () => {
    if (screen) {
      screen.getTracks().forEach(track => track.stop());
      
      // Restore camera video track
      if (peerRef.current && stream) {
        const videoTrack = stream.getVideoTracks()[0];
        
        const senders = peerRef.current._pc.getSenders();
        const sender = senders.find(s => s.track.kind === 'video');
        
        if (sender && videoTrack) {
          sender.replaceTrack(videoTrack);
        }
        
        // Restore local video
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      }
      
      setScreen(null);
      setIsScreenSharing(false);
    }
  };

  // Render the component
  return (
    <div className="app-container">
      <h1>WebRTC Video Chat</h1>
      
      {connectionStatus === 'error' && (
        <div className="connection-error">
          <p>Failed to connect to the server. Please check your internet connection and try again.</p>
          <button onClick={() => window.location.reload()}>Retry</button>
        </div>
      )}
      
      {!joined ? (
        <div className="join-container">
          <input
            type="text"
            placeholder="Enter your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button 
            onClick={joinRoom}
            disabled={connectionStatus !== 'connected' || !name}
          >
            Join
          </button>
          
          {connectionStatus === 'connecting' && <p>Connecting to server...</p>}
        </div>
      ) : (
        <div className="video-chat-container">
          <div className="video-container">
            <div className="video-box local-video">
              <h3>Your Video</h3>
              <video ref={localVideoRef} autoPlay muted playsInline />
              
              <div className="video-controls">
                <button onClick={toggleAudio} className={!audioEnabled ? 'disabled' : ''}>
                  {audioEnabled ? 'Mute' : 'Unmute'}
                </button>
                <button onClick={toggleVideo} className={!videoEnabled ? 'disabled' : ''}>
                  {videoEnabled ? 'Hide Video' : 'Show Video'}
                </button>
                {(callAccepted || calling) && (
                  <button 
                    onClick={toggleScreenShare}
                    className={isScreenSharing ? 'active' : ''}
                  >
                    {isScreenSharing ? 'Stop Sharing' : 'Share Screen'}
                  </button>
                )}
              </div>
            </div>
            
            {(callAccepted || calling) && (
              <div className="video-box remote-video">
                <h3>Remote Video</h3>
                <video ref={remoteVideoRef} autoPlay playsInline />
                <div className="call-status">{callStatus}</div>
                <button className="end-call-btn" onClick={() => handleEndCall()}>
                  End Call
                </button>
              </div>
            )}
          </div>

          {!callAccepted && !calling && (
            <div className="users-container">
              <h3>Online Users</h3>
              {users.length === 0 ? (
                <p>No users online</p>
              ) : (
                <ul>
                  {users.map((user) => (
                    <li key={user.id} className={user.inCall ? 'in-call' : ''}>
                      {user.name} {user.inCall && <span>(In Call)</span>}
                      <button 
                        onClick={() => callUser(user.id)}
                        disabled={user.inCall}
                      >
                        Call
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {receivingCall && !callAccepted && (
            <div className="incoming-call">
              <h3>{caller} is calling...</h3>
              <div className="call-buttons">
                <button onClick={answerCall}>Answer</button>
                <button onClick={declineCall}>Decline</button>
              </div>
            </div>
          )}
          
          {calling && !callAccepted && (
            <div className="outgoing-call">
              <h3>{callStatus}</h3>
              <button onClick={() => handleEndCall('Call cancelled')}>
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default App;