/* ============================================
   >>> INITIAL SETUP & MIDDLEWARES <<<
   ============================================ */
const express = require('express');
const bodyParser = require('body-parser');
const { Client } = require('pg');
const cors = require('cors');
const multer = require('multer');
const upload = multer();

const app = express();
app.use(cors());
app.use(bodyParser.json());


/* ============================================
   >>> DATABASE CONNECTION: USERS DB <<<
   ============================================ */
const usersDb = new Client({
  connectionString: 'postgres://neondb_owner:npg_Oa2PvqXF1ZHs@ep-square-bonus-a1go72ll-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require',
});

usersDb.connect()
  .then(() => console.log('✅ Connected to USERS database'))
  .catch(err => console.error('❌ Users DB connection error:', err));


/* ============================================
   >>> DATABASE CONNECTION: AUDITS DB <<<
   ============================================ */
const auditsDb = new Client({
  connectionString: 'postgresql://neondb_owner:npg_J1gloZUcFQS2@ep-still-truth-a1051s4o-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require',
});

async function ensureRisksSchema() {
  // Create tables if they do not exist
  await auditsDb.query(`
    CREATE TABLE IF NOT EXISTS risks (
      risk_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      risk_title VARCHAR(255) NOT NULL,
      dept VARCHAR(255),
      review_date DATE NOT NULL
    );
  `);
  await auditsDb.query(`
    CREATE TABLE IF NOT EXISTS risk_tasks (
      id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      risk_id INTEGER NOT NULL REFERENCES risks(risk_id) ON DELETE CASCADE,
      label VARCHAR(255) NOT NULL,
      weight INTEGER NOT NULL DEFAULT 0,
      done BOOLEAN NOT NULL DEFAULT FALSE
    );
  `);
  // Incidents
  await auditsDb.query(`
    CREATE TABLE IF NOT EXISTS incidents (
      incident_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      incident_type VARCHAR(255) NOT NULL,
      date_reported DATE NOT NULL,
      status VARCHAR(50) NOT NULL,
      severity_level VARCHAR(50) NOT NULL,
      risk_id INTEGER REFERENCES risks(risk_id) ON DELETE SET NULL
    );
  `);
  // Documents
  await auditsDb.query(`
    CREATE TABLE IF NOT EXISTS policy_documents (
      document_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      owner_dept VARCHAR(255) NOT NULL,
      approval_status VARCHAR(50) NOT NULL,
      last_review DATE,
      document_approved BOOLEAN NOT NULL DEFAULT FALSE,
      file_name TEXT,
      file_data BYTEA
    );
  `);
  // Regulations for dashboard
  await auditsDb.query(`
    CREATE TABLE IF NOT EXISTS regulations (
      id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      regulation_name TEXT NOT NULL,
      department TEXT NOT NULL,
      status TEXT NOT NULL,
      last_review DATE,
      next_review DATE,
      summary TEXT
    );
  `);
}

auditsDb.connect()
  .then(async () => {
    console.log('✅ Connected to AUDITS database');
    try {
      await ensureRisksSchema();
      console.log('✅ Ensured risks schema');
    } catch (e) {
      console.error('❌ Failed to ensure risks schema', e);
    }
  })
  .catch(err => console.error('❌ Audits DB connection error:', err));


/* ============================================
   >>> AUTH: LOGIN ROUTE <<<
   ============================================ */
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await usersDb.query(
      'SELECT * FROM users WHERE username = $1 AND password = $2',
      [username, password]
    );

    if (result.rows.length > 0) {
      res.json({ success: true, message: '✅ Login successful!' });
    } else {
      res.json({ success: false, message: '❌ Invalid username or password.' });
    }

  } catch (error) {
    console.error('Error during login:', error);
    res.status(500).json({ success: false, message: '⚠️ Server error.' });
  }
});


/* ============================================
   >>> AUDITS ROUTES <<<
   ============================================ */
