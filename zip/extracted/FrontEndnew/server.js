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

// GET all risks (basic list for table)
app.get('/api/risks', async (req, res) => {
  try {
    const result = await auditsDb.query(`
      SELECT 
        r.risk_id AS id,
        r.risk_title,
        r.dept,
        r.review_date,
        COALESCE(
          (
            CASE WHEN tc.total_count > 0 
                 THEN ROUND((COALESCE(dc.done_count, 0)::numeric / tc.total_count::numeric) * 100)
                 ELSE 0
            END
          )::int, 0
        ) AS progress,
        CASE
          WHEN (
            CASE WHEN tc.total_count > 0 
                 THEN ROUND((COALESCE(dc.done_count, 0)::numeric / tc.total_count::numeric) * 100)
                 ELSE 0
            END
          ) >= 80 THEN 'Ahead'
          WHEN (
            CASE WHEN tc.total_count > 0 
                 THEN ROUND((COALESCE(dc.done_count, 0)::numeric / tc.total_count::numeric) * 100)
                 ELSE 0
            END
          ) <= 30 THEN 'At risk'
          ELSE 'on track'
        END AS status
      FROM risks r
      LEFT JOIN (
        SELECT risk_id, COUNT(*) AS total_count
        FROM risk_tasks
        GROUP BY risk_id
      ) tc ON tc.risk_id = r.risk_id
      LEFT JOIN (
        SELECT risk_id, COUNT(*) AS done_count
        FROM risk_tasks
        WHERE done = true
        GROUP BY risk_id
      ) dc ON dc.risk_id = r.risk_id
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

    const totalCount = tasks.length;
    const doneCount = tasks.filter(t => t.done).length;
    const progress = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

    res.json({ ...risk, tasks, progress });
  } catch (error) {
    console.error('Error fetching risk by ID:', error);
    res.status(500).json({ error: 'Failed to fetch risk.' });
  }
});

// POST create new risk with tasks
app.post('/api/risks', async (req, res) => {
  const { risk_title, dept, review_date, tasks } = req.body;

  // Fallback defaults for missing columns
  const risk_level = req.body.risk_level || 'Low';
  const risk_owner = req.body.risk_owner || dept;

  try {
    const insertRiskQuery = `
      INSERT INTO risks (risk_title, dept, risk_level, review_date, risk_owner)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING risk_id AS id
    `;
    const riskResult = await auditsDb.query(insertRiskQuery, [
      risk_title,
      dept,
      risk_level,
      review_date,
      risk_owner
    ]);
    const riskId = riskResult.rows[0].id;

    const insertTaskQuery = `
      INSERT INTO risk_tasks (risk_id, label, weight, done)
      VALUES ($1, $2, $3, $4)
    `;
    for (const task of tasks) {
      await auditsDb.query(insertTaskQuery, [riskId, task.label, task.weight, task.done]);
    }

    res.json({ success: true, id: riskId });
  } catch (error) {
    console.error('Error creating risk:', error);
    res.status(500).json({ error: 'Failed to create risk.' });
  }
});


// PUT update task completion
app.put('/api/risks/:id/tasks', async (req, res) => {
  const { id } = req.params;
  const { tasks } = req.body;

  try {
    const updateQuery = `
      UPDATE risk_tasks
      SET done = $1
      WHERE id = $2 AND risk_id = $3
    `;

    for (const task of tasks) {
      await auditsDb.query(updateQuery, [task.done, task.id, id]);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating tasks:', error);
    res.status(500).json({ error: 'Failed to update tasks.' });
  }
});


/* ============================================
   >>> SERVER START <<<
   ============================================ */
app.listen(3000, () => {
  console.log('🚀 Server running on http://localhost:3000');
});
