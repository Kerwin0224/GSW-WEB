import type { Metadata } from "next";
import { Geist_Mono, Noto_Serif_SC } from "next/font/google";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const notoSerifSC = Noto_Serif_SC({
  variable: "--font-noto-serif-sc",
  weight: ["400", "500", "600", "700"],
  display: "swap",
  fallback: ["STSong", "Songti SC", "SimSun", "serif"],
});

export const metadata: Metadata = {
  title: "文韵智途 — 古诗文 AI 教学助手",
  description: "以布鲁姆认知层次为核心的古典中文 AI 学习平台",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className={`${geistMono.variable} ${notoSerifSC.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col font-sans">
        <TooltipProvider>
          {children}
        </TooltipProvider>
        {/* 归档等异步结果的全局回执：学生会话归入篇目时在顶部给出可感知反馈。 */}
        <Toaster position="top-center" richColors closeButton />
      </body>
    </html>
  );
}
