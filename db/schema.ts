import { index, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const assessments = sqliteTable("assessments", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  name: text("name").notNull(),
  domain: text("domain").notNull(),
  status: text("status").notNull(),
  createdAt: text("created_at").notNull(),
  finishedAt: text("finished_at"),
  resultJson: text("result_json"),
  error: text("error"),
  projectId: text("project_id"),
}, table => [index("idx_assessments_owner_created").on(table.ownerId, table.createdAt)]);

export const verifications = sqliteTable("domain_verifications", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  domain: text("domain").notNull(),
  token: text("token").notNull(),
  expiresAt: text("expires_at").notNull(),
  verifiedUntil: text("verified_until"),
}, table => [uniqueIndex("idx_verifications_owner_domain").on(table.ownerId, table.domain)]);

export const teamMembers = sqliteTable("team_members", {
  id: text("id").primaryKey(),
  teamId: text("team_id").notNull(),
  email: text("email").notNull().unique(),
  userId: text("user_id").unique(),
  role: text("role").notNull(),
  createdAt: text("created_at").notNull(),
}, table => [index("idx_members_team").on(table.teamId)]);

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  teamId: text("team_id").notNull(),
  name: text("name").notNull(),
  domain: text("domain").notNull(),
  clientEmail: text("client_email"),
  requestId: text("request_id").unique(),
  status: text("status").notNull(),
  progressNote: text("progress_note").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, table => [index("idx_projects_team").on(table.teamId,table.updatedAt)]);

export const projectRequests = sqliteTable("project_requests", {
  id: text("id").primaryKey(),
  teamId: text("team_id").notNull(),
  clientEmail: text("client_email").notNull(),
  name: text("name").notNull(),
  domain: text("domain").notNull(),
  details: text("details").notNull(),
  status: text("status").notNull(),
  createdAt: text("created_at").notNull(),
}, table => [index("idx_requests_team").on(table.teamId,table.createdAt)]);

export const projectEvents = sqliteTable("project_events", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  teamId: text("team_id").notNull(),
  actorEmail: text("actor_email").notNull(),
  kind: text("kind").notNull(),
  note: text("note").notNull(),
  createdAt: text("created_at").notNull(),
}, table => [index("idx_events_project_created").on(table.projectId,table.createdAt)]);
