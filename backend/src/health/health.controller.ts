import { Controller, Get, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../common/decorators/public.decorator';

interface DatabaseHealth {
  status: 'up' | 'down';
  responseTimeMs?: number;
  message?: string;
}

function readAppVersion(): string {
  try {
    const raw = readFileSync(join(process.cwd(), 'package.json'), 'utf8');
    const parsed = JSON.parse(raw) as { version?: string };
    return parsed.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/**
 * Public readiness endpoint used by the development manager and uptime checks.
 *
 * GET /api/health
 *  - 200 when the API and the database are reachable
 *  - 503 when the database is unreachable
 *
 * The response never contains secrets or connection strings.
 */
@Controller('health')
export class HealthController {
  private readonly version = readAppVersion();
  private readonly startedAt = Date.now();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Get()
  async check(@Res({ passthrough: true }) res: Response) {
    const startedAt = Date.now();
    let database: DatabaseHealth;

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      database = { status: 'up', responseTimeMs: Date.now() - startedAt };
    } catch {
      database = {
        status: 'down',
        message:
          'Database unreachable. Check that PostgreSQL is running and that DATABASE_URL in backend/.env is correct.',
      };
    }

    const healthy = database.status === 'up';
    res.status(healthy ? 200 : 503);

    return {
      status: healthy ? 'ok' : 'error',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round((Date.now() - this.startedAt) / 1000),
      backend: {
        status: 'up',
        environment: this.config.get<string>('NODE_ENV', 'development'),
        version: this.version,
      },
      database,
    };
  }
}
