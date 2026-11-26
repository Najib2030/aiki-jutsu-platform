// src/utils/adminPermissions.js
import i18n from '../i18n';

/**
 * ⚠️  SECURITY NOTE
 *
 * The `isMainAdmin` boolean field on the user document is the SINGLE
 * SOURCE OF TRUTH for who is the main admin. It MUST be set once in the
 * Firebase Console (Firestore → users → your main admin → Add field →
 * isMainAdmin → boolean → true).
 *
 * The app can neither set nor modify this field:
 *   - creation: blocked by `!('isMainAdmin' in request.resource.data)`
 *   - update:   blocked by `!changedKeys().hasAny(['isMainAdmin'])`
 *   - the Firestore rules also refuse to let ANY other admin touch a main
 *     admin's document at all (see /users/{userId}.allow.update)
 *
 * The list below is DELIBERATELY EMPTY. Do not add emails to it.
 * Emails in client-side code are readable by anyone — they are not
 * security, they only expose the target. If you want a code-level
 * fallback, keep using this empty array; the actual flag is what matters.
 *
 * @deprecated — kept only so existing imports don't break.
 */
export const MAIN_ADMIN_EMAILS = [];

// Full permission set — used as the default for every admin so existing
// accounts keep working exactly as before the permission system existed.
export const DEFAULT_PERMISSIONS = {
  approvals: true,
  validations: true,
  students: true,
  syllabus: true,
  admins: true,
};

export const ADMIN_PERMISSIONS = [
  {
    key: 'approvals',
    label: 'Approvals',
    description: 'Review and approve new student registrations',
  },
  {
    key: 'validations',
    label: 'Belt Validations',
    description: 'Review and approve belt validation requests',
  },
  {
    key: 'students',
    label: 'Manage Students',
    description: 'Edit, trash, and restore student accounts',
  },
  {
    key: 'syllabus',
    label: 'Manage Syllabus',
    description: 'Add, edit, and reorder categories and techniques',
  },
  {
    key: 'admins',
    label: 'Manage Admins',
    description: 'Promote students and demote other admins',
  },
];

// ─── Translated permissions list (for display in Settings) ───
export function getAdminPermissions() {
  return ADMIN_PERMISSIONS.map(({ key }) => ({
    key,
    label: i18n.t(`adminPermissions.${key}.label`),
    description: i18n.t(`adminPermissions.${key}.description`),
  }));
}

export function isMainAdminAccount(admin) {
  return !!admin && admin.isMainAdmin === true;
}

export function getEffectivePermissions(admin) {
  if (!admin) return { ...DEFAULT_PERMISSIONS };
  if (isMainAdminAccount(admin)) return { ...DEFAULT_PERMISSIONS };
  const p = admin.permissions || {};
  return {
    approvals: p.approvals !== false,
    validations: p.validations !== false,
    students: p.students !== false,
    syllabus: p.syllabus !== false,
    admins: p.admins !== false,
  };
}

export function hasPermission(admin, key) {
  if (!admin || admin.role !== 'admin') return false;
  return getEffectivePermissions(admin)[key] === true;
}