import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateMeetingDto, StartCallDto } from './dto/call.dto';

const CALL_USER_SELECT = {
  select: {
    id: true,
    username: true,
    profile: { select: { avatarUrl: true, headline: true } },
  },
} satisfies Prisma.UserArgs;

@Injectable()
export class CallsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  private async assertNotBlocked(userId: string, targetId: string) {
    const block = await this.prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: userId, blockedId: targetId },
          { blockerId: targetId, blockedId: userId },
        ],
      },
      select: { id: true },
    });
    if (block) throw new ForbiddenException('You cannot call this user');
  }

  async startCall(callerId: string, dto: StartCallDto) {
    let calleeId = dto.calleeId;
    if (!calleeId && dto.calleeUsername) {
      const callee = await this.prisma.user.findUnique({
        where: { username: dto.calleeUsername.toLowerCase() },
        select: { id: true },
      });
      if (!callee) throw new NotFoundException('User not found');
      calleeId = callee.id;
    }
    if (!calleeId) throw new BadRequestException('calleeId or calleeUsername is required');
    if (calleeId === callerId) {
      throw new BadRequestException('You cannot call yourself');
    }

    await this.assertNotBlocked(callerId, calleeId);

    if (dto.conversationId) {
      const participant = await this.prisma.conversationParticipant.findUnique({
        where: {
          conversationId_userId: { conversationId: dto.conversationId, userId: calleeId },
        },
        select: { id: true },
      });
      if (!participant) {
        throw new BadRequestException('The callee is not part of that conversation');
      }
    }

    const call = await this.prisma.call.create({
      data: {
        callerId,
        calleeId,
        conversationId: dto.conversationId ?? null,
        type: dto.type,
        status: 'RINGING',
      },
      include: { caller: CALL_USER_SELECT, callee: CALL_USER_SELECT },
    });

    await this.notifications.create(calleeId, {
      type: 'CALL',
      actorId: callerId,
      entityId: call.id,
      message: `is calling you (${dto.type.toLowerCase()})`,
    });

    return call;
  }

  async getCall(callId: string) {
    const call = await this.prisma.call.findUnique({
      where: { id: callId },
      include: { caller: CALL_USER_SELECT, callee: CALL_USER_SELECT },
    });
    if (!call) throw new NotFoundException('Call not found');
    return call;
  }

  async accept(callId: string, userId: string) {
    const call = await this.getCall(callId);
    if (call.calleeId !== userId) throw new ForbiddenException('Not your call');
    if (call.status !== 'RINGING') throw new BadRequestException('This call is no longer ringing');
    return this.prisma.call.update({
      where: { id: callId },
      data: { status: 'ACCEPTED', startedAt: new Date() },
      include: { caller: CALL_USER_SELECT, callee: CALL_USER_SELECT },
    });
  }

  async reject(callId: string, userId: string) {
    const call = await this.getCall(callId);
    if (call.calleeId !== userId) throw new ForbiddenException('Not your call');
    if (call.status !== 'RINGING') throw new BadRequestException('This call is no longer ringing');
    return this.prisma.call.update({
      where: { id: callId },
      data: { status: 'REJECTED', endedAt: new Date() },
      include: { caller: CALL_USER_SELECT, callee: CALL_USER_SELECT },
    });
  }

  async end(callId: string, userId: string) {
    const call = await this.getCall(callId);
    if (call.callerId !== userId && call.calleeId !== userId) {
      throw new ForbiddenException('Not your call');
    }
    return this.prisma.call.update({
      where: { id: callId },
      data: {
        status: call.status === 'RINGING' ? 'MISSED' : 'ENDED',
        endedAt: new Date(),
      },
      include: { caller: CALL_USER_SELECT, callee: CALL_USER_SELECT },
    });
  }

  async history(userId: string) {
    return this.prisma.call.findMany({
      where: { OR: [{ callerId: userId }, { calleeId: userId }] },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { caller: CALL_USER_SELECT, callee: CALL_USER_SELECT },
    });
  }

  // ---- Meetings -----------------------------------------------------------

  private roomCode() {
    return randomBytes(6).toString('base64url').replace(/[-_]/g, '').slice(0, 10);
  }

  async createMeeting(hostId: string, dto: CreateMeetingDto) {
    const participantIds: string[] = [];
    if (dto.participantUsernames?.length) {
      const users = await this.prisma.user.findMany({
        where: { username: { in: dto.participantUsernames.map((u) => u.toLowerCase()) } },
        select: { id: true },
      });
      users.forEach((u) => {
        if (u.id !== hostId) participantIds.push(u.id);
      });
    }

    // Blocking prevents unwanted invitations in either direction.
    const blocks = await this.prisma.block.findMany({
      where: {
        OR: [{ blockerId: hostId }, { blockedId: hostId }],
      },
      select: { blockerId: true, blockedId: true },
    });
    const blocked = new Set(blocks.map((b) => (b.blockerId === hostId ? b.blockedId : b.blockerId)));
    const invitedIds = participantIds.filter((id) => !blocked.has(id));

    const meeting = await this.prisma.meeting.create({
      data: {
        hostId,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        roomCode: this.roomCode(),
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
        participants: {
          create: [
            { userId: hostId },
            ...invitedIds.map((userId) => ({ userId })),
          ],
        },
      },
      include: {
        host: CALL_USER_SELECT,
        participants: { include: { user: CALL_USER_SELECT } },
      },
    });

    await Promise.all(
      invitedIds.map((userId) =>
        this.notifications.create(userId, {
          type: 'MEETING',
          actorId: hostId,
          entityId: meeting.id,
          message: `invited you to “${meeting.title}”`,
        }),
      ),
    );

    return meeting;
  }

  async listMeetings(userId: string) {
    return this.prisma.meeting.findMany({
      where: {
        OR: [{ hostId: userId }, { participants: { some: { userId } } }],
      },
      orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'desc' }],
      take: 50,
      include: {
        host: CALL_USER_SELECT,
        participants: { include: { user: CALL_USER_SELECT } },
      },
    });
  }

  async getMeeting(userId: string, roomCode: string) {
    const meeting = await this.prisma.meeting.findUnique({
      where: { roomCode },
      include: {
        host: CALL_USER_SELECT,
        participants: { include: { user: CALL_USER_SELECT } },
      },
    });
    if (!meeting) throw new NotFoundException('Meeting not found');
    const isInvited = meeting.participants.some((p) => p.userId === userId);
    if (!isInvited) {
      throw new ForbiddenException('You were not invited to this meeting');
    }
    return meeting;
  }

  async joinMeeting(userId: string, roomCode: string) {
    const meeting = await this.prisma.meeting.findUnique({
      where: { roomCode },
      select: { id: true, status: true, hostId: true },
    });
    if (!meeting) throw new NotFoundException('Meeting not found');
    if (meeting.status === 'ENDED') {
      throw new BadRequestException('This meeting has ended');
    }
    if (meeting.hostId !== userId) {
      const invited = await this.prisma.meetingParticipant.findUnique({
        where: { meetingId_userId: { meetingId: meeting.id, userId } },
        select: { id: true },
      });
      if (!invited) {
        throw new ForbiddenException('You were not invited to this meeting');
      }
    }
    await this.prisma.meetingParticipant.upsert({
      where: { meetingId_userId: { meetingId: meeting.id, userId } },
      update: { joinedAt: new Date(), leftAt: null },
      create: { meetingId: meeting.id, userId },
    });
    if (meeting.status === 'SCHEDULED') {
      await this.prisma.meeting.update({
        where: { id: meeting.id },
        data: { status: 'ACTIVE' },
      });
    }
    return this.getMeeting(userId, roomCode);
  }

  async leaveMeeting(userId: string, roomCode: string) {
    const meeting = await this.prisma.meeting.findUnique({
      where: { roomCode },
      select: { id: true },
    });
    if (!meeting) throw new NotFoundException('Meeting not found');
    await this.prisma.meetingParticipant.updateMany({
      where: { meetingId: meeting.id, userId },
      data: { leftAt: new Date() },
    });
    return { success: true };
  }

  async endMeeting(userId: string, roomCode: string) {
    const meeting = await this.prisma.meeting.findUnique({
      where: { roomCode },
      select: { id: true, hostId: true },
    });
    if (!meeting) throw new NotFoundException('Meeting not found');
    if (meeting.hostId !== userId) {
      throw new ForbiddenException('Only the host can end this meeting');
    }
    return this.prisma.meeting.update({
      where: { id: meeting.id },
      data: { status: 'ENDED', endedAt: new Date() },
    });
  }
}
