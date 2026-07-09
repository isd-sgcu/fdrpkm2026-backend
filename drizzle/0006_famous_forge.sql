CREATE TYPE "public"."staff_role" AS ENUM('firstdate', 'rpkm', 'walkrally', 'freshmennight');--> statement-breakpoint
ALTER TABLE "registrations" ADD COLUMN "staff_role" "staff_role";--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "cso_district" text;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "cso_province" text;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "bottle" boolean;