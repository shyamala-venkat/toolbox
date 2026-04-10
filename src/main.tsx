import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/globals.css';

/**
 * Pre-render theme hydration.
 *
 * The user's theme choice lives in two places:
 *   1. Rust-backed preferences (source of truth, loaded after mount).
 *   2. A shadow copy in `localStorage`, kept in sync by Layout.
 *
 * We read the shadow copy synchronously here so the initial paint already has
 * `data-theme` set. This prevents the flash of wrong theme on reload. If
 * there's no shadow copy yet, we fall back to the system preference.
 */
const applyInitialTheme = (): void => {
  try {
    const stored = localStorage.getItem('tb-theme');
    const prefersDark =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-color-scheme: dark)').matches === true;

    let resolved: 'light' | 'dark';
    if (stored === 'light' || stored === 'dark') {
      resolved = stored;
    } else {
      resolved = prefersDark ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', resolved);
  } catch {
    // If localStorage is disabled, leave the default (light) in place.
  }
};

applyInitialTheme();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found in index.html');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
