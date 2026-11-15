import { createParamDecorator, ExecutionContext } from '@nestjs/common';

import { UserCategory } from '../enums';

export type AuthUser = {
  userId: string;
  staffCategory: number | null;
  userCategory?: UserCategory;
  isDispatcher: boolean;
  permissions: string[];
};

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx.switchToHttp().getRequest<{ user: AuthUser }>();
    return request.user;
  },
);
