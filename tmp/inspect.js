const fs = require('fs');
const code = fs.readFileSync('/tmp/sesame-index.js', 'utf8');

// Find RTCPeerConnection context
let rtcIndex = code.indexOf('new RTCPeerConnection');
if (rtcIndex !== -1) {
  console.log('=== RTCPeerConnection CONTEXT ===');
  console.log(code.substring(rtcIndex - 300, rtcIndex + 600));
}

// Find WebRTC Transport class
let transIdx = code.indexOf('class WebRTCTransport');
if (transIdx === -1) transIdx = code.indexOf('WebRTC');
console.log('=== WebRTC mentions ===');
let pos = 0;
while ((pos = code.indexOf('RTCPeerConnection', pos)) !== -1) {
  console.log('Found RTCPeerConnection at', pos);
  console.log(code.substring(pos - 100, pos + 250));
  console.log('-------------------');
  pos += 17;
}

// Search for websocket or fetch urls
const urls = code.match(/https:\/\/[a-zA-Z0-9_\-\.]+\.[a-zA-Z]{2,}[^\s"'\`]*/g) || [];
console.log('=== HTTPS URLs ===');
console.log([...new Set(urls)].filter(u => !u.includes('w3.org') && !u.includes('github') && !u.includes('reactjs') && !u.includes('google.com') && !u.includes('gstatic') && !u.includes('stripe')).slice(0, 20));

// Search for character Maya
console.log('=== CHARACTER & VOICES ===');
const charIdx = code.indexOf('character_selector');
if (charIdx !== -1) {
  console.log(code.substring(charIdx - 200, charIdx + 400));
}
