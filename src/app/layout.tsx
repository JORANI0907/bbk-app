import type { Metadata, Viewport } from 'next'
import { headers } from 'next/headers'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from '@/components/AuthProvider'
import { SplashScreen } from '@/components/SplashScreen'
import { SwUpdateReloader } from '@/components/SwUpdateReloader'
import { GlobalFooter } from '@/components/GlobalFooter'
import './globals.css'

// Noto Sans KR 은 globals.css 에서 Google Fonts 스타일시트로 불러온다.
// next/font/google 은 빌드 때 Google 서버에서 글꼴 정보를 받아오는데, 2026-11-09 Vercel 빌드가
// 그 단계에서 계속 실패해(loader.js "Cannot read properties of null") 빌드 시점 의존을 없앴다.
const NOTO_SANS_KR_CSS = 'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;900&display=swap'

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
  colorScheme: 'only light',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ko" style={{ colorScheme: 'only light' }}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={NOTO_SANS_KR_CSS} />
      </head>
      <body className="font-noto-sans-kr antialiased">
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
