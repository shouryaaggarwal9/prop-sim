import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";

export const metadata: Metadata = {
  title: "PropSim — simulated prop-firm evaluation",
  description:
    "A simulated prop-trading evaluation: profit target, daily loss limit, and trailing drawdown rules, played out against a live-replayed synthetic market.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col bg-[#0a0a0a] text-white antialiased">
        <Navbar />
        <main className="flex flex-1 flex-col">{children}</main>
      </body>
    </html>
  );
}
