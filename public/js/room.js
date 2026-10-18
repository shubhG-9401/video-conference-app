// =========================================================
// IN-MEETING (ZOOM CLONE) WEBRTC & CONTROLLER ENGINE
// =========================================================

// Extract room ID from URL pathname /room/:roomId or query string
function getRoomIdFromURL() {
  const pathParts = window.location.pathname.split('/');
  if (pathParts[1] === 'room' && pathParts[2]) {
    return pathParts[2];
  }
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('room')) return urlParams.get('room');
  return 'demo-room';
}

const currentRoomId = getRoomIdFromURL();
const currentUserName = localStorage.getItem('zoom_clone_user_name') || `User_${Math.floor(1000 + Math.random() * 9000)}`;
const initialAudioPref = sessionStorage.getItem('initialAudio') !== 'false';
const initialVideoPref = sessionStorage.getItem('initialVideo') !== 'false';

// State Variables
let localStream = null;
let screenStream = null;
let isAudioMuted = !initialAudioPref;
let isVideoStopped = !initialVideoPref;
let isSharingScreen = false;
let isHandRaised = false;
let isHost = false;
let currentHostId = null;
let isRecording = false;
let mediaRecorder = null;
let recordedChunks = [];
let recordingSeconds = 0;
let recordingInterval = null;
let meetingSeconds = 0;
let meetingTimerInterval = null;
let viewMode = 'speaker'; // 'grid' | 'speaker'
let pinnedSocketId = null;
let unreadChatCount = 0;

// WebRTC Peer Connections Map: socketId -> { peerConnection, dataChannel, user, stream, candidateQueue }
const peers = new Map();

// WebRTC ICE Servers (Google Public STUN)
const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
  ]
};

// Connect to Socket.IO signaling server
const socket = io();

// DOM Elements
const meetingLayout = document.getElementById('meetingLayout');
const videoGrid = document.getElementById('videoGrid');
const localVideo = document.getElementById('localVideo');
const localVideoCard = document.getElementById('localVideoCard');
const localAvatarPlaceholder = document.getElementById('localAvatarPlaceholder');
const localAvatarLetter = document.getElementById('localAvatarLetter');
const localHandBadge = document.getElementById('localHandBadge');
const localUserNameLabel = document.getElementById('localUserNameLabel');
const localMicBadge = document.getElementById('localMicBadge');
const displayRoomTitle = document.getElementById('displayRoomTitle');
const meetingTimer = document.getElementById('meetingTimer');
const btnMeetingInfoPill = document.getElementById('btnMeetingInfoPill');
const btnToggleView = document.getElementById('btnToggleView');
const viewModeLabel = document.getElementById('viewModeLabel');
const btnToggleFullscreen = document.getElementById('btnToggleFullscreen');

// Bottom Toolbar Buttons
const btnToggleAudio = document.getElementById('btnToggleAudio');
const audioIconContainer = document.getElementById('audioIconContainer');
const audioLabel = document.getElementById('audioLabel');
const btnToggleVideo = document.getElementById('btnToggleVideo');
const videoIconContainer = document.getElementById('videoIconContainer');
const videoLabel = document.getElementById('videoLabel');
const btnVideoEffects = document.getElementById('btnVideoEffects');
const btnToggleParticipants = document.getElementById('btnToggleParticipants');
const badgeParticipantCount = document.getElementById('badgeParticipantCount');
const btnToggleChat = document.getElementById('btnToggleChat');
const badgeChatUnread = document.getElementById('badgeChatUnread');
const btnShareScreen = document.getElementById('btnShareScreen');
const btnRecordMeeting = document.getElementById('btnRecordMeeting');
const recordLabel = document.getElementById('recordLabel');
const recordingIndicator = document.getElementById('recordingIndicator');
const recordingTimer = document.getElementById('recordingTimer');
const btnReactions = document.getElementById('btnReactions');
const reactionsPopup = document.getElementById('reactionsPopup');
const btnRaiseHandAction = document.getElementById('btnRaiseHandAction');
const raiseHandIcon = document.getElementById('raiseHandIcon');
const raiseHandText = document.getElementById('raiseHandText');
const floatingReactionsLayer = document.getElementById('floatingReactionsLayer');
const btnLeaveMeeting = document.getElementById('btnLeaveMeeting');

// Side Panels
const participantsPanel = document.getElementById('participantsPanel');
const btnCloseParticipants = document.getElementById('btnCloseParticipants');
const participantList = document.getElementById('participantList');
const participantPanelCount = document.getElementById('participantPanelCount');
const btnHostMuteAll = document.getElementById('btnHostMuteAll');
const chatPanel = document.getElementById('chatPanel');
const btnCloseChat = document.getElementById('btnCloseChat');
const chatMessages = document.getElementById('chatMessages');
const chatForm = document.getElementById('chatForm');
const chatInput = document.getElementById('chatInput');
const chatRecipientSelect = document.getElementById('chatRecipientSelect');

