'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { getSocket } from '@/lib/socket';
import { useAuth } from '@/hooks/useAuth';
import type { CallType, PostAuthor } from '@/types';

type Direction = 'incoming' | 'outgoing';
type CallPhase = 'ringing' | 'active';

interface CallSession {
  callId: string;
  type: CallType;
  direction: Direction;
  phase: CallPhase;
  other: Pick<PostAuthor, 'id' | 'username' | 'profile'>;
}

interface CallContextValue {
  startCall: (username: string, type: CallType) => void;
  inCall: boolean;
}

const CallContext = createContext<CallContextValue | undefined>(undefined);

function RemoteVideo({ stream, video }: { stream: MediaStream | null; video: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current && stream) ref.current.srcObject = stream;
  }, [stream]);
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      className={video ? 'h-full w-full object-cover' : 'hidden'}
    />
  );
}

export function CallProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const toast = useToast();
  const [session, setSession] = useState<CallSession | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [connecting, setConnecting] = useState(false);

  const sessionRef = useRef<CallSession | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localRef = useRef<MediaStream | null>(null);
  const pendingCandidates = useRef<RTCIceCandidateInit[]>([]);
  const localVideoRef = useRef<HTMLVideoElement>(null);

  const updateSession = useCallback((next: CallSession | null) => {
    sessionRef.current = next;
    setSession(next);
  }, []);

  const cleanup = useCallback(() => {
    localRef.current?.getTracks().forEach((track) => track.stop());
    localRef.current = null;
    setLocalStream(null);
    pcRef.current?.close();
    pcRef.current = null;
    pendingCandidates.current = [];
    setRemoteStream(null);
    setMuted(false);
    setCameraOff(false);
    setSeconds(0);
    setConnecting(false);
    updateSession(null);
  }, [updateSession]);

  const ensureLocalStream = useCallback(
    async (type: CallType) => {
      if (localRef.current) return localRef.current;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: type === 'VIDEO' ? { width: 1280, height: 720 } : false,
        });
        localRef.current = stream;
        setLocalStream(stream);
        return stream;
      } catch {
        toast.error('Camera or microphone access was blocked. Allow access and try again.');
        return null;
      }
    },
    [toast],
  );

  const createPeer = useCallback(
    (type: CallType, otherId: string) => {
      const stream = localRef.current;
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      });
      stream?.getTracks().forEach((track) => pc.addTrack(track, stream));
      pc.ontrack = (event) => {
        const [remote] = event.streams;
        if (remote) setRemoteStream(remote);
      };
      pc.onicecandidate = (event) => {
        const current = sessionRef.current;
        if (!event.candidate || !current) return;
        getSocket().emit('webrtc:signal', {
          callId: current.callId,
          toUserId: otherId,
          signal: { candidate: event.candidate.toJSON() },
        });
      };
      pcRef.current = pc;
      return pc;
    },
    [],
  );

  const sendOffer = useCallback(async () => {
    const current = sessionRef.current;
    if (!current || !localRef.current) return;
    try {
      setConnecting(true);
      const pc = createPeer(current.type, current.other.id);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      getSocket().emit('webrtc:signal', {
        callId: current.callId,
        toUserId: current.other.id,
        signal: { description: pc.localDescription },
      });
    } catch {
      toast.error('Could not start the call audio/video. Try again.');
      getSocket().emit('call:end', { callId: current.callId });
      cleanup();
    }
  }, [cleanup, createPeer, toast]);

  const startCall = useCallback(
    (username: string, type: CallType) => {
      if (sessionRef.current) {
        toast.info('You are already in a call');
        return;
      }
      if (!username || username === user?.username) return;
      const socket = getSocket();
      socket.emit(
        'call:start',
        { calleeUsername: username, type },
        (response: { ok: boolean; call?: any; error?: string }) => {
          if (!response?.ok || !response.call) {
            toast.error(response?.error || 'Could not start the call');
            return;
          }
          updateSession({
            callId: response.call.id,
            type,
            direction: 'outgoing',
            phase: 'ringing',
            other: response.call.callee,
          });
        },
      );
    },
    [toast, updateSession, user?.username],
  );

  const acceptCall = useCallback(() => {
    const current = sessionRef.current;
    if (!current) return;
    getSocket().emit(
      'call:accept',
      { callId: current.callId },
      async (response: { ok: boolean; error?: string }) => {
        if (!response?.ok) {
          toast.error(response?.error || 'Could not answer the call');
          cleanup();
          return;
        }
        updateSession({ ...current, phase: 'active' });
        await ensureLocalStream(current.type);
        // The caller sends the WebRTC offer once it receives "call:accepted".
      },
    );
  }, [cleanup, ensureLocalStream, toast, updateSession]);

  const rejectCall = useCallback(() => {
    const current = sessionRef.current;
    if (current) getSocket().emit('call:reject', { callId: current.callId });
    cleanup();
  }, [cleanup]);

  const endCall = useCallback(() => {
    const current = sessionRef.current;
    if (current) getSocket().emit('call:end', { callId: current.callId });
    cleanup();
  }, [cleanup]);

  useEffect(() => {
    if (!user) return;
    const socket = getSocket();

    function onIncoming(call: any) {
      if (sessionRef.current) {
        socket.emit('call:reject', { callId: call.id });
        return;
      }
      updateSession({
        callId: call.id,
        type: call.type,
        direction: 'incoming',
        phase: 'ringing',
        other: call.caller,
      });
    }

    async function onAccepted(call: any) {
      const current = sessionRef.current;
      if (!current || current.callId !== call.id) return;
      updateSession({ ...current, phase: 'active' });
      const stream = await ensureLocalStream(current.type);
      if (!stream) {
        socket.emit('call:end', { callId: current.callId });
        cleanup();
        return;
      }
      await sendOffer();
    }

    function onRejected(call: any) {
      const current = sessionRef.current;
      if (!current || current.callId !== call.id) return;
      toast.info('Call declined');
      cleanup();
    }

    function onEnded(call: any) {
      const current = sessionRef.current;
      if (!current || current.callId !== call.id) return;
      toast.info('Call ended');
      cleanup();
    }

    async function onSignal(payload: {
      callId: string;
      fromUserId: string;
      signal: { description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };
    }) {
      const current = sessionRef.current;
      if (!current || current.callId !== payload.callId) return;
      const signal = payload.signal;
      if (signal.description) {
        if (!pcRef.current) {
          const stream = await ensureLocalStream(current.type);
          if (!stream) return;
          createPeer(current.type, current.other.id);
        }
        const pc = pcRef.current!;
        await pc.setRemoteDescription(new RTCSessionDescription(signal.description));
        for (const candidate of pendingCandidates.current) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => undefined);
        }
        pendingCandidates.current = [];
        if (signal.description.type === 'offer') {
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit('webrtc:signal', {
            callId: current.callId,
            toUserId: current.other.id,
            signal: { description: pc.localDescription },
          });
        }
      } else if (signal.candidate) {
        if (pcRef.current?.remoteDescription) {
          await pcRef.current
            .addIceCandidate(new RTCIceCandidate(signal.candidate))
            .catch(() => undefined);
        } else {
          pendingCandidates.current.push(signal.candidate);
        }
      }
    }

    socket.on('call:incoming', onIncoming);
    socket.on('call:accepted', onAccepted);
    socket.on('call:rejected', onRejected);
    socket.on('call:ended', onEnded);
    socket.on('webrtc:signal', onSignal);

    return () => {
      socket.off('call:incoming', onIncoming);
      socket.off('call:accepted', onAccepted);
      socket.off('call:rejected', onRejected);
      socket.off('call:ended', onEnded);
      socket.off('webrtc:signal', onSignal);
    };
  }, [cleanup, createPeer, ensureLocalStream, sendOffer, toast, updateSession, user]);

  useEffect(() => {
    if (!session || session.phase !== 'active') return;
    const interval = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(interval);
  }, [session]);

  useEffect(() => {
    if (session?.phase !== 'ringing') return;
    const timeout = window.setTimeout(() => {
      const current = sessionRef.current;
      if (!current) return;
      if (current.direction === 'outgoing') {
        getSocket().emit('call:end', { callId: current.callId });
        toast.info('No answer');
        cleanup();
      }
    }, 45_000);
    return () => window.clearTimeout(timeout);
  }, [cleanup, session, toast]);

  useEffect(() => {
    if (localVideoRef.current && localStream) localVideoRef.current.srcObject = localStream;
  }, [localStream, session]);

  useEffect(() => () => cleanup(), [cleanup]);

  function toggleMute() {
    const stream = localRef.current;
    if (!stream) return;
    const next = !muted;
    stream.getAudioTracks().forEach((track) => {
      track.enabled = !next;
    });
    setMuted(next);
  }

  function toggleCamera() {
    const stream = localRef.current;
    if (!stream) return;
    const next = !cameraOff;
    stream.getVideoTracks().forEach((track) => {
      track.enabled = !next;
    });
    setCameraOff(next);
  }

  const value = useMemo<CallContextValue>(
    () => ({ startCall, inCall: Boolean(session) }),
    [session, startCall],
  );

  const minutes = String(Math.floor(seconds / 60)).padStart(2, '0');
  const secs = String(seconds % 60).padStart(2, '0');

  return (
    <CallContext.Provider value={value}>
      {children}
      {session && (
        <div className="fixed inset-0 z-[95] flex flex-col bg-slate-950 text-white">
          <div className="relative flex flex-1 items-center justify-center overflow-hidden">
            {session.phase === 'active' && session.type === 'VIDEO' ? (
              <RemoteVideo stream={remoteStream} video />
            ) : (
              <div className="flex flex-col items-center gap-3">
                <Avatar
                  src={session.other.profile?.avatarUrl}
                  name={session.other.username}
                  size="xl"
                />
                <p className="text-lg font-semibold">@{session.other.username}</p>
                <p className="text-sm text-slate-300">
                  {session.phase === 'ringing'
                    ? session.direction === 'incoming'
                      ? `Incoming ${session.type.toLowerCase()} call…`
                      : 'Calling…'
                    : `${minutes}:${secs}`}
                </p>
                {session.phase === 'active' && !remoteStream && (
                  <p className="text-xs text-slate-400">
                    {connecting ? 'Connecting media…' : 'Waiting for the other side…'}
                  </p>
                )}
              </div>
            )}

            {session.type === 'VIDEO' && session.phase === 'active' && (
              <div className="absolute bottom-4 right-4 h-36 w-24 overflow-hidden rounded-xl border border-white/20 bg-black/60 sm:h-44 sm:w-32">
                <video ref={localVideoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
                {cameraOff && (
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80 text-xs">
                    Camera off
                  </div>
                )}
              </div>
            )}

            {session.phase === 'active' && session.type === 'AUDIO' && (
              <RemoteVideo stream={remoteStream} video={false} />
            )}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 border-t border-white/10 bg-slate-950/80 px-4 py-5">
            {session.direction === 'incoming' && session.phase === 'ringing' ? (
              <>
                <Button variant="danger" onClick={rejectCall}>
                  Decline
                </Button>
                <Button onClick={acceptCall} className="bg-emerald-600 hover:bg-emerald-500">
                  Accept {session.type === 'VIDEO' ? 'video' : 'audio'} call
                </Button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={toggleMute}
                  className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/20"
                  aria-label={muted ? 'Unmute microphone' : 'Mute microphone'}
                  title={muted ? 'Unmute' : 'Mute'}
                >
                  {muted ? '🔇' : '🎙️'}
                </button>
                {session.type === 'VIDEO' && (
                  <button
                    type="button"
                    onClick={toggleCamera}
                    className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/20"
                    aria-label={cameraOff ? 'Turn camera on' : 'Turn camera off'}
                    title={cameraOff ? 'Camera on' : 'Camera off'}
                  >
                    {cameraOff ? '📷' : '🎥'}
                  </button>
                )}
                <Button variant="danger" onClick={endCall} className="h-12 px-6">
                  {session.phase === 'ringing' ? 'Cancel' : 'Leave call'}
                </Button>
                {session.phase === 'active' && (
                  <span className="ml-1 text-sm tabular-nums text-slate-300">
                    {minutes}:{secs}
                  </span>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </CallContext.Provider>
  );
}

export function useCall() {
  const context = useContext(CallContext);
  if (!context) throw new Error('useCall must be used inside CallProvider');
  return context;
}
