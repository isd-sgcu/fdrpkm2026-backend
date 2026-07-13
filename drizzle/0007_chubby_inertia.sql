CREATE TYPE "public"."walk_rally_kind" AS ENUM('workshop', 'museum', 'minigame');--> statement-breakpoint
CREATE TABLE "walk_rally_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"kind" "walk_rally_kind" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "walk_rally_activities_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "walk_rally_attendances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"activity_id" uuid NOT NULL,
	"scanned_by" uuid NOT NULL,
	"scanned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "walk_rally_attendances_student_activity_unique" UNIQUE("student_id","activity_id")
);
--> statement-breakpoint
CREATE TABLE "walk_rally_registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"activity_id" uuid NOT NULL,
	"round" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "walk_rally_registrations_student_activity_unique" UNIQUE("student_id","activity_id"),
	CONSTRAINT "walk_rally_registrations_student_round_unique" UNIQUE("student_id","round"),
	CONSTRAINT "walk_rally_registrations_round_check" CHECK ("walk_rally_registrations"."round" between 1 and 6)
);
--> statement-breakpoint
ALTER TABLE "walk_rally_attendances" ADD CONSTRAINT "walk_rally_attendances_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "walk_rally_attendances" ADD CONSTRAINT "walk_rally_attendances_activity_id_walk_rally_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."walk_rally_activities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "walk_rally_attendances" ADD CONSTRAINT "walk_rally_attendances_scanned_by_students_id_fk" FOREIGN KEY ("scanned_by") REFERENCES "public"."students"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "walk_rally_registrations" ADD CONSTRAINT "walk_rally_registrations_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "walk_rally_registrations" ADD CONSTRAINT "walk_rally_registrations_activity_id_walk_rally_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."walk_rally_activities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "walk_rally_attendances_student_id_idx" ON "walk_rally_attendances" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "walk_rally_registrations_activity_round_idx" ON "walk_rally_registrations" USING btree ("activity_id","round");--> statement-breakpoint
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "walk_rally_activities" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "walk_rally_registrations" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "walk_rally_attendances" FOR EACH ROW EXECUTE FUNCTION set_updated_at();