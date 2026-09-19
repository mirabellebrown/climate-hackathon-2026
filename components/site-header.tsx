"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Leaf, Scale } from "lucide-react";

export function SiteHeader() {
  const pathname = usePathname();
  const onDashboard = pathname === "/dashboard";
  return (
    <header className="site-header">
      <Link className="brand" href="/" aria-label="GreenRoute home">
        <span className="brand-symbol"><Leaf size={22} strokeWidth={1.7} /></span>
        GreenRoute
      </Link>
      <div className="header-actions">
        <span className="header-pill"><span />Carbon-aware AI</span>
        <Link
          className="impact-toggle"
          href="/dashboard"
          aria-current={onDashboard ? "page" : undefined}
        >
          <Scale size={15} />Impact
        </Link>
      </div>
    </header>
  );
}
