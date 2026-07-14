import { Helmet } from 'react-helmet-async'

const siteName = 'Goslarer Gräber'
const siteUrl = 'https://friedhof.goslar.de'
const defaultDescription =
  'Digitale Grabstellensuche und Friedhofstour zu bedeutenden Gräbern auf den Goslarer Friedhöfen.'

type SeoProps = {
  title?: string
  description?: string
  path?: string
  image?: string
  type?: 'website' | 'article'
}

export const Seo = ({
  title = siteName,
  description = defaultDescription,
  path = '/',
  image,
  type = 'website',
}: SeoProps) => {
  const pageTitle = title === siteName ? title : `${title} | ${siteName}`
  const canonicalUrl = new URL(path, siteUrl).toString()
  const imageUrl = image ? new URL(image, siteUrl).toString() : undefined

  return (
    <Helmet>
      <title>{pageTitle}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonicalUrl} />

      <meta property="og:type" content={type} />
      <meta property="og:site_name" content={siteName} />
      <meta property="og:title" content={pageTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={canonicalUrl} />
      {imageUrl && <meta property="og:image" content={imageUrl} />}

      <meta name="twitter:card" content={imageUrl ? 'summary_large_image' : 'summary'} />
      <meta name="twitter:title" content={pageTitle} />
      <meta name="twitter:description" content={description} />
      {imageUrl && <meta name="twitter:image" content={imageUrl} />}
    </Helmet>
  )
}
