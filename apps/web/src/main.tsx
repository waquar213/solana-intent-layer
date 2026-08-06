import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './ErrorBoundary';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');
createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

// DEV feasibility probe: confirm the Wormhole SDK (granular imports + buffer polyfill) loads and
// initializes in the browser. Lazily imported so it never blocks first render; logs the result.
if (import.meta.env.DEV) {
  void import('./wormhole')
    .then(({ wormholeSelfCheck }) => wormholeSelfCheck())
    .then((r) => console.info('[wormhole self-check]', JSON.stringify(r)))
    .catch((e) => console.error('[wormhole self-check] FAILED', e instanceof Error ? e.message : String(e)));
}
