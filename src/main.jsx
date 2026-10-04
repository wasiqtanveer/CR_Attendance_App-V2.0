import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { MotionConfig } from 'framer-motion'
import { ThemeProvider } from './context/ThemeContext'
import { LoadingBarProvider } from './context/LoadingBarContext'
import './index.css'
import './lib/sounds'
import App from './App.jsx'

// Register PWA service worker
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

import { Analytics } from "@vercel/analytics/react"

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <LoadingBarProvider>
        <MotionConfig reducedMotion="user">
        <BrowserRouter>
          <App />
          <Analytics />
        </BrowserRouter>
        </MotionConfig>
      </LoadingBarProvider>
    </ThemeProvider>
  </StrictMode>,
)
