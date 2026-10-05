const elements = {
  status: document.querySelector('#status'),
  remoteState: document.querySelector('#remoteState'),
  localVideo: document.querySelector('#localVideo'),
  remoteVideo: document.querySelector('#remoteVideo'),
  localCard: document.querySelector('.local-card'),
  remoteCard: document.querySelector('.remote-card'),
  joinForm: document.querySelector('#joinForm'),
  roomInput: document.querySelector('#roomInput'),
  joinButton: document.querySelector('#joinButton'),
  copyButton: document.querySelector('#copyButton'),
  micButton: document.querySelector('#micButton'),
  cameraButton: document.querySelector('#cameraButton'),
  leaveButton: document.querySelector('#leaveButton'),
  iceInfo: document.querySelector('#iceInfo')
};

let socket;
let peerConnection;
let localStream;
let pendingCandidates = [];
let iceServers = [];
let activeRoom = '';

initialize().catch((error) => setStatus(error.message, 'error'));

async function initialize() {
  const config = await fetch('config').then((response) => {
    if (!response.ok) throw new Error('Could not load network configuration.');
    return response.json();
  });
  iceServers = config.iceServers;
  const firstUrls = Array.isArray(iceServers[0]?.urls) ? iceServers[0].urls : [iceServers[0]?.urls];
  elements.iceInfo.textContent = `ICE: ${firstUrls.filter(Boolean).join(', ')}`;

  const params = new URLSearchParams(location.search);
  elements.roomInput.value = sanitizeRoom(params.get('room')) || createRoomCode();
}

elements.joinForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const roomId = sanitizeRoom(elements.roomInput.value);
  if (!roomId) {
    setStatus('Use a valid 4-64 character room code.', 'error');
    return;
  }

  elements.joinButton.disabled = true;
  elements.roomInput.disabled = true;
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    elements.localVideo.srcObject = localStream;
    elements.localCard.classList.add('has-video');
    activeRoom = roomId;
    history.replaceState(null, '', `?room=${encodeURIComponent(roomId)}`);
    await connectSignal();
    socket.send(JSON.stringify({ type: 'join', roomId }));
    setControls(true);
    setStatus('Waiting for peer', 'waiting');
  } catch (error) {
    stopLocalMedia();
    elements.joinButton.disabled = false;
    elements.roomInput.disabled = false;
    setStatus(humanizeMediaError(error), 'error');
  }
});

elements.copyButton.addEventListener('click', async () => {
  const roomId = activeRoom || sanitizeRoom(elements.roomInput.value);
  const invite = new URL(location.href);
  invite.searchParams.set('room', roomId);
  try {
    await navigator.clipboard.writeText(invite.toString());
    setStatus('Invite copied', 'waiting');
  } catch {
    setStatus('Copy the URL from your address bar.', 'error');
  }
});

elements.micButton.addEventListener('click', () => toggleTrack('audio', elements.micButton, 'Mute mic', 'Unmute mic'));
elements.cameraButton.addEventListener('click', () => toggleTrack('video', elements.cameraButton, 'Hide camera', 'Show camera'));
elements.leaveButton.addEventListener('click', leaveCall);
window.addEventListener('beforeunload', leaveCall);

function connectSignal() {
  return new Promise((resolve, reject) => {
    const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const basePath = location.pathname.endsWith('/') ? location.pathname : `${location.pathname}/`;
    socket = new WebSocket(`${scheme}//${location.host}${basePath}signal`);
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', () => reject(new Error('Could not connect to signaling service.')), { once: true });
    socket.addEventListener('message', (event) => handleSignal(JSON.parse(event.data)));
    socket.addEventListener('close', () => {
      if (activeRoom) {
        leaveCall();
        setStatus('Signaling disconnected', 'error');
      }
    });
  });
}

