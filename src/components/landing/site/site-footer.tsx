import Link from "next/link";
import { FOOTER_COLUMNS } from "./landing-content";
import { Wordmark } from "@/components/shared/wordmark";

export function SiteFooter({
  showRecruiterCta = false,
}: {
  showRecruiterCta?: boolean;
}) {
  const year = new Date().getFullYear();

  return (
    <footer className="footer">
      <div className="container footer__grid">
        <div className="footer__brand">
          <Link href="/" className="footer__logo" aria-label="Klymb AI home">
            <Wordmark size="lg" />
          </Link>
        </div>

        {FOOTER_COLUMNS.map((col) => (
          <nav className="footer__col" aria-label={col.title} key={col.title}>
            <h3 className="footer__head">{col.title}</h3>
            <ul>
              {col.links
                .filter((link) => showRecruiterCta || link.href !== "/hire")
                .map((link) => (
                <li key={link.href + link.label}>
                  {link.href.startsWith("#") ? (
                    <a href={link.href}>{link.label}</a>
                  ) : (
                    <Link href={link.href}>{link.label}</Link>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div className="container footer__legal">
        <span>© Klymb AI {year} All rights reserved.</span>
       
      </div>
    </footer>
  );
}
