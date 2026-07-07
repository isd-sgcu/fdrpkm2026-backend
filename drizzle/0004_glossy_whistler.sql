ALTER TABLE "travel_legs" DROP CONSTRAINT "travel_legs_seq_check";--> statement-breakpoint
ALTER TABLE "travel_legs" ADD CONSTRAINT "travel_legs_seq_check" CHECK ("travel_legs"."seq" in (1, 2, 3, 4));