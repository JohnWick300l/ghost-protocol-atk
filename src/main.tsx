import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then(reg => {
        void reg.update();
      })
      .catch(err => {
        console.warn('[GHOST PROTOCOL] Service worker registration note:', err);
      });
  });
}

createRoot(document.getElementById('root')!).render(<App />);

