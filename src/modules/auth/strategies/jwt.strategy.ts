import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { AuthUser } from '../../../common/decorators/current-user.decorator';

export type JwtPayload = {
  sub: string;
  staffCategory: number | null;
  isDispatcher: boolean;
  permissions: string[];
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('jwt.accessSecret'),
    });
  }

  validate(payload: JwtPayload): AuthUser {
    if (!payload?.sub) throw new UnauthorizedException('invalid_token');
    return {
      userId: payload.sub,
      staffCategory: payload.staffCategory,
      isDispatcher: payload.isDispatcher,
      permissions: payload.permissions ?? [],
    };
  }
}
