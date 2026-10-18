// =========================================================
// LOBBY & PREVIEW CONTROLLER
// =========================================================

let localStream = null;
let isAudioEnabled = true;
let isVideoEnabled = true;

// DOM Elements
const clockElement = document.getElementById('currentTime');
const previewVideo = document.getElementById('previewVideo');
const previewAvatar = document.getElementById('previewAvatar');
const previewAvatarLetter = document.getElementById('previewAvatarLetter');
const btnPreviewToggleAudio = document.getElementById('btnPreviewToggleAudio');
const btnPreviewToggleVideo = document.getElementById('btnPreviewToggleVideo');
const displayNameInput = document.getElementById('displayNameInput');
const btnStartInstantMeeting = document.getElementById('btnStartInstantMeeting');
const btnNewMeeting = document.getElementById('btnNewMeeting');
const btnOpenJoinModal = document.getElementById('btnOpenJoinModal');
const joinModal = document.getElementById('joinModal');
const btnCloseJoinModal = document.getElementById('btnCloseJoinModal');
const btnCancelJoin = document.getElementById('btnCancelJoin');
const btnConfirmJoin = document.getElementById('btnConfirmJoin');
const modalRoomIdInput = document.getElementById('modalRoomIdInput');
const modalDisplayNameInput = document.getElementById('modalDisplayNameInput');
const quickRoomCodeInput = document.getElementById('quickRoomCodeInput');
const btnQuickJoin = document.getElementById('btnQuickJoin');
const toastContainer = document.getElementById('toastContainer');

// Clock updater
function updateClock() {
  if (clockElement) {
    const now = new Date();
    clockElement.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + 
      ' • ' + now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  }
}
setInterval(updateClock, 1000);
updateClock();

// Load saved name
const savedName = localStorage.getItem('zoom_clone_user_name') || 'Guest ' + Math.floor(1000 + Math.random() * 9000);
if (displayNameInput) displayNameInput.value = savedName;
if (modalDisplayNameInput) modalDisplayNameInput.value = savedName;

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

// Initialize Local Camera & Microphone for Preview
async function initMediaPreview() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: true
    });
    previewVideo.srcObject = localStream;
  } catch (err) {
    console.warn('Could not acquire audio/video stream:', err);
    isVideoEnabled = false;
    isAudioEnabled = false;
    updatePreviewUI();
    showToast('Camera/Mic permission needed or device not available');
  }
}

function updatePreviewUI() {
  if (localStream) {
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) videoTrack.enabled = isVideoEnabled;
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) audioTrack.enabled = isAudioEnabled;
  }

  // Video UI
  if (isVideoEnabled) {
    previewVideo.style.display = 'block';
    previewAvatar.style.display = 'none';
    btnPreviewToggleVideo.classList.remove('disabled');
    btnPreviewToggleVideo.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="m22 8-6 4 6 4V8Z"/>
        <rect width="14" height="12" x="2" y="6" rx="2" ry="2"/>
      </svg>`;
  } else {
    previewVideo.style.display = 'none';
    previewAvatar.style.display = 'flex';
    const name = displayNameInput.value.trim() || 'U';
    previewAvatarLetter.textContent = name.charAt(0).toUpperCase();
    btnPreviewToggleVideo.classList.add('disabled');
    btnPreviewToggleVideo.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="m22 8-6 4 6 4V8Z"/>
        <rect width="14" height="12" x="2" y="6" rx="2" ry="2"/>
        <line x1="2" x2="22" y1="2" y2="22"/>
      </svg>`;
  }

  // Audio UI
  if (isAudioEnabled) {
    btnPreviewToggleAudio.classList.remove('disabled');
    btnPreviewToggleAudio.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
        <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
        <line x1="12" x2="12" y1="19" y2="22"/>
      </svg>`;
  } else {
    btnPreviewToggleAudio.classList.add('disabled');
    btnPreviewToggleAudio.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="2" x2="22" y1="2" y2="22"/>
        <path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2"/>
        <path d="M5 10v2a7 7 0 0 0 12 5"/>
        <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33"/>
        <path d="M9 9v3a3 3 0 0 0 5.12 2.12"/>
        <line x1="12" x2="12" y1="19" y2="22"/>
      </svg>`;
  }
}

