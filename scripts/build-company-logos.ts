/**
 * Regenerates `public/company-logos/*` and `src/lib/company-logos.generated.ts`.
 *
 *   npx tsx scripts/build-company-logos.ts
 *
 * Run by hand, not from `npm run build`. The output is committed, so a
 * deploy never depends on a third party being up.
 *
 * TWO SOURCES, in this order:
 *
 *   1. Simple Icons (CC0) — a clean monochrome vector in the brand's own
 *      colour. Preferred, but it covers almost none of what Klymb AI
 *      candidates actually type: the project removed most enterprise marks at
 *      their owners' request, so Amazon, IBM, Oracle, Microsoft, Deloitte, EY
 *      and JPMorgan are gone and EXL, Cognizant, Capgemini, Nagarro, Genpact
 *      and Coforge were never in it.
 *
 *   2. The company's own favicon at 128px, fetched ONCE here and written into
 *      `public/`. This is what covers the names that actually dominate the
 *      data — EXL alone is 109 experience rows.
 *
 * Why fetch at build time rather than hotlinking a logo CDN: a logo request
 * made by the recruiter's browser tells that CDN which employers appear in
 * which recruiter's session, which is candidate data leaving the platform for
 * decoration. Fetching here leaks nothing — the runtime only ever loads files
 * from our own origin.
 *
 * Marks are used nominatively, to identify the employer a candidate named.
 * Trademarks remain their owners'.
 *
 * Adding a company: add a row below, rerun, then point an alias at the slug
 * from `src/lib/company-identity.ts`. Only add a `domain` you are sure of — a
 * wrong domain ships a confident, wrong logo, which is worse than initials.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import * as simpleIcons from "simple-icons";

type Brand = {
  /** Our slug. Referenced by `logo:` in the alias table. */
  slug: string;
  /** Simple Icons slug, when it still carries this brand. */
  icon?: string;
  /** Fallback: fetch this origin's favicon. */
  domain?: string;
};

/**
 * Ordered roughly by how often the name appears in `CandidateExperience`.
 * The counts in comments are from a census of the live table and are there so
 * the next person can see which rows are worth arguing about.
 */
