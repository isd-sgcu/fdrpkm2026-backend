ALTER TABLE "group_house_choices" DROP CONSTRAINT "group_house_choices_group_rank_unique";--> statement-breakpoint
ALTER TABLE "group_house_choices" DROP CONSTRAINT "group_house_choices_group_house_unique";--> statement-breakpoint
ALTER TABLE "group_house_choices" ADD COLUMN "round" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "group_house_choices" ADD CONSTRAINT "group_house_choices_group_round_rank_unique" UNIQUE("group_id","round","rank");--> statement-breakpoint
ALTER TABLE "group_house_choices" ADD CONSTRAINT "group_house_choices_group_round_house_unique" UNIQUE("group_id","round","house_id");--> statement-breakpoint
ALTER TABLE "group_house_choices" ADD CONSTRAINT "group_house_choices_round_check" CHECK ("group_house_choices"."round" in (1, 2));