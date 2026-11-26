// src/pages/Quizzes.jsx
import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase/config';
import { collection, query, where, getDocs, addDoc } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import { getBeltLabel } from '../utils/experience';
import styles from './Quiz.module.css';
import Loading from '../components/Loading';

const BELT_ORDER = ['yellow', 'orange', 'green', 'blue', 'brown', 'black', 'dan1'];

// `id` stays stable (used for query type + saving to DB). `labelKey` and
// `descriptionKey` are resolved with `t()` at render time.
const QUIZ_TYPES = [
  {
    id: 'ja-to-en',
    labelKey: 'quizzes.typeJaToEn',
    descriptionKey: 'quizzes.typeJaToEnDesc',
    icon: '語',
  },
  {
    id: 'en-to-ja',
    labelKey: 'quizzes.typeEnToJa',
    descriptionKey: 'quizzes.typeEnToJaDesc',
    icon: '英',
  },
  {
    id: 'image-to-ja',
    labelKey: 'quizzes.typeImageToJa',
    descriptionKey: 'quizzes.typeImageToJaDesc',
    icon: '絵',
  },
  {
    id: 'mixed',
    labelKey: 'quizzes.typeMixed',
    descriptionKey: 'quizzes.typeMixedDesc',
    icon: '乱',
  },
];

const QUESTION_COUNTS = [10, 15, 20, 0]; // 0 = all

// Short badges shown on question/review cards — technical abbreviations,
// language-neutral.
const TYPE_BADGE = {
  'ja-to-en': 'JP → EN',
  'en-to-ja': 'EN → JP',
  'image-to-ja': 'IMG → JP',
};

