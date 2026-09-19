import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "GreenRoute — the right model, a lighter footprint",
  description: "Carbon-aware AI routing. Ask a question, get a Gemini answer, and explore estimated impact compared with always using Gemini Pro.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><AppShell>{children}</AppShell></body></html>;
}
