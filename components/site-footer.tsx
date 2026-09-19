import { Leaf } from "lucide-react";

export function SiteFooter() {
  return <footer className="site-footer"><p><Leaf size={14} />Thoughtful AI. A little less impact.</p><p>Estimates, not measurements. <a href="https://arxiv.org/abs/2505.09598" target="_blank" rel="noreferrer">Research</a><span>·</span><a href="https://www.epa.gov/energy/greenhouse-gas-equivalencies-calculator-calculations-and-references" target="_blank" rel="noreferrer">EPA factors</a></p></footer>;
}
