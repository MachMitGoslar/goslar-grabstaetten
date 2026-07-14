import { StrictMode } from 'react'
import { renderToString } from 'react-dom/server'
import { HelmetProvider } from 'react-helmet-async'
import { StaticRouter } from 'react-router-dom'
import { App } from './App.tsx'
import './index.css'
import { importantRoutes } from './importantRoutes'

export { importantRoutes }

type HelmetContext = {
  helmet?: {
    link: { toString: () => string }
    meta: { toString: () => string }
    title: { toString: () => string }
  } | null
}

export const render = (url: string) => {
  const helmetContext = {}
  const appHtml = renderToString(
    <StrictMode>
      <HelmetProvider context={helmetContext}>
        <StaticRouter location={url}>
          <App />
        </StaticRouter>
      </HelmetProvider>
    </StrictMode>,
  )
  const helmet = helmetContext as HelmetContext

  return {
    appHtml,
    helmet: {
      link: helmet.helmet?.link.toString() ?? '',
      meta: helmet.helmet?.meta.toString() ?? '',
      title: helmet.helmet?.title.toString() ?? '',
    },
  }
}
