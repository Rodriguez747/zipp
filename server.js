/* ============================================
   >>> INITIAL SETUP & MIDDLEWARES <<<
   ============================================ */
const express = require('express');
const bodyParser = require('body-parser');
const { Client } = require('pg');
const cors = require('cors');

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

auditsDb.connect()
  .then(() => console.log('✅ Connected to AUDITS database'))
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

// Default task seeds mirrored from frontend logic
function defaultTasks(riskName) {
  const name = String(riskName || '').toLowerCase();
  const cryptoRandomId = () => 'r_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

  if (/gdpr violation/i.test(name)) {
    return [
      { label: 'Assess data exposure', weight: 20, done: false },
      { label: 'Notify DPO and legal', weight: 15, done: false },
      { label: 'Report to authorities', weight: 15, done: false },
      { label: 'Notify affected individuals', weight: 15, done: false },
      { label: 'Remediate breach', weight: 20, done: false },
      { label: 'Review policies & train staff', weight: 15, done: false }
    ];
  }
  if (/data breach/i.test(name)) {
    return [
      { label: 'Isolate affected systems', weight: 20, done: false },
      { label: 'Investigate breach source', weight: 20, done: false },
      { label: 'Notify IT/security team', weight: 15, done: false },
      { label: 'Patch vulnerabilities', weight: 15, done: false },
      { label: 'Communicate with stakeholders', weight: 15, done: false },
      { label: 'Document and report', weight: 15, done: false }
    ];
  }
  if (/product contamination/i.test(name)) {
    return [
      { label: 'Quarantine affected products', weight: 20, done: false },
      { label: 'Notify quality assurance', weight: 15, done: false },
      { label: 'Conduct root cause analysis', weight: 20, done: false },
      { label: 'Recall products if needed', weight: 20, done: false },
      { label: 'Remediate contamination', weight: 15, done: false },
      { label: 'Review and update SOPs', weight: 10, done: false }
    ];
  }
  if (/labeling error|mislabeling/i.test(name)) {
    return [
      { label: 'Identify mislabeled products', weight: 20, done: false },
      { label: 'Notify regulatory team', weight: 15, done: false },
      { label: 'Correct labeling', weight: 20, done: false },
      { label: 'Recall if distributed', weight: 20, done: false },
      { label: 'Communicate with customers', weight: 15, done: false },
      { label: 'Review labeling process', weight: 10, done: false }
    ];
  }
  if (/safety hazard - workplace/i.test(name)) {
    return [
      { label: 'Isolate hazard area', weight: 20, done: false },
      { label: 'Notify safety officer', weight: 15, done: false },
      { label: 'Investigate root cause', weight: 20, done: false },
      { label: 'Remediate hazard', weight: 20, done: false },
      { label: 'Conduct safety training', weight: 15, done: false },
      { label: 'Update safety protocols', weight: 10, done: false }
    ];
  }
  if (/adverse customer reaction/i.test(name)) {
    return [
      { label: 'Document incident', weight: 20, done: false },
      { label: 'Notify customer service', weight: 15, done: false },
      { label: 'Investigate cause', weight: 20, done: false },
      { label: 'Provide remedy to customer', weight: 20, done: false },
      { label: 'Review product/process', weight: 15, done: false },
      { label: 'Report to management', weight: 10, done: false }
    ];
  }
  if (/fraud|misconduct/i.test(name)) {
    return [
      { label: 'Suspend involved parties', weight: 20, done: false },
      { label: 'Notify compliance/legal', weight: 15, done: false },
      { label: 'Conduct investigation', weight: 20, done: false },
      { label: 'Document findings', weight: 15, done: false },
      { label: 'Implement corrective actions', weight: 20, done: false },
      { label: 'Review controls', weight: 10, done: false }
    ];
  }
  if (/policy violation/i.test(name)) {
    return [
      { label: 'Document violation', weight: 20, done: false },
      { label: 'Notify HR/compliance', weight: 15, done: false },
      { label: 'Investigate incident', weight: 20, done: false },
      { label: 'Counsel involved parties', weight: 20, done: false },
      { label: 'Implement corrective actions', weight: 15, done: false },
      { label: 'Review and update policy', weight: 10, done: false }
    ];
  }
  if (/system failure|downtime/i.test(name)) {
    return [
      { label: 'Notify IT support', weight: 20, done: false },
      { label: 'Diagnose failure', weight: 20, done: false },
      { label: 'Restore system', weight: 20, done: false },
      { label: 'Communicate outage', weight: 15, done: false },
      { label: 'Review incident', weight: 15, done: false },
      { label: 'Update recovery plan', weight: 10, done: false }
    ];
  }
  if (/inventory loss|theft/i.test(name)) {
    return [
      { label: 'Secure area', weight: 20, done: false },
      { label: 'Notify security', weight: 15, done: false },
      { label: 'Investigate loss', weight: 20, done: false },
      { label: 'Document incident', weight: 15, done: false },
      { label: 'Report to authorities', weight: 20, done: false },
      { label: 'Review inventory controls', weight: 10, done: false }
    ];
  }
  if (/supplier non-compliance/i.test(name)) {
    return [
      { label: 'Notify procurement', weight: 20, done: false },
      { label: 'Assess impact', weight: 20, done: false },
      { label: 'Engage supplier', weight: 20, done: false },
      { label: 'Document non-compliance', weight: 15, done: false },
      { label: 'Implement contingency', weight: 15, done: false },
      { label: 'Review supplier agreements', weight: 10, done: false }
    ];
  }
  if (/budget|overrun/i.test(name)) {
    return [
      { label: 'Baseline current spend', weight: 15, done: false },
      { label: 'Negotiate vendor discounts', weight: 20, done: false },
      { label: 'Freeze nonessential purchases', weight: 15, done: false },
      { label: 'Weekly cost variance review', weight: 15, done: false },
      { label: 'Automate spend alerts', weight: 15, done: false },
      { label: 'Reforecast budget with stakeholders', weight: 20, done: false }
    ];
  }
  if (/breach/i.test(name)) {
    return [
      { label: 'Enable MFA for all privileged accounts', weight: 20, done: false },
      { label: 'Patch critical systems', weight: 20, done: false },
      { label: 'Encrypt sensitive data at rest', weight: 15, done: false },
      { label: 'Implement IDS/IPS monitoring', weight: 15, done: false },
      { label: 'Employee security awareness training', weight: 10, done: false },
      { label: 'Backup and disaster recovery test', weight: 20, done: false }
    ];
  }
  return [
    { label: 'Define mitigation plan', weight: 20, done: false },
    { label: 'Assign owner(s)', weight: 10, done: false },
    { label: 'Identify key milestones', weight: 15, done: false },
    { label: 'Execute main mitigation tasks', weight: 35, done: false },
    { label: 'Validate outcomes', weight: 10, done: false },
    { label: 'Close-out and document', weight: 10, done: false }
  ];
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
      `SELECT risk_id AS id, risk_title FROM risks WHERE risk_id = $1`,
      [id]
    );

    const taskResult = await auditsDb.query(
      `SELECT id, label, weight, done FROM risk_tasks WHERE risk_id = $1`,
      [id]
    );

    const risk = riskResult.rows[0];
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

