CREATE TABLE `project_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`client_email` text NOT NULL,
	`name` text NOT NULL,
	`domain` text NOT NULL,
	`details` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_requests_team` ON `project_requests` (`team_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`name` text NOT NULL,
	`domain` text NOT NULL,
	`client_email` text,
	`request_id` text,
	`status` text NOT NULL,
	`progress_note` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `projects_request_id_unique` ON `projects` (`request_id`);--> statement-breakpoint
CREATE INDEX `idx_projects_team` ON `projects` (`team_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `team_members` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`email` text NOT NULL,
	`user_id` text,
	`role` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `team_members_email_unique` ON `team_members` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `team_members_user_id_unique` ON `team_members` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_members_team` ON `team_members` (`team_id`);--> statement-breakpoint
ALTER TABLE `assessments` ADD `project_id` text;