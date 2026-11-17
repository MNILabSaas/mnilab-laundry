import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MNILab Laundry — Sistem Operasional Laundry Multi-Cabang",
  description:
    "Sistem manajemen operasional bisnis laundry MNILab: Kasir POS, workflow cuci-setrika, upah setrika, absensi biometrik, dan cek nota pelanggan.",
  icons: {
    icon: "/assets/logoLaundry.webp",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
