CREATE TABLE "content_astro" (
	"family" text NOT NULL,
	"id" text NOT NULL,
	"payload" text DEFAULT '{}' NOT NULL,
	CONSTRAINT "content_astro_family_id_pk" PRIMARY KEY("family","id")
);
