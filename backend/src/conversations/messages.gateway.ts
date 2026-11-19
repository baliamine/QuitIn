import { Logger, OnModuleInit } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConversationsService } from './conversations.service';
import { CallsService } from '../calls/calls.service';
import { SendMessageDto } from './dto/conversation.dto';
import { NOTIFICATION_NEW, notificationEvents } from '../notifications/notification-events';

function parseCookies(header?: string): Record<string, string> {
  if (!header) return {};
  return header.split(';').reduce<Record<string, string>>((acc, part) => {
    const idx = part.indexOf('=');
    if (idx > -1) {
      const key = part.slice(0, idx).trim();
      const value = part.slice(idx + 1).trim();
      if (key) acc[key] = decodeURIComponent(value);
    }
    return acc;
  }, {});
}

interface AuthSocket extends Socket {
  userId?: string;
  username?: string;
}

@WebSocketGateway({
  cors: {
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
    credentials: true,
  },
})
export class MessagesGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit {
  private readonly logger = new Logger(MessagesGateway.name);

  /** userId -> connected socket ids (a user can have several tabs open). */
  private readonly online = new Map<string, Set<string>>();

  @WebSocketServer()
  server: Server;

  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
    private readonly conversations: ConversationsService,
    private readonly calls: CallsService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    // Notifications are global; forwarding them here lets the socket gateway
    // stay the single place that talks to connected clients.
    notificationEvents.on(NOTIFICATION_NEW, (payload: { userId: string; notification: unknown }) => {
      this.server?.to(`user:${payload.userId}`).emit('notification:new', payload.notification);
    });
  }

  async handleConnection(client: AuthSocket) {
    try {
      const cookieName = this.config.get<string>('COOKIE_NAME', 'quitin_token');
      const cookies = parseCookies(client.handshake.headers.cookie);
      const token = cookies[cookieName] ?? (client.handshake.auth?.token as string | undefined);
      if (!token) {
        client.disconnect();
        return;
      }
      const payload = await this.auth.verifyToken(token);
      if (!payload?.sub) {
        client.disconnect();
        return;
      }
      client.userId = payload.sub;
      client.username = payload.username;

      // Join a personal room (for direct notifications) and all conversation rooms.
      client.join(`user:${payload.sub}`);
      const conversationIds = await this.conversations.conversationIdsForUser(payload.sub);
      conversationIds.forEach((id) => client.join(`conversation:${id}`));

      const sockets = this.online.get(payload.sub) ?? new Set<string>();
      const firstConnection = sockets.size === 0;
      sockets.add(client.id);
      this.online.set(payload.sub, sockets);

      if (firstConnection) {
        this.server.emit('presence:update', {
          userId: payload.sub,
          online: true,
          lastActiveAt: new Date().toISOString(),
        });
      }

      this.logger.log(`Socket connected: ${payload.username} (${client.id})`);
    } catch (err) {
      this.logger.warn(`Socket auth failed: ${(err as Error).message}`);
      client.disconnect();
    }
  }

  async handleDisconnect(client: AuthSocket) {
    this.logger.log(`Socket disconnected: ${client.id}`);
    if (!client.userId) return;

    const sockets = this.online.get(client.userId);
    sockets?.delete(client.id);
    if (sockets && sockets.size === 0) {
      this.online.delete(client.userId);
      const lastActiveAt = new Date();
      try {
        await this.prisma.user.update({
          where: { id: client.userId },
          data: { lastActiveAt },
        });
      } catch {
        // Presence persistence is best-effort.
      }
      this.server.emit('presence:update', {
        userId: client.userId,
        online: false,
        lastActiveAt: lastActiveAt.toISOString(),
      });
    }
  }

  @SubscribeMessage('presence:query')
  handlePresenceQuery(@MessageBody() body: { userIds?: string[] }) {
    const ids = body?.userIds ?? [];
    return ids.map((id) => ({
      userId: id,
      online: (this.online.get(id)?.size ?? 0) > 0,
    }));
  }

  @SubscribeMessage('conversation:join')
  async handleJoin(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() body: { conversationId: string },
  ) {
    if (!client.userId || !body?.conversationId) return { ok: false };
    try {
      await this.conversations.assertParticipant(client.userId, body.conversationId);
      client.join(`conversation:${body.conversationId}`);
      return { ok: true };
    } catch {
      return { ok: false };
    }
  }

  @SubscribeMessage('message:send')
  async handleMessage(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() body: { conversationId: string } & SendMessageDto,
  ) {
    if (!client.userId) return { ok: false, error: 'unauthorized' };
    if (!body?.conversationId) return { ok: false, error: 'invalid payload' };

    try {
      const message = await this.conversations.sendMessage(client.userId, body.conversationId, {
        content: body.content,
        replyToId: body.replyToId,
        attachments: body.attachments,
      });
      const room = `conversation:${body.conversationId}`;
      this.server.to(room).emit('message:new', message);

      const participants = await this.conversations.participantIds(body.conversationId);
      participants
        .filter((id) => id !== client.userId)
        .forEach((id) => {
          this.server.to(`user:${id}`).emit('conversation:updated', {
            conversationId: body.conversationId,
            lastMessage: message,
          });
        });

      return { ok: true, message };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  @SubscribeMessage('message:edit')
  async handleEdit(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() body: { messageId: string; content: string },
  ) {
    if (!client.userId || !body?.messageId || !body.content?.trim()) return { ok: false };
    try {
      const message = await this.conversations.editMessage(
        client.userId,
        body.messageId,
        body.content,
      );
      this.server
        .to(`conversation:${message.conversationId}`)
        .emit('message:updated', message);
      return { ok: true, message };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  @SubscribeMessage('message:delete')
  async handleDelete(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() body: { messageId: string },
  ) {
    if (!client.userId || !body?.messageId) return { ok: false };
    try {
      const message = await this.conversations.deleteMessage(client.userId, body.messageId);
      this.server
        .to(`conversation:${message.conversationId}`)
        .emit('message:updated', message);
      return { ok: true, message };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  @SubscribeMessage('message:react')
  async handleReact(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() body: { messageId: string; emoji: string },
  ) {
    if (!client.userId || !body?.messageId || !body.emoji) return { ok: false };
    try {
      const message = await this.conversations.reactMessage(
        client.userId,
        body.messageId,
        body.emoji,
      );
      this.server
        .to(`conversation:${message.conversationId}`)
        .emit('message:updated', message);
      return { ok: true, message };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  @SubscribeMessage('message:read')
  async handleRead(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() body: { conversationId: string },
  ) {
    if (!client.userId || !body?.conversationId) return { ok: false };
    try {
      const res = await this.conversations.markRead(client.userId, body.conversationId);
      this.server.to(`conversation:${body.conversationId}`).emit('conversation:read', {
        conversationId: body.conversationId,
        userId: client.userId,
        readAt: res.readAt,
      });
      return { ok: true };
    } catch {
      return { ok: false, error: 'not allowed' };
    }
  }

  @SubscribeMessage('typing:start')
  async handleTypingStart(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() body: { conversationId: string },
  ) {
    if (!client.userId || !body?.conversationId) return { ok: false };
    try {
      await this.conversations.assertParticipant(client.userId, body.conversationId);
      client.to(`conversation:${body.conversationId}`).emit('typing:start', {
        conversationId: body.conversationId,
        userId: client.userId,
        username: client.username,
      });
      return { ok: true };
    } catch {
      return { ok: false };
    }
  }

  @SubscribeMessage('typing:stop')
  handleTypingStop(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() body: { conversationId: string },
  ) {
    if (!client.userId || !body?.conversationId) return { ok: false };
    client.to(`conversation:${body.conversationId}`).emit('typing:stop', {
      conversationId: body.conversationId,
      userId: client.userId,
    });
    return { ok: true };
  }

  // ---- Calls --------------------------------------------------------------

  @SubscribeMessage('call:start')
  async handleCallStart(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody()
    body: { calleeId?: string; calleeUsername?: string; conversationId?: string; type: 'AUDIO' | 'VIDEO' },
  ) {
    if (!client.userId) return { ok: false, error: 'unauthorized' };
    try {
      const call = await this.calls.startCall(client.userId, body);
      this.server.to(`user:${call.calleeId}`).emit('call:incoming', call);
      return { ok: true, call };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  @SubscribeMessage('call:accept')
  async handleCallAccept(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() body: { callId: string },
  ) {
    if (!client.userId || !body?.callId) return { ok: false };
    try {
      const call = await this.calls.accept(body.callId, client.userId);
      this.server.to(`user:${call.callerId}`).emit('call:accepted', call);
      return { ok: true, call };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  @SubscribeMessage('call:reject')
  async handleCallReject(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() body: { callId: string },
  ) {
    if (!client.userId || !body?.callId) return { ok: false };
    try {
      const call = await this.calls.reject(body.callId, client.userId);
      this.server.to(`user:${call.callerId}`).emit('call:rejected', call);
      return { ok: true, call };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  @SubscribeMessage('call:end')
  async handleCallEnd(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() body: { callId: string },
  ) {
    if (!client.userId || !body?.callId) return { ok: false };
    try {
      const call = await this.calls.end(body.callId, client.userId);
      [call.callerId, call.calleeId].forEach((id) =>
        this.server.to(`user:${id}`).emit('call:ended', call),
      );
      return { ok: true, call };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  @SubscribeMessage('webrtc:signal')
  async handleSignal(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody()
    body: { callId: string; toUserId: string; signal: unknown },
  ) {
    if (!client.userId || !body?.callId || !body?.toUserId) return { ok: false };
    try {
      const call = await this.calls.getCall(body.callId);
      const participants = [call.callerId, call.calleeId];
      if (!participants.includes(client.userId) || !participants.includes(body.toUserId)) {
        return { ok: false, error: 'not a participant' };
      }
      this.server.to(`user:${body.toUserId}`).emit('webrtc:signal', {
        callId: body.callId,
        fromUserId: client.userId,
        signal: body.signal,
      });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  // ---- Meetings -----------------------------------------------------------

  @SubscribeMessage('meeting:join')
  async handleMeetingJoin(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() body: { roomCode: string },
  ) {
    if (!client.userId || !body?.roomCode) return { ok: false };
    try {
      const meeting = await this.calls.joinMeeting(client.userId, body.roomCode);
      client.join(`meeting:${body.roomCode}`);
      client.to(`meeting:${body.roomCode}`).emit('meeting:participant-joined', {
        userId: client.userId,
        username: client.username,
      });
      return { ok: true, meeting };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  @SubscribeMessage('meeting:leave')
  async handleMeetingLeave(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() body: { roomCode: string },
  ) {
    if (!client.userId || !body?.roomCode) return { ok: false };
    try {
      await this.calls.leaveMeeting(client.userId, body.roomCode);
    } catch {
      // Leaving is best-effort.
    }
    client.leave(`meeting:${body.roomCode}`);
    client.to(`meeting:${body.roomCode}`).emit('meeting:participant-left', {
      userId: client.userId,
      username: client.username,
    });
    return { ok: true };
  }

  @SubscribeMessage('meeting:signal')
  handleMeetingSignal(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() body: { roomCode: string; signal: unknown },
  ) {
    if (!client.userId || !body?.roomCode) return { ok: false };
    client.to(`meeting:${body.roomCode}`).emit('meeting:signal', {
      fromUserId: client.userId,
      username: client.username,
      signal: body.signal,
    });
    return { ok: true };
  }

  @SubscribeMessage('meeting:end')
  async handleMeetingEnd(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() body: { roomCode: string },
  ) {
    if (!client.userId || !body?.roomCode) return { ok: false };
    try {
      await this.calls.endMeeting(client.userId, body.roomCode);
      this.server.to(`meeting:${body.roomCode}`).emit('meeting:ended', {
        roomCode: body.roomCode,
      });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }
}
