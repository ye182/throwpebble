import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { JwtPayload, PublicUser, UserRecord } from "./types.js";

const SALT_ROUNDS = 10;

export function toPublicUser(user: UserRecord): PublicUser {
  return {
    id: user.id,
    nickname: user.nickname,
    contact: user.contact,
    createdAt: user.createdAt,
  };
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  passwordHash: string
): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

export function signToken(
  payload: JwtPayload,
  secret: string,
  expiresIn: string
): string {
  return jwt.sign(payload, secret, { expiresIn } as jwt.SignOptions);
}

export function verifyToken(token: string, secret: string): JwtPayload {
  return jwt.verify(token, secret) as JwtPayload;
}