// POST create new risk with tasks
app.post('/api/risks', async (req, res) => {
  const { risk_title, dept, review_date } = req.body;
  let { tasks } = req.body;

  try {
    const insertRiskQuery = `
      INSERT INTO risks (risk_title, dept, review_date)
      VALUES ($1, $2, $3)
      RETURNING risk_id AS id
    `;
    const riskResult = await auditsDb.query(insertRiskQuery, [risk_title, dept, review_date]);
    const riskId = riskResult.rows[0].id;

    // If no tasks were provided, seed defaults based on the risk title
    if (!Array.isArray(tasks) || tasks.length === 0) {
      tasks = defaultTasks(risk_title);
    }

    const insertTaskQuery = `
      INSERT INTO risk_tasks (risk_id, label, weight, done)
      VALUES ($1, $2, $3, $4)
    `;
    for (const task of tasks) {
      await auditsDb.query(insertTaskQuery, [riskId, task.label, task.weight, !!task.done]);
    }

    res.json({ success: true, id: riskId });
  } catch (error) {
    console.error('Error creating risk:', error);
    res.status(500).json({ error: 'Failed to create risk.' });
  }
});

// PUT update task completion
app.put('/api/risks/:id/tasks', async (req, res) => {
  const riskId = req.params.id;
  const { tasks } = req.body;

  try {
    // Begin transaction to ensure consistency
    await auditsDb.query('BEGIN');

    // Update only the done flags for the specified tasks
    if (Array.isArray(tasks)) {
      for (const t of tasks) {
        // Accept boolean or truthy/falsy values
        const done = !!t.done;
        const taskId = t.id;
        if (taskId == null) continue;
        await auditsDb.query(
          'UPDATE risk_tasks SET done = $1 WHERE risk_id = $2 AND id = $3',
          [done, riskId, taskId]
        );
      }
    }

    // Recalculate progress for response
    const progRes = await auditsDb.query(
      `SELECT
         COALESCE(
           ROUND(
             CASE WHEN SUM(weight) > 0
               THEN SUM(CASE WHEN done THEN weight ELSE 0 END)::float / SUM(weight) * 100
               ELSE 0 END
           ), 0
         ) AS progress
       FROM risk_tasks
       WHERE risk_id = $1`,
      [riskId]
    );

    await auditsDb.query('COMMIT');

    res.json({ success: true, progress: progRes.rows[0]?.progress ?? 0 });
  } catch (err) {
    await auditsDb.query('ROLLBACK');
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
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete risk' });
  }
});


/* ============================================
   >>> SERVER START <<<
   ============================================ */
app.listen(3000, () => {
  console.log('🚀 Server running on http://localhost:3000');
});


