import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import RemoveBgPrompt from './components/RemoveBgPrompt.jsx'
import AppDialog from './components/AppDialog.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
    <RemoveBgPrompt />
    <AppDialog />
  </StrictMode>,
)
