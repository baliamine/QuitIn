import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Authenticates when a valid JWT is present, but allows the request through
 * without one. Used with @Public() for routes that work for guests while
 * still needing the current user when a session exists (e.g. /auth/me).
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = any>(
    _err: unknown,
    user: TUser | undefined | null,
    _info: unknown,
    _context: ExecutionContext,
  ): TUser | null {
    return user ?? null;
  }
}
