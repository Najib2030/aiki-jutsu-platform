// src/utils/chatPermissions.js

export function isMainRoomAdmin(userData) {
  return userData?.isMainAdmin === true;
}

export function isRoomAdmin(userData) {
  return userData?.isMainAdmin === true || userData?.roomAdmin === true;
}

export const EDIT_WINDOW_MS = 5 * 60 * 1000;
export const DELETE_WINDOW_MS = 10 * 60 * 1000;

function isWithinWindow(msg, ms) {
  if (!msg?.createdAt) return false;
  const createdMs =
    typeof msg.createdAt?.toMillis === 'function'
      ? msg.createdAt.toMillis()
      : Number(msg.createdAt) || 0;
  if (!createdMs) return false;
  return Date.now() - createdMs < ms;
}

export function canEditMessage(userData, msg, currentUid) {
  if (!msg || msg.isDeleted) return false;
  if (!currentUid || msg.userId !== currentUid) return false;
  return isWithinWindow(msg, EDIT_WINDOW_MS);
}

export function canDeleteMessage(userData, msg, currentUid) {
  if (!msg || msg.isDeleted) return false;
  if (isRoomAdmin(userData)) return true;
  if (!currentUid || msg.userId !== currentUid) return false;
  return isWithinWindow(msg, DELETE_WINDOW_MS);
}

export function canPinMessage(userData) {
  return isRoomAdmin(userData);
}

export function canSeeReadReceipts(userData, msg, currentUid) {
  if (!msg) return false;
  if (msg.userId === currentUid) return true;
  return isRoomAdmin(userData);
}

// ★ Students only (not room admins) can report
export function canReportMessage(userData, msg, currentUid) {
  if (!msg || msg.isDeleted) return false;
  if (isRoomAdmin(userData)) return false;
  if (!currentUid || msg.userId === currentUid) return false;
  return true;
}

export function canBlockUser(userData, targetUser, currentUid) {
  if (!isRoomAdmin(userData)) return false;
  if (!targetUser) return false;
  if (targetUser.isMainAdmin === true) return false;
  if (targetUser.roomAdmin === true) return false;
  if (targetUser.id === currentUid) return false;
  return true;
}

export function canPromoteRoomAdmin(userData, targetUser, currentUid) {
  if (!isMainRoomAdmin(userData)) return false;
  if (!targetUser) return false;
  if (targetUser.id === currentUid) return false;
  if (targetUser.isMainAdmin === true) return false;
  return true;
}

export function canCloseRoom(userData) {
  return isRoomAdmin(userData);
}

export function getMessageActions(userData, msg, currentUid, isBlocked = false) {
  if (!msg) return [];
  const out = [];
  const isMine = msg.userId === currentUid;
  const isImage = Array.isArray(msg.imageUrls) && msg.imageUrls.length > 0;
  const roomAdmin = isRoomAdmin(userData);

  if (!msg.isDeleted) out.push('reply');

  if (canReportMessage(userData, msg, currentUid)) out.push('report');

  if (canEditMessage(userData, msg, currentUid)) out.push('edit');
  if (canDeleteMessage(userData, msg, currentUid)) out.push('delete');

  // ★ Block / Unblock logic
  if (roomAdmin && !isMine && msg.userRole !== 'mainAdmin' && msg.userRole !== 'roomAdmin') {
    if (isBlocked) {
      out.push('unblock');
    } else {
      out.push('block');
    }
  }

  if (roomAdmin && !msg.isDeleted) {
    out.push(msg.pinned ? 'unpin' : 'pin');
  }

  if (canSeeReadReceipts(userData, msg, currentUid)) out.push('info');

  if (msg.text && msg.text.trim().length > 0) out.push('copy');
  if (isImage) out.push('download');

  return out;
}