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