app.get('/audits', async (req, res) => {
  try {
    const result = await auditsDb.query('SELECT * FROM audits ORDER BY audit_date DESC');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching audits:', error);
    res.status(500).json({ error: 'Failed to fetch audits.' });
  }
});

app.get('/audit-status-summary', async (req, res) => {
  try {
    const result = await auditsDb.query(`
      SELECT TRIM(LOWER(status)) AS normalized_status, COUNT(*) as count
      FROM audits
      GROUP BY normalized_status
    `);

    const data = result.rows.map(row => {
      let label;
      switch (row.normalized_status) {
        case 'completed': label = 'Completed'; break;
        case 'scheduled': label = 'Scheduled'; break;
        case 'in progress': label = 'In Progress'; break;
        case 'pending': label = 'Pending'; break;
        default:
          label = row.normalized_status.charAt(0).toUpperCase() + row.normalized_status.slice(1);
      }

      return { status: label, count: row.count };
    });

    res.json(data);
  } catch (error) {
    console.error('Error fetching audit summary:', error);
    res.status(500).json({ error: 'Failed to fetch audit summary.' });
  }
});

app.get('/graph-data', async (req, res) => {
  try {
    const result = await auditsDb.query('SELECT COUNT(*) AS total FROM audits');
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/audits', async (req, res) => {
  const { audit_id, audit_name, dept_audited, auditor, audit_date, status } = req.body;

  try {
    const insertQuery = `
      INSERT INTO audits (audit_id, audit_name, dept_audited, auditor, audit_date, status)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *;
    `;

    const result = await auditsDb.query(insertQuery, [
      audit_id,
      audit_name,
      dept_audited,
      auditor,
      audit_date,
      status
    ]);

    res.json({ success: true, audit: result.rows[0] });

  } catch (error) {
    console.error('Error inserting audit:', error);
    res.status(500).json({ success: false, message: 'Failed to add audit.' });
  }
});


/* ============================================
   >>> RISKS API (used by finding.js) <<<
   ============================================ */

// Server-side default task seeds mirroring the frontend logic
function defaultTasks(riskName) {
  const name = String(riskName || '').toLowerCase();

  if (/gdpr violation/i.test(name)) {
    return [
      { label: 'Assess data exposure', weight: 20, done: false },
      { label: 'Notify DPO and legal', weight: 15, done: false },
      { label: 'Report to authorities', weight: 15, done: false },
      { label: 'Notify affected individuals', weight: 15, done: false },
      { label: 'Remediate breach', weight: 20, done: false },
      { label: 'Review policies & train staff', weight: 15, done: false },
    ];
  }
  if (/data breach/i.test(name)) {
    return [
      { label: 'Isolate affected systems', weight: 20, done: false },
      { label: 'Investigate breach source', weight: 20, done: false },
      { label: 'Notify IT/security team', weight: 15, done: false },
      { label: 'Patch vulnerabilities', weight: 15, done: false },
      { label: 'Communicate with stakeholders', weight: 15, done: false },
      { label: 'Document and report', weight: 15, done: false },
    ];
  }
  if (/product contamination/i.test(name)) {
    return [
      { label: 'Quarantine affected products', weight: 20, done: false },
      { label: 'Notify quality assurance', weight: 15, done: false },
      { label: 'Conduct root cause analysis', weight: 20, done: false },
      { label: 'Recall products if needed', weight: 20, done: false },
      { label: 'Remediate contamination', weight: 15, done: false },
      { label: 'Review and update SOPs', weight: 10, done: false },
    ];
  }
  if (/labeling error|mislabeling/i.test(name)) {
    return [
      { label: 'Identify mislabeled products', weight: 20, done: false },
      { label: 'Notify regulatory team', weight: 15, done: false },
      { label: 'Correct labeling', weight: 20, done: false },
      { label: 'Recall if distributed', weight: 20, done: false },
      { label: 'Communicate with customers', weight: 15, done: false },
      { label: 'Review labeling process', weight: 10, done: false },
    ];
  }
  if (/safety hazard - workplace/i.test(name)) {
    return [
      { label: 'Isolate hazard area', weight: 20, done: false },
      { label: 'Notify safety officer', weight: 15, done: false },
      { label: 'Investigate root cause', weight: 20, done: false },
      { label: 'Remediate hazard', weight: 20, done: false },
      { label: 'Conduct safety training', weight: 15, done: false },
      { label: 'Update safety protocols', weight: 10, done: false },
    ];
  }
  if (/adverse customer reaction/i.test(name)) {
    return [
      { label: 'Document incident', weight: 20, done: false },
      { label: 'Notify customer service', weight: 15, done: false },
      { label: 'Investigate cause', weight: 20, done: false },
      { label: 'Provide remedy to customer', weight: 20, done: false },
      { label: 'Review product/process', weight: 15, done: false },
      { label: 'Report to management', weight: 10, done: false },
    ];
  }
  if (/fraud|misconduct/i.test(name)) {
    return [
      { label: 'Suspend involved parties', weight: 20, done: false },
      { label: 'Notify compliance/legal', weight: 15, done: false },
      { label: 'Conduct investigation', weight: 20, done: false },
      { label: 'Document findings', weight: 15, done: false },
      { label: 'Implement corrective actions', weight: 20, done: false },
      { label: 'Review controls', weight: 10, done: false },
    ];
  }
  if (/policy violation/i.test(name)) {
    return [
      { label: 'Document violation', weight: 20, done: false },
      { label: 'Notify HR/compliance', weight: 15, done: false },
      { label: 'Investigate incident', weight: 20, done: false },
      { label: 'Counsel involved parties', weight: 20, done: false },
      { label: 'Implement corrective actions', weight: 15, done: false },
      { label: 'Review and update policy', weight: 10, done: false },
    ];
  }
  if (/system failure|downtime/i.test(name)) {
    return [
      { label: 'Notify IT support', weight: 20, done: false },
      { label: 'Diagnose failure', weight: 20, done: false },
      { label: 'Restore system', weight: 20, done: false },
      { label: 'Communicate outage', weight: 15, done: false },
      { label: 'Review incident', weight: 15, done: false },
      { label: 'Update recovery plan', weight: 10, done: false },
    ];
  }
  if (/inventory loss|theft/i.test(name)) {
    return [
      { label: 'Secure area', weight: 20, done: false },
      { label: 'Notify security', weight: 15, done: false },
      { label: 'Investigate loss', weight: 20, done: false },
      { label: 'Document incident', weight: 15, done: false },
      { label: 'Report to authorities', weight: 20, done: false },
      { label: 'Review inventory controls', weight: 10, done: false },
    ];
  }
  if (/supplier non-compliance/i.test(name)) {
    return [
      { label: 'Notify procurement', weight: 20, done: false },
      { label: 'Assess impact', weight: 20, done: false },
      { label: 'Engage supplier', weight: 20, done: false },
      { label: 'Document non-compliance', weight: 15, done: false },
      { label: 'Implement contingency', weight: 15, done: false },
      { label: 'Review supplier agreements', weight: 10, done: false },
    ];
  }
  if (/budget|overrun/i.test(name)) {
    return [
      { label: 'Baseline current spend', weight: 15, done: false },
      { label: 'Negotiate vendor discounts', weight: 20, done: false },
      { label: 'Freeze nonessential purchases', weight: 15, done: false },
      { label: 'Weekly cost variance review', weight: 15, done: false },
      { label: 'Automate spend alerts', weight: 15, done: false },
      { label: 'Reforecast budget with stakeholders', weight: 20, done: false },
    ];
  }
  if (/breach/i.test(name)) {
    return [
      { label: 'Enable MFA for all privileged accounts', weight: 20, done: false },
      { label: 'Patch critical systems', weight: 20, done: false },
      { label: 'Encrypt sensitive data at rest', weight: 15, done: false },
      { label: 'Implement IDS/IPS monitoring', weight: 15, done: false },
      { label: 'Employee security awareness training', weight: 10, done: false },
      { label: 'Backup and disaster recovery test', weight: 20, done: false },
    ];
  }
  return [
    { label: 'Define mitigation plan', weight: 20, done: false },
    { label: 'Assign owner(s)', weight: 10, done: false },
    { label: 'Identify key milestones', weight: 15, done: false },
    { label: 'Execute main mitigation tasks', weight: 35, done: false },
    { label: 'Validate outcomes', weight: 10, done: false },
    { label: 'Close-out and document', weight: 10, done: false },
  ];
}

async function computeRiskProgress(riskId) {
  const prog = await auditsDb.query(
    `SELECT COALESCE(ROUND(CASE WHEN SUM(weight) > 0
              THEN SUM(CASE WHEN done THEN weight ELSE 0 END)::float / SUM(weight) * 100
              ELSE 0 END), 0) AS progress
     FROM risk_tasks WHERE risk_id = $1`,
    [riskId]
  );
  return Number(prog.rows[0]?.progress || 0);
}

function mapProgressToIncidentStatus(progress) {
  const p = Number(progress) || 0;
  if (p === 100) return 'resolved';
  if (p < 35) return 'investigating';
  if (p > 35 && p < 99) return 'in progress';
  return 'in progress';
}

async function logAudit(auditName, dept, status) {
  try {
    await auditsDb.query(
      `INSERT INTO audits (audit_name, dept_audited, auditor, audit_date, status)
       VALUES ($1, $2, $3, NOW(), $4)`,
      [auditName, dept || 'N/A', 'system', status || 'pending']
    );
  } catch (e) {
    console.error('Audit log failed', e);
  }
}

// GET all risks (with progress)
app.get('/api/risks', async (req, res) => {
  try {
    const result = await auditsDb.query(`
      SELECT
        r.risk_id AS id,
        r.risk_title,
        r.dept,
        r.review_date,
        COALESCE(
          ROUND(
            CASE WHEN SUM(rt.weight) > 0
              THEN SUM(CASE WHEN rt.done THEN rt.weight ELSE 0 END)::float / SUM(rt.weight) * 100
              ELSE 0 END
          ), 0
        ) AS progress,
        'on track' AS status
      FROM risks r
      LEFT JOIN risk_tasks rt ON r.risk_id = rt.risk_id
      GROUP BY r.risk_id
      ORDER BY r.review_date ASC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching risks:', error);
    res.status(500).json({ error: 'Failed to fetch risks.' });
  }
});

// GET a single risk with tasks
app.get('/api/risks/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const riskResult = await auditsDb.query(
      `SELECT risk_id AS id, risk_title, dept FROM risks WHERE risk_id = $1`,
      [id]
    );

    if (riskResult.rows.length === 0) {
      return res.status(404).json({ error: 'Risk not found' });
    }

    const risk = riskResult.rows[0];

    let taskResult = await auditsDb.query(
      `SELECT id, label, weight, done FROM risk_tasks WHERE risk_id = $1`,
      [id]
    );

    // Auto-seed tasks for risks inserted directly in DB with no tasks
    if (taskResult.rows.length === 0) {
      const seeds = defaultTasks(risk.risk_title);
      await auditsDb.query('BEGIN');
      try {
        for (const t of seeds) {
          await auditsDb.query(
            'INSERT INTO risk_tasks (risk_id, label, weight, done) VALUES ($1, $2, $3, $4)',
            [id, t.label, t.weight, t.done]
          );
        }
        await auditsDb.query('COMMIT');
      } catch (e) {
        try { await auditsDb.query('ROLLBACK'); } catch (_) {}
        throw e;
      }

      taskResult = await auditsDb.query(
        `SELECT id, label, weight, done FROM risk_tasks WHERE risk_id = $1`,
        [id]
      );
    }

    const tasks = taskResult.rows;

    const totalWeight = tasks.reduce((sum, t) => sum + t.weight, 0);
    const completedWeight = tasks.reduce((sum, t) => t.done ? sum + t.weight : sum, 0);
    const progress = totalWeight > 0 ? Math.round((completedWeight / totalWeight) * 100) : 0;

    res.json({ ...risk, tasks, progress });
  } catch (error) {
    console.error('Error fetching risk by ID:', error);
    res.status(500).json({ error: 'Failed to fetch risk.' });
  }
});

// POST create new risk with tasks (auto-seed if tasks missing)
app.post('/api/risks', async (req, res) => {
  const { risk_title, dept, review_date } = req.body;
  let { tasks } = req.body;

  try {
    await auditsDb.query('BEGIN');

    const insertRiskQuery = `
      INSERT INTO risks (risk_title, dept, review_date)
      VALUES ($1, $2, $3)
      RETURNING risk_id AS id
    `;
    const riskResult = await auditsDb.query(insertRiskQuery, [risk_title, dept, review_date]);
    const riskId = riskResult.rows[0].id;

    // If tasks were not provided or empty, seed defaults based on title
    if (!Array.isArray(tasks) || tasks.length === 0) {
      tasks = defaultTasks(risk_title);
    }

    const insertTaskQuery = `
      INSERT INTO risk_tasks (risk_id, label, weight, done)
      VALUES ($1, $2, $3, $4)
    `;
    for (const task of tasks) {
      const label = String(task.label || 'Task').slice(0, 200);
      const weight = Number.isFinite(task.weight) ? Math.max(0, Math.min(100, Number(task.weight))) : 0;
      const done = !!task.done;
      await auditsDb.query(insertTaskQuery, [riskId, label, weight, done]);
    }

    await auditsDb.query('COMMIT');

    // Log audit
    logAudit(`Risk created: ${risk_title}`, dept, 'pending');

    res.json({ success: true, id: riskId });
  } catch (error) {
    try { await auditsDb.query('ROLLBACK'); } catch (_) {}
    console.error('Error creating risk:', error);
    res.status(500).json({ error: 'Failed to create risk.' });
  }
});

// PUT update task completion (update only done flags, preserve labels/weights)
app.put('/api/risks/:id/tasks', async (req, res) => {
  const riskId = req.params.id;
  const { tasks } = req.body;

  if (!Array.isArray(tasks)) {
    return res.status(400).json({ error: 'Invalid tasks payload' });
  }

  try {
    await auditsDb.query('BEGIN');

    for (const t of tasks) {
      const taskId = t.id;
      const done = !!t.done;
      if (taskId == null) continue;
      await auditsDb.query(
        'UPDATE risk_tasks SET done = $3 WHERE risk_id = $1 AND id = $2',
        [riskId, taskId, done]
      );
    }

    // Recalculate progress to return for convenience
    const progress = await computeRiskProgress(riskId);

    await auditsDb.query('COMMIT');

    // Update related incidents' status if linked
    try {
      const derived = mapProgressToIncidentStatus(progress);
      await auditsDb.query('UPDATE incidents SET status = $2 WHERE risk_id = $1', [riskId, derived]);
      logAudit(`Risk progress updated (ID ${riskId}) -> ${progress}%`, null, derived === 'resolved' ? 'completed' : 'in progress');
    } catch (e) {
      console.error('Failed to sync incidents status', e);
    }

    res.json({ success: true, progress });
  } catch (err) {
    try { await auditsDb.query('ROLLBACK'); } catch (_) {}
    console.error('Error updating tasks:', err);
    res.status(500).json({ error: 'Failed to update tasks' });
  }
});

// DELETE risk and its tasks
app.delete('/api/risks/:id', async (req, res) => {
  const id = req.params.id;
  try {
    await auditsDb.query('DELETE FROM risk_tasks WHERE risk_id = $1', [id]); // deletes child records
    await auditsDb.query('DELETE FROM risks WHERE risk_id = $1', [id]);      // deletes parent record
    logAudit(`Risk deleted (ID ${id})`, null, 'completed');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete risk' });
  }
});

/* ============================================
   >>> INCIDENTS API <<<
   ============================================ */
app.get('/api/incidents', async (req, res) => {
  try {
    const rows = (await auditsDb.query('SELECT * FROM incidents ORDER BY date_reported DESC')).rows;
    // For each, compute derived status from risk progress if linked
    const enriched = [];
    for (const inc of rows) {
      let derived_status = inc.status;
      if (inc.risk_id) {
        const prog = await computeRiskProgress(inc.risk_id);
        derived_status = mapProgressToIncidentStatus(prog);
      }
      enriched.push({ ...inc, derived_status });
    }
    res.json(enriched);
  } catch (e) {
    console.error('Error fetching incidents', e);
    res.status(500).json({ error: 'Failed to fetch incidents' });
  }
});

app.post('/api/incidents', async (req, res) => {
  const { incident_type, date_reported, status, severity_level, risk_id } = req.body;
  try {
    const out = await auditsDb.query(
      `INSERT INTO incidents (incident_type, date_reported, status, severity_level, risk_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [incident_type, date_reported, status || 'investigating', severity_level, risk_id || null]
    );
    logAudit(`Incident reported: ${incident_type}`, null, 'pending');
    res.json(out.rows[0]);
  } catch (e) {
    console.error('Error creating incident', e);
    res.status(500).json({ error: 'Failed to create incident' });
  }
});

app.put('/api/incidents/:id', async (req, res) => {
  const { id } = req.params;
  const { incident_type, date_reported, status, severity_level, risk_id } = req.body;
  try {
    const out = await auditsDb.query(
      `UPDATE incidents SET incident_type=$2, date_reported=$3, status=$4, severity_level=$5, risk_id=$6
       WHERE incident_id=$1 RETURNING *`,
      [id, incident_type, date_reported, status, severity_level, risk_id || null]
    );
    logAudit(`Incident updated: ${incident_type || id}`, null, status || 'pending');
    res.json(out.rows[0]);
  } catch (e) {
    console.error('Error updating incident', e);
    res.status(500).json({ error: 'Failed to update incident' });
  }
});

app.delete('/api/incidents/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await auditsDb.query('DELETE FROM incidents WHERE incident_id=$1', [id]);
    logAudit(`Incident deleted: ${id}`, null, 'completed');
    res.json({ success: true });
  } catch (e) {
    console.error('Error deleting incident', e);
    res.status(500).json({ error: 'Failed to delete incident' });
  }
});

