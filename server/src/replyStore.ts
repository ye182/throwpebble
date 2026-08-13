import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

export type StoredReplyUserMessage = {
  id: string;
  body: string;
  createdAt: string;
};

export type StoredReplyLetter = {
  id: string;
  userId: string;
  createdAt: string;
  body: string;
  title?: string;
  style: string;
  sourceEntryIds: string[];
  insight?: {
    dominantMoods: string[];
    trendLabel: string;
    energy?: "low" | "mixed" | "lifted";
  };
  starred: boolean;
  feedback: "like" | "dislike" | null;
  /** User replies written under the letter body. */
  userReplies?: StoredReplyUserMessage[];
  provider?: "mock" | "llm";
  modelHint?: string;
};

type FileShape = { letters: StoredReplyLetter[] };

/**
 * Persist reply letters under dataDir.
 * LLM body generation stays stubbed — same shape when real model lands.
 */
export class ReplyStore {
  private file: string;
  private letters: StoredReplyLetter[] = [];

  constructor(dataDir: string) {
    this.file = path.join(dataDir, "reply-letters.json");
    this.load();
  }

  private load() {
    try {
      if (!fs.existsSync(this.file)) {
        this.letters = [];
        this.persist();
        return;
      }
      const raw = JSON.parse(fs.readFileSync(this.file, "utf8")) as FileShape;
      this.letters = Array.isArray(raw.letters) ? raw.letters : [];
    } catch {
      this.letters = [];
    }
  }

  private persist() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(
      tmp,
      JSON.stringify({ letters: this.letters }, null, 2),
      "utf8"
    );
    fs.renameSync(tmp, this.file);
  }

  listByUser(userId: string): StoredReplyLetter[] {
    return this.letters
      .filter((l) => l.userId === userId)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }

  create(
    input: Omit<StoredReplyLetter, "id" | "createdAt" | "starred" | "feedback"> & {
      id?: string;
      createdAt?: string;
      starred?: boolean;
      feedback?: "like" | "dislike" | null;
    }
  ): StoredReplyLetter {
    const letter: StoredReplyLetter = {
      id: input.id?.trim() || randomUUID(),
      userId: input.userId,
      createdAt: input.createdAt?.trim() || new Date().toISOString(),
      body: input.body,
      title: input.title,
      style: input.style,
      sourceEntryIds: input.sourceEntryIds,
      insight: input.insight,
      starred: input.starred ?? false,
      feedback: input.feedback ?? null,
      provider: input.provider,
      modelHint: input.modelHint,
    };
    const i = this.letters.findIndex(
      (l) => l.id === letter.id && l.userId === letter.userId
    );
    if (i >= 0) this.letters[i] = letter;
    else this.letters.unshift(letter);
    this.persist();
    return letter;
  }

  patch(
    userId: string,
    id: string,
    patch: Partial<Pick<StoredReplyLetter, "starred" | "feedback">>
  ): StoredReplyLetter | null {
    const i = this.letters.findIndex((l) => l.id === id && l.userId === userId);
    if (i < 0) return null;
    this.letters[i] = { ...this.letters[i], ...patch };
    this.persist();
    return this.letters[i];
  }

  appendUserReply(
    userId: string,
    id: string,
    body: string
  ): StoredReplyLetter | null {
    const trimmed = body.trim();
    if (!trimmed) return null;
    const i = this.letters.findIndex((l) => l.id === id && l.userId === userId);
    if (i < 0) return null;
    const msg: StoredReplyUserMessage = {
      id: randomUUID(),
      body: trimmed,
      createdAt: new Date().toISOString(),
    };
    const prev = this.letters[i].userReplies ?? [];
    this.letters[i] = {
      ...this.letters[i],
      userReplies: [...prev, msg],
    };
    this.persist();
    return this.letters[i];
  }

  removeUserReply(
    userId: string,
    letterId: string,
    replyId: string
  ): StoredReplyLetter | null {
    const i = this.letters.findIndex(
      (l) => l.id === letterId && l.userId === userId
    );
    if (i < 0) return null;
    const prev = this.letters[i].userReplies ?? [];
    if (!prev.some((r) => r.id === replyId)) return this.letters[i];
    this.letters[i] = {
      ...this.letters[i],
      userReplies: prev.filter((r) => r.id !== replyId),
    };
    this.persist();
    return this.letters[i];
  }

  /** Delete an entire letter for this user. */
  removeLetter(userId: string, id: string): boolean {
    const before = this.letters.length;
    this.letters = this.letters.filter(
      (l) => !(l.id === id && l.userId === userId)
    );
    if (this.letters.length === before) return false;
    this.persist();
    return true;
  }
}
