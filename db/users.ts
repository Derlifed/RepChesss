import { eq } from "drizzle-orm";
import { db } from "./index.js";
import { userProfiles } from "./schema.js";

// Usernames are stored lowercase so "Magnus" and "magnus" can't both exist.
export const USERNAME = /^[a-z0-9_]{3,20}$/;
export const USERNAME_MSG = "Usernames are 3 to 20 letters, numbers or underscores.";
export const cleanUsername = (v: unknown) => (typeof v === "string" ? v.trim().toLowerCase() : "");

// Returns the id of the user who owns a username, if anyone does.
export const usernameOwner = async (username: string) =>
  (await db.select({ userId: userProfiles.userId }).from(userProfiles).where(eq(userProfiles.username, username)))[0]
    ?.userId;

export const getUsername = async (userId: string) =>
  (await db.select({ username: userProfiles.username }).from(userProfiles).where(eq(userProfiles.userId, userId)))[0]
    ?.username ?? null;

// Creates or changes a user's username. Returns false when someone else already has it.
export async function setUsername(userId: string, username: string) {
  const owner = await usernameOwner(username);
  if (owner && owner !== userId) return false;
  try {
    await db
      .insert(userProfiles)
      .values({ userId, username })
      .onConflictDoUpdate({ target: userProfiles.userId, set: { username } });
    return true;
  } catch {
    // A unique violation here means someone claimed it between the check and the write.
    return false;
  }
}
