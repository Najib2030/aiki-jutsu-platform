// src/services/ai/conversationStore.js
import {
  doc, getDoc, setDoc, deleteDoc, collection, query, where, getDocs,
} from 'firebase/firestore';
import { db } from '../../firebase/config';

const MAX_MESSAGES = 80;
const MAX_CONVERSATIONS = 30;

const convRef = (id) => doc(db, 'conversations', id);
export const newConvId = (uid) =>
  `conv_${uid}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

export async function listConversations(uid) {
  const snap = await getDocs(query(collection(db, 'conversations'), where('userId', '==', uid)));
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) =>
      (b.updatedAt?.toDate?.()?.getTime?.() || 0) -
      (a.updatedAt?.toDate?.()?.getTime?.() || 0))
    .slice(0, MAX_CONVERSATIONS);
}

export async function loadConversation(id) {
  try {
    const snap = await getDoc(convRef(id));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  } catch { return null; }
}

export async function saveConversation({ id, uid, title, messages }) {
  const trimmed = messages
    .filter(m => m.role === 'user' || (m.role === 'assistant' && m.content))
    .slice(-MAX_MESSAGES)
    .map(m => ({ role: m.role, content: m.content, ts: m.ts || Date.now() }));

  await setDoc(convRef(id), {
    userId: uid,
    title: title || 'New conversation',
    messages: trimmed,
    updatedAt: new Date(),
    createdAt: new Date(),
  }, { merge: true });
}

export async function deleteConversation(id) {
  try { await deleteDoc(convRef(id)); } catch { /* ignore */ }
}