/* ============================================
   >>> DOCUMENTS API <<<
   ============================================ */
app.get('/api/documents', async (req, res) => {
  const { owner, status } = req.query;
  try {
    const clauses = [];
    const params = [];
    if (owner) { params.push(`%${owner}%`); clauses.push(`owner_dept ILIKE $${params.length}`); }
    if (status) { params.push(status); clauses.push(`approval_status = $${params.length}`); }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = (await auditsDb.query(`SELECT document_id, owner_dept, approval_status, last_review, document_approved, file_name FROM policy_documents ${where} ORDER BY document_id DESC`, params)).rows;
    res.json(rows);
  } catch (e) {
    console.error('Error fetching documents', e);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

app.post('/api/documents/upload', upload.single('file'), async (req, res) => {
  try {
    const { owner_dept, approval_status, last_review, document_approved } = req.body;
    const file = req.file;
    const out = await auditsDb.query(
      `INSERT INTO policy_documents (owner_dept, approval_status, last_review, document_approved, file_name, file_data)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING document_id`,
      [owner_dept, approval_status, last_review || null, String(document_approved) === 'true', file?.originalname || null, file?.buffer || null]
    );
    logAudit(`Document uploaded: ${file?.originalname || ''}`, owner_dept, approval_status);
    res.json({ success: true, document_id: out.rows[0].document_id });
  } catch (e) {
    console.error('Upload failed', e);
    res.status(500).json({ error: 'Upload failed' });
  }
});

app.get('/api/documents/:id/download', async (req, res) => {
  const { id } = req.params;
  try {
    const row = (await auditsDb.query('SELECT file_name, file_data FROM policy_documents WHERE document_id=$1', [id])).rows[0];
    if (!row || !row.file_data) return res.status(404).end();
    res.setHeader('Content-Disposition', `attachment; filename="${row.file_name || 'file'}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.send(row.file_data);
  } catch (e) {
    console.error('Download failed', e);
    res.status(500).end();
  }
});

app.get('/api/documents/:id/view', async (req, res) => {
  const { id } = req.params;
  try {
    const row = (await auditsDb.query('SELECT file_name, file_data FROM policy_documents WHERE document_id=$1', [id])).rows[0];
    if (!row || !row.file_data) return res.status(404).end();
    res.setHeader('Content-Type', 'application/octet-stream');
    res.send(row.file_data);
  } catch (e) {
    console.error('View failed', e);
    res.status(500).end();
  }
});

/* ============================================
   >>> REGULATIONS & DASHBOARD API <<<
   ============================================ */
app.get('/api/regulations', async (req, res) => {
  try {
    const rows = (await auditsDb.query('SELECT * FROM regulations ORDER BY regulation_id ASC')).rows;
    res.json(rows);
  } catch (e) {
    console.error('Error fetching regulations', e);
    res.status(500).json({ error: 'Failed to fetch regulations' });
  }
});

app.get('/api/dashboard/compliance-status', async (req, res) => {
  try {
    const rows = (await auditsDb.query('SELECT status FROM incidents')).rows;
    const counts = rows.reduce((acc, r) => { const s = String(r.status || '').toLowerCase(); acc[s] = (acc[s]||0)+1; return acc; }, {});
    const compliant = (counts['investigating'] || 0) + (counts['in progress'] || 0);
    const non_compliant = (counts['resolved'] || 0);
    res.json({ compliant, non_compliant });
  } catch (e) {
    console.error('Dashboard status failed', e);
    res.status(500).json({ error: 'Failed' });
  }
});

app.get('/api/dashboard/pending', async (req, res) => {
  try {
    const pending = [];
    // risks with progress < 100
    const risks = (await auditsDb.query(`
      SELECT r.risk_id AS id, r.risk_title, r.dept, r.review_date,
        COALESCE(ROUND(CASE WHEN SUM(rt.weight)>0 THEN SUM(CASE WHEN rt.done THEN rt.weight ELSE 0 END)::float / SUM(rt.weight) * 100 ELSE 0 END),0) AS progress
      FROM risks r LEFT JOIN risk_tasks rt ON r.risk_id=rt.risk_id GROUP BY r.risk_id`)).rows;
    risks.filter(r => Number(r.progress) < 100).forEach(r => {
      pending.push({ type: 'risk', title: r.risk_title, dueDate: r.review_date, progress: r.progress });
    });
    // documents not approved/validated
    const docs = (await auditsDb.query('SELECT * FROM policy_documents')).rows;
    docs.filter(d => !d.document_approved || (String(d.approval_status||'').toLowerCase() !== 'approved')).forEach(d => {
      pending.push({ type: 'document', title: d.file_name || d.owner_dept, dueDate: d.last_review || null, status: d.approval_status });
    });
    // incidents not resolved
    const incs = (await auditsDb.query('SELECT * FROM incidents')).rows;
    incs.filter(i => String(i.status||'').toLowerCase() !== 'resolved').forEach(i => {
      pending.push({ type: 'incident', title: i.incident_type, dueDate: i.date_reported, status: i.status });
    });
    // audits not completed
    const auds = (await auditsDb.query('SELECT * FROM audits')).rows;
    auds.filter(a => String(a.status||'').toLowerCase() !== 'completed').forEach(a => {
      pending.push({ type: 'audit', title: a.audit_name, dueDate: a.audit_date, status: a.status });
    });
    res.json(pending.slice(0, 20));
  } catch (e) {
    console.error('Pending failed', e);
    res.status(500).json({ error: 'Failed' });
  }
});

/* ============================================
   >>> SERVER START <<<
   ============================================ */
app.listen(3000, () => {
  console.log('🚀 Server running on http://localhost:3000');
});


