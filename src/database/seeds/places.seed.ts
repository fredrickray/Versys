export type PlaceSeed = {
  code: string;
  name: string;
  groupKey: string;
  ussdNumber: number;
  isMusterPoint: boolean;
  /** Optional WGS84 — used by mobile distance / directions. */
  latitude?: number;
  longitude?: number;
};

/** Approximate Veritas University (Bwari) campus cluster for local demos. */
const CAMPUS = { lat: 9.0778, lng: 7.4112 } as const;

const hostels: PlaceSeed[] = 'ABCDEFGHIJKLMNOPQRST'
  .split('')
  .map((letter, i) => ({
    code: `HOSTEL_${letter}`,
    name: `Hostel ${letter}`,
    groupKey: 'hostels',
    ussdNumber: i + 1,
    isMusterPoint: false,
  }));

const namedHostels: PlaceSeed[] = [
  {
    code: 'CICL',
    name: 'CICL',
    groupKey: 'hostels',
    ussdNumber: 21,
    isMusterPoint: false,
  },
  {
    code: 'KELSON',
    name: 'Kelson',
    groupKey: 'hostels',
    ussdNumber: 22,
    isMusterPoint: false,
  },
  {
    code: 'NEW_KELSON',
    name: 'New Kelson',
    groupKey: 'hostels',
    ussdNumber: 23,
    isMusterPoint: false,
  },
  {
    code: 'STANZEL',
    name: 'Stanzel',
    groupKey: 'hostels',
    ussdNumber: 24,
    isMusterPoint: false,
  },
  {
    code: 'PAETOS',
    name: 'Paetos',
    groupKey: 'hostels',
    ussdNumber: 25,
    isMusterPoint: false,
  },
  {
    code: 'NEW_PAETOS',
    name: 'New Paetos',
    groupKey: 'hostels',
    ussdNumber: 26,
    isMusterPoint: false,
  },
];

export const PLACE_SEEDS: PlaceSeed[] = [
  {
    code: 'MAIN_GATE',
    name: 'Main Gate',
    groupKey: 'sports_and_gate',
    ussdNumber: 1,
    isMusterPoint: false,
    latitude: CAMPUS.lat + 0.0018,
    longitude: CAMPUS.lng - 0.0012,
  },
  {
    code: 'NLT',
    name: 'New Lecture Theatre',
    groupKey: 'faculties',
    ussdNumber: 1,
    isMusterPoint: false,
    latitude: CAMPUS.lat + 0.0004,
    longitude: CAMPUS.lng + 0.0006,
  },
  {
    code: 'FOOTBALL',
    name: 'Football Field',
    groupKey: 'sports_and_gate',
    ussdNumber: 2,
    isMusterPoint: true,
    latitude: CAMPUS.lat - 0.0008,
    longitude: CAMPUS.lng - 0.0005,
  },
  {
    code: 'BLOCK_A',
    name: 'Block A',
    groupKey: 'faculties',
    ussdNumber: 2,
    isMusterPoint: false,
    latitude: CAMPUS.lat + 0.0002,
    longitude: CAMPUS.lng + 0.0002,
  },
  {
    code: 'BLOCK_B',
    name: 'Block B',
    groupKey: 'faculties',
    ussdNumber: 3,
    isMusterPoint: false,
    latitude: CAMPUS.lat + 0.0003,
    longitude: CAMPUS.lng + 0.0004,
  },
  {
    code: 'BLOCK_C',
    name: 'Block C',
    groupKey: 'faculties',
    ussdNumber: 4,
    isMusterPoint: false,
    latitude: CAMPUS.lat + 0.0005,
    longitude: CAMPUS.lng + 0.0003,
  },
  {
    code: 'BLOCK_D',
    name: 'Block D',
    groupKey: 'faculties',
    ussdNumber: 5,
    isMusterPoint: false,
    latitude: CAMPUS.lat + 0.0006,
    longitude: CAMPUS.lng + 0.0005,
  },
  {
    code: 'CHAPEL',
    name: 'Chapel',
    groupKey: 'halls_and_chapel',
    ussdNumber: 1,
    isMusterPoint: false,
    latitude: CAMPUS.lat - 0.0002,
    longitude: CAMPUS.lng + 0.0008,
  },
  {
    code: 'ICT_PG',
    name: 'ICT / PG Building',
    groupKey: 'faculties',
    ussdNumber: 6,
    isMusterPoint: false,
    latitude: CAMPUS.lat + 0.0001,
    longitude: CAMPUS.lng - 0.0003,
  },
  {
    code: 'LAW',
    name: 'Faculty of Law',
    groupKey: 'faculties',
    ussdNumber: 7,
    isMusterPoint: false,
    latitude: CAMPUS.lat + 0.0007,
    longitude: CAMPUS.lng - 0.0002,
  },
  {
    code: 'ENG',
    name: 'Faculty of Engineering',
    groupKey: 'faculties',
    ussdNumber: 8,
    isMusterPoint: false,
    latitude: CAMPUS.lat + 0.0009,
    longitude: CAMPUS.lng + 0.0001,
  },
  {
    code: 'MPHALL',
    name: 'Multipurpose Hall',
    groupKey: 'halls_and_chapel',
    ussdNumber: 2,
    isMusterPoint: true,
    latitude: CAMPUS.lat - 0.0004,
    longitude: CAMPUS.lng + 0.0004,
  },
  {
    code: 'SENATE',
    name: 'Senate Building',
    groupKey: 'faculties',
    ussdNumber: 9,
    isMusterPoint: false,
    latitude: CAMPUS.lat,
    longitude: CAMPUS.lng,
  },
  {
    code: 'MED',
    name: 'Medical Faculty',
    groupKey: 'faculties',
    ussdNumber: 10,
    isMusterPoint: false,
    latitude: CAMPUS.lat + 0.0011,
    longitude: CAMPUS.lng + 0.0007,
  },
  {
    code: 'CAFE',
    name: 'Cafeteria',
    groupKey: 'halls_and_chapel',
    ussdNumber: 3,
    isMusterPoint: false,
    latitude: CAMPUS.lat - 0.0001,
    longitude: CAMPUS.lng - 0.0006,
  },
  ...hostels,
  ...namedHostels,
];
