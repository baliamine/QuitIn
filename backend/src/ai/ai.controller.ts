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
import { AiService } from './ai.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import {
  CreateAiConversationDto,
  RenameAiConversationDto,
  SendAiMessageDto,
} from './dto/ai.dto';

@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Get('conversations')
  list(@CurrentUser('id') userId: string, @Query('q') q?: string) {
    return this.ai.listConversations(userId, q);
  }

  @Post('conversations')
  create(@CurrentUser('id') userId: string, @Body() dto: CreateAiConversationDto) {
    return this.ai.createConversation(userId, dto.title);
  }

  @Get('shared/:token')
  @Public()
  getShared(@Param('token') token: string) {
    return this.ai.getShared(token);
  }

  @Get('conversations/:id')
  get(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.ai.getConversation(userId, id);
  }

  @Patch('conversations/:id')
  rename(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: RenameAiConversationDto,
  ) {
    return this.ai.renameConversation(userId, id, dto.title);
  }

  @Post('conversations/:id/messages')
  send(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: SendAiMessageDto,
  ) {
    return this.ai.sendMessage(userId, id, dto);
  }

  @Post('conversations/:id/regenerate')
  regenerate(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.ai.regenerate(userId, id);
  }

  @Post('conversations/:id/share')
  share(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.ai.share(userId, id);
  }

  @Delete('conversations/:id/share')
  unshare(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.ai.unshare(userId, id);
  }

  @Delete('conversations/:id')
  remove(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.ai.deleteConversation(userId, id);
  }
}
