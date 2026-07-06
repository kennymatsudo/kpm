import './index.css';
import { bootTheme } from './themeBoot';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

// Apply the persisted theme before React mounts so the first paint isn't a flash.
bootTheme();

const ua = navigator.userAgent;
const platform = ua.includes('Mac') ? 'darwin' : ua.includes('Windows') ? 'win32' : 'linux';
document.documentElement.dataset.platform = platform;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
