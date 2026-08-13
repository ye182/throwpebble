import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

export type StoredDiaryEntry = {
  id: string;
  userId: string;
  mood: string;
  moodId?: string;
  moodIcon?: string;
  body: string;
  images?: string[];
  /** Local calendar day YYYY-MM-DD from the client. */
  dateKey: string;
  visibilityMode: "private" | "explore";
  createdAt: string;
};

/**
 * Per-user diary entries on disk so iOS / Android (same login) share calendar marks.
 */
export class DiaryStore {
  private filePath: string;
  private entries: StoredDiaryEntry[] = [];

  constructor(dataDir: string) {
    fs.mkdirSync(dataDir, { recursive: true });
    this.filePath = path.join(dataDir, "diary-entries.json");
    this.load();
  }

  private load() {
    if (!fs.existsSync(this.filePath)) {
      this.entries = [];
      this.persist();
      return;
    }
    try {
      const raw = fs.readFileSync(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as StoredDiaryEntry[];
      this.entries = Array.isArray(parsed) ? parsed : [];
    } catch {
      this.entries = [];
      this.persist();
    }
  }

  private persist() {
    const tmp = `${this.filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.entries, null, 2), "utf8");
    fs.renameSync(tmp, this.filePath);
  }

  listByUser(userId: string): StoredDiaryEntry[] {
    return this.entries
      .filter((e) => e.userId === userId)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }

  create(input: {
    userId: string;
    mood: string;
    moodId?: string;
    moodIcon?: string;
    body: string;
    images?: string[];
    dateKey: string;
    visibilityMode: "private" | "explore";
    id?: string;
    createdAt?: string;
  }): StoredDiaryEntry {
    const now = input.createdAt?.trim() || new Date().toISOString();
    const images = (input.images ?? []).filter((x) => x.trim().length > 0);
    const entry: StoredDiaryEntry = {
      id: input.id?.trim() || randomUUID(),
      userId: input.userId,
      mood: input.mood.trim(),
      moodId: input.moodId?.trim() || undefined,
      moodIcon: input.moodIcon?.trim() || undefined,
      body: input.body.trim(),
      images: images.length > 0 ? images : undefined,
      dateKey: input.dateKey,
      visibilityMode: input.visibilityMode,
      createdAt: now,
    };
    const existing = this.entries.findIndex(
      (e) => e.id === entry.id && e.userId === entry.userId
    );
    if (existing >= 0) {
      this.entries[existing] = entry;
    } else {
      this.entries.push(entry);
    }
    this.persist();
    return entry;
  }

  delete(userId: string, entryId: string): boolean {
    const id = entryId.trim();
    if (!id) return false;
    const before = this.entries.length;
    this.entries = this.entries.filter(
      (e) => !(e.userId === userId && e.id === id)
    );
    if (this.entries.length === before) return false;
    this.persist();
    return true;
  }
}
