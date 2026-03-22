import type { Metadata, Viewport } from "next";
import { Inter, Roboto_Mono } from "next/font/google";
import "./globals.css";
import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const robotoMono = Roboto_Mono({
  variable: "--font-roboto-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Telsiz-72 Kriz Yönetimi",
  description: "Deprem Anı Acil İletişim ve Kurtarma Altyapısı",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#0F172A",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr" className={`${inter.variable} ${robotoMono.variable} dark`}>
      <body className="antialiased font-sans bg-slate-900 text-slate-100 min-h-screen flex flex-col overflow-hidden select-none">
        <ServiceWorkerRegistration />
        {children}
      </body>
    </html>
  );
}
