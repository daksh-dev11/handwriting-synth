import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/tokens.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('ROOT_ELEMENT_MISSING');

createRoot(rootElement).render(<App />);
