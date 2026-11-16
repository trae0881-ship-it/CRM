import { Menu, X } from "lucide-react";
import { useEffect, useState } from "react";

type HeaderProps = { onLogin?: () => void };

export function Header({ onLogin }: HeaderProps) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);
  const links = [
    ["Home", "/"],
    ["Features", "/features"],
    ["Pricing", "/pricing"],
    ["Integrations", "/integrations"],
    ["FAQ", "/faq"],
    ["About Us", "/about"],
    ["Contact Us", "/contact"],
  ];
  return <header className="public-header"><a className="public-brand" href="/"><span className="brand-mark">A</span><span>adometa</span></a><button className="public-menu-button" aria-label={open ? "Close navigation" : "Open navigation"} aria-expanded={open} aria-controls="public-navigation" onClick={() => setOpen((value) => !value)}>{open ? <X size={21} /> : <Menu size={21} />}</button><nav id="public-navigation" className={`public-nav ${open ? "public-nav-open" : ""}`}>{links.map(([label, href]) => <a key={href} href={href} onClick={() => setOpen(false)}>{label}</a>)}<a href="/login" onClick={() => { setOpen(false); onLogin?.(); }}>Login</a><a className="public-signup" href="/signup" onClick={() => setOpen(false)}>Sign Up</a></nav></header>;
}
