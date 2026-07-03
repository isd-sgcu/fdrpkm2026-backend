CREATE TYPE "public"."game" AS ENUM('jigsaw', 'csr');--> statement-breakpoint
CREATE TYPE "public"."prefix" AS ENUM('mr', 'mrs', 'ms', 'not_specified', 'other');--> statement-breakpoint
CREATE TYPE "public"."project" AS ENUM('firstdate', 'rpkm');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('student', 'staff');--> statement-breakpoint
CREATE TYPE "public"."vehicle" AS ENUM('private_car', 'private_ev', 'transit', 'bus', 'taxi', 'motorcycle', 'bike_walk', 'other');--> statement-breakpoint
CREATE TABLE "registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"project" "project" NOT NULL,
	"pdpa_accepted_at" timestamp with time zone NOT NULL,
	"attended_days" integer,
	"group_id" uuid,
	"pno_referral_source" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "registrations_student_project_unique" UNIQUE("student_id","project")
);
--> statement-breakpoint
CREATE TABLE "students" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" text NOT NULL,
	"email" text NOT NULL,
	"prefix" "prefix" DEFAULT 'not_specified' NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"nickname" text,
	"faculty" text,
	"department" text,
	"year" text,
	"phone" text,
	"line_id" text,
	"emergency_contact_name" text,
	"emergency_contact_phone" text,
	"allergies" text,
	"dietary" text,
	"medical_notes" text,
	"role" "role" DEFAULT 'student' NOT NULL,
	"pno_sgcu_awareness" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "students_student_id_unique" UNIQUE("student_id")
);
--> statement-breakpoint
CREATE TABLE "travel_legs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"registration_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"vehicle" "vehicle" NOT NULL,
	"vehicle_other" text,
	"origin_district" text NOT NULL,
	"origin_province" text NOT NULL,
	"destination_district" text NOT NULL,
	"destination_province" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "travel_legs_registration_seq_unique" UNIQUE("registration_id","seq"),
	CONSTRAINT "travel_legs_seq_check" CHECK ("travel_legs"."seq" in (1, 2)),
	CONSTRAINT "travel_legs_vehicle_other_check" CHECK (("travel_legs"."vehicle" = 'other') = ("travel_legs"."vehicle_other" is not null))
);
--> statement-breakpoint
CREATE TABLE "fd_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"scanned_by" uuid NOT NULL,
	"scanned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fd_entries_student_unique" UNIQUE("student_id")
);
--> statement-breakpoint
CREATE TABLE "checkpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game" "game" NOT NULL,
	"code" text NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"geofence_radius_m" integer DEFAULT 50 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "checkpoints_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "scans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"checkpoint_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"scanned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scans_checkpoint_student_unique" UNIQUE("checkpoint_id","student_id")
);
--> statement-breakpoint
CREATE TABLE "group_house_choices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"house_id" uuid NOT NULL,
	"rank" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_house_choices_group_rank_unique" UNIQUE("group_id","rank"),
	CONSTRAINT "group_house_choices_group_house_unique" UNIQUE("group_id","house_id"),
	CONSTRAINT "group_house_choices_rank_check" CHECK ("group_house_choices"."rank" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"leader_id" uuid NOT NULL,
	"join_code" text NOT NULL,
	"assigned_house_id" uuid,
	"assigned_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "groups_join_code_unique" UNIQUE("join_code")
);
--> statement-breakpoint
CREATE TABLE "houses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"capacity" integer,
	"info" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "houses_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travel_legs" ADD CONSTRAINT "travel_legs_registration_id_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."registrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fd_entries" ADD CONSTRAINT "fd_entries_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fd_entries" ADD CONSTRAINT "fd_entries_scanned_by_students_id_fk" FOREIGN KEY ("scanned_by") REFERENCES "public"."students"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scans" ADD CONSTRAINT "scans_checkpoint_id_checkpoints_id_fk" FOREIGN KEY ("checkpoint_id") REFERENCES "public"."checkpoints"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scans" ADD CONSTRAINT "scans_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_house_choices" ADD CONSTRAINT "group_house_choices_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_house_choices" ADD CONSTRAINT "group_house_choices_house_id_houses_id_fk" FOREIGN KEY ("house_id") REFERENCES "public"."houses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_leader_id_students_id_fk" FOREIGN KEY ("leader_id") REFERENCES "public"."students"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_assigned_house_id_houses_id_fk" FOREIGN KEY ("assigned_house_id") REFERENCES "public"."houses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "registrations_group_id_idx" ON "registrations" USING btree ("group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "students_email_unique" ON "students" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "travel_legs_registration_id_idx" ON "travel_legs" USING btree ("registration_id");--> statement-breakpoint
CREATE INDEX "scans_student_id_idx" ON "scans" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "group_house_choices_house_id_idx" ON "group_house_choices" USING btree ("house_id");