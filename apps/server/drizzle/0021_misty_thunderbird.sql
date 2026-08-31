CREATE TABLE "corporation_invites" (
	"id" text PRIMARY KEY NOT NULL,
	"game_id" text NOT NULL,
	"corporation_id" text NOT NULL,
	"empire_id" text NOT NULL,
	"invited_by" text NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "corporation_members" (
	"empire_id" text PRIMARY KEY NOT NULL,
	"game_id" text NOT NULL,
	"corporation_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"joined_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "corporations" (
	"id" text PRIMARY KEY NOT NULL,
	"game_id" text NOT NULL,
	"name" text NOT NULL,
	"tag" text NOT NULL,
	"founder_empire_id" text NOT NULL,
	"treasury" double precision DEFAULT 0 NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "corporation_invites" ADD CONSTRAINT "corporation_invites_corporation_id_corporations_id_fk" FOREIGN KEY ("corporation_id") REFERENCES "public"."corporations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corporation_members" ADD CONSTRAINT "corporation_members_corporation_id_corporations_id_fk" FOREIGN KEY ("corporation_id") REFERENCES "public"."corporations"("id") ON DELETE cascade ON UPDATE no action;