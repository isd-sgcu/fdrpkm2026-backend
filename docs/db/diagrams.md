# FD × RPKM — Diagrams

## 1. ER diagram (schema)

> Every table also has `created_at` + `updated_at`. See `schema.dbml` for the authoritative version.

```mermaid
erDiagram
    students ||--o{ registrations : has
    registrations ||--o{ travel_legs : trip
    students ||--o{ entries : enters
    students ||--o{ entries : scanned_by
    checkpoints ||--o{ scans : logged_at
    students ||--o{ scans : earns
    students ||--o{ groups : leads
    groups ||--o{ registrations : contains_members
    groups ||--o{ group_house_choices : ranks
    houses ||--o{ group_house_choices : ranked_in
    houses ||--o{ groups : assigned_to

    students {
        uuid id PK
        text student_id UK "QR payload; 69%% = year one"
        text email UK "from Chula SSO"
        text prefix "NN default not_specified; mr/mrs/ms/not_specified/other"
        text first_name
        text last_name
        text nickname
        text faculty
        text department
        text year
        text phone
        text line_id
        text emergency_contact_name
        text emergency_contact_phone
        text allergies
        text dietary
        text medical_notes
        text role "student or staff"
        text pno_sgcu_awareness "survey (P&O)"
        text cso_district "CSO home sub-district"
        text cso_province "CSO home province"
        boolean bottle "Did bring water bottle"
    }
    registrations {
        uuid id PK
        uuid student_id FK
        text project "firstdate or rpkm"
        timestamptz pdpa_accepted_at
        int attended_days "RPKM carbon"
        uuid group_id FK "RPKM only; holds membership (1:1)"
        text pno_referral_source "survey (P&O)"
        text staff_role "firstdate or rpkm or walkrally or freshmennight"
        unique student_project "uniq(student_id, project)"
    }
    travel_legs {
        uuid id PK
        uuid registration_id FK
        int seq "1 or 2"
        text vehicle "8 types or other"
        text vehicle_other
        text origin_district "free text"
        text origin_province "free text"
        text destination_district "free text"
        text destination_province "free text"
    }
    entries {
        uuid id PK
        uuid student_id FK "freshman who entered"
        uuid scanned_by FK "staff"
        text event "firstdate or freshmennight or rpkm"
        timestamptz scanned_at
        unique student_event "uniq(student_id, event)"
    }
    checkpoints {
        uuid id PK
        text game "jigsaw (10) or csr (35)"
        text code UK "QR payload"
        numeric lat
        numeric lng
        int geofence_radius_m "default 50"
    }
    scans {
        uuid id PK
        uuid checkpoint_id FK
        uuid student_id FK
        timestamptz scanned_at "logging req"
        numeric lat
        numeric lng
        unique cp_student "uniq(checkpoint_id, student_id)"
    }
    houses {
        uuid id PK
        text code UK "name/desc in i18n"
        int capacity
        jsonb info
    }
    groups {
        uuid id PK
        uuid leader_id FK
        text join_code UK "6-digit, regenerable"
        uuid assigned_house_id FK "null until random"
        timestamptz assigned_at
        timestamptz created_at
    }
    group_house_choices {
        uuid id PK
        uuid group_id FK
        uuid house_id FK
        int rank "1..5"
    }
```

## 2. User flow (journey)

```mermaid
flowchart TD
    subgraph AUTH [Entry & registration - shared]
        direction TB
        FDsite([FD website]):::fd --> SSO
        RPKMsite([RPKM website]):::rpkm --> SSO
        SSO[Chula SSO] --> Upsert[Upsert students by email]
        Upsert --> Reg{Registered<br/>THIS site?}
        Reg -- yes --> Home[Site home]
        Reg -- no --> Form[Registration page<br/>prefill if other site done<br/>+ travel method + PDPA]
        Form --> InsReg[Insert registrations]
        InsReg --> Home
    end

    Home --> FDhome
    Home --> RPKMhome

    subgraph FD [FirstDate]
        direction TB
        FDhome[FD activities]:::fd --> MyQR[My QR = student_id]
        MyQR --> StaffScan[[Staff scans at event]]
        StaffScan --> Att[(entries:<br/>firstdate | freshmennight | rpkm)]
    end

    subgraph RPKM [RPKM]
        direction TB
        RPKMhome[RPKM activities]:::rpkm --> Houses[Houses - see state machine]
        RPKMhome --> Game{Game:<br/>year-one + in window?}
        Game -- no --> Disabled[Disabled]
        Game -- yes --> ScanQR[Scan static QR]
        ScanQR --> GPSgate{require_gps?}
        GPSgate -- yes --> CheckGPS{within<br/>geofence?}
        CheckGPS -- no --> Reject[Reject]
        CheckGPS -- yes --> Credit[(scans:<br/>dedupe + timestamp)]
        GPSgate -- no --> Credit
        RPKMhome --> StaticForm{Static<br/>in window?}
        StaticForm -- yes --> GGForm[Open form_url]
        StaticForm -- no --> Disabled
    end

    classDef fd fill:#ffe0e6,stroke:#cc3355;
    classDef rpkm fill:#e0ecff,stroke:#3355cc;
```

> RPKM registration also auto-creates the student's solo group (see state machine §3).

## 3. Group state machine (one student's group membership)

```mermaid
stateDiagram-v2
    [*] --> SoloLeader : RPKM register (auto solo group)

    SoloLeader --> Member : join_code (target < 4), delete own empty group
    Member --> SoloLeader : leave / kicked -> new solo group
    Member --> Member : join another group

    SoloLeader --> Leader : someone joins my group
    Leader --> Leader : kick member / regen join_code
    Leader --> SoloLeader : leader leaves -> group dissolves, each member gets own solo group

    note right of Leader
        Leader WITH members
        cannot join elsewhere;
        must kick/disband first
    end note
```

## RPKM houses timeline

```mermaid
flowchart LR
    A[12/7 house data in] --> B[18/7 00:00 register + group opens]
    B --> C[22/7 group/ranking locked]
    C --> D[23-25/7 batch random -> house_assignments]
    D --> E[26/7 announce, export to ทะเบียนบ้าน]
    E --> F[31/7-2/8 house activities]
```
