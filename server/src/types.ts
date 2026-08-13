export interface UserRecord {
  id: string;
  nickname: string;
  passwordHash: string;
  contact: string;
  createdAt: string;
  updatedAt: string;
}

export interface PublicUser {
  id: string;
  nickname: string;
  contact: string;
  createdAt: string;
}

export interface JwtPayload {
  sub: string;
  nickname: string;
}
