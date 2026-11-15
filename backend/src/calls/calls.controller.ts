import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CallsService } from './calls.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateMeetingDto, StartCallDto } from './dto/call.dto';

@Controller()
export class CallsController {
  constructor(private readonly calls: CallsService) {}

  @Post('calls')
  start(@CurrentUser('id') userId: string, @Body() dto: StartCallDto) {
    return this.calls.startCall(userId, dto);
  }

  @Get('calls/history')
  history(@CurrentUser('id') userId: string) {
    return this.calls.history(userId);
  }

  @Get('calls/:id')
  get(@Param('id') id: string) {
    return this.calls.getCall(id);
  }

  @Patch('calls/:id/accept')
  accept(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.calls.accept(id, userId);
  }

  @Patch('calls/:id/reject')
  reject(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.calls.reject(id, userId);
  }

  @Patch('calls/:id/end')
  end(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.calls.end(id, userId);
  }

  @Post('meetings')
  createMeeting(@CurrentUser('id') userId: string, @Body() dto: CreateMeetingDto) {
    return this.calls.createMeeting(userId, dto);
  }

  @Get('meetings')
  listMeetings(@CurrentUser('id') userId: string) {
    return this.calls.listMeetings(userId);
  }

  @Get('meetings/:roomCode')
  getMeeting(@CurrentUser('id') userId: string, @Param('roomCode') roomCode: string) {
    return this.calls.getMeeting(userId, roomCode);
  }

  @Post('meetings/:roomCode/join')
  join(@CurrentUser('id') userId: string, @Param('roomCode') roomCode: string) {
    return this.calls.joinMeeting(userId, roomCode);
  }

  @Post('meetings/:roomCode/leave')
  leave(@CurrentUser('id') userId: string, @Param('roomCode') roomCode: string) {
    return this.calls.leaveMeeting(userId, roomCode);
  }

  @Post('meetings/:roomCode/end')
  endMeeting(@CurrentUser('id') userId: string, @Param('roomCode') roomCode: string) {
    return this.calls.endMeeting(userId, roomCode);
  }
}
