import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    try {
      await this.$connect();
    } catch (error) {
      const firstLine = (error instanceof Error ? error.message : String(error)).split('\n')[0];

      this.logger.error(
        [
          'Cannot connect to PostgreSQL. QUITIN cannot start without its database.',
          'How to fix:',
          '  1. Check the database status:   npm run dev:status',
          '  2. Start everything safely:      npm run dev:up',
          '  3. If you use a manual PostgreSQL install, make sure the service is running',
          '     and that DATABASE_URL in backend/.env points to the right host/port/database.',
          `Underlying error: ${firstLine}`,
        ].join('\n'),
      );

      throw error;
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
