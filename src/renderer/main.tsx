import './index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

const ua = navigator.userAgent;
const platform = ua.includes('Mac') ? 'darwin' : ua.includes('Windows') ? 'win32' : 'linux';
document.documentElement.dataset.platform = platform;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
