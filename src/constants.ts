// For each event, we will defined it here.
// Which is for feature flag.

export const EventTime = {
  // Example: "new-feature": true,
  // Add your feature flags here
  cu_firstdate_registration: {
    start: new Date("2026-07-17T19:00:00+07:00"),
    end: new Date("2026-07-17T16:59:59+07:00")
  },
  rpkm_house_pick: {
    start: new Date("2026-07-18T00:00:00+07:00"),
    end: new Date("2026-07-21T23:59:00+07:00")
  },
  rpkm_house_result: {
    start: new Date("2026-07-23T19:00:00+07:00"),
    end: new Date("2099-12-31T23:59:59+07:00")
  },
  rpkm_jigsaw: {
    start: new Date("2026-07-20T00:00:00+07:00"),
    end: new Date("2026-08-03T23:59:59+07:00")
  },
  rpkm_csr: {
    start: new Date("2026-07-20T00:00:00+07:00"),
    end: new Date("2026-08-07T23:59:59+07:00")
  }
  // Other events can be added here as needed
};

// walk rally has 2 type of round schedule, default and cu_museum.
export const WALK_RALLY = {
  rounds: {
    default: [
      { round: 1, start: "09:00", end: "09:30" },
      { round: 2, start: "10:00", end: "10:30" },
      { round: 3, start: "11:00", end: "11:30" },
      { round: 4, start: "13:00", end: "13:30" },
      { round: 5, start: "14:00", end: "14:30" },
      { round: 6, start: "15:00", end: "15:30" }
    ],
    cu_museum: [
      { round: 1, start: "12:00", end: "12:30" },
      { round: 2, start: "12:35", end: "13:05" },
      { round: 3, start: "13:10", end: "13:40" },
      { round: 4, start: "14:20", end: "14:50" },
      { round: 5, start: "14:55", end: "15:25" },
      { round: 6, start: "15:30", end: "16:00" }
    ]
  }
} as const;
