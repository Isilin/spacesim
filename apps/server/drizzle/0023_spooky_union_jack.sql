CREATE TABLE "corp_relations" (
	"corp_a" text NOT NULL,
	"corp_b" text NOT NULL,
	"game_id" text NOT NULL,
	"state" text DEFAULT 'neutral' NOT NULL,
	"since" bigint NOT NULL,
	CONSTRAINT "corp_relations_corp_a_corp_b_pk" PRIMARY KEY("corp_a","corp_b")
);
--> statement-breakpoint
CREATE TABLE "standings" (
	"corporation_id" text NOT NULL,
	"target_id" text NOT NULL,
	"game_id" text NOT NULL,
	"value" integer DEFAULT 0 NOT NULL,
	"set_at" bigint NOT NULL,
	CONSTRAINT "standings_corporation_id_target_id_pk" PRIMARY KEY("corporation_id","target_id")
);
--> statement-breakpoint
ALTER TABLE "corp_relations" ADD CONSTRAINT "corp_relations_corp_a_corporations_id_fk" FOREIGN KEY ("corp_a") REFERENCES "public"."corporations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corp_relations" ADD CONSTRAINT "corp_relations_corp_b_corporations_id_fk" FOREIGN KEY ("corp_b") REFERENCES "public"."corporations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standings" ADD CONSTRAINT "standings_corporation_id_corporations_id_fk" FOREIGN KEY ("corporation_id") REFERENCES "public"."corporations"("id") ON DELETE cascade ON UPDATE no action;