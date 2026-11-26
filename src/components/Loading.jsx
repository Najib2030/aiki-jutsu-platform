// src/components/Loading.jsx
import styles from './Loading.module.css';

export default function Loading({ size = 'md', variant = 'page' }) {
  return (
    <div
      className={`${styles.wrapper} ${styles[variant]} ${styles[`size_${size}`]}`}
      role="status"
      aria-label="Loading"
      aria-live="polite"
    >
      <div className={styles.clashContainer} aria-hidden="true">
        <svg viewBox="0 0 100 100" className={styles.clashSvg}>
          <defs>
            <linearGradient id="bladeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%"   stopColor="#5c4a2a" />
              <stop offset="30%"  stopColor="#a8894a" />
              <stop offset="55%"  stopColor="#e8d5b7" />
              <stop offset="75%"  stopColor="#fbf3da" />
              <stop offset="100%" stopColor="#c0a062" />
            </linearGradient>
            <linearGradient id="tsubaGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%"   stopColor="#e8d5b7" />
              <stop offset="50%"  stopColor="#c0a062" />
              <stop offset="100%" stopColor="#8a6e3a" />
            </linearGradient>
            <linearGradient id="kashiraGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%"   stopColor="#fbf3da" />
              <stop offset="60%"  stopColor="#c0a062" />
              <stop offset="100%" stopColor="#6d5528" />
            </linearGradient>
            <radialGradient id="sparkGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%"   stopColor="#ffffff" />
              <stop offset="25%"  stopColor="#fff8e1" />
              <stop offset="55%"  stopColor="#f1c40f" />
              <stop offset="100%" stopColor="rgba(192, 160, 98, 0)" />
            </radialGradient>

            <g id="katanaShape">
              <path d="M 46.5 46 C 46.8 36, 47.5 26, 48.8 17 Q 49.8 11, 51 7.5 L 52 5 L 53.4 7.5 Q 52.4 12.5, 51.4 18 C 50.2 27, 49.5 36, 49.3 46 Z" fill="url(#bladeGrad)" />
              <path d="M 51 7.5 L 52 5 L 53.4 7.5 Q 52.4 10.5, 51.6 12.5 Z" fill="#8a6e3a" opacity="0.35" />
              <path d="M 49.3 46 C 49.5 36, 50.2 27, 51.4 18 Q 52.4 12.5, 53.4 7.5" stroke="#fbf3da" strokeWidth="0.55" fill="none" opacity="0.92" strokeLinecap="round" />
              <path d="M 47.3 46 C 47.6 36, 48.2 26, 49.5 17 Q 50.3 12, 51.2 8" stroke="#6d5528" strokeWidth="0.35" fill="none" opacity="0.65" />
              <rect x="45" y="45.5" width="10" height="2.2" rx="0.4" fill="#c0a062" />
              <rect x="45" y="45.5" width="10" height="0.8" fill="#fbf3da" opacity="0.45" />
              <ellipse cx="50" cy="49.2" rx="8.5" ry="2.4" fill="#1a1a1a" />
              <ellipse cx="50" cy="49.2" rx="7.6" ry="2" fill="#2c1810" />
              <ellipse cx="50" cy="49.2" rx="6.2" ry="1.4" fill="url(#tsubaGrad)" />
              <ellipse cx="50" cy="49.2" rx="1.1" ry="0.5" fill="#1a0e0a" />
              <rect x="46" y="51.5" width="8" height="15.5" rx="0.4" fill="#1a0e0a" />
              <path d="M 46 53.5 L 54 55 M 54 53.5 L 46 55" stroke="#8b2c24" strokeWidth="0.95" fill="none" strokeLinecap="round" />
              <path d="M 46 56.5 L 54 58 M 54 56.5 L 46 58" stroke="#8b2c24" strokeWidth="0.95" fill="none" strokeLinecap="round" />
              <path d="M 46 59.5 L 54 61 M 54 59.5 L 46 61" stroke="#8b2c24" strokeWidth="0.95" fill="none" strokeLinecap="round" />
              <path d="M 46 62.5 L 54 64 M 54 62.5 L 46 64" stroke="#8b2c24" strokeWidth="0.95" fill="none" strokeLinecap="round" />
              <circle cx="50" cy="54.2" r="0.35" fill="#e8d5b7" opacity="0.9" />
              <circle cx="50" cy="57.2" r="0.35" fill="#e8d5b7" opacity="0.9" />
              <circle cx="50" cy="60.2" r="0.35" fill="#e8d5b7" opacity="0.9" />
              <circle cx="50" cy="63.2" r="0.35" fill="#e8d5b7" opacity="0.9" />
              <circle cx="50" cy="52.8" r="0.35" fill="#c0a062" opacity="0.8" />
              <path d="M 46 67 L 54 67 L 54 68.6 Q 54 69.6 53 69.6 L 47 69.6 Q 46 69.6 46 68.6 Z" fill="url(#kashiraGrad)" />
              <path d="M 46 67 L 54 67 L 54 67.7 L 46 67.7 Z" fill="#fbf3da" opacity="0.55" />
            </g>
          </defs>

          <circle cx="50" cy="50" r="55" className={styles.bgRing} fill="none" />

          {/* Left Katana */}
          <g className={styles.katanaLeft}>
            <g transform="translate(14, 0) scale(-1, 1) translate(-50, 0)">
              <use href="#katanaShape" />
            </g>
          </g>

          {/* Right Katana */}
          <g className={styles.katanaRight}>
            <g transform="translate(86, 0) translate(-50, 0)">
              <use href="#katanaShape" />
            </g>
          </g>

          {/* Spark */}
          <circle cx="50" cy="46" r="13" fill="url(#sparkGlow)" className={styles.sparkGlow} />
        </svg>
      </div>

      <div className={styles.dots}>
        <span className={styles.dot} />
        <span className={styles.dot} />
        <span className={styles.dot} />
      </div>
    </div>
  );
}