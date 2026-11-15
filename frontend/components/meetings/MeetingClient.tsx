'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { EmptyState, Spinner } from '@/components/ui/Feedback';
import { callsService } from '@/lib/services';
import { emitWithAck, getSocket } from '@/lib/socket';
import { useToast } from '@/components/ui/Toast';
import type { Meeting } from '@/types';

interface PeerStream {
  userId: string;
  stream: MediaStream | null;
}

export function MeetingClient({ roomCode }: { roomCode: string }) {
  const toast = useToast();
  const socket = getSocket();
  const localStreamRef = useRef<MediaStream | null>(null);
  const pcsRef = useRef(new Map<string, RTCPeerConnection>());
  const videoRefs = useRef(new Map<string, HTMLVideoElement>());
  const localVideoRef = useRef<HTMLVideoElement>(null);

  const [phase, setPhase] = useState<'idle' | 'loading' | 'joined'>('idle');
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [peerStreams, setPeerStreams] = useState<Record<string, MediaStream>>({});
  const [peerNames, setPeerNames] = useState<Record<string, string>>({});
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [leaving, setLeaving] = useState(false);

  const closePeers = useCallback(() => {
    pcsRef.current.forEach((pc) => pc.close());
    pcsRef.current.clear();
    setPeerStreams({});
  }, []);

  const cleanup = useCallback(() => {
    closePeers();
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    setMeeting(null);
    setPhase('idle');
  }, [closePeers]);

  useEffect(() => {
    if (phase !== 'joined') return;
    function onParticipantJoined(payload: { userId: string; username: string }) {
      setPeerNames((prev) => ({ ...prev, [payload.userId]: payload.username }));
    }
    function onParticipantLeft(payload: { userId: string }) {
      setPeerNames((prev) => {
        const next = { ...prev };
        delete next[payload.userId];
        return next;
      });
      const pc = pcsRef.current.get(payload.userId);
      if (pc) {
        pc.close();
        pcsRef.current.delete(payload.userId);
      }
    }
    function onSignal(payload: {
      fromUserId: string;
      username: string;
      signal: { description?: { type?: string; sdp?: string }; candidate?: RTCIceCandidateInit };
    }) {
      const pc = pcsRef.current.get(payload.fromUserId);
      if (!pc) return;
      void (async () => {
        if (payload.signal?.description) {
          const description = payload.signal.description;
          const init: RTCSessionDescriptionInit = {
            type: (description.type ?? 'offer') as RTCSessionDescriptionInit['type'],
            sdp: description.sdp ?? '',
          };
          await pc.setRemoteDescription(new RTCSessionDescription(init));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit('meeting:signal', { roomCode, signal: { description: pc.localDescription } });
        }
        if (payload.signal?.candidate) {
          await pc.addIceCandidate(new RTCIceCandidate(payload.signal.candidate)).catch(() => undefined);
        }
      })();
    }
    function onEnded() {
      setPhase('idle');
      cleanup();
    }

    socket.on('meeting:participant-joined', onParticipantJoined);
    socket.on('meeting:participant-left', onParticipantLeft);
    socket.on('meeting:signal', onSignal);
    socket.on('meeting:ended', onEnded);

    return () => {
      socket.off('meeting:participant-joined', onParticipantJoined);
      socket.off('meeting:participant-left', onParticipantLeft);
      socket.off('meeting:signal', onSignal);
      socket.off('meeting:ended', onEnded);
    };
  }, [phase, roomCode, socket, cleanup, camOn]);

  useEffect(() => {
    if (localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
  }, [phase]);

  useEffect(() => {
    if (phase !== 'joined') return;
    let cancelled = false;

    async function join() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: { width: 1280, height: 720 },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        localStreamRef.current = stream;
        if (camOn) {
          stream.getVideoTracks().forEach((t) => (t.enabled = true));
        } else {
          stream.getVideoTracks().forEach((t) => (t.enabled = false));
        }
        try {
          const result = await emitWithAck<{ ok: boolean; meeting?: Meeting; error?: string }>(
            'meeting:join',
            { roomCode },
          );
          if (cancelled) return;
          if (!result?.ok || !result.meeting) {
            toast.error(result?.error || 'Could not join this meeting');
            cleanup();
            return;
          }
          setMeeting(result.meeting);
          setPhase('joined');
        } catch {
          try {
            const meeting = await callsService.meeting(roomCode);
            setMeeting(meeting);
            await emitWithAck('meeting:join', { roomCode });
            setPhase('joined');
          } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Could not join this meeting');
            cleanup();
            return;
          }
        }
      } catch {
        if (!cancelled) toast.error('Microphone or camera access was blocked. Allow access and retry.');
        cleanup();
      }
    }

    void join();
    return () => {
      cancelled = true;
    };
  }, [phase, roomCode, cleanup, toast, camOn]);

  useEffect(
    () => () => {
      getSocket().emit('meeting:leave', { roomCode });
    },
    [roomCode],
  );

  async function leave() {
    setLeaving(true);
    try {
      getSocket().emit('meeting:leave', { roomCode });
      await callsService.leaveMeeting(roomCode);
      getSocket().emit('meeting:end', { roomCode });
      setPhase('idle');
      cleanup();
    } finally {
      setLeaving(false);
    }
  }

  const peerEntries = Object.entries(peerStreams);
  const showLocalVideo = camOn && Boolean(localStreamRef.current);

  if (phase === 'idle') {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <EmptyState
          title="Meeting unavailable"
          description="This meeting room could not be joined. The host may have ended it or you were not invited."
          icon={<span className="text-2xl">🫥</span>}
        />
      </div>
    );
  }

  if (phase === 'loading' || !meeting) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
        <Spinner />
        <p className="text-sm text-muted">Joining the meeting…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-white">
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
        <div className="grid gap-3">
          <div className="overflow-hidden rounded-xl border border-white/10 bg-black">
            <video ref={localVideoRef} autoPlay playsInline muted className="aspect-video w-full object-cover" />
            {(!showLocalVideo || !micOn) && (
              <div className="absolute flex h-full items-center justify-center bg-slate-950/80">
                <span className="text-2xl">{micOn ? '🎥' : '🎙️'}</span>
              </div>
            )}
          </div>
          {peerEntries.map(([userId, stream]) => (
            <div key={userId} className="overflow-hidden rounded-xl border border-white/10 bg-black">
              <video
                ref={(element) => {
                  if (element) videoRefs.current.set(userId, element);
                  else videoRefs.current.delete(userId);
                }}
                autoPlay
                playsInline
                className="aspect-video w-full object-cover"
              />
            </div>
          ))}
          {peerEntries.length === 0 && Object.keys(peerNames).length > 0 && (
            Object.keys(peerNames).map((userId) => (
              <div key={userId} className="overflow-hidden rounded-xl border border-white/10 bg-black/40">
                <div className="aspect-video w-full">
                  <Avatar src={null} name={peerNames[userId]} size="xl" />
                </div>
              </div>
            ))
          )}
        </div>

        <div className="rounded-xl border border-white/10 bg-slate-900 p-4">
          <h1 className="text-lg font-semibold">{meeting.title}</h1>
          <p className="mt-1 text-sm text-slate-300">{meeting.roomCode}</p>
          <p className="mt-1 text-xs text-slate-400">
            Status: {meeting.status} · Host: @{meeting.host?.username ?? 'unknown'}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              variant="danger"
              size="sm"
              loading={leaving}
              onClick={() => void leave()}
              disabled={meeting.status === 'ENDED'}
            >
              {meeting.status === 'ENDED' ? 'Meeting ended' : 'Leave meeting'}
            </Button>
            {meeting.status === 'ENDED' && (
              <Button size="sm" variant="secondary" disabled>
                Host ended this meeting
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