// Modals
const infoModal = document.getElementById('infoModal');
const btnCloseInfoModal = document.getElementById('btnCloseInfoModal');
const infoModalRoomId = document.getElementById('infoModalRoomId');
const infoModalInviteLink = document.getElementById('infoModalInviteLink');
const btnCopyRoomId = document.getElementById('btnCopyRoomId');
const btnCopyInviteLink = document.getElementById('btnCopyInviteLink');
const effectsModal = document.getElementById('effectsModal');
const btnCloseEffectsModal = document.getElementById('btnCloseEffectsModal');
const leaveModal = document.getElementById('leaveModal');
const btnCancelLeave = document.getElementById('btnCancelLeave');
const btnConfirmLeave = document.getElementById('btnConfirmLeave');
const toastContainer = document.getElementById('toastContainer');

// Set UI texts
if (displayRoomTitle) displayRoomTitle.textContent = `Meeting (${currentRoomId})`;
if (infoModalRoomId) infoModalRoomId.value = currentRoomId;
if (infoModalInviteLink) infoModalInviteLink.value = window.location.origin + `/room/${currentRoomId}`;
if (localUserNameLabel) localUserNameLabel.textContent = `${currentUserName} (You)`;
if (localAvatarLetter) localAvatarLetter.textContent = currentUserName.charAt(0).toUpperCase();

// Toast helper
function showToast(message, duration = 3000) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// Meeting timer
meetingTimerInterval = setInterval(() => {
  meetingSeconds++;
  const mins = String(Math.floor(meetingSeconds / 60)).padStart(2, '0');
  const secs = String(meetingSeconds % 60).padStart(2, '0');
  meetingTimer.textContent = `${mins}:${secs}`;
}, 1000);

// =========================================================
// LOCAL MEDIA STREAM INITIALIZATION
// =========================================================
async function setupLocalStream() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        facingMode: 'user'
      }
    });

    localVideo.srcObject = localStream;

    // Apply initial mute/video off preferences
    if (isAudioMuted) {
      localStream.getAudioTracks().forEach(t => t.enabled = false);
    }
    if (isVideoStopped) {
      localStream.getVideoTracks().forEach(t => t.enabled = false);
    }

    updateLocalMediaUI();
    setupAudioVisualizer(localStream, localVideoCard);

  } catch (err) {
    console.error('Failed to get media devices:', err);
    showToast('Camera/Microphone permission denied or unavailable');
    // Create silent dummy audio/video tracks if permissions denied so peer connection still functions
    localStream = createEmptyMediaStream();
    localVideo.srcObject = localStream;
    isAudioMuted = true;
    isVideoStopped = true;
    updateLocalMediaUI();
  }

  // Join Room via Socket.IO
  socket.emit('join-room', {
    roomId: currentRoomId,
    userId: socket.id,
    userName: currentUserName,
    isAudioEnabled: !isAudioMuted,
    isVideoEnabled: !isVideoStopped
  });
}

function createEmptyMediaStream() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const osc = ctx.createOscillator();
  const dst = osc.connect(ctx.createMediaStreamDestination());
  osc.start();
  const audioTrack = dst.stream.getAudioTracks()[0];
  audioTrack.enabled = false;

  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 360;
  const canvasCtx = canvas.getContext('2d');
  canvasCtx.fillStyle = '#1c1e28';
  canvasCtx.fillRect(0, 0, 640, 360);
  const stream = canvas.captureStream(10);
  const videoTrack = stream.getVideoTracks()[0];
  videoTrack.enabled = false;

  return new MediaStream([audioTrack, videoTrack]);
}

// =========================================================
// WEBRTC PEER CONNECTION MANAGEMENT
// =========================================================
function createPeerConnection(targetSocketId, targetUser) {
  const pc = new RTCPeerConnection(rtcConfig);
  const candidateQueue = [];

  // Add all local tracks to this connection
  if (localStream) {
    localStream.getTracks().forEach(track => {
      pc.addTrack(track, localStream);
    });
  }

  // Send ICE candidates to the target peer
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('send-ice-candidate', {
        targetSocketId,
        candidate: event.candidate
      });
    }
  };

  // Remote stream received
  pc.ontrack = (event) => {
    const remoteStream = event.streams[0];
    let peerObj = peers.get(targetSocketId);
    if (peerObj) {
      peerObj.stream = remoteStream;
      attachRemoteVideo(targetSocketId, remoteStream, peerObj.user);
    }
  };

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
      removePeer(targetSocketId);
    }
  };

  peers.set(targetSocketId, {
    peerConnection: pc,
    user: targetUser,
    stream: null,
    candidateQueue,
    isRemoteDescriptionSet: false
  });

  return pc;
}

