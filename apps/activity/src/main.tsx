import '@fontsource-variable/nunito/wght.css';
import '@fontsource/fredoka/500.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles.css';

const container = document.getElementById('root');
if (!container) throw new Error('missing root element');

createRoot(container).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
