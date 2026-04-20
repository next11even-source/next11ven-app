import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
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
      </body>
    </html>
  );
}
