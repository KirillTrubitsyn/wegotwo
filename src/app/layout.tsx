import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// В UI используются только веса 400/500/600/700 (`font-medium`,
// `font-semibold`, `font-bold` + дефолтный 400). Без явного `weight`
// Next грузил бы variable axis с полным набором осей — на мобильном
// 4G это десятки лишних килобайт woff2. Пинуем нужные веса, чтобы
// браузер скачал ровно то, что используется.
const inter = Inter({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    template: "%s · WeGoTwo",
    default: "WeGoTwo",
  },
  description: "Приватный планировщик поездок",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#FFFFFF",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru" className={`${inter.variable} ${mono.variable}`}>
      <head>
        {/*
          iOS Safari решает запускать сайт в standalone режиме с домашнего
          экрана только по apple-mobile-web-app-capable. Прописываем теги
          вручную, не полагаясь на сериализацию Metadata API, чтобы они
          гарантированно присутствовали в первом HTML-ответе.
        */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="black-translucent"
        />
        <meta name="apple-mobile-web-app-title" content="WeGoTwo" />
        <meta name="application-name" content="WeGoTwo" />
        <link rel="manifest" href="/manifest.json" />
        <link
          rel="apple-touch-icon"
          sizes="180x180"
          href="/apple-touch-icon.png"
        />
        <link
          rel="apple-touch-icon-precomposed"
          sizes="180x180"
          href="/apple-touch-icon.png"
        />
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link
          rel="icon"
          type="image/png"
          sizes="192x192"
          href="/icons/icon-192x192.png"
        />
        <link
          rel="icon"
          type="image/png"
          sizes="512x512"
          href="/icons/icon-512x512.png"
        />
      </head>
      <body className="font-sans">
        <div className="min-h-[100svh] mx-auto max-w-app bg-white shadow-[0_0_60px_rgba(0,0,0,0.04)]">
          {children}
        </div>
      </body>
    </html>
  );
}
