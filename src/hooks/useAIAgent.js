// src/hooks/useAIAgent.js
import { useState, useCallback, useEffect, useRef } from 'react';
import { auth } from '../firebase/config';
import { streamAI } from '../services/ai/aiClient';
import {
  TOOL_DEFINITIONS, CONFIRMATION_TOOLS, executeTool,
} from '../services/ai/aiTools';
import { buildAppContext } from '../services/ai/appRegistry';
import {
  listConversations, loadConversation, saveConversation,
  deleteConversation, newConvId,
} from '../services/ai/conversationStore';

const MAX_TOOL_STEPS = 6;
const DEFAULT_MODEL = 'openai/gpt-oss-120b';

export function useAIAgent({ userData, navigate, t, i18n }) {
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [error, setError] = useState(null);
  const [pendingTool, setPendingTool] = useState(null);
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [tone, setTone] = useState('balanced');

  const abortRef    = useRef(null);
  const messagesRef = useRef([]);
  messagesRef.current = messages;

  const uid = auth.currentUser?.uid;

  /* ── Load conversation list on mount ──────────────────────── */
  useEffect(() => {
    if (!uid) return;
    listConversations(uid).then(list => {
      setConversations(list);
      if (list[0]) openConversation(list[0].id);
    });
  }, [uid]);

  /* ── Persist (debounced) ──────────────────────────────────── */
  useEffect(() => {
    if (!uid || !activeId || messages.length === 0) return;
    const timer = setTimeout(() => {
      const firstUser = messages.find(m => m.role === 'user');
      const title = firstUser
        ? firstUser.content.slice(0, 48) + (firstUser.content.length > 48 ? '…' : '')
        : 'New conversation';
      saveConversation({ id: activeId, uid, title, messages }).catch(() => {});
      setConversations(prev =>
        prev.map(c => c.id === activeId ? { ...c, title, updatedAt: { toDate: () => new Date() } } : c)
      );
    }, 700);
    return () => clearTimeout(timer);
  }, [messages, activeId, uid]);

  /* ── Helpers ──────────────────────────────────────────────── */
  const userContext = useCallback(() => {
    if (!userData) return '';
    return [
      `Name: ${userData.name || 'Student'}`,
      `Belt: ${userData.belt || 'yellow'}`,
      `Role: ${userData.role || 'student'}`,
    ].join('\n');
  }, [userData]);

  const toOpenAI = useCallback((history) => {
    const out = [];
    for (const m of history) {
      if (m.role === 'user') out.push({ role: 'user', content: m.content });
      else if (m.role === 'assistant') {
        if (m.toolCalls?.length) {
          out.push({ role: 'assistant', content: m.content || null, tool_calls: m.toolCalls });
        } else {
          out.push({ role: 'assistant', content: m.content || '' });
        }
      } else if (m.role === 'tool') {
        out.push({ role: 'tool', tool_call_id: m.toolCallId, content: m.content });
      }
    }
    return out;
  }, []);

  /* ── Core loop ────────────────────────────────────────────── */
  const driveLoop = useCallback(async (working) => {
    let current = working;

    for (let step = 0; step < MAX_TOOL_STEPS; step++) {
      const controller = new AbortController();
      abortRef.current = controller;
      setStreamingText('');

      let result;
      try {
        result = await streamAI({
          messages: toOpenAI(current),
          tools: TOOL_DEFINITIONS,
          model,
          locale: i18n.language || 'en',
          tone,
          appContext: buildAppContext(),
          userContext: userContext(),
          signal: controller.signal,
          onDelta: (d) => setStreamingText(prev => prev + d),
        });
      } catch (err) {
        if (err.name === 'AbortError') {
          setStreamingText('');
          return;
        }
        throw err;
      } finally {
        abortRef.current = null;
        setStreamingText('');
      }

      const aMsg = {
        role: 'assistant',
        content: result.content || '',
        toolCalls: result.tool_calls || null,
        ts: Date.now(),
      };
      current = [...current, aMsg];
      setMessages(current);

      const calls = result.tool_calls || [];
      if (!calls.length) return;

      /* Confirmation gate */
      const needsConfirm = calls.find(c => CONFIRMATION_TOOLS.has(c.function.name));
      if (needsConfirm) {
        let args = {};
        try { args = JSON.parse(needsConfirm.function.arguments || '{}'); } catch { /* ignore */ }
        setPendingTool({
          id: needsConfirm.id,
          name: needsConfirm.function.name,
          args,
          snapshot: current,
          restCalls: calls.filter(c => c.id !== needsConfirm.id),
        });
        return;
      }

      /* Execute read-only tools */
      const results = [];
      for (const call of calls) {
        let args = {};
        try { args = JSON.parse(call.function.arguments || '{}'); } catch { /* ignore */ }
        let content;
        try {
          content = await executeTool(call.function.name, args, {
            user: auth.currentUser, userData, navigate, t, i18n,
          });
        } catch (err) {
          content = JSON.stringify({ error: err.message || 'tool_failed' });
        }
        results.push({
          role: 'tool',
          toolCallId: call.id,
          toolName: call.function.name,
          content: String(content),
        });
      }
      current = [...current, ...results];
      setMessages(current);
    }
    throw new Error('Too many tool steps');
  }, [toOpenAI, model, tone, i18n, userContext, userData, navigate, t]);

  /* ── Public actions ───────────────────────────────────────── */
  const sendMessage = useCallback(async (text) => {
    const trimmed = String(text || '').trim();
    if (!trimmed || loading) return;
    setError(null);

    let convId = activeId;
    if (!convId) {
      convId = newConvId(uid);
      setActiveId(convId);
    }

    const next = [...messages, { role: 'user', content: trimmed, ts: Date.now() }];
    setMessages(next);
    setLoading(true);
    try {
      await driveLoop(next);
    } catch (err) {
      setError(err.message || t('aiAgent.error'));
    } finally {
      setLoading(false);
    }
  }, [messages, loading, activeId, uid, driveLoop, t]);

  const stopGeneration = useCallback(() => {
    abortRef.current?.abort();
    setLoading(false);
  }, []);

  const regenerate = useCallback(async () => {
    const hist = [...messages];
    while (hist.length && hist[hist.length - 1].role !== 'user') hist.pop();
    if (!hist.length) return;
    setMessages(hist);
    setLoading(true);
    setError(null);
    try { await driveLoop(hist); }
    catch (err) { setError(err.message || t('aiAgent.error')); }
    finally { setLoading(false); }
  }, [messages, driveLoop, t]);

  const confirmPendingTool = useCallback(async () => {
    if (!pendingTool || loading) return;
    const { id, name, args, snapshot, restCalls } = pendingTool;
    setPendingTool(null);
    setLoading(true);
    try {
      let content;
      try {
        content = await executeTool(name, args, {
          user: auth.currentUser, userData, navigate, t, i18n,
        });
      } catch (err) {
        content = JSON.stringify({ error: err.message || 'tool_failed' });
      }
      const after = [...snapshot, { role: 'tool', toolCallId: id, toolName: name, content: String(content) }];

      for (const call of restCalls) {
        let a = {};
        try { a = JSON.parse(call.function.arguments || '{}'); } catch { /* ignore */ }
        let c;
        try { c = await executeTool(call.function.name, a, { user: auth.currentUser, userData, navigate, t, i18n }); }
        catch (err) { c = JSON.stringify({ error: err.message }); }
        after.push({ role: 'tool', toolCallId: call.id, toolName: call.function.name, content: String(c) });
      }

      setMessages(after);
      await driveLoop(after);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [pendingTool, loading, driveLoop, userData, navigate, t, i18n]);

  const cancelPendingTool = useCallback(async () => {
    if (!pendingTool || loading) return;
    const { id, name, snapshot } = pendingTool;
    setPendingTool(null);
    setLoading(true);
    try {
      const after = [...snapshot, {
        role: 'tool', toolCallId: id, toolName: name,
        content: JSON.stringify({ declined: true }),
      }];
      setMessages(after);
      await driveLoop(after);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [pendingTool, loading, driveLoop]);

  /* ── Conversation management ──────────────────────────────── */
  const openConversation = useCallback(async (id) => {
    setActiveId(id);
    setMessages([]);
    setPendingTool(null);
    setError(null);
    const conv = await loadConversation(id);
    if (conv?.messages?.length) setMessages(conv.messages);
  }, []);

  const startNewConversation = useCallback(() => {
    const newId = newConvId(uid);
    setActiveId(newId);
    setMessages([]);
    setPendingTool(null);
    setError(null);
    
    // Instantly add placeholder to history sidebar
    setConversations(prev => [
      { id: newId, title: 'New conversation', updatedAt: { toDate: () => new Date() } },
      ...prev
    ]);
  }, [uid]);

  const removeConversation = useCallback(async (id) => {
    await deleteConversation(id);
    setConversations(prev => prev.filter(c => c.id !== id));
    if (id === activeId) startNewConversation();
  }, [activeId, startNewConversation]);

  return {
    conversations, activeId, messages, loading, streamingText, error, pendingTool,
    model, setModel, tone, setTone,
    sendMessage, stopGeneration, regenerate,
    confirmPendingTool, cancelPendingTool,
    openConversation, startNewConversation, removeConversation,
  };
}