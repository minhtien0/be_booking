import { Injectable, NestMiddleware } from '@nestjs/common';

@Injectable()
export class AuthMiddleware implements NestMiddleware {
  use(req: any, _res: any, next: () => void) {
    const authHeader = req.headers?.authorization;

    if (authHeader?.startsWith('Bearer ')) {
      req.bearerToken = authHeader.slice(7);
    }

    next();
  }
}