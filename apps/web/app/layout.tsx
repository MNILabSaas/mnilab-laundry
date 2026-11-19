import type { Metadata } from "next";
import { Inter, Manrope, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const heading = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["700", "800"],
  variable: "--font-heading",
});

const sub = Manrope({
  subsets: ["latin"],
  weight: ["600"],
  variable: "--font-sub",
});

const body = Inter({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-body",
});

export const metadata: Metadata = {
  title: "MNILab Laundry — Sistem Operasional Laundry Multi-Cabang",
  description:
    "Sistem manajemen operasional bisnis laundry MNILab: Kasir POS, workflow cuci-setrika, upah setrika, absensi biometrik, dan cek nota pelanggan.",
  icons: {
    icon: "/assets/newLogo/logoOnlyNoBackground.webp",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="id"
      className={`${heading.variable} ${sub.variable} ${body.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-body">{children}</body>
    </html>
  );
}
