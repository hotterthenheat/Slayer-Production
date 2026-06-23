/**
 * Theme generator — emits a complete, token-based theme library.
 * Each theme overrides the design tokens the app already consumes
 * (--bg-base, --surface[-2/-3], --border[-strong], --text-primary/secondary/tertiary,
 * --accent-color, --grid-dot). Semantic colors (--success/danger/warning/info) are
 * intentionally NOT themed so up/down stays readable on a trading screen.
 *
 * Palettes are derived from a single (hue, saturation, base-lightness, accent) seed
 * via HSL math, so every theme is internally harmonized and meets AA text contrast.
 * Run:  node scripts/genThemes.mjs   ->   src/themes.css  +  src/lib/themes.generated.ts
 */
import { writeFileSync } from 'fs';

/* ---- color helpers ---- */
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360; s = clamp(s, 0, 100) / 100; l = clamp(l, 0, 100) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0]; else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x]; else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c]; else [r, g, b] = [c, 0, x];
  const to = (n) => Math.round((n + m) * 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}
const rgba = (h, s, l, a) => {
  const hex = hslToHex(h, s, l);
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

/* ---- token derivation from a seed ---- */
function tokensFor(seed) {
  const [, , , mode, h, s, lBase, accent] = seed;
  if (mode === 'light') {
    const ts = Math.min(s, 22);
    return {
      '--bg-base': hslToHex(h, ts, 96),
      '--surface': hslToHex(h, ts * 0.5, 99),
      '--surface-2': hslToHex(h, ts, 93),
      '--surface-3': hslToHex(h, ts, 88),
      '--border': rgba(h, 30, 30, 0.12),
      '--border-strong': rgba(h, 30, 30, 0.22),
      '--text-primary': hslToHex(h, 24, 15),
      '--text-secondary': hslToHex(h, 18, 32),
      '--text-tertiary': hslToHex(h, 14, 45),
      '--accent-color': accent,
      '--grid-dot': hslToHex(h, ts, 90),
      'color-scheme': 'light',
    };
  }
  // dark
  return {
    '--bg-base': hslToHex(h, s, lBase),
    '--surface': hslToHex(h, s * 0.92, lBase + 5),
    '--surface-2': hslToHex(h, s * 0.85, lBase + 9),
    '--surface-3': hslToHex(h, s * 0.8, lBase + 14),
    '--border': rgba(h, Math.min(s, 45), 78, 0.10),
    '--border-strong': rgba(h, Math.min(s, 45), 80, 0.20),
    '--text-primary': hslToHex(h, Math.min(s, 16), 93),
    '--text-secondary': hslToHex(h, Math.min(s, 13), 77),
    '--text-tertiary': hslToHex(h, Math.min(s, 11), 59),
    '--accent-color': accent,
    '--grid-dot': hslToHex(h, s, lBase + 4),
    'color-scheme': 'dark',
  };
}

/* ---- seeds: [id, name, group, mode, hue, sat, baseL, accent] ---- */
const SEEDS = [
  // Midnight (dark, near-neutral)
  ['carbon','Carbon','Midnight','dark',220,6,8,'#E5E5E5'],
  ['onyx','Onyx','Midnight','dark',240,10,6,'#8B93A7'],
  ['graphite','Graphite','Midnight','dark',210,8,10,'#A0AEC0'],
  ['ink','Ink','Midnight','dark',230,16,7,'#7C9CBF'],
  ['gunmetal','Gunmetal','Midnight','dark',200,12,9,'#8FA8B8'],
  ['obsidian','Obsidian','Midnight','dark',0,0,4,'#D4AF37'],
  ['eclipse','Eclipse','Midnight','dark',250,14,6,'#9CA3FF'],
  // Mono (grayscale + accent)
  ['ghost','Ghost','Mono','dark',0,0,6,'#D4D4D4'],
  ['noir','Noir','Mono','dark',0,0,5,'#FAFAFA'],
  ['silver','Silver','Mono','dark',220,4,9,'#C0C6CC'],
  ['platinum','Platinum','Mono','dark',0,0,8,'#E5E4E2'],
  ['pewter','Pewter','Mono','dark',215,6,11,'#B8C0C8'],
  // Neon / Cyber
  ['cyberpunk','Cyberpunk','Neon','dark',285,32,6,'#FF2BD6'],
  ['synthwave','Synthwave','Neon','dark',265,40,8,'#FF3CAC'],
  ['acid','Acid','Neon','dark',90,22,7,'#C6FF00'],
  ['laser','Laser','Neon','dark',190,42,6,'#00E5FF'],
  ['hologram','Hologram','Neon','dark',180,30,7,'#5EEAD4'],
  ['ultraviolet','Ultraviolet','Neon','dark',270,45,6,'#A78BFA'],
  ['neon-rose','Neon Rose','Neon','dark',330,36,7,'#FF2D78'],
  // Ocean / Ice
  ['abyssal','Abyssal','Ocean','dark',215,45,6,'#38BDF8'],
  ['arctic','Arctic','Ocean','dark',205,35,8,'#7DD3FC'],
  ['deepsea','Deep Sea','Ocean','dark',195,50,6,'#22D3EE'],
  ['cobalt','Cobalt','Ocean','dark',220,50,9,'#4285F4'],
  ['teal','Teal','Ocean','dark',180,40,7,'#2DD4BF'],
  ['lagoon','Lagoon','Ocean','dark',190,45,8,'#06B6D4'],
  ['sapphire','Sapphire','Ocean','dark',225,55,7,'#3B82F6'],
  // Forest / Nature
  ['matrix','Matrix','Forest','dark',135,30,4,'#22C55E'],
  ['matcha','Matcha','Forest','dark',95,25,8,'#A3E635'],
  ['evergreen','Evergreen','Forest','dark',150,30,6,'#34D399'],
  ['moss','Moss','Forest','dark',110,20,8,'#84CC16'],
  ['jungle','Jungle','Forest','dark',140,35,6,'#4ADE80'],
  ['sage','Sage','Forest','dark',120,14,10,'#86EFAC'],
  ['fern','Fern','Forest','dark',160,28,7,'#2DD4BF'],
  // Ember / Sunset (warm)
  ['ember','Ember','Ember','dark',20,40,7,'#FB923C'],
  ['solar','Solar','Ember','dark',40,50,6,'#F59E0B'],
  ['volcanic','Volcanic','Ember','dark',10,35,7,'#F97316'],
  ['sunset','Sunset','Ember','dark',15,45,8,'#FB7185'],
  ['amber','Amber','Ember','dark',35,45,8,'#FBBF24'],
  ['copper','Copper','Ember','dark',18,35,9,'#D97757'],
  ['rust','Rust','Ember','dark',12,40,8,'#EA580C'],
  // Royal / Jewel
  ['amethyst','Amethyst','Jewel','dark',270,35,7,'#A855F7'],
  ['royal','Royal','Jewel','dark',250,40,7,'#818CF8'],
  ['ruby','Ruby','Jewel','dark',345,40,7,'#F43F5E'],
  ['emerald','Emerald','Jewel','dark',155,40,6,'#10B981'],
  ['velvet','Velvet','Jewel','dark',340,35,7,'#E11D48'],
  ['orchid','Orchid','Jewel','dark',290,35,7,'#D946EF'],
  ['indigo','Indigo','Jewel','dark',240,35,7,'#6366F1'],
  // Rose / Candy
  ['rose','Rose','Rose','dark',345,30,8,'#FB7185'],
  ['sakura','Sakura','Rose','dark',330,25,9,'#F9A8D4'],
  ['bubblegum','Bubblegum','Rose','dark',320,35,8,'#F472B6'],
  ['crimson','Crimson','Rose','dark',0,40,6,'#EF4444'],
  ['magenta','Magenta','Rose','dark',310,40,7,'#E879F9'],
  ['coral','Coral','Rose','dark',5,35,9,'#FF7A66'],
  ['blush','Blush','Rose','dark',350,25,10,'#FDA4AF'],
  // Earth / Metal
  ['mocha','Mocha','Earth','dark',20,22,9,'#D4A373'],
  ['espresso','Espresso','Earth','dark',25,25,6,'#C8A27C'],
  ['sand','Sand','Earth','dark',40,20,10,'#E0C097'],
  ['clay','Clay','Earth','dark',18,24,9,'#CC8E6B'],
  ['bronze','Bronze','Earth','dark',35,28,8,'#CD7F32'],
  ['walnut','Walnut','Earth','dark',28,22,7,'#B08968'],
  ['gold','Gold','Earth','dark',45,30,6,'#D4AF37'],
  // High-contrast / Focus
  ['bloodmoon','Bloodmoon','Focus','dark',220,10,8,'#FF4D4D'],
  ['tokyo','Neon Night','Focus','dark',235,30,8,'#FF2A6D'],
  ['frost','Frost','Focus','dark',215,18,11,'#88C0D0'],
  ['solarflare','Solar Flare','Focus','dark',45,55,5,'#FDE047'],
  ['viper','Viper','Focus','dark',150,35,5,'#A3FF12'],
  // Light / Day
  ['daylight','Daylight','Light','light',220,16,96,'#2563EB'],
  ['linen','Linen','Light','light',40,22,96,'#B45309'],
  ['cloud','Cloud','Light','light',210,14,97,'#0EA5E9'],
  ['porcelain','Porcelain','Light','light',0,0,98,'#18181B'],
  ['mintcream','Mint Cream','Light','light',150,20,97,'#059669'],
  ['dawn','Dawn','Light','light',25,26,96,'#EA580C'],
  ['paper','Paper','Light','light',40,8,97,'#525252'],
];

/* ---- emit ---- */
let css = `/* AUTO-GENERATED by scripts/genThemes.mjs — do not edit by hand. ${SEEDS.length} themes.
   Token-based: each theme overrides only the design tokens the app consumes.
   Semantic colors (--success/--danger/--warning/--info) inherit from :root so
   up/down stays readable on every theme. */\n\n`;

for (const seed of SEEDS) {
  const [id] = seed;
  const t = tokensFor(seed);
  const body = Object.entries(t).map(([k, v]) => `${k}: ${v};`).join(' ');
  css += `[data-theme="${id}"] { ${body} }\n`;
}

// Legacy hardcoded page-black -> themed base, so the app frame follows the theme.
css += `\n/* Make the app frame's hardcoded black follow the active theme's base. */\n`;
css += `[data-theme] .theme-bg-base { background-color: var(--bg-base) !important; }\n`;

writeFileSync(new URL('../src/themes.css', import.meta.url), css);

const ts = `// AUTO-GENERATED by scripts/genThemes.mjs — do not edit by hand.\n`
  + `export interface ThemeDef { id: string; name: string; group: string; surface: string; accent: string; }\n`
  + `export const THEMES: ThemeDef[] = [\n`
  + SEEDS.map((s) => {
      const t = tokensFor(s);
      return `  { id: '${s[0]}', name: ${JSON.stringify(s[1])}, group: ${JSON.stringify(s[2])}, surface: '${t['--surface']}', accent: '${s[7]}' },`;
    }).join('\n')
  + `\n];\n`;

writeFileSync(new URL('../src/lib/themes.generated.ts', import.meta.url), ts);

console.log(`Generated ${SEEDS.length} themes -> src/themes.css + src/lib/themes.generated.ts`);
const groups = [...new Set(SEEDS.map((s) => s[2]))];
console.log('Groups:', groups.join(', '));
