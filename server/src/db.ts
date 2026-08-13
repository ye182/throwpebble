import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { UserRecord } from "./types.js";

export class UserStore {
  private filePath: string;
  private users: UserRecord[] = [];

  constructor(dataDir: string) {
    fs.mkdirSync(dataDir, { recursive: true });
    this.filePath = path.join(dataDir, "users.json");
    this.load();
  }

  private load() {
    if (!fs.existsSync(this.filePath)) {
      this.users = [];
      this.persist();
      return;
    }
    try {
      const raw = fs.readFileSync(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as UserRecord[];
      this.users = Array.isArray(parsed) ? parsed : [];
    } catch {
      this.users = [];
      this.persist();
    }
  }

  private persist() {
    const tmp = `${this.filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.users, null, 2), "utf8");
    fs.renameSync(tmp, this.filePath);
  }

  findByNickname(nickname: string): UserRecord | undefined {
    const key = nickname.trim().toLowerCase();
    return this.users.find((u) => u.nickname.toLowerCase() === key);
  }

  findByContact(contact: string): UserRecord | undefined {
    const key = contact.trim().toLowerCase();
    if (!key) return undefined;
    return this.users.find((u) => u.contact.trim().toLowerCase() === key);
  }

  findById(id: string): UserRecord | undefined {
    return this.users.find((u) => u.id === id);
  }

  create(input: {
    nickname: string;
    passwordHash: string;
    contact: string;
  }): UserRecord {
    const now = new Date().toISOString();
    const contact = input.contact.trim();
    const user: UserRecord = {
      id: randomUUID(),
      nickname: input.nickname.trim() || contact,
      passwordHash: input.passwordHash,
      contact,
      createdAt: now,
      updatedAt: now,
    };
    this.users.push(user);
    this.persist();
    return user;
  }

  updatePasswordHash(contact: string, passwordHash: string): boolean {
    const user = this.findByContact(contact);
    if (!user) return false;
    user.passwordHash = passwordHash;
    user.updatedAt = new Date().toISOString();
    this.persist();
    return true;
  }
}
