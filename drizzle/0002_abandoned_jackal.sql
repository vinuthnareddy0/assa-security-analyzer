CREATE TABLE `project_events` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`team_id` text NOT NULL,
	`actor_email` text NOT NULL,
	`kind` text NOT NULL,
	`note` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_events_project_created` ON `project_events` (`project_id`,`created_at`);