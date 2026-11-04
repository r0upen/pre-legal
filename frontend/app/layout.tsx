import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

// The title is also the default file name when saving the PDF; DocumentBuilder puts the
// chosen agreement's name in front of it.
export const metadata: Metadata = {
  title: "Pre-Legal",
  description: "Draft common legal agreements from the Common Paper templates by chatting with an AI.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
