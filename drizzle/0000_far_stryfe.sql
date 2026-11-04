CREATE TABLE `audit` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`action` text NOT NULL,
	`title` text NOT NULL,
	`record_id` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_owner_created` ON `audit` (`owner`,`created_at`);--> statement-breakpoint
CREATE TABLE `blob_cleanup` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`key` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `records` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`meta` text DEFAULT '{}' NOT NULL,
	`favorite` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`due_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`version` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `records_owner_updated` ON `records` (`owner`,`updated_at`,`id`);--> statement-breakpoint
CREATE INDEX `records_owner_kind` ON `records` (`owner`,`kind`,`deleted_at`);--> statement-breakpoint
CREATE TABLE `revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`record_id` text NOT NULL,
	`snapshot` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `revisions_record` ON `revisions` (`owner`,`record_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `settings` (
	`owner` text PRIMARY KEY NOT NULL,
	`value` text DEFAULT '{}' NOT NULL
);
