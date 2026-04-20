import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import Script from "next/script";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "NEXT11VEN — Non-League Recruitment",
  description: "The scouting platform built for non-league football.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "NEXT11VEN",
  },
  openGraph: {
    title: "NEXT11VEN — Non-League Recruitment",
    description: "The scouting platform built for non-league football.",
    images: [{ url: "/logo.jpg", width: 1200, height: 630, alt: "NEXT11VEN" }],
    siteName: "NEXT11VEN",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "NEXT11VEN — Non-League Recruitment",
    description: "The scouting platform built for non-league football.",
    images: ["/logo.jpg"],
  },
  icons: {
    icon: "/next11ven_favicon.png",
    apple: "/next11ven_square_logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="apple-touch-icon" sizes="180x180" href="/next11ven_square_logo.png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className={`${inter.variable} antialiased`} style={{ fontFamily: "var(--font-inter), Inter, sans-serif" }}>
        {children}
        <Analytics />
        <Script id="meta-pixel" strategy="afterInteractive">{`
          !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
          n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
          n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
          t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}
          (window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
          fbq('init','943750121308525');
          fbq('track','PageView');
        `}</Script>
        <noscript>
          <img height="1" width="1" style={{display:'none'}}
            src="https://www.facebook.com/tr?id=943750121308525&ev=PageView&noscript=1" alt="" />
        </noscript>
      </body>
    </html>
  );
}
