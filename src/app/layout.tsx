import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Guru Chat - AI Assistant",
  description: "Guru Chat - Your AI assistant with memory, multi-model chat, image/video/audio generation",
  keywords: ["AI", "Chat", "Image Generation", "Video Generation", "OpenRouter", "GPT", "Guru"],
  authors: [{ name: "Fame510" }],
  icons: {
    icon: "/logo.svg",
  },
  openGraph: {
    title: "Guru Chat",
    description: "AI assistant with memory, multi-model chat, and media generation",
    url: "https://guru-chat.vercel.app",
    siteName: "Guru Chat",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Guru Chat",
    description: "AI assistant with memory, multi-model chat, and media generation",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
