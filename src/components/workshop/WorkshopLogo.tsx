import Link from "next/link";
import { Wordmark } from "@/components/shared/wordmark";

export default function WorkshopLogo() {
  return (
    <Link
      href="/"
      aria-label="Klymb AI home"
      className="wk-logo logo-link group relative inline-flex shrink-0 overflow-hidden rounded-md"
    >
      <style>{`
        .wk-logo::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.5) 50%, transparent 60%);
          transform: translateX(-130%) skewX(-15deg);
          pointer-events: none;
        }
        .wk-logo:hover::after { animation: wk-logo-shine 0.75s ease forwards; }
        @keyframes wk-logo-shine { to { transform: translateX(130%) skewX(-15deg); } }
        .wk-logo img { transition: filter 0.3s ease, transform 0.3s ease; }
        /* The source PNG is white; globals.css inverts it to black, which is
           what the white frosted header needs. Hover keeps the invert and adds
           a soft teal glow. */
        .wk-root .wk-logo:hover .logo-image {
          filter: invert(1) drop-shadow(0 0 10px rgba(var(--wk-a1-rgb),0.35));
        }
        .wk-logo:hover img { transform: scale(1.03); }
      `}</style>
      <Wordmark size="lg" className="logo-image !h-6 w-auto sm:!h-7" />
    </Link>
  );
}
