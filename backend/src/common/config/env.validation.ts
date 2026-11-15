import { Logger } from '@nestjs/common';

/**
 * Validates the environment at startup.
 *
 * - Fails fast with a readable, actionable message when a required value is
 *   missing or malformed (instead of crashing later inside Prisma).
 * - Never prints secret values.
 * - Optional integrations (AI, SMTP, OAuth) only produce warnings.
 *
 * Called by `ConfigModule.forRoot({ validate: validateEnv })`.
 */
export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const logger = new Logger('EnvValidation');
  const problems: string[] = [];
  const warnings: string[] = [];

  const read = (key: string, fallback = '') => {
    const value = config[key];
    return value === undefined || value === null ? fallback : String(value).trim();
  };

  // --- Required: DATABASE_URL -------------------------------------------
  const databaseUrl = read('DATABASE_URL');
  if (!databaseUrl) {
    problems.push(
      'DATABASE_URL is missing. Copy backend/.env.example to backend/.env and set it, e.g. ' +
        'postgresql://postgres@127.0.0.1:5432/quitin?schema=public',
    );
  } else if (!/^postgres(ql)?:\/\//i.test(databaseUrl)) {
    problems.push('DATABASE_URL must start with postgresql:// or postgres://');
  } else {
    try {
      const parsed = new URL(databaseUrl);
      if (!parsed.hostname) {
        problems.push('DATABASE_URL has no host (expected 127.0.0.1 or localhost)');
      }
      if (parsed.port && (!/^\d+$/.test(parsed.port) || Number(parsed.port) > 65535)) {
        problems.push('DATABASE_URL contains an invalid port');
      }
      if (!parsed.pathname || parsed.pathname === '/') {
        problems.push('DATABASE_URL has no database name (expected /quitin)');
      }
    } catch {
      problems.push('DATABASE_URL is not a valid URL');
    }
  }

  // --- Required: JWT_SECRET ---------------------------------------------
  const jwtSecret = read('JWT_SECRET');
  if (!jwtSecret) {
    problems.push(
      'JWT_SECRET is missing. Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"',
    );
  } else if (jwtSecret.length < 16) {
    problems.push('JWT_SECRET must be at least 16 characters long');
  }

  // --- Optional but typed: PORT / FRONTEND_URL / NODE_ENV ---------------
  const port = read('PORT', '4000');
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
    problems.push(`PORT must be a number between 1 and 65535 (received "${port}")`);
  }

  const frontendUrl = read('FRONTEND_URL', 'http://localhost:3000');
  if (!/^https?:\/\//i.test(frontendUrl)) {
    problems.push('FRONTEND_URL must be a full URL such as http://localhost:3000');
  }

  const nodeEnv = read('NODE_ENV', 'development');
  if (!['development', 'production', 'test'].includes(nodeEnv)) {
    warnings.push(`NODE_ENV="${nodeEnv}" is unusual; expected development, production or test.`);
  }
  if (nodeEnv === 'production' && jwtSecret && jwtSecret.length < 32) {
    problems.push('JWT_SECRET should be at least 32 characters in production');
  }

  // --- Optional integrations --------------------------------------------
  if (!read('AI_API_KEY')) {
    warnings.push(
      'AI_API_KEY is empty - the AI assistant will answer with a setup message instead of live AI replies.',
    );
  }
  const hasSmtp = Boolean(read('SMTP_HOST'));
  const hasResend = Boolean(read('RESEND_API_KEY'));
  if (!hasSmtp && !hasResend) {
    warnings.push(
      'No SMTP_HOST or RESEND_API_KEY configured - emails (verification / password reset) are logged to the console in development.',
    );
  }

  for (const warning of warnings) {
    logger.warn(warning);
  }

  if (problems.length > 0) {
    const message = [
      'Invalid environment configuration. QUITIN cannot start.',
      'Fix the following in backend/.env (you can copy backend/.env.example):',
      ...problems.map((problem) => `  - ${problem}`),
      'Then run: npm run dev:check',
    ].join('\n');
    throw new Error(message);
  }

  return {
    ...config,
    DATABASE_URL: databaseUrl,
    JWT_SECRET: jwtSecret,
    JWT_EXPIRES_IN: read('JWT_EXPIRES_IN', '7d'),
    COOKIE_NAME: read('COOKIE_NAME', 'quitin_token'),
    NODE_ENV: nodeEnv,
    FRONTEND_URL: frontendUrl,
    PORT: Number(port),
  };
}
