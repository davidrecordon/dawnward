import type { Metadata } from "next";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dawnward",
  description:
    "Free, science-backed jet lag optimization. Personalized light, sleep, and supplement schedules to help you arrive ready, not wrecked.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className="min-h-screen bg-dawnward-gradient text-slate-800 antialiased"
        style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}
      >
        <div className="flex min-h-screen flex-col">
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
        </div>
      </body>
    </html>
  );
}
