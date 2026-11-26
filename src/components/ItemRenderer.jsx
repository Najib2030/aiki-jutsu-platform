// src/components/ItemRenderer.jsx
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { getEffectiveLayout, SECTION_TYPES } from '../utils/defaultLayout';
import styles from './ItemRenderer.module.css';

// ---------- Helpers ----------
function filterAndSortSections(item, layout) {
  return layout.sections
    .filter((s) => s.visible !== false)
    .filter((s) => SECTION_TYPES[s.type]?.hasData(item))
    .slice()
    .sort((a, b) => (a.order || 0) - (b.order || 0));
}

function buildRows(sections) {
  const rows = [];
  let pending = null;
  for (const sec of sections) {
    if (sec.position === 'full') {
      if (pending) { rows.push(pending); pending = null; }
      rows.push({ full: sec });
    } else if (sec.position === 'left') {
      if (pending?.left) { rows.push(pending); pending = { left: sec }; }
      else { pending = { ...(pending || {}), left: sec }; }
    } else if (sec.position === 'right') {
      if (pending?.right) { rows.push(pending); pending = { right: sec }; }
      else { pending = { ...(pending || {}), right: sec }; }
    }
  }
  if (pending) rows.push(pending);
  return rows;
}

function getLocalizedName(item, lang) {
  if (lang === 'ar') return item.names?.ar || item.names?.en;
  if (lang === 'fr') return item.names?.fr || item.names?.en;
  return item.names?.en;
}

// ---------- Section content blocks ----------
function NamesBody({ item }) {
  const { i18n } = useTranslation();
  const activeLang = (i18n.language || 'en').split('-')[0];
  const ja = item.names?.ja;
  const secondary = getLocalizedName(item, activeLang);
  return (
    <div className={styles.namesBlock}>
      {ja && <h1 className={styles.jaTitle}>{ja}</h1>}
      {secondary && (
        <div className={styles.enSubtitle} dir="auto">{secondary}</div>
      )}
    </div>
  );
}

function TranslationsBody({ item }) {
  const { fr, ar } = item.names || {};
  return (
    <div className={styles.translationsBlock}>
      {fr && (
        <div className={styles.translationRow}>
          <span className={styles.langLabel}>FR</span>
          <span>{fr}</span>
        </div>
      )}
      {ar && (
        <div className={styles.translationRow} dir="rtl">
          <span className={styles.langLabel}>AR</span>
          <span>{ar}</span>
        </div>
      )}
    </div>
  );
}

function ClassificationBody({ item }) {
  const { t } = useTranslation();
  const belt = item.minimumGrade || 'yellow';
  return (
    <div className={styles.classificationBlock}>
      <div
        className={styles.beltBadge}
        style={{
          backgroundColor: `var(--color-${belt}, #f1c40f)`,
          color: belt === 'black' ? 'white' : '#1a1a1a',
        }}
      >
        {t('itemRenderer.beltLabel', { belt })}
      </div>
      {item.subGroup && (
        <div className={styles.subGroupText}>
          <span className={styles.metaLabel}>{t('itemRenderer.subgroup')}</span>{' '}
          {item.subGroup}
        </div>
      )}
    </div>
  );
}

function CombatBody({ item }) {
  const { t } = useTranslation();
  return (
    <div className={styles.combatBlock}>
      {item.attack && (
        <div className={styles.combatRow}>
          <span className={styles.metaLabel}>{t('itemRenderer.attack')}</span>
          <span>{item.attack}</span>
        </div>
      )}
      {item.defense && (
        <div className={styles.combatRow}>
          <span className={styles.metaLabel}>{t('itemRenderer.defense')}</span>
          <span>{item.defense}</span>
        </div>
      )}
    </div>
  );
}

