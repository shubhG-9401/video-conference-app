# 🎥 Video Conference App (

A modern, full-featured **Zoom Clone** video conferencing web application built with **Node.js, Express, Socket.IO, and WebRTC (Mesh Architecture)**.

![Zoom Clone Preview](https://images.unsplash.com/photo-1588196749597-9ff075ee6b5b?auto=format&fit=crop&w=1200&q=80)

---

## ✨ Features

- 📹 **HD Video & Audio Calling**: Multi-peer WebRTC mesh network with Google STUN relay for crystal clear communication.
- 🎙️ **Microphone & Camera Controls**: Instant mute/unmute and camera toggles with avatar fallback and active speaker indicators.
- 🖥️ **Screen Sharing**: One-click full screen or window sharing with live track renegotiation across all connected peers.
- ⏺️ **Meeting Recording**: In-browser meeting recording using the native `MediaRecorder` API with instant `.webm` download.
- 💬 **In-Meeting Chat**: Real-time group messaging with unread notification badges and support for direct private messages.
- 👥 **Participants Panel**: Live roster displaying join status, host badge, mic/camera status, and a **Host "Mute All"** control.
- ✋ **Raise Hand & Emoji Reactions**: Floating animated reactions (👍, 👏, ❤️, 😂, 😮, 🎉) that bubble up over the meeting screen.
- 🎨 **Virtual Video Effects**: Switchable video filters including Soft Blur, Monochrome (B&W), and Warm Sepia.
- 🔗 **Instant Room Creation & Link Sharing**: Easy room ID generation, direct invite links, and one-click clipboard copying.
- 🖼️ **Flexible Layouts & PiP**: Dynamic responsive grid (1 to 9+ participants), Speaker View, Pin / Spotlight video, and Picture-in-Picture mode.
- ⌨️ **Keyboard Shortcuts**:
  - `Space` or `M` — Mute / Unmute microphone
  - `V` — Start / Stop camera

---

## 🚀 Quick Start

### 1. Prerequisites
Ensure you have [Node.js](https://nodejs.org/) installed (v16 or higher).

### 2. Clone the Repository
```bash
git clone https://github.com/shubhG-9401/video-conference-app.git
cd video-conference-app
```

### 3. Install Dependencies
```bash
npm install
```

### 4. Start the Application
```bash
npm start
```
The server will start on `http://localhost:5000`.

### 5. Join a Meeting
- Open `http://localhost:5000` in your browser.
- Check your camera and microphone in the live media preview.
- Click **"New Meeting"** or enter a Meeting ID to join.
- Open multiple browser tabs or windows to simulate multiple participants!

---

## 🏗️ Architecture & Technologies

- **Frontend**: Vanilla JavaScript (ES6+), HTML5 Canvas & MediaStreams, Modern CSS (CSS Grid, Flexbox, Glassmorphism).
- **Signaling Server**: Node.js & Express with Socket.IO for room coordination and WebRTC SDP/ICE candidate exchange.
- **Peer-to-Peer Media**: Native WebRTC (`RTCPeerConnection`) with STUN fallback (`stun.l.google.com:19302`).
- **Audio Processing**: Web Audio API (`AudioContext`, `AnalyserNode`) for active speaker detection and visualizer glowing borders.
- **Recording**: Web MediaStream Recording API (`MediaRecorder`).

---

## 📁 Project Structure

```
video-conference-app/
├── public/
│   ├── index.html        # Landing page, Lobby & media preview
│   ├── room.html         # In-meeting Zoom UI & grid
│   ├── css/
│   │   └── style.css     # Zoom dark theme styling & animations
│   └── js/
│       ├── lobby.js      # Lobby preview & room router
│       └── room.js       # WebRTC peer mesh, signaling & meeting controls
├── server.js             # Express & Socket.IO signaling server
├── package.json          # Dependencies & scripts
├── .gitignore            # Git ignore configuration
└── README.md             # Project documentation
```

---

## 📜 License

Distributed under the MIT License. See `LICENSE` for more information.
