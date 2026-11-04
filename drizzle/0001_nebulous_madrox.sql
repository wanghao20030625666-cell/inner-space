CREATE TABLE `collections` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`color` text DEFAULT 'green' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `collections_owner` ON `collections` (`owner`,`created_at`);--> statement-breakpoint
ALTER TABLE `records` ADD `pinned` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `records` ADD `collection_id` text REFERENCES collections(id) ON DELETE SET NULL;
