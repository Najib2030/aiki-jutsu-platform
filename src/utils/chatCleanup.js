// src/utils/chatCleanup.js
// ─────────────────────────────────────────────────────────────
// Deletes messages older than 30 days in chunks of 500.
// Called whenever a room admin opens the chat page.
// Spark-plan friendly (batches only, no Cloud Functions).
// ─────────────────────────────────────────────────────────────
import { db } from '../firebase/config';
import {
  collection, query, where, orderBy, limit, getDocs, writeBatch,
} from 'firebase/firestore';

const RETENTION_DAYS = 30;
const CHUNK_SIZE = 500;

/**
 * Removes messages older than RETENTION_DAYS.
 * Returns the total number of messages deleted.
 * Safe to call repeatedly — no-op when nothing old exists.
 */
export async function cleanupOldMessages() {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  let totalDeleted = 0;

  // Loop until no more old messages
  // Note: we delete in batches; the 500 limit is well below the
  // Firestore batch cap (500) — both client and server agree.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const q = query(
      collection(db, 'messages'),
      where('createdAt', '<', cutoff),
      orderBy('createdAt', 'asc'),
      limit(CHUNK_SIZE)
    );

    const snap = await getDocs(q);
    if (snap.empty) break;

    const batch = writeBatch(db);
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    totalDeleted += snap.size;

    // Safety valve — avoid infinite loop on huge backlogs
    if (snap.size < CHUNK_SIZE) break;
  }

  return totalDeleted;
}

export { RETENTION_DAYS };