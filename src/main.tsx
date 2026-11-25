import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Must load before App: equal-specificity component styles override .control only by source order.
import '@/styles/global.css';
import App from '@/App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
