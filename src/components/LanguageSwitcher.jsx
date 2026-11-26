// src/components/LanguageSwitcher.jsx
import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import styles from './LanguageSwitcher.module.css';

const BUTTON_SIZE = 58;
const OFFSET = 20;

// `label` stays in the language itself so users recognize their choice.
// `sub` is the Japanese sub-label that ties into the dojo aesthetic.
const LANGUAGES = [
  { code: 'en', label: 'English',  sub: '英語' },
  { code: 'fr', label: 'Français', sub: 'フランス語' },
  { code: 'ar', label: 'العربية',  sub: 'アラビア語' },
];

const CORNER_CLASS = {
  'top-left':     'cornerTopLeft',
  'top-right':    'cornerTopRight',
  'bottom-left':  'cornerBottomLeft',
  'bottom-right': 'cornerBottomRight',
};

export default function LanguageSwitcher() {
  const { t, i18n } = useTranslation();

  // ── Direction & corner constraints ──────────────────────
  // LTR: sidebar on the left  → profile at top-right → forbid top-right.
  // RTL: sidebar on the right → profile at top-left  → forbid top-left.
  const isRtl = i18n.language?.startsWith('ar') ?? false;
  const FORBIDDEN_CORNER    = isRtl ? 'top-left'   : 'top-right';
  const SAFE_DEFAULT_CORNER = isRtl ? 'bottom-left': 'bottom-right';

  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  const buttonRef = useRef(null);

  const [corner, setCorner] = useState(() => {
    const saved = localStorage.getItem('languageSwitcherCorner');
    // Guard against a stale persisted corner that is now forbidden.
    if (!saved || saved === FORBIDDEN_CORNER) return SAFE_DEFAULT_CORNER;
    return saved;
  });

  const [sidebarWidth, setSidebarWidth] = useState(0);

  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [tempPosition, setTempPosition] = useState({ x: 0, y: 0 });
  const [isDraggingActive, setIsDraggingActive] = useState(false);

  const currentLanguage =
    LANGUAGES.find(lang => lang.code === i18n.language) || LANGUAGES[0];

  const switchLanguage = (code) => {
    i18n.changeLanguage(code);
    setIsOpen(false);
  };

  // ── Detect sidebar so the medallion never overlaps it ──
  useEffect(() => {
    const updateSidebarWidth = () => {
      const sidebar = document.querySelector('aside');
      if (sidebar) {
        const rect = sidebar.getBoundingClientRect();
        if (rect.left >= 0 && rect.width > 0) {
          setSidebarWidth(rect.width);
          return;
        }
      }
      setSidebarWidth(0);
    };

    updateSidebarWidth();
    window.addEventListener('resize', updateSidebarWidth);

    const sidebar = document.querySelector('aside');
    let resizeObserver;
    let mutationObserver;
    if (sidebar) {
      mutationObserver = new MutationObserver(updateSidebarWidth);
      mutationObserver.observe(sidebar, {
        attributes: true,
        attributeFilter: ['class', 'style'],
      });
      if (window.ResizeObserver) {
        resizeObserver = new ResizeObserver(updateSidebarWidth);
        resizeObserver.observe(sidebar);
      }
    }

    return () => {
      window.removeEventListener('resize', updateSidebarWidth);
      if (resizeObserver) resizeObserver.disconnect();
      if (mutationObserver) mutationObserver.disconnect();
    };
  }, []);

  // ── If the persisted corner becomes forbidden (lang switched),
  //    migrate it to the safe default on the same side. ──
  useEffect(() => {
    if (corner === FORBIDDEN_CORNER) {
      setCorner(SAFE_DEFAULT_CORNER);
      localStorage.setItem('languageSwitcherCorner', SAFE_DEFAULT_CORNER);
    }
  }, [corner, FORBIDDEN_CORNER, SAFE_DEFAULT_CORNER]);

  // ── Direction-aware margins ─────────────────────────────
  // LTR: sidebar on left  → left is the clamped side.
  // RTL: sidebar on right → right is the clamped side.
  const computeMargins = useCallback(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const leftEdge  = isRtl ? OFFSET : sidebarWidth + OFFSET;
    const rightEdge = isRtl
      ? vw - sidebarWidth - BUTTON_SIZE - OFFSET
      : vw - BUTTON_SIZE - OFFSET;
    const topEdge    = OFFSET;
    const bottomEdge = vh - BUTTON_SIZE - OFFSET;
    return { leftEdge, rightEdge, topEdge, bottomEdge };
  }, [sidebarWidth, isRtl]);

  // ── Corner math ────────────────────────────────────────
  const getPositionForCorner = useCallback((cornerName) => {
    const effective = cornerName === FORBIDDEN_CORNER ? SAFE_DEFAULT_CORNER : cornerName;
    const { leftEdge, rightEdge, topEdge, bottomEdge } = computeMargins();

    const x = effective.includes('right') ? rightEdge : leftEdge;
    const y = effective.includes('bottom') ? bottomEdge : topEdge;
    return { x, y };
  }, [computeMargins, FORBIDDEN_CORNER, SAFE_DEFAULT_CORNER]);

  const getNearestCorner = useCallback((posX, posY) => {
    const { leftEdge, rightEdge, topEdge, bottomEdge } = computeMargins();
    const centerX = posX + BUTTON_SIZE / 2;
    const centerY = posY + BUTTON_SIZE / 2;

    // Forbidden corner is excluded from candidates → releasing over
    // the profile button still snaps to an allowed corner.
    const corners = [
      { name: 'top-left',     x: leftEdge,  y: topEdge    },
      { name: 'top-right',    x: rightEdge, y: topEdge    },
      { name: 'bottom-left',  x: leftEdge,  y: bottomEdge },
      { name: 'bottom-right', x: rightEdge, y: bottomEdge },
    ].filter(c => c.name !== FORBIDDEN_CORNER);

    let minDist = Infinity;
    let nearest = SAFE_DEFAULT_CORNER;
    for (const c of corners) {
      const dx = centerX - (c.x + BUTTON_SIZE / 2);
      const dy = centerY - (c.y + BUTTON_SIZE / 2);
      const dist = dx * dx + dy * dy;
      if (dist < minDist) {
        minDist = dist;
        nearest = c.name;
      }
    }
    return nearest;
  }, [computeMargins, FORBIDDEN_CORNER, SAFE_DEFAULT_CORNER]);

  const saveCorner = useCallback((newCorner) => {
    setCorner(newCorner);
    localStorage.setItem('languageSwitcherCorner', newCorner);
  }, []);

  // ── Drag handling ──
  const handlePointerDown = (e) => {
    if (!buttonRef.current) return;
    if (!e.target.closest('[data-drag-handle]')) return;
    e.preventDefault();

    const rect = buttonRef.current.getBoundingClientRect();
    setDragOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    const pos = getPositionForCorner(corner);
    setTempPosition({ x: pos.x, y: pos.y });
    setIsDragging(true);
    setIsDraggingActive(true);
    setIsOpen(false);
  };

  const handlePointerMove = useCallback((e) => {
    if (!isDragging) return;
    e.preventDefault();

    const newX = e.clientX - dragOffset.x;
    const newY = e.clientY - dragOffset.y;

    // Direction-aware clamp — matches the corner math above.
    const { leftEdge, rightEdge, topEdge, bottomEdge } = computeMargins();

    setTempPosition({
      x: Math.max(leftEdge, Math.min(rightEdge, newX)),
      y: Math.max(topEdge,  Math.min(bottomEdge, newY)),
    });
  }, [isDragging, dragOffset, computeMargins]);

  const handlePointerUp = useCallback(() => {
    if (!isDragging) return;
    const nearest = getNearestCorner(tempPosition.x, tempPosition.y);
    saveCorner(nearest);
    setIsDragging(false);
    setIsDraggingActive(false);
  }, [isDragging, tempPosition, getNearestCorner, saveCorner]);

  useEffect(() => {
    if (!isDragging) return;
    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
    return () => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
    };
  }, [isDragging, handlePointerMove, handlePointerUp]);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleDropdown = () => {
    if (isDragging) return;
    setIsOpen(o => !o);
  };

  // Effective corner — belt-and-braces against a stale value between
  // renders (the effect above already migrates it).
  const effectiveCorner =
    corner === FORBIDDEN_CORNER ? SAFE_DEFAULT_CORNER : corner;

  const displayPosition = isDraggingActive
    ? tempPosition
    : getPositionForCorner(effectiveCorner);

  const cornerClass = styles[CORNER_CLASS[effectiveCorner]] || '';

  return (
    <div
      ref={dropdownRef}
      className={`${styles.wrapper} ${cornerClass} ${isDragging ? styles.dragging : ''}`}
      style={{
        left: displayPosition.x,
        top: displayPosition.y,
        cursor: isDragging ? 'grabbing' : 'grab',
        transition: isDragging
          ? 'none'
          : 'left 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), top 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
      }}
    >
      <button
        ref={buttonRef}
        data-drag-handle
        type="button"
        className={styles.medallion}
        onPointerDown={handlePointerDown}
        onClick={toggleDropdown}
        title={t('languageSwitcher.changeLanguageTitle', {
          language: currentLanguage.label,
          defaultValue: 'Change language — {{language}}',
        })}
        aria-label={t('languageSwitcher.changeLanguageAria', {
          language: currentLanguage.label,
          defaultValue: 'Change language (current: {{language}})',
        })}
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        <span className={styles.medallionKanji} aria-hidden="true">語</span>
        <span className={styles.codeBadge} aria-hidden="true">
          {currentLanguage.code.toUpperCase()}
        </span>
      </button>

      {isOpen && (
        <div className={styles.dropdown} role="menu">
          {LANGUAGES.map(lang => {
            const active = lang.code === i18n.language;
            return (
              <button
                key={lang.code}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                className={`${styles.option} ${active ? styles.optionActive : ''}`}
                onClick={() => switchLanguage(lang.code)}
              >
                <div className={styles.optionBody}>
                  <span className={styles.optionLabel}>{lang.label}</span>
                  <span className={styles.optionSub}>{lang.sub}</span>
                </div>
                {active && (
                  <Check size={16} strokeWidth={2.5} className={styles.optionCheck} />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}