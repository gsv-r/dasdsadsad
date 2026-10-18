import { z } from 'zod'

import './assets/global.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { consumeReloadFlag } from './lib/reload-flag'

// Zod 4 compiles schemas with `new Function` (JIT) on first parse, which the
// app CSP (`script-src 'self'`, no 'unsafe-eval') reports as a violation.
// Schema compilation is lazy, so disabling JIT here runs before any parse.
z.config({ jitless: true })

// Lê e limpa a flag de reload de forma SÍNCRONA antes do primeiro render,
// sem flicker. Se o usuário clicou Reload na sessão anterior, o indicador
// aparece brevemente no boot desta página.
const reloadPending = consumeReloadFlag()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App reloadPending={reloadPending} />
  </StrictMode>
)
