import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../../styles/index.css';
import { BrowserFrame } from '../../components/ui/BrowserFrame';
import { DesktopApp } from './DesktopApp';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Size matches the desktop window in public/manifest.json */}
    <BrowserFrame width={420} height={320}>
      <DesktopApp />
    </BrowserFrame>
  </StrictMode>,
);
