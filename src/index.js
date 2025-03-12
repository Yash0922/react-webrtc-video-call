import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './polyfills';
import App from './App';
import reportWebVitals from './reportWebVitals';

const root = ReactDOM.createRoot(document.getElementById('root'));
// // Add this to the top of your index.js file
// if (typeof window !== 'undefined' && !window.process) {
//   window.process = {
//     env: {},
//     nextTick: function(callback) {
//       setTimeout(callback, 0);
//     }
//   };
// }
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