// When this client joins, initiate offers to existing users
socket.on('room-joined', ({ self, hostId, existingUsers }) => {
  currentHostId = hostId;
  isHost = (self.socketId === hostId);
  if (isHost && btnHostMuteAll) {
    btnHostMuteAll.style.display = 'block';
  }

  updateParticipantsList();
  showToast(`Joined as ${self.userName}`);

  // Create connections and offers to all existing peers in the room
  existingUsers.forEach(user => {
    initiateCall(user.socketId, user);
  });
  updateVideoGridLayout();
});

// Initiator creates offer
async function initiateCall(targetSocketId, targetUser) {
  const pc = createPeerConnection(targetSocketId, targetUser);
  try {
    const offer = await pc.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true
    });
    await pc.setLocalDescription(offer);

    socket.emit('send-offer', {
      targetSocketId,
      callerUserId: socket.id,
      callerName: currentUserName,
      sdp: pc.localDescription
    });
  } catch (err) {
    console.error('Error creating offer:', err);
  }
}

// When a new user connects to the room
socket.on('user-connected', ({ user }) => {
  showToast(`${user.userName} joined the meeting`);
  // Add to peers list if not exists; the initiator will send an offer
  if (!peers.has(user.socketId)) {
    peers.set(user.socketId, {
      peerConnection: null,
      user,
      stream: null,
      candidateQueue: [],
      isRemoteDescriptionSet: false
    });
  }
  updateParticipantsList();
  updateChatTargetSelect();
  updateVideoGridLayout();
});

// Target peer receives offer
socket.on('receive-offer', async ({ callerSocketId, callerName, sdp }) => {
  let peerObj = peers.get(callerSocketId);
  const targetUser = peerObj ? peerObj.user : { userName: callerName, isMuted: false, isVideoOff: false };
  const pc = createPeerConnection(callerSocketId, targetUser);

  try {
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    const currentPeer = peers.get(callerSocketId);
    if (currentPeer) {
      currentPeer.isRemoteDescriptionSet = true;
      // Drain buffered ICE candidates
      while (currentPeer.candidateQueue.length > 0) {
        const cand = currentPeer.candidateQueue.shift();
        await pc.addIceCandidate(cand);
      }
    }

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    socket.emit('send-answer', {
      targetSocketId: callerSocketId,
      responderUserId: socket.id,
      sdp: pc.localDescription
    });
  } catch (err) {
    console.error('Error answering offer:', err);
  }
});

// Initiator receives answer
socket.on('receive-answer', async ({ responderSocketId, sdp }) => {
  const peerObj = peers.get(responderSocketId);
  if (peerObj && peerObj.peerConnection) {
    try {
      await peerObj.peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
      peerObj.isRemoteDescriptionSet = true;
      // Drain buffered ICE candidates
      while (peerObj.candidateQueue.length > 0) {
        const cand = peerObj.candidateQueue.shift();
        await peerObj.peerConnection.addIceCandidate(cand);
      }
    } catch (err) {
      console.error('Error handling answer:', err);
    }
  }
});

// ICE Candidate exchange
socket.on('receive-ice-candidate', async ({ senderSocketId, candidate }) => {
  const peerObj = peers.get(senderSocketId);
  if (peerObj && peerObj.peerConnection) {
    const iceCandidate = new RTCIceCandidate(candidate);
    if (peerObj.isRemoteDescriptionSet) {
      try {
        await peerObj.peerConnection.addIceCandidate(iceCandidate);
      } catch (err) {
        console.error('Failed to add ICE candidate:', err);
      }
    } else {
      peerObj.candidateQueue.push(iceCandidate);
    }
  }
});

// Participant departs
socket.on('user-disconnected', ({ socketId, userName }) => {
  showToast(`${userName || 'A participant'} left the meeting`);
  removePeer(socketId);
});

function removePeer(socketId) {
  const peerObj = peers.get(socketId);
  if (peerObj) {
    if (peerObj.peerConnection) {
      peerObj.peerConnection.close();
    }
    peers.delete(socketId);
  }
  const tile = document.getElementById(`peer-card-${socketId}`);
  if (tile) tile.remove();
  updateParticipantsList();
  updateChatTargetSelect();
  updateVideoGridLayout();
}

