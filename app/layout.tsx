import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Canopy — the right model, a lighter footprint",
  description: "Carbon-aware AI routing. Ask a question, get a Claude answer, and explore estimated impact compared with always using Opus.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
