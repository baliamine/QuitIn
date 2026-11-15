import { Module } from '@nestjs/common';
import { ConversationsService } from './conversations.service';
import { ConversationsController } from './conversations.controller';
import { MessagesGateway } from './messages.gateway';
import { AuthModule } from '../auth/auth.module';
import { CallsModule } from '../calls/calls.module';

@Module({
  imports: [AuthModule, CallsModule],
  controllers: [ConversationsController],
  providers: [ConversationsService, MessagesGateway],
  exports: [ConversationsService],
})
export class ConversationsModule {}
