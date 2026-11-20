import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "@fontsource-variable/vazirmatn";
import "./globals.css";
import Shell from "@/components/Shell";

export const metadata: Metadata = {
  title: "Meme Radar Pro | رادار سیگنال میم‌کوین‌ها",
  description: "پلتفرم حرفه‌ای تحلیل و سیگنال ارزهای دیجیتال با موتور تحلیل تکنیکال و دستیار هوش مصنوعی",
};

export const viewport: Viewport = { themeColor: "#080b12", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <body className="font-sans antialiased">
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