// Attach remote video tile in the grid
function attachRemoteVideo(socketId, stream, user) {
  let card = document.getElementById(`peer-card-${socketId}`);
  if (!card) {
    card = document.createElement('div');
    card.className = 'video-card';
    card.id = `peer-card-${socketId}`;

    const video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    video.srcObject = stream;

    const avatarPlaceholder = document.createElement('div');
    avatarPlaceholder.className = 'avatar-placeholder';
    avatarPlaceholder.id = `peer-avatar-${socketId}`;
    avatarPlaceholder.innerHTML = `<div class="avatar-bubble">${(user.userName || 'P').charAt(0).toUpperCase()}</div>`;

    const handBadge = document.createElement('div');
    handBadge.className = 'hand-raised-badge';
    handBadge.id = `peer-hand-${socketId}`;
    handBadge.textContent = '✋';
    handBadge.style.display = user.isHandRaised ? 'flex' : 'none';

    const tileActions = document.createElement('div');
    tileActions.className = 'video-tile-actions';
    tileActions.innerHTML = `
      <button class="tile-action-btn pin-btn" title="Pin Video">📌</button>
      <button class="tile-action-btn pip-btn" title="Picture-in-Picture">⧉</button>
    `;

    const footer = document.createElement('div');
    footer.className = 'video-card-footer';
    footer.innerHTML = `
      <span class="mic-badge ${user.isMuted ? 'muted' : ''}" id="peer-mic-${socketId}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
          <line x1="12" x2="12" y1="19" y2="22"/>
        </svg>
      </span>
      <span>${user.userName || 'Participant'}</span>
    `;

    card.appendChild(video);
    card.appendChild(avatarPlaceholder);
    card.appendChild(handBadge);
    card.appendChild(tileActions);
    card.appendChild(footer);
    videoGrid.appendChild(card);

    // Pin handler
    tileActions.querySelector('.pin-btn').addEventListener('click', () => {
      togglePinVideo(socketId);
    });

    // PiP handler
    tileActions.querySelector('.pip-btn').addEventListener('click', async () => {
      try {
        if (document.pictureInPictureElement) {
          await document.exitPictureInPicture();
        } else {
          await video.requestPictureInPicture();
        }
      } catch (e) {
        showToast('Picture-in-Picture not supported or active');
      }
    });

    setupAudioVisualizer(stream, card);
  } else {
    const video = card.querySelector('video');
    if (video.srcObject !== stream) {
      video.srcObject = stream;
    }
  }

  // Update card video off state
  const avatar = document.getElementById(`peer-avatar-${socketId}`);
  if (avatar) {
    avatar.classList.toggle('visible', !!user.isVideoOff);
  }

  updateVideoGridLayout();
}

// Adjust Grid CSS according to participant count
function updateVideoGridLayout() {
  const totalCards = videoGrid.querySelectorAll('.video-card').length;
  videoGrid.setAttribute('data-count', Math.min(totalCards, 9));
}

// Pin / Spotlight video
function togglePinVideo(targetId) {
  if (pinnedSocketId === targetId) {
    pinnedSocketId = null;
    meetingLayout.classList.remove('spotlight-active');
    document.querySelectorAll('.video-card').forEach(c => c.classList.remove('pinned'));
    viewModeLabel.textContent = 'Speaker View';
  } else {
    pinnedSocketId = targetId;
    meetingLayout.classList.add('spotlight-active');
    document.querySelectorAll('.video-card').forEach(c => c.classList.remove('pinned'));
    const targetCard = targetId === 'local' ? localVideoCard : document.getElementById(`peer-card-${targetId}`);
    if (targetCard) targetCard.classList.add('pinned');
    viewModeLabel.textContent = 'Gallery View';
  }
}

// =========================================================
// AUDIO VISUALIZER (ACTIVE SPEAKER GLOW)
// =========================================================
function setupAudioVisualizer(stream, cardElement) {
  try {
    const audioTrack = stream.getAudioTracks()[0];
    if (!audioTrack) return;

    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 64;
    const source = audioCtx.createMediaStreamSource(stream);
    source.connect(analyser);

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    function checkAudio() {
      if (!cardElement.isConnected) {
        audioCtx.close();
        return;
      }
      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i];
      }
      const avg = sum / bufferLength;

      // Threshold for speaking glow
      if (avg > 24) {
        cardElement.classList.add('speaking');
      } else {
        cardElement.classList.remove('speaking');
      }
      requestAnimationFrame(checkAudio);
    }
    checkAudio();
  } catch (e) {
    // Audio context may require user gesture on some browsers
  }
}

