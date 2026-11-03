import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { TrackerApp } from './TrackerApp.tsx';
import '../styles.css';
import './tracker.css';

const container = document.getElementById('root');
if (!container) throw new Error('#root missing from tracker.html');

createRoot(container).render(
  <StrictMode>
    <TrackerApp />
  </StrictMode>,
);