// ★ VideoBody now shows an offline hint below the iframe.
function VideoBody({ item }) {
  const { t, i18n } = useTranslation();
  const activeLang = (i18n.language || 'en').split('-')[0];
  const localizedName = getLocalizedName(item, activeLang);

  return (
    <div>
      <div className={styles.videoWrapper}>
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${item.videoId}`}
          title={localizedName || t('itemRenderer.techniqueVideo')}
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
      <div className={styles.videoOfflineNote}>
        {t('offline.videoRequiresInternet', {
          defaultValue: '📡 Video playback requires an internet connection.',
        })}
      </div>
    </div>
  );
}

function ImagesBody({ item }) {
  const { i18n } = useTranslation();
  const [selectedImage, setSelectedImage] = useState(null);
  
  const activeLang = (i18n.language || 'en').split('-')[0];
  const fallbackAlt = getLocalizedName(item, activeLang) || '';
  
  const list = item.images?.length
    ? item.images
    : item.imageUrl
    ? [{ url: item.imageUrl }]
    : [];

  return (
    <div>
      <div className={styles.imagesGrid}>
        {list.map((img, i) => (
          <div
            key={i}
            onClick={() => setSelectedImage(img)}
            className={styles.imageTile}
            style={{ cursor: 'pointer' }}
          >
            <img
              src={img.url}
              alt={img.caption || fallbackAlt}
              loading="lazy"
            />
            {img.caption && <span className={styles.imageCaption}>{img.caption}</span>}
          </div>
        ))}
      </div>

      {/* 👇 Wrap the Lightbox in createPortal and attach to document.body 👇 */}
      {selectedImage && createPortal(
        <div 
          className={styles.lightboxOverlay} 
          onClick={() => setSelectedImage(null)}
        >
          <div 
            className={styles.lightboxContent} 
            onClick={(e) => e.stopPropagation()}
          >
            <button 
              className={styles.lightboxClose} 
              onClick={() => setSelectedImage(null)}
            >
              ×
            </button>
            <img 
              src={selectedImage.url} 
              alt={selectedImage.caption || fallbackAlt} 
            />
            {selectedImage.caption && (
              <p className={styles.lightboxCaption}>{selectedImage.caption}</p>
            )}
          </div>
        </div>,
        document.body // 👈 This tells React to render it directly inside <body>
      )}
    </div>
  );
}

function DescriptionBody({ item }) {
  const { en, fr, ar } = item.description || {};
  return (
    <div className={styles.descriptionBlock}>
      {en && <p className={styles.descEn}>{en}</p>}
      {fr && (
        <div className={styles.descSub}>
          <span className={styles.langLabel}>FR</span>
          <p>{fr}</p>
        </div>
      )}
      {ar && (
        <div className={styles.descSub} dir="rtl">
          <span className={styles.langLabel}>AR</span>
          <p>{ar}</p>
        </div>
      )}
    </div>
  );
}

function SectionBody({ title, children }) {
  return (
    <div>
      {title && <h3 className={styles.sectionTitle}>{title}</h3>}
      {children}
    </div>
  );
}

function renderSectionContent(sec, item, t) {
  switch (sec.type) {
    case 'names':
      return <NamesBody item={item} />;
    case 'translations':
      return <SectionBody title={sec.title}><TranslationsBody item={item} /></SectionBody>;
    case 'classification':
      return <SectionBody title={sec.title}><ClassificationBody item={item} /></SectionBody>;
    case 'combat':
      return <SectionBody title={sec.title}><CombatBody item={item} /></SectionBody>;
    case 'video':
      return <SectionBody title={sec.title}><VideoBody item={item} /></SectionBody>;
    case 'images':
      return <SectionBody title={sec.title}><ImagesBody item={item} /></SectionBody>;
    case 'description':
      return (
        <SectionBody title={sec.title || t('itemRenderer.notes')}>
          <DescriptionBody item={item} />
        </SectionBody>
      );
    default:
      return null;
  }
}

function renderSection(sec, item, t) {
  const isRaw = sec.border === 'none';
  const borderClass = isRaw ? '' : styles[`border_${sec.border}`];
  const baseClass = isRaw ? styles.sectionRaw : styles.sectionCard;
  return (
    <div className={`${baseClass} ${borderClass}`}>
      {renderSectionContent(sec, item, t)}
    </div>
  );
}

export default function ItemRenderer({ item, layout: overrideLayout }) {
  const { t } = useTranslation();
  if (!item) return null;
  const layout = overrideLayout || getEffectiveLayout(item);
  const sections = filterAndSortSections(item, layout);
  const rows = buildRows(sections);
  return (
    <div className={styles.renderer}>
      {rows.map((row, i) => {
        if (row.full) {
          return (
            <div key={`r${i}`} className={styles.rowFull}>
              {renderSection(row.full, item, t)}
            </div>
          );
        }
        if (row.left && row.right) {
          return (
            <div key={`r${i}`} className={styles.rowTwoCol}>
              <div>{renderSection(row.left, item, t)}</div>
              <div>{renderSection(row.right, item, t)}</div>
            </div>
          );
        }
        const sec = row.left || row.right;
        return (
          <div key={`r${i}`} className={styles.rowFull}>
            {renderSection(sec, item, t)}
          </div>
        );
      })}
    </div>
  );
}