// =========================================================
// USER CONTROLS: MIC, VIDEO, SCREEN SHARE, EFFECTS
// =========================================================
function toggleAudio() {
  isAudioMuted = !isAudioMuted;
  if (localStream) {
    localStream.getAudioTracks().forEach(t => t.enabled = !isAudioMuted);
  }
  socket.emit('update-user-status', { isMuted: isAudioMuted });
  updateLocalMediaUI();
  updateParticipantsList();
}

function toggleVideo() {
  isVideoStopped = !isVideoStopped;
  if (localStream) {
    localStream.getVideoTracks().forEach(t => t.enabled = !isVideoStopped);
  }
  socket.emit('update-user-status', { isVideoOff: isVideoStopped });
  updateLocalMediaUI();
  updateParticipantsList();
}

function updateLocalMediaUI() {
  // Mic Button UI
  if (isAudioMuted) {
    btnToggleAudio.classList.add('danger-active');
    audioLabel.textContent = 'Unmute';
    localMicBadge.classList.add('muted');
    audioIconContainer.innerHTML = `
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="2" x2="22" y1="2" y2="22"/>
        <path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2"/>
        <path d="M5 10v2a7 7 0 0 0 12 5"/>
        <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33"/>
        <path d="M9 9v3a3 3 0 0 0 5.12 2.12"/>
        <line x1="12" x2="12" y1="19" y2="22"/>
      </svg>`;
  } else {
    btnToggleAudio.classList.remove('danger-active');
    audioLabel.textContent = 'Mute';
    localMicBadge.classList.remove('muted');
    audioIconContainer.innerHTML = `
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
        <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
        <line x1="12" x2="12" y1="19" y2="22"/>
      </svg>`;
  }

  // Camera Button UI
  if (isVideoStopped) {
    btnToggleVideo.classList.add('danger-active');
    videoLabel.textContent = 'Start Video';
    localAvatarPlaceholder.classList.add('visible');
    videoIconContainer.innerHTML = `
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="m22 8-6 4 6 4V8Z"/>
        <rect width="14" height="12" x="2" y="6" rx="2" ry="2"/>
        <line x1="2" x2="22" y1="2" y2="22"/>
      </svg>`;
  } else {
    btnToggleVideo.classList.remove('danger-active');
    videoLabel.textContent = 'Stop Video';
    localAvatarPlaceholder.classList.remove('visible');
    videoIconContainer.innerHTML = `
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="m22 8-6 4 6 4V8Z"/>
        <rect width="14" height="12" x="2" y="6" rx="2" ry="2"/>
      </svg>`;
  }
}

// Screen Sharing
async function toggleScreenShare() {
  if (!isSharingScreen) {
    try {
      screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always' },
        audio: true
      });

      const screenTrack = screenStream.getVideoTracks()[0];
      replaceVideoTrackInPeers(screenTrack);
      localVideo.srcObject = screenStream;
      localVideoCard.classList.remove('local-video'); // Don't mirror screen share
      isSharingScreen = true;

      btnShareScreen.querySelector('.tool-btn-label').textContent = 'Stop Share';
      btnShareScreen.classList.add('danger-active');
      socket.emit('screen-share-status', { isSharing: true });

      screenTrack.onended = () => {
        stopScreenSharing();
      };

      showToast('Screen sharing started');
    } catch (err) {
      console.warn('Screen share cancelled or failed:', err);
    }
  } else {
    stopScreenSharing();
  }
}

function stopScreenSharing() {
  if (screenStream) {
    screenStream.getTracks().forEach(track => track.stop());
    screenStream = null;
  }
  if (localStream) {
    const webcamTrack = localStream.getVideoTracks()[0];
    replaceVideoTrackInPeers(webcamTrack);
    localVideo.srcObject = localStream;
    localVideoCard.classList.add('local-video'); // Restore selfie mirror
  }
  isSharingScreen = false;
  btnShareScreen.querySelector('.tool-btn-label').textContent = 'Share Screen';
  btnShareScreen.classList.remove('danger-active');
  socket.emit('screen-share-status', { isSharing: false });
  showToast('Screen sharing stopped');
}

function replaceVideoTrackInPeers(newTrack) {
  peers.forEach(({ peerConnection }) => {
    if (peerConnection) {
      const senders = peerConnection.getSenders();
      const videoSender = senders.find(s => s.track && s.track.kind === 'video');
      if (videoSender && newTrack) {
        videoSender.replaceTrack(newTrack);
      }
    }
  });
}

// =========================================================
// MEETING RECORDING (MEDIARECORDER DOWNLOAD)
// =========================================================
function toggleRecording() {
  if (!isRecording) {
    startMeetingRecording();
  } else {
    stopMeetingRecording();
  }
}

