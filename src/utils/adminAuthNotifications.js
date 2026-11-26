// src/utils/adminAuthNotifications.js
import { db } from '../firebase/config';
import {
  collection, query, where, getDocs, doc, writeBatch,
} from 'firebase/firestore';

/**
 * Notify every main admin (`isMainAdmin === true`) when another admin
 * signs in or out.
 *
 * Rules:
 *  - Skips if the actor is not an admin (students never trigger these).
 *  - Skips if the actor IS a main admin — they are the receiver, not a subject.
 *  - Skips any main admin whose uid matches the actor (self-notification).
 *  - Never throws; auth flows must not be blocked by notification failures.
 *
 * i18n note:
 *  Notifications are stored with BOTH an English fallback (`title`,
 *  `message`) AND translation metadata (`titleKey`, `messageKey`,
 *  `messageParams`). Translation-aware readers (Layout, Settings) render
 *  `t(titleKey, messageParams)` / `t(messageKey, messageParams)` so the
 *  *reader* sees the notification in their own language. Legacy readers
 *  that only know `title` / `message` still show the English fallback.
 *
 * @param {Object}  params
 * @param {Object}  params.actor      { uid, name, email, role, isMainAdmin }
 * @param {'login'|'logout'} params.action
 */
export async function notifyMainAdminsOfAuthEvent({ actor, action }) {
  try {
    if (!actor) return;
    if (actor.role !== 'admin') return;
    if (actor.isMainAdmin === true) return;      // main admin doesn't notify themselves
    if (action !== 'login' && action !== 'logout') return;

    // Find every main admin
    const mainAdminsSnap = await getDocs(
      query(collection(db, 'users'), where('isMainAdmin', '==', true))
    );
    if (mainAdminsSnap.empty) return;

    const actorLabel = actor.name || actor.email || 'An administrator';
    const isLogin = action === 'login';

    // ── English fallback (for legacy readers) ──
    const title = isLogin ? 'Admin Signed In' : 'Admin Signed Out';
    const message = isLogin
      ? `${actorLabel} signed in to the admin console.`
      : `${actorLabel} signed out of the admin console.`;

    // ── Translation metadata (for i18n-aware readers) ──
    const titleKey = isLogin
      ? 'notifications.adminLogin.title'
      : 'notifications.adminLogout.title';
    const messageKey = isLogin
      ? 'notifications.adminLogin.message'
      : 'notifications.adminLogout.message';
    const messageParams = { name: actorLabel };

    const type = isLogin ? 'admin_login' : 'admin_logout';

    const batch = writeBatch(db);
    let queued = 0;
    mainAdminsSnap.forEach(mainAdminDoc => {
      // Never notify the actor about themselves
      if (mainAdminDoc.id === actor.uid) return;
      const notifRef = doc(collection(db, 'notifications'));
      batch.set(notifRef, {
        userId: mainAdminDoc.id,
        type,
        // Legacy / fallback text
        title,
        message,
        // i18n metadata
        titleKey,
        messageKey,
        messageParams,
        read: false,
        createdAt: new Date(),
        actorId: actor.uid,
        actorName: actorLabel,
        actorEmail: actor.email || '',
      });
      queued++;
    });

    if (queued > 0) await batch.commit();
  } catch (err) {
    // Never let this break the auth flow
    console.error('Failed to notify main admins of auth event:', err);
  }
}