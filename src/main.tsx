import { createRoot } from 'react-dom/client'
import 'lenis/dist/lenis.css'
import './index.css'
import App from './App'
import { initScroll } from './lib/scroll'

// one Lenis instance for the whole app, started before the first render
initScroll()

createRoot(document.getElementById('root')!).render(<App />)