function startMeetingRecording() {
  try {
    const streamToRecord = screenStream || localStream;
    if (!streamToRecord) {
      showToast('No active stream to record');
      return;
    }

    recordedChunks = [];
    const options = { mimeType: 'video/webm;codecs=vp9,opus' };
    
    // Fallback for browsers that don't support vp9
    try {
      mediaRecorder = new MediaRecorder(streamToRecord, options);
    } catch (e) {
      mediaRecorder = new MediaRecorder(streamToRecord);
    }

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    };

    mediaRecorder.onstop = saveRecordingFile;
    mediaRecorder.start(1000); // 1s slice
    isRecording = true;

    // UI Updates
    recordLabel.textContent = 'Stop REC';
    btnRecordMeeting.classList.add('danger-active');
    recordingIndicator.classList.add('active');
    recordingSeconds = 0;
    recordingInterval = setInterval(() => {
      recordingSeconds++;
      const mins = String(Math.floor(recordingSeconds / 60)).padStart(2, '0');
      const secs = String(recordingSeconds % 60).padStart(2, '0');
      recordingTimer.textContent = `${mins}:${secs}`;
    }, 1000);

    showToast('🔴 Recording started');
  } catch (err) {
    console.error('Recording failed:', err);
    showToast('Failed to start recording');
  }
}

function stopMeetingRecording() {
  if (mediaRecorder && isRecording) {
    mediaRecorder.stop();
    isRecording = false;
    clearInterval(recordingInterval);
    recordingIndicator.classList.remove('active');
    recordLabel.textContent = 'Record';
    btnRecordMeeting.classList.remove('danger-active');
    showToast('Saving recording...');
  }
}

function saveRecordingFile() {
  const blob = new Blob(recordedChunks, { type: 'video/webm' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = url;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  a.download = `meeting-recording-${currentRoomId}-${timestamp}.webm`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    showToast('Meeting recording downloaded! 🎉');
  }, 100);
}

// =========================================================
// STATUS UPDATES, HAND RAISE & HOST CONTROLS
// =========================================================
socket.on('user-status-updated', ({ socketId, status }) => {
  const peerObj = peers.get(socketId);
  if (peerObj) {
    Object.assign(peerObj.user, status);
  }

  // Update Peer Video UI
  const micBadge = document.getElementById(`peer-mic-${socketId}`);
  if (micBadge && status.isMuted !== undefined) {
    micBadge.classList.toggle('muted', status.isMuted);
  }

  const avatar = document.getElementById(`peer-avatar-${socketId}`);
  if (avatar && status.isVideoOff !== undefined) {
    avatar.classList.toggle('visible', status.isVideoOff);
  }

  const handBadge = document.getElementById(`peer-hand-${socketId}`);
  if (handBadge && status.isHandRaised !== undefined) {
    handBadge.style.display = status.isHandRaised ? 'flex' : 'none';
  }

  updateParticipantsList();
});

// Host Mute All notification
socket.on('host-muted-all', () => {
  if (!isAudioMuted) {
    toggleAudio();
    showToast('You have been muted by the host');
  }
});

// Toggle Hand Raise
function toggleRaiseHand() {
  isHandRaised = !isHandRaised;
  localHandBadge.style.display = isHandRaised ? 'flex' : 'none';
  raiseHandText.textContent = isHandRaised ? 'Lower Hand' : 'Raise Hand';
  btnRaiseHandAction.style.background = isHandRaised ? 'rgba(234, 59, 67, 0.2)' : 'rgba(245, 158, 11, 0.15)';
  
  socket.emit('update-user-status', { isHandRaised });
  reactionsPopup.classList.remove('active');
  updateParticipantsList();
  showToast(isHandRaised ? 'Hand raised ✋' : 'Hand lowered');
}

// =========================================================
// FLOATING REACTIONS & EMOJIS
// =========================================================
function sendReaction(emoji) {
  socket.emit('send-reaction', { emoji });
  reactionsPopup.classList.remove('active');
}

socket.on('receive-reaction', ({ socketId, userName, emoji }) => {
  spawnFloatingReaction(emoji);
});

function spawnFloatingReaction(emoji) {
  const elem = document.createElement('div');
  elem.className = 'floating-reaction';
  elem.textContent = emoji;
  // Random horizontal position across bottom
  const randomX = Math.floor(20 + Math.random() * 60);
  elem.style.left = `${randomX}%`;
  floatingReactionsLayer.appendChild(elem);

  setTimeout(() => {
    elem.remove();
  }, 2800);
}

