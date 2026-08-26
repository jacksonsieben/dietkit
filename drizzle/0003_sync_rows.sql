CREATE SCHEMA "sync";
--> statement-breakpoint
CREATE TABLE "sync"."rows" (
	"account_id" text NOT NULL,
	"collection" text NOT NULL,
	"record_id" text NOT NULL,
	"ciphertext" text NOT NULL,
	"nonce" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"rev" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "rows_account_id_collection_record_id_pk" PRIMARY KEY("account_id","collection","record_id")
);
--> statement-breakpoint
CREATE INDEX "rows_account_updated_idx" ON "sync"."rows" USING btree ("account_id","updated_at");