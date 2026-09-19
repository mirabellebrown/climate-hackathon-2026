import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI Environmental Reporting — GreenRoute",
  description: "ISO/IEC TR 20226 metrics mapped to your ESG disclosures: Scope 3 emissions, energy and water from AI use, with methodology and boundaries.",
};

export default function EsgLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
