CREATE TABLE `assessments` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`domain` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`finished_at` text,
	`result_json` text,
	`error` text
);
--> statement-breakpoint
CREATE INDEX `idx_assessments_owner_created` ON `assessments` (`owner_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `domain_verifications` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`domain` text NOT NULL,
	`token` text NOT NULL,
	`expires_at` text NOT NULL,
	`verified_until` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_verifications_owner_domain` ON `domain_verifications` (`owner_id`,`domain`);