const BRANDS: Brand[] = [
  // --- The actual top of Klymb AI's data --------------------------------------
  { slug: "exl", domain: "exlservice.com" },            // 109 rows
  { slug: "accenture", icon: "accenture" },             //  24
  { slug: "cognizant", domain: "cognizant.com" },       //  23
  { slug: "tcs", icon: "tcs" },                         //  35 (with aliases)
  { slug: "infosys", icon: "infosys" },                 //  23
  { slug: "nagarro", domain: "nagarro.com" },           //  14
  { slug: "capgemini", domain: "capgemini.com" },       //  11
  { slug: "amazon", domain: "amazon.com" },             //   8
  { slug: "genpact", domain: "genpact.com" },           //   7
  { slug: "ibm", domain: "ibm.com" },                   //   6
  { slug: "techmahindra", domain: "techmahindra.com" }, //   6
  { slug: "hcl", icon: "hcl" },                         //   7
  { slug: "barclays", icon: "barclays" },               //   6
  { slug: "ey", domain: "ey.com" },                     //   5
  { slug: "ltimindtree", domain: "ltimindtree.com" },   //   5
  { slug: "coforge", domain: "coforge.com" },           //   5
  { slug: "cvshealth", domain: "cvshealth.com" },       //   4
  { slug: "jpmorgan", domain: "jpmorgan.com" },         //   4
  { slug: "soprasteria", domain: "soprasteria.com" },   //   4
  { slug: "deloitte", domain: "deloitte.com" },         //   4
  { slug: "fujitsu", icon: "fujitsu" },                 //   4
  { slug: "oracle", domain: "oracle.com" },             //   3
  { slug: "wipro", icon: "wipro" },                     //   3
  { slug: "ericsson", icon: "ericsson" },               //   3
  { slug: "samsung", icon: "samsung" },                 //   3
  { slug: "sapient", domain: "publicissapient.com" },   //   3
  { slug: "techolution", domain: "techolution.com" },   //   3
  { slug: "zebronics", domain: "zebronics.com" },       //   3
  { slug: "ikshealth", domain: "ikshealth.com" },       //   3
  { slug: "celebal", domain: "celebaltech.com" },       //   3
  { slug: "axtria", domain: "axtria.com" },             //   3
  { slug: "verizon", domain: "verizon.com" },           //   2
  { slug: "societegenerale", domain: "societegenerale.com" },
  { slug: "dxc", domain: "dxc.com" },
  { slug: "keywordsstudios", domain: "keywordsstudios.com" },
  { slug: "shriramfinance", domain: "shriramfinance.in" },
  { slug: "natwest", domain: "natwest.com" },
  { slug: "amdocs", domain: "amdocs.com" },
  { slug: "ienergizer", domain: "ienergizer.com" },
  { slug: "atos", domain: "atos.net" },
  { slug: "mphasis", domain: "mphasis.com" },
  { slug: "citi", domain: "citi.com" },
  { slug: "hexaware", domain: "hexaware.com" },
  { slug: "virtusa", domain: "virtusa.com" },
  { slug: "cvent", domain: "cvent.com" },
  { slug: "abes", domain: "abes.ac.in" },               // college, 10 rows
  { slug: "persistent", icon: "persistent" },
  { slug: "adp", icon: "adp" },
  { slug: "westernunion", icon: "westernunion" },
  { slug: "wellsfargo", icon: "wellsfargo" },
  { slug: "hdfcbank", icon: "hdfcbank" },
  { slug: "freelancer", icon: "freelancer" },

  // --- Names not in the data yet, but the obvious next arrivals -------------
  { slug: "microsoft", domain: "microsoft.com" },
  { slug: "adobe", domain: "adobe.com" },
  { slug: "salesforce", domain: "salesforce.com" },
  { slug: "kpmg", domain: "kpmg.com" },
  { slug: "pwc", domain: "pwc.com" },
  { slug: "goldmansachs", domain: "goldmansachs.com" },
  { slug: "morganstanley", domain: "morganstanley.com" },
  { slug: "birlasoft", domain: "birlasoft.com" },
  { slug: "zensar", domain: "zensar.com" },
  { slug: "honeywell", domain: "honeywell.com" },
  { slug: "flipkart", domain: "flipkart.com" },
  { slug: "sbi", domain: "sbi.co.in" },
  { slug: "kotak", domain: "kotak.com" },
  { slug: "google", icon: "google" },
  { slug: "apple", icon: "apple" },
  { slug: "meta", icon: "meta" },
  { slug: "netflix", icon: "netflix" },
  { slug: "nvidia", icon: "nvidia" },
  { slug: "intel", icon: "intel" },
  { slug: "cisco", icon: "cisco" },
  { slug: "dell", icon: "dell" },
  { slug: "sap", icon: "sap" },
  { slug: "redhat", icon: "redhat" },
  { slug: "vmware", icon: "vmware" },
  { slug: "qualcomm", icon: "qualcomm" },
  { slug: "siemens", icon: "siemens" },
  { slug: "atlassian", icon: "atlassian" },
  { slug: "snowflake", icon: "snowflake" },
  { slug: "databricks", icon: "databricks" },
  { slug: "mongodb", icon: "mongodb" },
  { slug: "stripe", icon: "stripe" },
  { slug: "shopify", icon: "shopify" },
  { slug: "paypal", icon: "paypal" },
  { slug: "uber", icon: "uber" },
  { slug: "airbnb", icon: "airbnb" },
  { slug: "tesla", icon: "tesla" },
  { slug: "github", icon: "github" },
  { slug: "gitlab", icon: "gitlab" },
  { slug: "spotify", icon: "spotify" },
  { slug: "fedex", icon: "fedex" },
  { slug: "nike", icon: "nike" },
  { slug: "zomato", icon: "zomato" },
  { slug: "swiggy", icon: "swiggy" },
  { slug: "razorpay", icon: "razorpay" },
  { slug: "zoho", icon: "zoho" },
  { slug: "phonepe", icon: "phonepe" },
  { slug: "zerodha", icon: "zerodha" },
  { slug: "icicibank", icon: "icicibank" },
  { slug: "axisbank", icon: "axisbank" },
  { slug: "jio", icon: "jio" },
  { slug: "airtel", icon: "airtel" },
  { slug: "paytm", icon: "paytm" },
  { slug: "unacademy", icon: "unacademy" },
  { slug: "tata", icon: "tata" },
  { slug: "mahindra", icon: "mahindra" },
];