btnPreviewToggleVideo.addEventListener('click', () => {
  isVideoEnabled = !isVideoEnabled;
  updatePreviewUI();
});

btnPreviewToggleAudio.addEventListener('click', () => {
  isAudioEnabled = !isAudioEnabled;
  updatePreviewUI();
});

displayNameInput.addEventListener('input', () => {
  const name = displayNameInput.value.trim() || 'U';
  previewAvatarLetter.textContent = name.charAt(0).toUpperCase();
  localStorage.setItem('zoom_clone_user_name', name);
  if (modalDisplayNameInput) modalDisplayNameInput.value = name;
});

// Create and Join Meeting helpers
async function startInstantMeeting() {
  const name = displayNameInput.value.trim() || 'Guest User';
  localStorage.setItem('zoom_clone_user_name', name);

  try {
    const res = await fetch('/api/new-room');
    const data = await res.json();
    const roomId = data.roomId;
    
    // Save preferences
    sessionStorage.setItem('initialAudio', isAudioEnabled ? 'true' : 'false');
    sessionStorage.setItem('initialVideo', isVideoEnabled ? 'true' : 'false');
    
    // Navigate
    window.location.href = `/room/${roomId}`;
  } catch (err) {
    showToast('Failed to create room. Please try again.');
  }
}

function parseRoomId(input) {
  if (!input) return null;
  input = input.trim();
  // If full URL was pasted, extract room ID
  if (input.includes('/room/')) {
    return input.split('/room/')[1].split('?')[0].split('#')[0];
  }
  if (input.includes('?room=')) {
    return new URL(input).searchParams.get('room');
  }
  return input;
}

function joinMeeting(roomId, name, audioOff = false, videoOff = false) {
  const cleanedId = parseRoomId(roomId);
  if (!cleanedId) {
    showToast('Please enter a valid Meeting ID');
    return;
  }
  const chosenName = name.trim() || 'Guest User';
  localStorage.setItem('zoom_clone_user_name', chosenName);
  sessionStorage.setItem('initialAudio', audioOff ? 'false' : 'true');
  sessionStorage.setItem('initialVideo', videoOff ? 'false' : 'true');
  window.location.href = `/room/${cleanedId}`;
}

// Event Listeners
btnStartInstantMeeting.addEventListener('click', startInstantMeeting);
btnNewMeeting.addEventListener('click', startInstantMeeting);

// Modal handling
btnOpenJoinModal.addEventListener('click', () => {
  joinModal.classList.add('active');
  modalRoomIdInput.focus();
});

btnCloseJoinModal.addEventListener('click', () => {
  joinModal.classList.remove('active');
});

btnCancelJoin.addEventListener('click', () => {
  joinModal.classList.remove('active');
});

btnConfirmJoin.addEventListener('click', () => {
  const roomId = modalRoomIdInput.value;
  const name = modalDisplayNameInput.value;
  const audioOff = document.getElementById('joinMutedCheck').checked;
  const videoOff = document.getElementById('joinVideoOffCheck').checked;
  joinMeeting(roomId, name, audioOff, videoOff);
});

btnQuickJoin.addEventListener('click', () => {
  const roomId = quickRoomCodeInput.value;
  const name = displayNameInput.value;
  joinMeeting(roomId, name);
});

quickRoomCodeInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    btnQuickJoin.click();
  }
});

modalRoomIdInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    btnConfirmJoin.click();
  }
});

// Check URL query parameters (e.g. ?room=xyz)
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.has('room')) {
  const targetRoom = urlParams.get('room');
  modalRoomIdInput.value = targetRoom;
  quickRoomCodeInput.value = targetRoom;
  joinModal.classList.add('active');
}

// Initialize on page load
initMediaPreview();
