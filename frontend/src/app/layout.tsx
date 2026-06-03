import type { Metadata } from "next";
import AppWrapper from "./AppWrapper";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI 运维平台",
  description: "AI Ops Assistant",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <AppWrapper>{children}</AppWrapper>
      </body>
    </html>
  );
}
