import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EV Live",
  description: "期待値ガチ勢向け 実戦EVチェッカー",
  manifest: "/manifest.json"
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  // safe-area-inset-* は viewport-fit=cover を宣言しないと常に 0 を返す。
  // ノッチ／ホームバーの下へヘッダーとフッターが潜り込むのを防ぐ。
  viewportFit: "cover",
  themeColor: "#070a10"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
