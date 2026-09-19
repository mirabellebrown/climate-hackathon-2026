import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Canopy — the right model, a lighter footprint",
  description: "Carbon-aware Claude routing. Run prompts in your own Claude Code on the smallest suitable model and track estimated impact compared with always using Opus.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