// =========================================================
// PARTICIPANTS PANEL & ROSTER
// =========================================================
function updateParticipantsList() {
  participantList.innerHTML = '';

  const totalCount = 1 + peers.size;
  badgeParticipantCount.textContent = totalCount;
  participantPanelCount.textContent = totalCount;

  // Add Local User
  appendParticipantItem({
    socketId: socket.id,
    userName: currentUserName,
    isMuted: isAudioMuted,
    isVideoOff: isVideoStopped,
    isHandRaised,
    isHost,
    isSelf: true
  });

  // Add Peers
  peers.forEach((peerObj, sId) => {
    appendParticipantItem({
      socketId: sId,
      userName: peerObj.user.userName,
      isMuted: peerObj.user.isMuted,
      isVideoOff: peerObj.user.isVideoOff,
      isHandRaised: peerObj.user.isHandRaised,
      isHost: (sId === currentHostId),
      isSelf: false
    });
  });
}

function appendParticipantItem(user) {
  const item = document.createElement('div');
  item.className = 'participant-item';

  const avatarInitial = (user.userName || 'P').charAt(0).toUpperCase();

  item.innerHTML = `
    <div class="participant-info">
      <div class="participant-avatar">${avatarInitial}</div>
      <div class="participant-name-col">
        <span class="participant-name">${user.userName} ${user.isSelf ? '(You)' : ''}</span>
        <span class="participant-role">${user.isHost ? 'Host' : 'Participant'}</span>
      </div>
    </div>
    <div class="participant-status-icons">
      ${user.isHandRaised ? '<span title="Hand Raised">✋</span>' : ''}
      <span class="status-icon ${user.isMuted ? 'muted' : ''}">
        ${user.isMuted ? '🔇' : '🎙️'}
      </span>
      <span class="status-icon">
        ${user.isVideoOff ? '🚫' : '📹'}
      </span>
    </div>
  `;

  participantList.appendChild(item);
}

// =========================================================
// IN-MEETING CHAT
// =========================================================
function updateChatTargetSelect() {
  const currentSelection = chatRecipientSelect.value;
  chatRecipientSelect.innerHTML = '<option value="everyone">Everyone</option>';
  peers.forEach((peerObj, sId) => {
    const opt = document.createElement('option');
    opt.value = sId;
    opt.textContent = `${peerObj.user.userName} (Direct)`;
    chatRecipientSelect.appendChild(opt);
  });
  chatRecipientSelect.value = currentSelection || 'everyone';
}

chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;

  const targetSocketId = chatRecipientSelect.value === 'everyone' ? null : chatRecipientSelect.value;
  socket.emit('send-chat', { message: text, targetSocketId });
  chatInput.value = '';
});

socket.on('receive-chat', (chatPayload) => {
  renderChatMessage(chatPayload);

  // If chat panel is not open, increment unread badge
  if (!chatPanel.classList.contains('open')) {
    unreadChatCount++;
    badgeChatUnread.textContent = unreadChatCount;
    badgeChatUnread.style.display = 'block';
  }
});

function renderChatMessage({ senderName, message, time, isPrivate, isSelfCopy }) {
  const bubble = document.createElement('div');
  bubble.className = `chat-message-bubble ${isSelfCopy ? 'self' : ''}`;

  let labelText = senderName;
  if (isPrivate) {
    labelText += isSelfCopy ? ' (Direct to Participant)' : ' (Direct Message)';
  }

  bubble.innerHTML = `
    <div class="chat-bubble-header">
      <span class="sender-name">${labelText}</span>
      <span>${time}</span>
    </div>
    <div class="chat-text">${escapeHTML(message)}</div>
  `;

  chatMessages.appendChild(bubble);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function escapeHTML(str) {
  return str.replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}

// =========================================================
// EVENT LISTENERS & UI WIDGET HANDLERS
// =========================================================

// Audio / Video toggles
btnToggleAudio.addEventListener('click', toggleAudio);
btnToggleVideo.addEventListener('click', toggleVideo);
btnShareScreen.addEventListener('click', toggleScreenShare);
btnRecordMeeting.addEventListener('click', toggleRecording);
btnRaiseHandAction.addEventListener('click', toggleRaiseHand);

// Host Mute All
if (btnHostMuteAll) {
  btnHostMuteAll.addEventListener('click', () => {
    if (confirm('Mute all other participants in the meeting?')) {
      socket.emit('mute-all');
      showToast('Requested all participants to mute');
    }
  });
}

// Reactions popup toggle
btnReactions.addEventListener('click', (e) => {
  e.stopPropagation();
  reactionsPopup.classList.toggle('active');
});

document.addEventListener('click', (e) => {
  if (!reactionsPopup.contains(e.target) && e.target !== btnReactions) {
    reactionsPopup.classList.remove('active');
  }
});

document.querySelectorAll('.reaction-emoji-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    sendReaction(btn.dataset.emoji);
  });
});

