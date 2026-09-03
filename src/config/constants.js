export const BRAND = {
  department: "Liberty County Sheriff's Office",
  shortName: 'LCSO',
  footer: "Liberty County Sheriff's Office • ERLC",
  colors: {
    primary: 0x1f4e79,
    success: 0x2e7d32,
    warning: 0xf9a825,
    error: 0xb71c1c,
    neutral: 0x455a64,
  },
};

export const RANKS = [
  'Cadet',
  'Deputy Sheriff',
  'Senior Deputy',
  'Corporal',
  'Sergeant',
  'Lieutenant',
  'Captain',
  'Assistant Sheriff',
  'Undersheriff',
  'Sheriff',
];

export const RANK_LEVEL = Object.fromEntries(RANKS.map((rank, index) => [rank, index]));

export const DEFAULT_RANK_REQUIREMENTS = [
  { rank: 'Cadet', minActivityMinutes: 0, maxInfractionPoints: 999, minDaysInDepartment: 0 },
  { rank: 'Deputy Sheriff', minActivityMinutes: 120, maxInfractionPoints: 4, minDaysInDepartment: 3 },
  { rank: 'Senior Deputy', minActivityMinutes: 300, maxInfractionPoints: 3, minDaysInDepartment: 7 },
  { rank: 'Corporal', minActivityMinutes: 600, maxInfractionPoints: 2, minDaysInDepartment: 14 },
  { rank: 'Sergeant', minActivityMinutes: 900, maxInfractionPoints: 2, minDaysInDepartment: 21 },
  { rank: 'Lieutenant', minActivityMinutes: 1200, maxInfractionPoints: 1, minDaysInDepartment: 30 },
  { rank: 'Captain', minActivityMinutes: 1800, maxInfractionPoints: 1, minDaysInDepartment: 45 },
  { rank: 'Assistant Sheriff', minActivityMinutes: 2400, maxInfractionPoints: 0, minDaysInDepartment: 60 },
  { rank: 'Undersheriff', minActivityMinutes: 3000, maxInfractionPoints: 0, minDaysInDepartment: 75 },
  { rank: 'Sheriff', minActivityMinutes: 0, maxInfractionPoints: 999, minDaysInDepartment: 0 },
];

export const INFRACTION_TYPES = ['Verbal Warning', 'Written Warning', 'Suspension', 'Termination'];
export const DEFAULT_INFRACTION_POINTS = {
  'Verbal Warning': 0,
  'Written Warning': 1,
  Suspension: 3,
  Termination: 10,
};

export const ACTIVITY_TYPES = ['Patrol', 'Training', 'Ride-Along', 'Event'];
export const TICKET_TYPES = ['support', 'internal_affairs', 'promotion', 'loa', 'appeal', 'application'];
export const LOG_TYPES = ['moderation', 'promotion', 'infraction', 'loa', 'training', 'activity', 'member', 'ticket', 'command', 'application', 'investigation', 'guideline'];
