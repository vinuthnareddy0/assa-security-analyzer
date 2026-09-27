import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {clientProjects,clientAssessments,clientAssessmentById} from '../lib/team-queries.ts';

test('clients see only assigned projects and their saved assessment', () => {
  const db = new DatabaseSync(':memory:');
  for (const filename of ['0000_flippant_tarot.sql','0001_sparkling_enchantress.sql','0002_abandoned_jackal.sql']) {
    const sql=readFileSync(new URL(`../drizzle/${filename}`,import.meta.url),'utf8').replaceAll('--> statement-breakpoint','');
    db.exec(sql);
  }
  const now=new Date().toISOString();
  db.prepare('INSERT INTO projects (id,team_id,name,domain,client_email,status,progress_note,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)').run('mine','team','My project','demo.testfire.net','client@example.com','Reporting','Ready',now,now);
  db.prepare('INSERT INTO projects (id,team_id,name,domain,client_email,status,progress_note,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)').run('other','team','Other project','demo.testfire.net','other@example.com','Reporting','Private',now,now);
  db.prepare('INSERT INTO assessments (id,owner_id,name,domain,status,created_at,project_id) VALUES (?,?,?,?,?,?,?)').run('run-1','tester','My run','demo.testfire.net','completed',now,'mine');
  db.prepare('INSERT INTO assessments (id,owner_id,name,domain,status,created_at,project_id) VALUES (?,?,?,?,?,?,?)').run('run-2','tester','Other run','demo.testfire.net','completed',now,'other');
  assert.deepEqual(db.prepare(clientProjects).all('team','client@example.com').map(x=>x.id),['mine']);
  assert.deepEqual(db.prepare(clientAssessments).all('team','client@example.com').map(x=>x.id),['run-1']);
  assert.equal(db.prepare(clientAssessmentById).get('run-2','team','client@example.com'),undefined);
  assert.equal(db.prepare(clientAssessmentById).get('run-1','team','client@example.com').name,'My run');
  db.close();
});
