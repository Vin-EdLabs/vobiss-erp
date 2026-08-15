import pool from '../db.js';

async function ensureTodosTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_todos (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      text TEXT NOT NULL,
      completed BOOLEAN DEFAULT false,
      reminder_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
}

const ready = ensureTodosTable().catch((err) => {
  console.error('[todos] failed to ensure user_todos table:', err.message);
});

const userId = (req) => req.user?.id;

async function listTodos(req, res) {
  try {
    await ready;
    const uid = userId(req);
    const { rows } = await pool.query(
      `SELECT id, user_id, text, completed, reminder_at, created_at, updated_at
       FROM user_todos
       WHERE user_id = $1
       ORDER BY completed ASC, created_at DESC`,
      [uid]
    );
    res.json(rows);
  } catch (err) {
    console.error('[todos] list error:', err);
    res.status(500).json({ error: 'Failed to load to-dos' });
  }
}

async function createTodo(req, res) {
  try {
    await ready;
    const uid = userId(req);
    const text = String(req.body?.text || '').trim();
    if (!text) return res.status(400).json({ error: 'Task text is required' });
    const reminder_at = req.body?.reminder_at || null;
    const { rows } = await pool.query(
      `INSERT INTO user_todos (user_id, text, reminder_at)
       VALUES ($1, $2, $3)
       RETURNING id, user_id, text, completed, reminder_at, created_at, updated_at`,
      [uid, text, reminder_at]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[todos] create error:', err);
    res.status(500).json({ error: 'Failed to create to-do' });
  }
}

async function updateTodo(req, res) {
  try {
    await ready;
    const uid = userId(req);
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });

    const existing = await pool.query(
      'SELECT id FROM user_todos WHERE id = $1 AND user_id = $2',
      [id, uid]
    );
    if (!existing.rows[0]) return res.status(404).json({ error: 'To-do not found' });

    const fields = [];
    const values = [];
    let i = 1;
    if (req.body?.text !== undefined) {
      const text = String(req.body.text || '').trim();
      if (!text) return res.status(400).json({ error: 'Task text is required' });
      fields.push(`text = $${i++}`);
      values.push(text);
    }
    if (req.body?.completed !== undefined) {
      fields.push(`completed = $${i++}`);
      values.push(Boolean(req.body.completed));
    }
    if (req.body?.reminder_at !== undefined) {
      fields.push(`reminder_at = $${i++}`);
      values.push(req.body.reminder_at || null);
    }
    if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });
    fields.push('updated_at = NOW()');
    values.push(id, uid);

    const { rows } = await pool.query(
      `UPDATE user_todos SET ${fields.join(', ')}
       WHERE id = $${i++} AND user_id = $${i}
       RETURNING id, user_id, text, completed, reminder_at, created_at, updated_at`,
      values
    );
    res.json(rows[0]);
  } catch (err) {
    console.error('[todos] update error:', err);
    res.status(500).json({ error: 'Failed to update to-do' });
  }
}

async function deleteTodo(req, res) {
  try {
    await ready;
    const uid = userId(req);
    const id = Number(req.params.id);
    const result = await pool.query(
      'DELETE FROM user_todos WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, uid]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'To-do not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[todos] delete error:', err);
    res.status(500).json({ error: 'Failed to delete to-do' });
  }
}

export function registerTodoRoutes(app, auth) {
  app.get('/api/todos', auth, listTodos);
  app.post('/api/todos', auth, createTodo);
  app.patch('/api/todos/:id', auth, updateTodo);
  app.delete('/api/todos/:id', auth, deleteTodo);
}
