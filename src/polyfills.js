// Polyfills for browser compatibility with simple-peer and other Node.js libraries

// Process polyfill
if (typeof window !== 'undefined') {
    if (!window.process) {
      window.process = {};
    }
    
    if (!window.process.env) {
      window.process.env = {};
    }
    
    if (!window.process.nextTick) {
      window.process.nextTick = function(callback) {
        setTimeout(callback, 0);
      };
    }
    
    if (!window.process.version) {
      window.process.version = 'v16.0.0'; // Fake a recent Node.js version
    }
    
    if (!window.process.browser) {
      window.process.browser = true;
    }
  }
  
  // Stream polyfill for _readableState issues
  if (typeof window !== 'undefined') {
    // Make sure EventEmitter doesn't throw on missing listeners
    if (!window.EventEmitter) {
      window.EventEmitter = class EventEmitter {
        constructor() {
          this.events = {};
        }
        
        on(event, listener) {
          if (!this.events[event]) {
            this.events[event] = [];
          }
          this.events[event].push(listener);
          return this;
        }
        
        removeListener(event, listener) {
          if (!this.events[event]) return this;
          this.events[event] = this.events[event].filter(l => l !== listener);
          return this;
        }
        
        emit(event, ...args) {
          if (!this.events[event]) return false;
          this.events[event].forEach(listener => {
            listener.apply(this, args);
          });
          return true;
        }
        
        once(event, listener) {
          const onceWrapper = (...args) => {
            listener.apply(this, args);
            this.removeListener(event, onceWrapper);
          };
          this.on(event, onceWrapper);
          return this;
        }
        
        removeAllListeners(event) {
          if (event) {
            this.events[event] = [];
          } else {
            this.events = {};
          }
          return this;
        }
      };
    }
  }
  
  // Buffer polyfill (minimal implementation)
  if (typeof window !== 'undefined' && !window.Buffer) {
    window.Buffer = {
      isBuffer: () => false
    };
  }
  
  // Fix for readable-stream issues
  if (typeof window !== 'undefined') {
    window._readableStreamNative = {};
    window._stream_readable = {
      ReadableState: function() {
        return {
          flowing: null,
          ended: false,
          endEmitted: false,
          length: 0,
          pipesCount: 0
        };
      }
    };
  }
  
  export default {};