import { Menu, X } from "lucide-react";
import { useState } from "react";

type HeaderProps = { onLogin?: () => void };

export function Header({ onLogin }: HeaderProps) {
  const [open, setOpen] = useState(false);
  const links = [
    ["Home", "/"],
    ["Features", "/features"],
    ["Pricing", "/pricing"],
    ["About Us", "/about"],
    ["Contact Us", "/contact"],
  ];
  return <header className="public-header"><a className="public-brand" href="/"><span className="brand-mark">A</span><span>adometa</span></a><button className="public-menu-button" aria-label="Toggle navigation" onClick={() => setOpen(!open)}>{open ? <X size={21} /> : <Menu size={21} />}</button><nav className={`public-nav ${open ? "public-nav-open" : ""}`}>{links.map(([label, href]) => <a key={href} href={href} onClick={() => setOpen(false)}>{label}</a>)}<a href="/login" onClick={() => { setOpen(false); onLogin?.(); }}>Login</a><a className="public-signup" href="/signup" onClick={() => setOpen(false)}>Sign Up</a></nav></header>;
}
