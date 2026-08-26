CREATE TABLE "sync"."consent" (
	"account_id" text PRIMARY KEY NOT NULL,
	"notice" text NOT NULL,
	"consented_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sync"."vault" (
	"account_id" text PRIMARY KEY NOT NULL,
	"version" integer NOT NULL,
	"kdf" text NOT NULL,
	"iterations" integer NOT NULL,
	"salt" text NOT NULL,
	"passphrase_nonce" text NOT NULL,
	"passphrase_ciphertext" text NOT NULL,
	"recovery_nonce" text NOT NULL,
	"recovery_ciphertext" text NOT NULL
);
