import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../../styles/index.css';
import { InGameApp } from './InGameApp';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <InGameApp />
  </StrictMode>,
);
