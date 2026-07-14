import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const distDir = path.join(root, 'dist')
const serverDir = path.join(distDir, 'server')
const template = await readFile(path.join(distDir, 'index.html'), 'utf-8')
const { importantRoutes, render } = await import(
  pathToFileURL(path.join(serverDir, 'entry-server.js')).href
)

const toHtmlPath = (route) => {
  if (route === '/') {
    return path.join(distDir, 'index.html')
  }

  return path.join(distDir, route.replace(/^\//, ''), 'index.html')
}

for (const route of importantRoutes) {
  const { appHtml, helmet } = render(route)
  const reactHeadTagPattern = /<title\b[^>]*>.*?<\/title>|<meta\b[^>]*\/?>|<link\b[^>]*\/?>/gs
  const reactHeadTags = appHtml.match(reactHeadTagPattern) ?? []
  const bodyHtml = appHtml.replace(reactHeadTagPattern, '')
  const headTags = [helmet.title, helmet.meta, helmet.link, ...reactHeadTags]
    .filter(Boolean)
    .join('')
  const html = template
    .replace(/<title>.*?<\/title>/, '')
    .replace('</head>', `${headTags}</head>`)
    .replace('<div id="root"></div>', `<div id="root">${bodyHtml}</div>`)
  const filePath = toHtmlPath(route)

  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, html)
}

await rm(serverDir, { recursive: true, force: true })
