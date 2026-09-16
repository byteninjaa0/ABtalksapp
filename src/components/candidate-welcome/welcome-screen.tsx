import { Outfit } from "next/font/google";
import "./welcome-screen.css";

/*
 * Candidate "Welcome Back" interstitial between sign-in and the dashboard
 * (Figma Abtalks node 1899:777). Server Component: the only motion is the
 * CSS ellipse loop, so it ships no client JavaScript. Geometry and effects
 * are documented in welcome-screen.css.
 */

// The root layout loads Outfit 400–700; this screen needs Light (300) too.
const outfit = Outfit({ subsets: ["latin"], weight: ["300", "500"] });

const ELLIPSES = [1, 2, 3, 4] as const;

export function WelcomeScreen() {
  return (
    <div aria-busy="true" className="cwelcome">
      {ELLIPSES.map((n) => (
        <div key={n} aria-hidden className={`cwelcome__ellipse cwelcome__ellipse--${n}`} />
      ))}

      <div aria-hidden className="cwelcome__backdrop" />

      {/* Both grids tile one square cell, so the mesh never stretches. */}
      <div aria-hidden className="cwelcome__grid cwelcome__grid--cols" />

      <div aria-hidden className="cwelcome__grid cwelcome__grid--rows" />

      <div className="cwelcome__frame">
        <h1 className={`cwelcome__text ${outfit.className}`}>
          <span className="cwelcome__title">Welcome Back</span>
          <span className="cwelcome__subtitle">Your dashboard will be ready soon</span>
        </h1>
      </div>
    </div>
  );
}