// ─── Data helpers ────────────────────────────────────────────────
async function fetchAccessibleItems(userData) {
  if (userData?.role === 'admin') {
    const snap = await getDocs(collection(db, 'items'));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  const userBelt = userData?.belt || 'yellow';
  const maxIdx =
    userBelt === 'dan1' ? BELT_ORDER.length - 1 : BELT_ORDER.indexOf(userBelt);
  const belts = maxIdx >= 0 ? BELT_ORDER.slice(0, maxIdx + 1) : ['yellow'];

  const batches = await Promise.all(
    belts.map(async belt => {
      const snap = await getDocs(
        query(collection(db, 'items'), where('minimumGrade', '==', belt))
      );
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    })
  );
  return batches.flat();
}

function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function getItemImages(item) {
  const list = item.images?.length
    ? item.images
    : item.imageUrl
    ? [{ url: item.imageUrl }]
    : [];
  return list.map(img => img.url).filter(Boolean);
}

function hasName(item, field) {
  return !!(item.names?.[field] && item.names[field].trim());
}

function canBuildQuestion(item, type) {
  switch (type) {
    case 'ja-to-en':
      return hasName(item, 'ja') && hasName(item, 'en');
    case 'en-to-ja':
      return hasName(item, 'ja') && hasName(item, 'en');
    case 'image-to-ja':
      return hasName(item, 'ja') && getItemImages(item).length > 0;
    default:
      return false;
  }
}

function buildQuestion(item, type, pool) {
  const ja = item.names?.ja?.trim();
  const en = item.names?.en?.trim();
  const imageUrls = getItemImages(item);

  let prompt, correctAnswer, distractField;
  switch (type) {
    case 'ja-to-en':
      prompt = ja; correctAnswer = en; distractField = 'en'; break;
    case 'en-to-ja':
      prompt = en; correctAnswer = ja; distractField = 'ja'; break;
    case 'image-to-ja':
      prompt = 'Identify this technique'; correctAnswer = ja; distractField = 'ja'; break;
    default:
      return null;
  }

  const distractors = shuffle(
    pool
      .filter(p => p.id !== item.id)
      .filter(p => p.names?.[distractField]?.trim())
      .filter(p => p.names[distractField].trim() !== correctAnswer)
  )
    .slice(0, 3)
    .map(p => p.names[distractField].trim());

  if (distractors.length < 3) return null;

  return {
    itemId: item.id,
    type,
    prompt,
    imageUrls: type === 'image-to-ja' ? imageUrls : [],
    correctAnswer,
    options: shuffle([correctAnswer, ...distractors]),
  };
}

function generateQuiz(pool, type, count) {
  const types =
    type === 'mixed' ? ['ja-to-en', 'en-to-ja', 'image-to-ja'] : [type];

  const usable = pool.filter(item => types.some(t => canBuildQuestion(item, t)));
  if (usable.length < 4) return [];

  const shuffled = shuffle(usable);
  const target = count === 0 ? shuffled.length : Math.min(count, shuffled.length);
  const questions = [];

  for (const item of shuffled) {
    if (questions.length >= target) break;
    const supported = types.filter(t => canBuildQuestion(item, t));
    if (supported.length === 0) continue;
    const qType = supported[Math.floor(Math.random() * supported.length)];
    const q = buildQuestion(item, qType, pool);
    if (q) questions.push(q);
  }
  return questions;
}

// Universal short units — `s` and `m` are understood across languages.
function formatDuration(seconds) {
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function formatDate(ts, locale) {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return (
    d.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' · ' +
    d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
  );
}

// ══════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════
export default function Quizzes() {
  const { t, i18n } = useTranslation();
  const { userData, currentUser } = useAuth();

  const [allItems, setAllItems] = useState([]);
  const [categories, setCategories] = useState({});
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [view, setView] = useState('setup'); // 'setup' | 'quiz' | 'results'
  const [setupTab, setSetupTab] = useState('new'); // 'new' | 'history'

  // Setup
  const [quizType, setQuizType] = useState('mixed');
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [questionCount, setQuestionCount] = useState(10);

  // Quiz
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [startTime, setStartTime] = useState(null);
  const [elapsed, setElapsed] = useState(0);

  // Results
  const [saving, setSaving] = useState(false);

  // ─── Fetch on mount ─────────────────────────────────────────
  useEffect(() => {
    async function load() {
      if (!userData || !currentUser) return;
      try {
        const [items, catSnap, histSnap] = await Promise.all([
          fetchAccessibleItems(userData),
          getDocs(collection(db, 'categories')),
          getDocs(
            query(
              collection(db, 'quizAttempts'),
              where('userId', '==', currentUser.uid)
            )
          ),
        ]);

        const catMap = {};
        catSnap.forEach(d => { catMap[d.id] = { id: d.id, ...d.data() }; });

        const hist = histSnap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => {
            const at = a.completedAt?.toDate?.()?.getTime?.() || 0;
            const bt = b.completedAt?.toDate?.()?.getTime?.() || 0;
            return bt - at;
          });

        setAllItems(items);
        setCategories(catMap);
        setHistory(hist);
      } catch (err) {
        console.error('Quiz load error:', err);
        setError(t('quizzes.loadError'));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [userData, currentUser, t]);

  // ─── Timer ──────────────────────────────────────────────────
  useEffect(() => {
    if (view !== 'quiz' || !startTime) return;
    const id = setInterval(
      () => setElapsed(Math.floor((Date.now() - startTime) / 1000)),
      1000
    );
    return () => clearInterval(id);
  }, [view, startTime]);

  // ─── Preload next question's images ─────────────────────────
  useEffect(() => {
    if (view !== 'quiz' || questions.length === 0) return;
    const nextQ = questions[currentIndex + 1];
    nextQ?.imageUrls?.forEach(url => {
      const img = new Image();
      img.src = url;
    });
  }, [view, currentIndex, questions]);

  // ─── Derived pools ──────────────────────────────────────────
  const pool = useMemo(
    () =>
      selectedCategories.length === 0
        ? allItems
        : allItems.filter(i => selectedCategories.includes(i.categoryId)),
    [allItems, selectedCategories]
  );

  const availableCount = useMemo(() => {
    const types =
      quizType === 'mixed' ? ['ja-to-en', 'en-to-ja', 'image-to-ja'] : [quizType];
    return pool.filter(item => types.some(tp => canBuildQuestion(item, tp))).length;
  }, [pool, quizType]);

  const maxQuestions = questionCount === 0
    ? availableCount
    : Math.min(questionCount, availableCount);

  // ─── Category visibility ────────────────────────────────────
  const categoryItemCounts = useMemo(() => {
    const counts = {};
    allItems.forEach(item => {
      if (item.categoryId) {
        counts[item.categoryId] = (counts[item.categoryId] || 0) + 1;
      }
    });
    return counts;
  }, [allItems]);

  const nonEmptyCategories = useMemo(
    () =>
      Object.values(categories)
        .filter(c => (categoryItemCounts[c.id] || 0) > 0)
        .sort((a, b) => (a.order || 0) - (b.order || 0)),
    [categories, categoryItemCounts]
  );

  useEffect(() => {
    setSelectedCategories(prev => {
      const valid = prev.filter(id => (categoryItemCounts[id] || 0) > 0);
      return valid.length === prev.length ? prev : valid;
    });
  }, [categoryItemCounts]);

  // ─── Handlers ───────────────────────────────────────────────
  const toggleCategory = catId => {
    setSelectedCategories(prev =>
      prev.includes(catId) ? prev.filter(c => c !== catId) : [...prev, catId]
    );
  };

  const startQuiz = () => {
    if (availableCount < 4) {
      setError(t('quizzes.notEnoughConfig'));
      return;
    }
    const generated = generateQuiz(pool, quizType, questionCount);
    if (generated.length === 0) {
      setError(t('quizzes.generateFailed'));
      return;
    }
    setQuestions(generated);
    setCurrentIndex(0);
    setAnswers([]);
    setSelectedAnswer(null);
    setStartTime(Date.now());
    setElapsed(0);
    setError('');
    setView('quiz');
  };

  const handleAnswer = answer => {
    if (selectedAnswer) return;
    setSelectedAnswer(answer);

    const q = questions[currentIndex];
    const correct = answer === q.correctAnswer;

    setTimeout(() => {
      const next = [...answers, { question: q, userAnswer: answer, correct }];
      setAnswers(next);
      if (currentIndex + 1 < questions.length) {
        setCurrentIndex(currentIndex + 1);
        setSelectedAnswer(null);
      } else {
        finish(next);
      }
    }, 1200);
  };

  const finish = async finalAnswers => {
    const duration = Math.floor((Date.now() - startTime) / 1000);
    const score = finalAnswers.filter(a => a.correct).length;
    setView('results');
    setSaving(true);

    try {
      const attempt = {
        userId: currentUser.uid,
        userName: userData.name || '',
        score,
        total: finalAnswers.length,
        percentage: Math.round((score / finalAnswers.length) * 100),
        duration,
        quizType,
        categories: selectedCategories,
        completedAt: new Date(),
        answers: finalAnswers.map(a => ({
          itemId: a.question.itemId,
          questionType: a.question.type,
          prompt: a.question.prompt,
          imageUrls: a.question.imageUrls || [],
          correctAnswer: a.question.correctAnswer,
          userAnswer: a.userAnswer,
          correct: a.correct,
        })),
      };
      const ref = await addDoc(collection(db, 'quizAttempts'), attempt);
      setHistory(prev => [{ id: ref.id, ...attempt }, ...prev]);
    } catch (err) {
      console.error('Save quiz attempt failed:', err);
    } finally {
      setSaving(false);
    }
  };

  const resetToSetup = () => {
    setView('setup');
    setQuestions([]);
    setAnswers([]);
    setSelectedAnswer(null);
    setStartTime(null);
    setElapsed(0);
    setError('');
  };

  const retrySameSettings = () => {
    const generated = generateQuiz(pool, quizType, questionCount);
    if (generated.length === 0) return resetToSetup();
    setQuestions(generated);
    setCurrentIndex(0);
    setAnswers([]);
    setSelectedAnswer(null);
    setStartTime(Date.now());
    setElapsed(0);
    setView('quiz');
  };

  const exitQuiz = () => {
    if (window.confirm(t('quizzes.exitConfirm'))) {
      resetToSetup();
    }
  };

  // ─── Stats from history ─────────────────────────────────────
  const stats = useMemo(() => {
    if (history.length === 0) {
      return {
        attempts: 0,
        best: 0,
        bestToday: null,
        bestWeek: null,
        avg: 0,
        totalQuestions: 0,
      };
    }

    const now = new Date();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    ).getTime();
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    const withTs = history.map(h => ({
      pct: h.percentage || 0,
      ts: h.completedAt?.toDate?.()?.getTime?.() || 0,
    }));

    const best = Math.max(...withTs.map(x => x.pct));
    const avg = Math.round(
      withTs.reduce((s, x) => s + x.pct, 0) / withTs.length
    );
    const totalQuestions = history.reduce((s, h) => s + (h.total || 0), 0);

    const todayAttempts = withTs.filter(x => x.ts >= startOfToday);
    const weekAttempts = withTs.filter(x => x.ts >= weekAgo);

    const bestToday = todayAttempts.length
      ? Math.max(...todayAttempts.map(x => x.pct))
      : null;
    const bestWeek = weekAttempts.length
      ? Math.max(...weekAttempts.map(x => x.pct))
      : null;

    return {
      attempts: history.length,
      best,
      bestToday,
      bestWeek,
      avg,
      totalQuestions,
    };
  }, [history]);

  // ═══════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════
  if (loading) return <Loading text={t('quizzes.loading')} />;

  if (view === 'quiz') {
    return renderQuizView();
  }

  if (view === 'results') {
    return renderResultsView();
  }

  return renderSetupView();

  // ─── SETUP VIEW ─────────────────────────────────────────────
  function renderSetupView() {
    const isHistory = setupTab === 'history';

    return (
      <div className={styles.quizPage}>
        <section className={styles.hero}>
          <div className={styles.heroText}>
            <h1 className={styles.heroTitle}>{t('quizzes.heroTitle')}</h1>
            <p className={styles.heroSubtitle}>
              {t('quizzes.heroSubtitle')}
            </p>
          </div>
          <div className={styles.heroBadge}>
            {getBeltLabel(userData?.belt || 'yellow')}
          </div>
        </section>

        <section className={styles.statsBar}>
          <div className={styles.statBlock}>
            <div className={styles.statValue}>{stats.attempts}</div>
            <div className={styles.statLabel}>{t('quizzes.statTaken')}</div>
          </div>

          <div className={styles.statBlock}>
            <div className={styles.statValue}>{stats.best}%</div>
            <div className={styles.statLabel}>{t('quizzes.statBest')}</div>
          </div>

          <div className={`${styles.statBlock} ${styles.statBlockToday}`}>
            <div className={styles.statValue}>
              {stats.bestToday !== null ? `${stats.bestToday}%` : '—'}
            </div>
            <div className={styles.statLabel}>{t('quizzes.statBestToday')}</div>
          </div>

          <div className={`${styles.statBlock} ${styles.statBlockWeek}`}>
            <div className={styles.statValue}>
              {stats.bestWeek !== null ? `${stats.bestWeek}%` : '—'}
            </div>
            <div className={styles.statLabel}>{t('quizzes.statBestWeek')}</div>
          </div>

          <div className={styles.statBlock}>
            <div className={styles.statValue}>{stats.avg}%</div>
            <div className={styles.statLabel}>{t('quizzes.statAvg')}</div>
          </div>

          <div className={styles.statBlock}>
            <div className={styles.statValue}>{stats.totalQuestions}</div>
            <div className={styles.statLabel}>{t('quizzes.statQuestions')}</div>
          </div>
        </section>

        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${!isHistory ? styles.tabActive : ''}`}
            onClick={() => setSetupTab('new')}
          >
            {t('quizzes.tabNew')}
          </button>
          <button
            className={`${styles.tab} ${isHistory ? styles.tabActive : ''}`}
            onClick={() => setSetupTab('history')}
          >
            {t('quizzes.tabHistory')}{history.length > 0 && ` (${history.length})`}
          </button>
        </div>

        {error && <div className={styles.errorBanner}>{error}</div>}

        {/* ─── NEW QUIZ TAB ──────────────────────────────── */}
        {!isHistory && (
          <>
            {allItems.length === 0 && (
              <div className={styles.emptyState}>
                <h3>{t('quizzes.noTechniquesTitle')}</h3>
                <p>{t('quizzes.noTechniquesSub')}</p>
              </div>
            )}
            {allItems.length > 0 && allItems.length < 4 && (
              <div className={styles.emptyState}>
                <h3>{t('quizzes.notEnoughTitle')}</h3>
                <p>{t('quizzes.notEnoughSub')}</p>
              </div>
            )}

            {allItems.length >= 4 && (
              <>
                {/* Step 1 — Type */}
                <div className={styles.setupSection}>
                  <div className={styles.sectionHeader}>
                    <span className={styles.stepBadge}>1</span>
                    <h2 className={styles.sectionTitle}>{t('quizzes.step1Title')}</h2>
                  </div>
                  <div className={styles.typeGrid}>
                    {QUIZ_TYPES.map(tp => {
                      const active = quizType === tp.id;
                      return (
                        <button
                          key={tp.id}
                          className={`${styles.typeCard} ${
                            active ? styles.typeCardActive : ''
                          }`}
                          onClick={() => setQuizType(tp.id)}
                        >
                          <div className={styles.typeIcon}>{tp.icon}</div>
                          <div className={styles.typeBody}>
                            <div className={styles.typeLabel}>{t(tp.labelKey)}</div>
                            <div className={styles.typeDesc}>{t(tp.descriptionKey)}</div>
                          </div>
                          {active && (
                            <div className={styles.typeCheck}>✓</div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Step 2 — Categories */}
                <div className={styles.setupSection}>
                  <div className={styles.sectionHeader}>
                    <span className={styles.stepBadge}>2</span>
                    <h2 className={styles.sectionTitle}>{t('quizzes.step2Title')}</h2>
                    <span className={styles.sectionHint}>
                      {t('quizzes.step2Hint')}
                    </span>
                  </div>
                  <div className={styles.categoryChips}>
                    <button
                      className={`${styles.catChip} ${
                        selectedCategories.length === 0 ? styles.catChipActive : ''
                      }`}
                      onClick={() => setSelectedCategories([])}
                    >
                      {t('quizzes.allCategories')}
                      <span className={styles.catChipCount}>{allItems.length}</span>
                    </button>
                    {nonEmptyCategories.map(c => {
                      const active = selectedCategories.includes(c.id);
                      const count = categoryItemCounts[c.id];
                      return (
                        <button
                          key={c.id}
                          className={`${styles.catChip} ${
                            active ? styles.catChipActive : ''
                          }`}
                          onClick={() => toggleCategory(c.id)}
                          title={t('quizzes.catChipTooltip', { count })}
                        >
                          {c.names?.en || t('quizzes.untitled')}
                          <span className={styles.catChipCount}>{count}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Step 3 — Question count */}
                <div className={styles.setupSection}>
                  <div className={styles.sectionHeader}>
                    <span className={styles.stepBadge}>3</span>
                    <h2 className={styles.sectionTitle}>{t('quizzes.step3Title')}</h2>
                  </div>
                  <div className={styles.countRow}>
                    {QUESTION_COUNTS.map(n => {
                      const active = questionCount === n;
                      const label = n === 0 ? t('quizzes.allCount') : n;
                      return (
                        <button
                          key={n}
                          className={`${styles.countBtn} ${
                            active ? styles.countBtnActive : ''
                          }`}
                          onClick={() => setQuestionCount(n)}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Summary & start */}
                <div className={styles.startPanel}>
                  <div className={styles.startSummary}>
                    <div className={styles.startSummaryLine}>
                      <span className={styles.startKey}>{t('quizzes.availableTechniques')}</span>
                      <span className={styles.startVal}>{availableCount}</span>
                    </div>
                    <div className={styles.startSummaryLine}>
                      <span className={styles.startKey}>{t('quizzes.quizLength')}</span>
                      <span className={styles.startVal}>
                        {t('quizzes.questionsCount', { count: maxQuestions })}
                      </span>
                    </div>
                    <div className={styles.startSummaryLine}>
                      <span className={styles.startKey}>{t('quizzes.typeLabel')}</span>
                      <span className={styles.startVal}>
                        {t(QUIZ_TYPES.find(tp => tp.id === quizType)?.labelKey || quizType)}
                      </span>
                    </div>
                  </div>
                  <button
                    className={styles.startBtn}
                    onClick={startQuiz}
                    disabled={availableCount < 4}
                  >
                    {t('quizzes.startQuiz')}
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {/* ─── HISTORY TAB ──────────────────────────────── */}
        {isHistory && (
          <>
            {history.length === 0 ? (
              <div className={styles.emptyState}>
                <h3>{t('quizzes.noHistoryTitle')}</h3>
                <p>{t('quizzes.noHistorySub')}</p>
              </div>
            ) : (
              <div className={styles.historyList}>
                {history.map(h => {
                  const pct = h.percentage || 0;
                  const tone =
                    pct >= 80 ? 'great' : pct >= 60 ? 'good' : 'low';
                  const historyLabel = t(
                    QUIZ_TYPES.find(tp => tp.id === h.quizType)?.labelKey || '',
                    { defaultValue: h.quizType }
                  );
                  return (
                    <div key={h.id} className={styles.historyItem}>
                      <div
                        className={`${styles.historyScore} ${styles[`tone_${tone}`]}`}
                      >
                        <div className={styles.historyPct}>{pct}%</div>
                        <div className={styles.historyFrac}>
                          {h.score}/{h.total}
                        </div>
                      </div>
                      <div className={styles.historyInfo}>
                        <div className={styles.historyType}>
                          {historyLabel}
                        </div>
                        <div className={styles.historyMeta}>
                          {formatDate(h.completedAt, i18n.language)} · {formatDuration(h.duration)}
                        </div>
                      </div>
                      <div className={styles.historyProgress}>
                        <div className={styles.progressTrack}>
                          <div
                            className={`${styles.progressFill} ${styles[`fill_${tone}`]}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  // ─── QUIZ VIEW ──────────────────────────────────────────────
  function renderQuizView() {
    const q = questions[currentIndex];
    const progressPct = Math.round((currentIndex / questions.length) * 100);
    const scoreSoFar = answers.filter(a => a.correct).length;

    return (
      <div className={styles.quizActive}>
        <div className={styles.quizTopBar}>
          <button className={styles.exitBtn} onClick={exitQuiz}>
            {t('quizzes.exit')}
          </button>
          <div className={styles.quizTopCenter}>
            <span className={styles.questionCounter}>
              {t('quizzes.questionOf', {
                current: currentIndex + 1,
                total: questions.length,
              })}
            </span>
            <span className={styles.quizTimer}>⏱ {formatDuration(elapsed)}</span>
          </div>
          <div className={styles.liveScore}>
            ✓ {scoreSoFar}
            <span className={styles.liveScoreSub}>/ {answers.length}</span>
          </div>
        </div>

        <div className={styles.progressOuter}>
          <div
            className={styles.progressInner}
            style={{ width: `${progressPct}%` }}
          />
        </div>

        <div className={styles.questionCard}>
          <span className={styles.qTypeBadge}>{TYPE_BADGE[q.type] || t('quizzes.questionFallback')}</span>

          {q.imageUrls?.length > 0 ? (
            <div className={styles.questionImageWrap} key={currentIndex}>
              <div
                className={styles.questionImageGrid}
                data-count={Math.min(q.imageUrls.length, 9)}
              >
                {q.imageUrls.map((url, i) => (
                  <a
                    key={i}
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className={styles.questionImageLink}
                    title={t('quizzes.imageOpenFull')}
                  >
                    <img
                      src={url}
                      alt={t('quizzes.techniqueImageAlt', { index: i + 1 })}
                      className={styles.questionImage}
                      loading="eager"
                    />
                  </a>
                ))}
              </div>
              <p className={styles.questionPrompt}>
                {q.type === 'image-to-ja'
                  ? t('quizzes.promptIdentify')
                  : q.prompt}
              </p>
            </div>
          ) : (
            <div className={styles.promptWrap} key={currentIndex}>
              <div className={styles.promptLabel}>
                {q.type === 'ja-to-en'
                  ? t('quizzes.promptJapanese')
                  : t('quizzes.promptEnglish')}
              </div>
              <div className={styles.promptText}>{q.prompt}</div>
            </div>
          )}

          <div className={styles.optionsGrid}>
            {q.options.map((opt, i) => {
              let cls = styles.optionBtn;
              if (selectedAnswer) {
                if (opt === q.correctAnswer) cls += ` ${styles.optCorrect}`;
                else if (opt === selectedAnswer) cls += ` ${styles.optWrong}`;
                else cls += ` ${styles.optDim}`;
              }
              return (
                <button
                  key={i}
                  className={cls}
                  onClick={() => handleAnswer(opt)}
                  disabled={!!selectedAnswer}
                >
                  <span className={styles.optionLetter}>
                    {String.fromCharCode(65 + i)}
                  </span>
                  <span className={styles.optionText}>{opt}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ─── RESULTS VIEW ───────────────────────────────────────────
  function renderResultsView() {
    const score = answers.filter(a => a.correct).length;
    const total = answers.length;
    const pct = total === 0 ? 0 : Math.round((score / total) * 100);
    const duration = Math.floor((Date.now() - startTime) / 1000);

    const tone = pct >= 80 ? 'great' : pct >= 60 ? 'good' : 'low';
    const titleKey =
      pct >= 80 ? 'quizzes.resultsTitleGreat' :
      pct >= 60 ? 'quizzes.resultsTitleGood' :
      'quizzes.resultsTitleLow';
    const messageKey =
      pct === 100 ? 'quizzes.resultsMsgPerfect' :
      pct >= 80  ? 'quizzes.resultsMsgGreat' :
      pct >= 60  ? 'quizzes.resultsMsgGood' :
      'quizzes.resultsMsgLow';

    return (
      <div className={styles.resultsPage}>
        <div className={styles.resultsCard}>
          <div className={`${styles.scoreRing} ${styles[`ring_${tone}`]}`}>
            <svg viewBox="0 0 120 120" className={styles.scoreSvg}>
              <circle cx="60" cy="60" r="52" className={styles.scoreTrack} />
              <circle
                cx="60"
                cy="60"
                r="52"
                className={styles.scoreFill}
                style={{
                  strokeDasharray: `${2 * Math.PI * 52}`,
                  strokeDashoffset: `${2 * Math.PI * 52 * (1 - pct / 100)}`,
                }}
              />
            </svg>
            <div className={styles.scoreLabel}>
              <span className={styles.scoreBig}>{pct}%</span>
              <span className={styles.scoreSmall}>
                {score} / {total}
              </span>
            </div>
          </div>

          <h1 className={styles.resultsTitle}>{t(titleKey)}</h1>
          <p className={styles.resultsMessage}>{t(messageKey)}</p>

          <div className={styles.resultsStats}>
            <div className={styles.resultsStat}>
              <div className={styles.resultsStatVal}>{score}</div>
              <div className={styles.resultsStatLabel}>{t('quizzes.correct')}</div>
            </div>
            <div className={styles.resultsStat}>
              <div className={styles.resultsStatVal}>{total - score}</div>
              <div className={styles.resultsStatLabel}>{t('quizzes.incorrect')}</div>
            </div>
            <div className={styles.resultsStat}>
              <div className={styles.resultsStatVal}>{formatDuration(duration)}</div>
              <div className={styles.resultsStatLabel}>{t('quizzes.time')}</div>
            </div>
          </div>

          <div className={styles.resultsActions}>
            <button className={styles.primaryBtn} onClick={retrySameSettings}>
              {t('quizzes.retrySettings')}
            </button>
            <button className={styles.secondaryBtn} onClick={resetToSetup}>
              {t('quizzes.newQuiz')}
            </button>
            <Link to="/dashboard" className={styles.ghostBtn}>
              {t('quizzes.goDashboard')}
            </Link>
          </div>
          {saving && (
            <div className={styles.savingNote}>{t('quizzes.savingNote')}</div>
          )}
        </div>

        <div className={styles.reviewCard}>
          <h2 className={styles.reviewTitle}>{t('quizzes.reviewTitle')}</h2>
          <div className={styles.reviewList}>
            {answers.map((a, i) => (
              <div
                key={i}
                className={`${styles.reviewItem} ${
                  a.correct ? styles.reviewCorrect : styles.reviewWrong
                }`}
              >
                <div className={styles.reviewIcon}>
                  {a.correct ? '✓' : '✕'}
                </div>
                <div className={styles.reviewBody}>
                  <div className={styles.reviewPrompt}>
                    <span className={styles.reviewType}>
                      {TYPE_BADGE[a.question.type] || t('quizzes.questionFallback')}
                    </span>
                    {a.question.prompt}
                  </div>

                  {a.question.imageUrls?.length > 0 && (
                    <div className={styles.reviewThumbs}>
                      {a.question.imageUrls.slice(0, 4).map((url, j) => (
                        <img
                          key={j}
                          src={url}
                          alt=""
                          className={styles.reviewThumb}
                        />
                      ))}
                      {a.question.imageUrls.length > 4 && (
                        <span className={styles.reviewThumbMore}>
                          +{a.question.imageUrls.length - 4}
                        </span>
                      )}
                    </div>
                  )}

                  {!a.correct && (
                    <div className={styles.reviewDetail}>
                      <span className={styles.reviewWrongAns}>
                        {t('quizzes.yourAnswer', { answer: a.userAnswer })}
                      </span>
                      <span className={styles.reviewCorrectAns}>
                        {t('quizzes.correctAnswer', { answer: a.question.correctAnswer })}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }
}