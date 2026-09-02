const fs = require("fs");
const raw = JSON.parse(fs.readFileSync(__dirname + "/world.json", "utf8"));

// Overrides: the source uses full ISO/UN treaty names for some entries
// ("United States of America", "Korea, Republic of") which read badly in a
// short dropdown. Swap these for the names people actually look for; every
// other entry is already a normal short name and is left untouched.
const NAME_OVERRIDES = {
  US: "United States",
  GB: "United Kingdom",
  RU: "Russia",
  KR: "South Korea",
  KP: "North Korea",
  LA: "Laos",
  VN: "Vietnam",
  TZ: "Tanzania",
  BO: "Bolivia",
  VE: "Venezuela",
  IR: "Iran",
  SY: "Syria",
  MD: "Moldova",
  CD: "DR Congo",
  CG: "Congo",
  BN: "Brunei",
  FM: "Micronesia",
  TW: "Taiwan",
  PS: "Palestine",
  VA: "Vatican City",
  SH: "Saint Helena",
};

const countries = raw
  .map((c) => {
    const code = c.alpha2.toUpperCase();
    return { code, name: NAME_OVERRIDES[code] ?? c.name };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

console.log("count:", countries.length);
const codes = new Set(countries.map((c) => c.code));
console.log("unique codes:", codes.size);
console.log("IN entry:", countries.find((c) => c.code === "IN"));
console.log("first 5:", countries.slice(0, 5));
console.log("last 5:", countries.slice(-5));

const out = JSON.stringify(countries);
fs.writeFileSync(__dirname + "/countries.json", out);
console.log("output bytes:", Buffer.byteLength(out));
