import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GreenRoute — the right model, a lighter footprint",
  description: "Carbon-aware AI routing. Chat with your own Claude Code on the smallest suitable model and see estimated impact compared with always using Opus.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
