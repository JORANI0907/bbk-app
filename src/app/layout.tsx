import type { Metadata, Viewport } from 'next'
import { Noto_Sans_KR } from 'next/font/google'
import { headers } from 'next/headers'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from '@/components/AuthProvider'
import { SplashScreen } from '@/components/SplashScreen'
import { SwUpdateReloader } from '@/components/SwUpdateReloader'
import { GlobalFooter } from '@/components/GlobalFooter'
import './globals.css'

const notoSansKR = Noto_Sans_KR({
  subsets: ['latin'],
  weight: ['400', '500', '700', '900'],
  variable: '--font-noto-sans-kr',
  display: 'swap',
})

const SITE_URL = 'https://app.bbkorea.co.kr'
const SITE_TITLE = 'BBK 공간케어'
const SITE_DESCRIPTION =
  '범빌드코리아 공간케어 관리 앱. 상업용 주방·시설 청소 서비스 관리, 작업자 배정, 정기 케어 스케줄을 한 곳에서.'
const OG_IMAGE = '/icons/icon-512x512.png'

// docs.bbkorea.co.kr (직원 서류 업로드 전용 서브도메인)에서는
// PWA 설치용 리소스(manifest, apple-web-app 메타)를 노출하지 않는다.
// 이 도메인에도 PWA가 설치되면 원래 회피하려던 딥링크 문제가 그대로 재현되므로,
// 브라우저에서만 열리도록 metadata 자체를 조건부로 구성한다.
function isDocumentSubdomain(host: string | null): boolean {
  if (!host) return false
  return host.startsWith('docs.')
}

export function generateMetadata(): Metadata {
  const host = headers().get('host')
  const isDocDomain = isDocumentSubdomain(host)

  const base: Metadata = {
    metadataBase: new URL(SITE_URL),
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    icons: {
      icon: '/icons/icon-192x192.png',
      apple: '/icons/icon-192x192.png',
    },
    openGraph: {
      type: 'website',
      url: SITE_URL,
      siteName: SITE_TITLE,
      title: SITE_TITLE,
      description: SITE_DESCRIPTION,
      locale: 'ko_KR',
      images: [
        {
          url: OG_IMAGE,
          width: 512,
          height: 512,
          alt: 'BBK 공간케어 로고',
        },
      ],
    },
    twitter: {
      card: 'summary',
      title: SITE_TITLE,
      description: SITE_DESCRIPTION,
      images: [OG_IMAGE],
    },
  }

  if (isDocDomain) {
    // 서브도메인: PWA 설치 유도 리소스 제거
    return {
      ...base,
      other: {
        'mobile-web-app-capable': 'no',
      },
    }
  }

  // 메인 도메인: 기존과 동일 (PWA 정상 동작)
  return {
    ...base,
    manifest: '/manifest.json',
    appleWebApp: {
      capable: true,
      statusBarStyle: 'default',
      title: SITE_TITLE,
      startupImage: '/icons/icon-192x192.png',
    },
    other: {
      'mobile-web-app-capable': 'yes',
    },
  }
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#2AABE2',
  colorScheme: 'light',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ko" className={notoSansKR.variable}>
      <body className={`${notoSansKR.className} antialiased`}>
        <SwUpdateReloader />
        <SplashScreen />
        <AuthProvider>
          {children}
          <GlobalFooter />
        </AuthProvider>
        <Toaster
          position="top-center"
          toastOptions={{
            duration: 3000,
            style: {
              borderRadius: '12px',
              background: '#1f2937',
              color: '#fff',
              fontSize: '14px',
              fontWeight: '500',
            },
            success: {
              iconTheme: {
                primary: '#10b981',
                secondary: '#fff',
              },
            },
            error: {
              iconTheme: {
                primary: '#ef4444',
                secondary: '#fff',
              },
            },
          }}
        />
      </body>
    </html>
  )
}
