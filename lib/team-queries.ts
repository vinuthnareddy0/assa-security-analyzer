export const clientProjects = 'SELECT * FROM projects WHERE team_id = ? AND client_email = ? ORDER BY updated_at DESC LIMIT 100';
export const clientAssessments = 'SELECT a.id,a.name,a.domain,a.status,a.created_at,a.finished_at,a.error,a.result_json FROM assessments a JOIN projects p ON p.id = a.project_id WHERE p.team_id = ? AND p.client_email = ? ORDER BY a.created_at DESC LIMIT 30';
export const clientAssessmentById = 'SELECT a.* FROM assessments a JOIN projects p ON p.id = a.project_id WHERE a.id = ? AND p.team_id = ? AND p.client_email = ?';
