CREATE TABLE "content_factions" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"description_fr" text DEFAULT '' NOT NULL,
	"produces" text DEFAULT '{}' NOT NULL,
	"consumes" text DEFAULT '{}' NOT NULL
);
