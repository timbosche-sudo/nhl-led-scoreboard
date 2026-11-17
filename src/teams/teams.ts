import { hexToRgb, ledSafe, type RGB } from '../core/color';

export interface Team {
  abbrev: string;
  city: string;
  name: string;
  /** Brand colours (approximate public team colours), used for text, bars and goal flashes. */
  primary: string;
  secondary: string;
}

/** The 32 NHL clubs for the 2025-26 season onward (abbreviations as used by api-web.nhle.com). */
export const TEAMS: Team[] = [
  { abbrev: 'ANA', city: 'Anaheim', name: 'Ducks', primary: '#F47A38', secondary: '#B9975B' },
  { abbrev: 'BOS', city: 'Boston', name: 'Bruins', primary: '#FFB81C', secondary: '#FFFFFF' },
  { abbrev: 'BUF', city: 'Buffalo', name: 'Sabres', primary: '#003087', secondary: '#FFB81C' },
  { abbrev: 'CGY', city: 'Calgary', name: 'Flames', primary: '#C8102E', secondary: '#F1BE48' },
  { abbrev: 'CAR', city: 'Carolina', name: 'Hurricanes', primary: '#CC0000', secondary: '#A2AAAD' },
  { abbrev: 'CHI', city: 'Chicago', name: 'Blackhawks', primary: '#CF0A2C', secondary: '#FFFFFF' },
  { abbrev: 'COL', city: 'Colorado', name: 'Avalanche', primary: '#6F263D', secondary: '#236192' },
  { abbrev: 'CBJ', city: 'Columbus', name: 'Blue Jackets', primary: '#002654', secondary: '#CE1126' },
  { abbrev: 'DAL', city: 'Dallas', name: 'Stars', primary: '#006847', secondary: '#8F8F8C' },
  { abbrev: 'DET', city: 'Detroit', name: 'Red Wings', primary: '#CE1126', secondary: '#FFFFFF' },
  { abbrev: 'EDM', city: 'Edmonton', name: 'Oilers', primary: '#FF4C00', secondary: '#041E42' },
  { abbrev: 'FLA', city: 'Florida', name: 'Panthers', primary: '#C8102E', secondary: '#B9975B' },
  { abbrev: 'LAK', city: 'Los Angeles', name: 'Kings', primary: '#A2AAAD', secondary: '#FFFFFF' },
  { abbrev: 'MIN', city: 'Minnesota', name: 'Wild', primary: '#154734', secondary: '#A6192E' },
  { abbrev: 'MTL', city: 'Montréal', name: 'Canadiens', primary: '#AF1E2D', secondary: '#192168' },
  { abbrev: 'NSH', city: 'Nashville', name: 'Predators', primary: '#FFB81C', secondary: '#041E42' },
  { abbrev: 'NJD', city: 'New Jersey', name: 'Devils', primary: '#CE1126', secondary: '#FFFFFF' },
  { abbrev: 'NYI', city: 'New York', name: 'Islanders', primary: '#00539B', secondary: '#F47D30' },
  { abbrev: 'NYR', city: 'New York', name: 'Rangers', primary: '#0038A8', secondary: '#CE1126' },
  { abbrev: 'OTT', city: 'Ottawa', name: 'Senators', primary: '#C52032', secondary: '#C2912C' },
  { abbrev: 'PHI', city: 'Philadelphia', name: 'Flyers', primary: '#F74902', secondary: '#FFFFFF' },
  { abbrev: 'PIT', city: 'Pittsburgh', name: 'Penguins', primary: '#FCB514', secondary: '#FFFFFF' },
  { abbrev: 'SJS', city: 'San Jose', name: 'Sharks', primary: '#006D75', secondary: '#EA7200' },
  { abbrev: 'SEA', city: 'Seattle', name: 'Kraken', primary: '#99D9D9', secondary: '#355464' },
  { abbrev: 'STL', city: 'St. Louis', name: 'Blues', primary: '#002F87', secondary: '#FCB514' },
  { abbrev: 'TBL', city: 'Tampa Bay', name: 'Lightning', primary: '#002868', secondary: '#FFFFFF' },
  { abbrev: 'TOR', city: 'Toronto', name: 'Maple Leafs', primary: '#00205B', secondary: '#FFFFFF' },
  { abbrev: 'UTA', city: 'Utah', name: 'Mammoth', primary: '#6CACE4', secondary: '#FFFFFF' },
  { abbrev: 'VAN', city: 'Vancouver', name: 'Canucks', primary: '#00205B', secondary: '#00843D' },
  { abbrev: 'VGK', city: 'Vegas', name: 'Golden Knights', primary: '#B4975A', secondary: '#C8102E' },
  { abbrev: 'WSH', city: 'Washington', name: 'Capitals', primary: '#C8102E', secondary: '#041E42' },
  { abbrev: 'WPG', city: 'Winnipeg', name: 'Jets', primary: '#004C97', secondary: '#AC162C' },
];

const BY_ABBREV = new Map(TEAMS.map((t) => [t.abbrev, t]));

export function getTeam(abbrev: string): Team | undefined {
  return BY_ABBREV.get(abbrev.toUpperCase());
}

/** Team colour adjusted so it is clearly visible when lit on a black LED matrix. */
export function teamLedColor(abbrev: string, which: 'primary' | 'secondary' = 'primary'): RGB {
  const t = getTeam(abbrev);
  if (!t) return [200, 200, 200];
  return ledSafe(hexToRgb(t[which]));
}

export function teamRawColor(abbrev: string, which: 'primary' | 'secondary' = 'primary'): RGB {
  const t = getTeam(abbrev);
  return t ? hexToRgb(t[which]) : [128, 128, 128];
}

/** Official NHL logo SVG path (relative to the assets.nhle.com host). */
export function logoPath(abbrev: string, variant: 'dark' | 'light' = 'dark'): string {
  return `/logos/nhl/svg/${abbrev.toUpperCase()}_${variant}.svg`;
}
