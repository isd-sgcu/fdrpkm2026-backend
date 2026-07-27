// For each event, we will defined it here.
// Which is for feature flag.

export const EventTime = {
  /** FirstDate registration: 17 Jul 19:00 – 18 Jul 18:00. */
  cu_firstdate_registration: {
    start: new Date("2026-07-17T19:00:00+07:00"),
    end: new Date("2026-07-18T18:00:00+07:00")
  },
  /** RPKM registration: opens 18 Jul 19:00; no announced close (far-future sentinel). */
  rpkm_registration: {
    start: new Date("2026-07-18T19:00:00+07:00"),
    end: new Date("2099-12-31T23:59:59+07:00")
  },
  /** House choosing (group house preferences): 18–21 Jul. */
  rpkm_house_pick: {
    start: new Date("2026-07-18T00:00:00+07:00"),
    end: new Date("2026-07-21T23:59:00+07:00")
  },
  /** House result announcement: 23 Jul onward. */
  rpkm_house_result: {
    start: new Date("2026-07-23T19:00:00+07:00"),
    end: new Date("2099-12-31T23:59:59+07:00")
  },
  /** Round 2 house choosing, for freshmen still without a house: 28-30 Jul. */
  rpkm_house_pick_round2: {
    start: new Date("2026-07-28T00:00:00+07:00"),
    end: new Date("2026-07-30T12:00:00+07:00")
  },
  /** Round 2 house result announcement: 30 Jul evening onward. */
  rpkm_house_result_round2: {
    start: new Date("2026-07-30T19:00:00+07:00"),
    end: new Date("2099-12-31T23:59:59+07:00")
  },
  /** House activities (บ้านรับเพื่อน): 1–2 Aug. */
  rpkm_house_activity: {
    start: new Date("2026-08-01T00:00:00+07:00"),
    end: new Date("2026-08-02T23:59:59+07:00")
  },
  /** Chula Jigsaw: 20 Jul – 3 Aug. */
  rpkm_jigsaw: {
    start: new Date("2026-07-20T00:00:00+07:00"),
    end: new Date("2026-08-03T23:59:59+07:00")
  },
  /** Chula QR Quest (game key `csr`): 20 Jul – 7 Aug. */
  rpkm_csr: {
    start: new Date("2026-07-20T00:00:00+07:00"),
    end: new Date("2026-08-07T23:59:59+07:00")
  },
  /** My Freshy Story: 22 Jul – 3 Aug. */
  rpkm_my_freshy_story: {
    start: new Date("2026-07-22T00:00:00+07:00"),
    end: new Date("2026-08-03T23:59:59+07:00")
  },
  /**
   * Field trip registration: 18–20 Jul for every route, or until a trip is
   * full (capacity is enforced on the Google-form side, not here). The trips
   * themselves run on different days per route (see docs/db/schema-spec.md):
   * สามย่าน 22–25 Jul; รักโลก plant walk 22 & 23 Jul, trashvenger 24 & 27 Jul;
   * จุฬาฯ 25–26 & 28–29 Jul.
   */
  rpkm_fieldtrip_registration: {
    start: new Date("2026-07-18T00:00:00+07:00"),
    end: new Date("2026-07-20T23:59:59+07:00")
  },
  /** Walk rally slot registration: 22–29 Jul (editable until close). */
  rpkm_walkrally_registration: {
    start: new Date("2026-07-22T00:00:00+07:00"),
    end: new Date("2026-07-29T23:59:59+07:00")
  },
  /** Walk rally event day (d-day): 31 Jul, rounds 12:00–16:00. */
  rpkm_walkrally_event: {
    start: new Date("2026-07-31T12:00:00+07:00"),
    end: new Date("2026-07-31T16:00:00+07:00")
  }
  // Other events can be added here as needed
};

// Round 2 house selection reuses existing houses from the 22-house set —
// not new house rows. Hardcoded per product decision (house list isn't
// otherwise configurable yet). These are the houses wanting more freshmen:
// house03 บ้านดัง, house04 บ้านเยิ้ม, house05 บ้านรุม, house10 บ้านอะอึ๋ม,
// house11 บ้านคิดส์, house13 บ้านโจ๊ะเด๊ะ ฮือซา, house14 บ้านเอช้วน,
// house18 บ้านโจ๋, house21 บ้านยิ้ม.
export const ROUND2_HOUSE_CODES = [
  "house03",
  "house04",
  "house05",
  "house10",
  "house11",
  "house13",
  "house14",
  "house18",
  "house21"
];

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
