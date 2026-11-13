export type TokenResponse = {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
};

export type RefreshTokenPayload = {
  sub: string;
  typ: 'refresh';
  sid: string;
  jti: string;
  iat?: number;
  exp?: number;
};