async function handleSignal(message) {
  try {
    if (message.type === 'peer-ready') {
      await createPeerConnection();
      elements.remoteState.textContent = 'Connecting';
      if (message.initiator) {
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        sendSignal({ type: 'offer', description: peerConnection.localDescription });
      }
      return;
    }
    if (message.type === 'offer') {
      await createPeerConnection();
      await peerConnection.setRemoteDescription(message.description);
      await flushCandidates();
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      sendSignal({ type: 'answer', description: peerConnection.localDescription });
      return;
    }
    if (message.type === 'answer') {
      await peerConnection.setRemoteDescription(message.description);
      await flushCandidates();
      return;
    }
    if (message.type === 'ice-candidate') {
      if (peerConnection?.remoteDescription) {
        await peerConnection.addIceCandidate(message.candidate);
      } else {
        pendingCandidates.push(message.candidate);
      }
      return;
    }
    if (message.type === 'peer-left') {
      resetPeer();
      setStatus('Peer left — waiting', 'waiting');
      elements.remoteState.textContent = 'Waiting';
      return;
    }
    if (message.type === 'error') {
      if (['room_full', 'invalid_room', 'already_joined'].includes(message.code)) {
        leaveCall();
      }
      throw new Error(message.message);
    }
  } catch (error) {
    setStatus(error.message || 'Signaling failed.', 'error');
  }
}

async function createPeerConnection() {
  if (peerConnection) return;
  peerConnection = new RTCPeerConnection({ iceServers });
  for (const track of localStream.getTracks()) {
    peerConnection.addTrack(track, localStream);
  }
  peerConnection.addEventListener('icecandidate', ({ candidate }) => {
    if (candidate) sendSignal({ type: 'ice-candidate', candidate });
  });
  peerConnection.addEventListener('track', ({ streams }) => {
    elements.remoteVideo.srcObject = streams[0];
    elements.remoteCard.classList.add('has-video');
  });
  peerConnection.addEventListener('connectionstatechange', () => {
    const state = peerConnection?.connectionState;
    elements.remoteState.textContent = state || 'Waiting';
    if (state === 'connected') setStatus('Call connected', 'live');
    if (state === 'failed') setStatus('Peer connection failed', 'error');
  });
}

async function flushCandidates() {
  for (const candidate of pendingCandidates) {
    await peerConnection.addIceCandidate(candidate);
  }
  pendingCandidates = [];
}

function sendSignal(message) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function toggleTrack(kind, button, enabledLabel, disabledLabel) {
  const track = localStream?.getTracks().find((candidate) => candidate.kind === kind);
  if (!track) return;
  track.enabled = !track.enabled;
  button.textContent = track.enabled ? enabledLabel : disabledLabel;
}

function leaveCall() {
  activeRoom = '';
  socket?.close();
  socket = null;
  resetPeer();
  stopLocalMedia();
  elements.localCard.classList.remove('has-video');
  elements.remoteState.textContent = 'Waiting';
  elements.micButton.textContent = 'Mute mic';
  elements.cameraButton.textContent = 'Hide camera';
  elements.joinButton.disabled = false;
  elements.roomInput.disabled = false;
  setControls(false);
  setStatus('Ready to join', 'idle');
}

function resetPeer() {
  peerConnection?.close();
  peerConnection = null;
  pendingCandidates = [];
  elements.remoteVideo.srcObject = null;
  elements.remoteCard.classList.remove('has-video');
}

function stopLocalMedia() {
  localStream?.getTracks().forEach((track) => track.stop());
  localStream = null;
  elements.localVideo.srcObject = null;
}

function setControls(active) {
  elements.micButton.disabled = !active;
  elements.cameraButton.disabled = !active;
  elements.leaveButton.disabled = !active;
}

function setStatus(message, state) {
  elements.status.textContent = message;
  elements.status.dataset.state = state;
}

function sanitizeRoom(value) {
  const room = typeof value === 'string' ? value.trim() : '';
  return /^[A-Za-z0-9_-]{4,64}$/.test(room) ? room : '';
}

function createRoomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return [...bytes].map((value) => value.toString(36).padStart(2, '0')).join('').slice(0, 10);
}

function humanizeMediaError(error) {
  if (error?.name === 'NotAllowedError') return 'Camera and microphone permission is required.';
  if (error?.name === 'NotFoundError') return 'No camera or microphone was found.';
  return error?.message || 'Could not start local media.';
}
