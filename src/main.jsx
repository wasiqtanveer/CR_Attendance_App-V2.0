import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ThemeProvider } from './context/ThemeContext'
import { LoadingBarProvider } from './context/LoadingBarContext'
import './index.css'
import App from './App.jsx'

// Register PWA service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

import { Analytics } from "@vercel/analytics/react"

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <LoadingBarProvider>
        <BrowserRouter>
          <App />
          <Analytics />
        </BrowserRouter>
      </LoadingBarProvider>
    </ThemeProvider>
  </StrictMode>,
)
