import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ConversationsService } from './conversations.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  CreateConversationDto,
  EditMessageDto,
  ReactMessageDto,
  SendMessageDto,
  UpdateConversationDto,
} from './dto/conversation.dto';

@Controller('conversations')
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @Get()
  list(
    @CurrentUser('id') userId: string,
    @Query('archived') archived?: string,
    @Query('q') q?: string,
  ) {
    return this.conversations.list(userId, {
      archived: archived === '1' || archived === 'true',
      q,
    });
  }

  @Post()
  findOrCreate(@CurrentUser('id') userId: string, @Body() dto: CreateConversationDto) {
    return this.conversations.findOrCreate(userId, dto);
  }

  @Get(':id')
  get(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.conversations.get(userId, id);
  }

  @Patch(':id')
  update(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateConversationDto,
  ) {
    return this.conversations.updateFlags(userId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.conversations.deleteConversation(userId, id);
  }

  @Get(':id/messages')
  messages(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
    @Query('q') q?: string,
  ) {
    return this.conversations.listMessages(
      userId,
      id,
      take ? Number(take) : undefined,
      skip ? Number(skip) : undefined,
      q,
    );
  }

  @Post(':id/messages')
  send(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.conversations.sendMessage(userId, id, dto);
  }

  @Post(':id/read')
  read(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.conversations.markRead(userId, id);
  }

  @Patch('messages/:messageId')
  editMessage(
    @CurrentUser('id') userId: string,
    @Param('messageId') messageId: string,
    @Body() dto: EditMessageDto,
  ) {
    return this.conversations.editMessage(userId, messageId, dto.content);
  }

  @Delete('messages/:messageId')
  deleteMessage(@CurrentUser('id') userId: string, @Param('messageId') messageId: string) {
    return this.conversations.deleteMessage(userId, messageId);
  }

  @Post('messages/:messageId/pin')
  pinMessage(@CurrentUser('id') userId: string, @Param('messageId') messageId: string) {
    return this.conversations.pinMessage(userId, messageId);
  }

  @Post('messages/:messageId/react')
  reactMessage(
    @CurrentUser('id') userId: string,
    @Param('messageId') messageId: string,
    @Body() dto: ReactMessageDto,
  ) {
    return this.conversations.reactMessage(userId, messageId, dto.emoji);
  }
}
