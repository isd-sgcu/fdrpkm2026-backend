CREATE TYPE "public"."attendance_source" AS ENUM('preregis', 'onsite');--> statement-breakpoint
ALTER TABLE "walk_rally_attendances" ADD COLUMN "source" "attendance_source" DEFAULT 'onsite' NOT NULL;--> statement-breakpoint
ALTER TABLE "walk_rally_attendances" ALTER COLUMN "source" DROP DEFAULT;