const OUT_DIR = "public/company-logos";

type Icon = { title: string; slug: string; hex: string; path: string };

const bySlug = new Map<string, Icon>(
  Object.values(simpleIcons as Record<string, unknown>)
    .filter((i): i is Icon =>
      typeof i === "object" && i !== null && "slug" in i && "path" in i,
    )
    .map((i) => [i.slug, i]),
);

/** PNG width from the IHDR chunk. Avoids pulling in an image library. */
function pngWidth(bytes: Uint8Array): number {
  if (bytes.length < 24) return 0;
  return new DataView(bytes.buffer, bytes.byteOffset).getUint32(16, false);
}

async function fetchFavicon(domain: string): Promise<Uint8Array | null> {
  const url = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) return null;
  const bytes = new Uint8Array(await res.arrayBuffer());
  // The service answers an unknown domain with a 16x16 globe rather than a
  // 404. Shipping that would put a grey globe next to a job title, which
  // reads as a broken image; initials are better than a wrong mark.
  if (pngWidth(bytes) < 32) return null;
  return bytes;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  const files: Record<string, string> = {};
  const fromIcons: string[] = [];
  const fromFavicon: string[] = [];
  const failed: string[] = [];

  for (const brand of BRANDS) {
    if (brand.icon) {
      const icon = bySlug.get(brand.icon);
      if (!icon) {
        failed.push(`${brand.slug} (simple-icons slug "${brand.icon}" is gone)`);
        continue;
      }
      // `fill` is baked in: an <img> cannot inherit colour from the page, and
      // the brand's own hex is the point.
      const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" role="img" ` +
        `aria-label="${icon.title.replace(/[<>&"]/g, "")}">` +
        `<path fill="#${icon.hex}" d="${icon.path}"/>` +
        `</svg>\n`;
      writeFileSync(`${OUT_DIR}/${brand.slug}.svg`, svg);
      files[brand.slug] = `${brand.slug}.svg`;
      fromIcons.push(brand.slug);
      continue;
    }

    if (!brand.domain) {
      failed.push(`${brand.slug} (no icon and no domain)`);
      continue;
    }

    try {
      const bytes = await fetchFavicon(brand.domain);
      if (!bytes) {
        failed.push(`${brand.slug} (${brand.domain} has no usable favicon)`);
        continue;
      }
      writeFileSync(`${OUT_DIR}/${brand.slug}.png`, bytes);
      files[brand.slug] = `${brand.slug}.png`;
      fromFavicon.push(brand.slug);
    } catch (error) {
      failed.push(`${brand.slug} (${brand.domain}: ${String(error)})`);
    }
  }

  const entries = Object.keys(files)
    .sort()
    .map((slug) => `  ${JSON.stringify(slug)}: ${JSON.stringify(files[slug])},`)
    .join("\n");

  writeFileSync(
    "src/lib/company-logos.generated.ts",
    `/**
 * GENERATED by scripts/build-company-logos.ts — do not edit by hand.
 *
 * slug -> the file under \`public/company-logos/\`. Only this map ships in the
 * bundle; each logo is fetched by the browser from our own origin, and only
 * when a panel actually shows that employer.
 *
 * Vector marks are Simple Icons (CC0). The rest are the company's own favicon,
 * vendored at generation time. Trademarks remain their owners'; they identify
 * the employer a candidate named.
 */

export const BRAND_LOGO_FILES: Record<string, string> = {
${entries}
};

export const BRAND_LOGO_SLUGS = new Set<string>(Object.keys(BRAND_LOGO_FILES));
`,
  );

  console.log(`vector (simple-icons): ${fromIcons.length}`);
  console.log(`favicon (vendored):    ${fromFavicon.length}`);
  console.log(`total logos:           ${Object.keys(files).length}`);
  if (failed.length > 0) {
    console.log(`\nno logo for ${failed.length}:`);
    for (const f of failed) console.log(`  - ${f}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
