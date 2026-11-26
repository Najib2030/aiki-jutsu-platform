// src/services/ai/appRegistry.js
export const APP_PAGES = [
  {
    path: '/dashboard',
    label: 'Dashboard',
    description:
      'Home screen. Shows overall progress, current belt, recent activity, ' +
      'belt journey, quiz trend, and quick links.',
  },
  {
    path: '/assistant',
    label: 'Sensei AI',
    description:
      'The current chat interface. Users talk to you to get app help, check stats, or navigate.',
  },
  {
    path: '/syllabus',
    label: 'Syllabus',
    description:
      'List of all technique categories available at the student’s belt level.',
  },
  {
    path: '/progress',
    label: 'My Progress',
    description:
      'Detailed per-technique progress, request belt validation when all ' +
      'current-belt techniques are completed, view belt history.',
  },
  {
    path: '/quizzes',
    label: 'Quizzes',
    description:
      'Create a new quiz (Japanese→English, English→Japanese, image→Japanese, ' +
      'or mixed), review past quiz attempts and scores.',
  },
  {
    path: '/rewards',
    label: 'Rewards',
    description:
      'Badge collection: earned, claimable, and locked achievements with XP.',
  },
  {
    path: '/competition',
    label: 'Competition',
    description:
      'Global leaderboard ranking students by XP (Earned through claimed badges) and badge count. Can be filtered by belt.',
  },
  {
    path: '/chat',
    label: 'Dojo Chat',
    description:
      'A real-time group chat for all dojo members. Contains pinned announcements, recent discussions, and mentions.',
  },
  {
    path: '/settings',
    label: 'Settings',
    description:
      'Edit profile (name, birth date, photo), change password, manage ' +
      'notifications, deactivate account.',
  },
];

export const ALLOWED_PATHS = APP_PAGES.map(p => p.path);

export function buildAppContext() {
  return APP_PAGES
    .map(p => `- ${p.path} — ${p.label}: ${p.description}`)
    .join('\n');
}