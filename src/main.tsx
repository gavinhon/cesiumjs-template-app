import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// The global stylesheet must be imported BEFORE <App>, and this is the one
// place in the codebase where a CSS import doesn't come last.
//
// `.control-button` (global.css) and a component's own `.foo__button` have
// equal specificity, so whichever stylesheet the bundler emits last wins.
// Component styles are meant to override the shared `.control` primitives
// they compose with — so the global sheet has to load first. Import App
// first and every component that overrides padding, background, or radius
// silently loses.
import '@/styles/global.css';
import App from '@/App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