// Side panels toggle
btnToggleParticipants.addEventListener('click', () => {
  chatPanel.classList.remove('open');
  btnToggleChat.classList.remove('active');
  participantsPanel.classList.toggle('open');
  btnToggleParticipants.classList.toggle('active', participantsPanel.classList.contains('open'));
});

btnCloseParticipants.addEventListener('click', () => {
  participantsPanel.classList.remove('open');
  btnToggleParticipants.classList.remove('active');
});

btnToggleChat.addEventListener('click', () => {
  participantsPanel.classList.remove('open');
  btnToggleParticipants.classList.remove('active');
  chatPanel.classList.toggle('open');
  btnToggleChat.classList.toggle('active', chatPanel.classList.contains('open'));

  if (chatPanel.classList.contains('open')) {
    unreadChatCount = 0;
    badgeChatUnread.style.display = 'none';
    chatInput.focus();
  }
});

btnCloseChat.addEventListener('click', () => {
  chatPanel.classList.remove('open');
  btnToggleChat.classList.remove('active');
});

// View mode toggle
btnToggleView.addEventListener('click', () => {
  if (viewMode === 'grid') {
    viewMode = 'speaker';
    viewModeLabel.textContent = 'Speaker View';
    togglePinVideo(null);
  } else {
    viewMode = 'grid';
    viewModeLabel.textContent = 'Gallery View';
    togglePinVideo('local');
  }
});

// Fullscreen
btnToggleFullscreen.addEventListener('click', () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen().catch(() => {});
  }
});

// Local Pin & PiP
document.getElementById('btnPinLocal').addEventListener('click', () => {
  togglePinVideo('local');
});

document.getElementById('btnPipLocal').addEventListener('click', async () => {
  try {
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
    } else {
      await localVideo.requestPictureInPicture();
    }
  } catch (e) {
    showToast('Picture-in-Picture not supported');
  }
});

// Meeting Info Modal
btnMeetingInfoPill.addEventListener('click', () => {
  infoModal.classList.add('active');
});

btnCloseInfoModal.addEventListener('click', () => {
  infoModal.classList.remove('active');
});

btnCopyRoomId.addEventListener('click', () => {
  navigator.clipboard.writeText(currentRoomId);
  showToast('Meeting ID copied to clipboard! 📋');
});

btnCopyInviteLink.addEventListener('click', () => {
  navigator.clipboard.writeText(infoModalInviteLink.value);
  showToast('Invite link copied to clipboard! 🔗');
});

// Video Effects Modal & Filters
btnVideoEffects.addEventListener('click', () => {
  effectsModal.classList.add('active');
});

btnCloseEffectsModal.addEventListener('click', () => {
  effectsModal.classList.remove('active');
});

document.getElementById('filterNone').addEventListener('click', () => {
  localVideo.style.filter = 'none';
  effectsModal.classList.remove('active');
  showToast('Normal video');
});

document.getElementById('filterBlur').addEventListener('click', () => {
  localVideo.style.filter = 'blur(3px)';
  effectsModal.classList.remove('active');
  showToast('Soft blur effect enabled');
});

document.getElementById('filterBw').addEventListener('click', () => {
  localVideo.style.filter = 'grayscale(100%) contrast(1.1)';
  effectsModal.classList.remove('active');
  showToast('Black & White effect enabled');
});

document.getElementById('filterSepia').addEventListener('click', () => {
  localVideo.style.filter = 'sepia(80%)';
  effectsModal.classList.remove('active');
  showToast('Warm sepia effect enabled');
});

// Leave Meeting Modal
btnLeaveMeeting.addEventListener('click', () => {
  leaveModal.classList.add('active');
});

btnCancelLeave.addEventListener('click', () => {
  leaveModal.classList.remove('active');
});

btnConfirmLeave.addEventListener('click', () => {
  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
  }
  if (screenStream) {
    screenStream.getTracks().forEach(t => t.stop());
  }
  socket.disconnect();
  window.location.href = '/';
});

// Keyboard Shortcuts: Space (toggle mute), M (mute), V (video)
window.addEventListener('keydown', (e) => {
  // Ignore shortcuts if user is typing in chat or input
  if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') {
    return;
  }
  if (e.code === 'Space') {
    e.preventDefault();
    toggleAudio();
  } else if (e.key === 'm' || e.key === 'M') {
    toggleAudio();
  } else if (e.key === 'v' || e.key === 'V') {
    toggleVideo();
  }
});

// Start Engine
setupLocalStream();
