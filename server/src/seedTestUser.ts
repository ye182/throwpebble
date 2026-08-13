import { hashPassword } from "./auth.js";
import type { UserStore } from "./db.js";

/** Fixed local QA account — contact / password both `111111`. */
export const TEST_CONTACT = "111111";
export const TEST_PASSWORD = "111111";

/**
 * Ensure the QA account exists with the expected password.
 * Returns "created" | "updated" | "ok".
 */
export async function ensureTestUser(
  store: UserStore
): Promise<"created" | "updated" | "ok"> {
  const passwordHash = await hashPassword(TEST_PASSWORD);
  const existing = store.findByContact(TEST_CONTACT);
  if (!existing) {
    store.create({
      nickname: TEST_CONTACT,
      contact: TEST_CONTACT,
      passwordHash,
    });
    return "created";
  }
  // Always reset QA password so local login stays predictable.
  store.updatePasswordHash(TEST_CONTACT, passwordHash);
  return "updated";
}
