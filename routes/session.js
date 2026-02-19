const express = require("express");
const router = express.Router();
const { auth } = require("../middleware/auth");
const { pool } = require("../lib/db");

// ---
// START NEW SESSION
// ---
router.post("/session/start", auth(true), async (req, res) => {
  const userId = req.user?.id;
  const { plan_name } = req.body;

  try {
    // Check for existing in-progress session
    const [existing] = await pool.promise().query(
      "SELECT id FROM workout_sessions WHERE user_id = ? AND status = 'in_progress'",
      [userId]
    );

    if (existing.length > 0) {
  const sessionId = existing[0].id;
  const [activities] = await pool.promise().query(
    "SELECT * FROM workout_activities WHERE session_id = ? ORDER BY start_time ASC",
    [sessionId]
  );

  if (activities.length === 0) {
     await pool.promise().query(
      `INSERT INTO workout_activities (session_id, user_id, activity_type, start_time, is_active) 
       VALUES (?, ?, 'preparation', NOW(), TRUE)`,
      [sessionId, userId]
    );
    const [refetched] = await pool.promise().query(
      "SELECT * FROM workout_activities WHERE session_id = ? ORDER BY start_time ASC",
      [sessionId]
    );
    return res.json({ ok: true, session_id: sessionId, resumed: true, activities: refetched });
  }

  return res.json({ ok: true, session_id: sessionId, resumed: true, activities });
}

    // Create new session
    const [result] = await pool.promise().query(
      "INSERT INTO workout_sessions (user_id, plan_name, started_at) VALUES (?, ?, NOW())",
      [userId, plan_name || null]
    );
    const sessionId = result.insertId;

    // Auto-start preparation phase
    await pool.promise().query(
      `INSERT INTO workout_activities (session_id, user_id, activity_type, start_time, is_active) 
       VALUES (?, ?, 'preparation', NOW(), TRUE)`,
      [sessionId, userId]
    );

    res.json({ 
      ok: true, 
      session_id: sessionId, 
      resumed: false,
      message: "Session started with preparation phase" 
    });

  } catch (error) {
    console.error("Error starting session:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// ---
// GET CURRENT SESSION STATE (for resuming after app restart)
// ---
router.get("/session/current", auth(true), async (req, res) => {
  const userId = req.user?.id;

  try {
    const [sessions] = await pool.promise().query(
      `SELECT * FROM workout_sessions WHERE user_id = ? AND status = 'in_progress' LIMIT 1`,
      [userId]
    );

    if (sessions.length === 0) {
      return res.json({ active: false });
    }

    const session = sessions[0];
    const [activities] = await pool.promise().query(
      "SELECT * FROM workout_activities WHERE session_id = ? ORDER BY start_time ASC",
      [session.id]
    );

    // Calculate elapsed time for active activity
    const activeActivity = activities.find(a => a.is_active);
    let elapsed_seconds = 0;
    if (activeActivity) {
      const startTime = new Date(activeActivity.start_time);
      elapsed_seconds = Math.floor((Date.now() - startTime.getTime()) / 1000);
    }

    res.json({
      active: true,
      session: {
        id: session.id,
        plan_name: session.plan_name,
        started_at: session.started_at,
        status: session.status
      },
      activities: activities.map(a => ({
        ...a,
        // Recalculate duration for active activity
        duration_seconds: a.is_active 
          ? Math.floor((Date.now() - new Date(a.start_time).getTime()) / 1000)
          : a.duration_seconds
      })),
      current_activity: activeActivity ? {
        type: activeActivity.activity_type,
        started_at: activeActivity.start_time,
        elapsed_seconds
      } : null
    });

  } catch (error) {
    console.error("Error getting current session:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// ---
// TRANSITION TO NEXT PHASE
// ---
router.post("/session/transition", auth(true), async (req, res) => {
  const userId = req.user?.id;
  const { session_id, next_type, metadata } = req.body;

  if (!session_id || !next_type) {
    return res.status(400).json({ error: "session_id and next_type required" });
  }

  const validTypes = ['preparation', 'training', 'rest', 'cooldown'];
  if (!validTypes.includes(next_type)) {
    return res.status(400).json({ error: "Invalid activity type" });
  }

  let connection;
  try {
    connection = await pool.promise().getConnection();
    await connection.beginTransaction();

    // End current active activity
    await connection.query(
      `UPDATE workout_activities 
       SET is_active = FALSE, 
           end_time = NOW(),
           duration_seconds = TIMESTAMPDIFF(SECOND, start_time, NOW())
       WHERE session_id = ? AND user_id = ? AND is_active = TRUE`,
      [session_id, userId]
    );

    // Start new activity
    await connection.query(
      `INSERT INTO workout_activities (session_id, user_id, activity_type, start_time, is_active, metadata) 
       VALUES (?, ?, ?, NOW(), TRUE, ?)`,
      [session_id, userId, next_type, metadata ? JSON.stringify(metadata) : null]
    );

    await connection.commit();

    // Get updated activities
    const [activities] = await connection.query(
      "SELECT * FROM workout_activities WHERE session_id = ? ORDER BY start_time ASC",
      [session_id]
    );

    res.json({ 
      ok: true, 
      message: `Transitioned to ${next_type}`,
      activities 
    });

  } catch (error) {
    if (connection) await connection.rollback();
    console.error("Error transitioning phase:", error);
    res.status(500).json({ error: "Server error" });
  } finally {
    if (connection) connection.release();
  }
});

// ---
// START EXERCISE SET (granular tracking per exercise and set)
// ---
router.post("/session/set/start", auth(true), async (req, res) => {
  const userId = req.user?.id;
  const { session_id, exercise_code, exercise_name, set_number } = req.body;

  if (!session_id || !exercise_code || !set_number) {
    return res.status(400).json({ error: "session_id, exercise_code, and set_number required" });
  }

  let connection;
  try {
    connection = await pool.promise().getConnection();
    await connection.beginTransaction();

    // End any current active activity (rest or previous set)
    await connection.query(
      `UPDATE workout_activities 
       SET is_active = FALSE, 
           end_time = NOW(),
           duration_seconds = TIMESTAMPDIFF(SECOND, start_time, NOW())
       WHERE session_id = ? AND user_id = ? AND is_active = TRUE`,
      [session_id, userId]
    );

    // Start new set as training activity
    const metadata = JSON.stringify({
      exercise_code,
      exercise_name: exercise_name || exercise_code,
      set_number
    });

    await connection.query(
      `INSERT INTO workout_activities (session_id, user_id, activity_type, start_time, is_active, metadata) 
       VALUES (?, ?, 'training', NOW(), TRUE, ?)`,
      [session_id, userId, metadata]
    );

    await connection.commit();

    res.json({ 
      ok: true, 
      message: `Started set ${set_number} of ${exercise_code}`
    });

  } catch (error) {
    if (connection) await connection.rollback();
    console.error("Error starting set:", error);
    res.status(500).json({ error: "Server error" });
  } finally {
    if (connection) connection.release();
  }
});

// ---
// END SET AND START REST
// ---
router.post("/session/set/end", auth(true), async (req, res) => {
  const userId = req.user?.id;
  const { session_id, reps, weight, start_rest } = req.body;

  if (!session_id) {
    return res.status(400).json({ error: "session_id required" });
  }

  let connection;
  try {
    connection = await pool.promise().getConnection();
    await connection.beginTransaction();

    // Get current active set info before ending
    const [currentSet] = await connection.query(
      `SELECT id, metadata FROM workout_activities 
       WHERE session_id = ? AND user_id = ? AND is_active = TRUE AND activity_type = 'training'`,
      [session_id, userId]
    );

    // Update metadata with reps/weight if provided
    if (currentSet.length > 0 && (reps || weight)) {
      let metadata = {};
      try {
        metadata = JSON.parse(currentSet[0].metadata || '{}');
      } catch (e) {}
      metadata.reps = reps;
      metadata.weight = weight;

      await connection.query(
        `UPDATE workout_activities SET metadata = ? WHERE id = ?`,
        [JSON.stringify(metadata), currentSet[0].id]
      );
    }

    // End current set
    await connection.query(
      `UPDATE workout_activities 
       SET is_active = FALSE, 
           end_time = NOW(),
           duration_seconds = TIMESTAMPDIFF(SECOND, start_time, NOW())
       WHERE session_id = ? AND user_id = ? AND is_active = TRUE`,
      [session_id, userId]
    );

    // Start rest period if requested
    if (start_rest !== false) {
      const restMetadata = currentSet.length > 0 ? JSON.stringify({
        after_exercise: JSON.parse(currentSet[0].metadata || '{}').exercise_code,
        after_set: JSON.parse(currentSet[0].metadata || '{}').set_number
      }) : null;

      await connection.query(
        `INSERT INTO workout_activities (session_id, user_id, activity_type, start_time, is_active, metadata) 
         VALUES (?, ?, 'rest', NOW(), TRUE, ?)`,
        [session_id, userId, restMetadata]
      );
    }

    await connection.commit();

    res.json({ ok: true, message: "Set completed" });

  } catch (error) {
    if (connection) await connection.rollback();
    console.error("Error ending set:", error);
    res.status(500).json({ error: "Server error" });
  } finally {
    if (connection) connection.release();
  }
});

// ---
// GET EXERCISE STATS (time per exercise)
// ---
router.get("/session/exercise-stats", auth(true), async (req, res) => {
  const userId = req.user?.id;
  const { period } = req.query;

  try {
    let dateFilter = "";
    if (period === 'week') {
      dateFilter = "AND start_time >= DATE_SUB(NOW(), INTERVAL 7 DAY)";
    } else if (period === 'month') {
      dateFilter = "AND start_time >= DATE_SUB(NOW(), INTERVAL 30 DAY)";
    }

    // Get all training activities with exercise metadata
    const [activities] = await pool.promise().query(
      `SELECT metadata, duration_seconds FROM workout_activities 
       WHERE user_id = ? AND activity_type = 'training' AND end_time IS NOT NULL ${dateFilter}`,
      [userId]
    );

    // Aggregate by exercise
    const exerciseStats = {};
    activities.forEach(a => {
      try {
        const meta = JSON.parse(a.metadata || '{}');
        if (meta.exercise_code) {
          if (!exerciseStats[meta.exercise_code]) {
            exerciseStats[meta.exercise_code] = {
              name: meta.exercise_name || meta.exercise_code,
              total_time: 0,
              set_count: 0,
              sets: []
            };
          }
          exerciseStats[meta.exercise_code].total_time += a.duration_seconds || 0;
          exerciseStats[meta.exercise_code].set_count++;
          exerciseStats[meta.exercise_code].sets.push({
            set_number: meta.set_number,
            duration: a.duration_seconds,
            reps: meta.reps,
            weight: meta.weight
          });
        }
      } catch (e) {}
    });

    res.json({
      period: period || 'all',
      exercises: exerciseStats
    });

  } catch (error) {
    console.error("Error getting exercise stats:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// ---
// END SESSION (complete workout)
// ---
router.post("/session/end", auth(true), async (req, res) => {
  const userId = req.user?.id;
  const { session_id, exercises } = req.body;

  if (!session_id) {
    return res.status(400).json({ error: "session_id required" });
  }

  let connection;
  try {
    connection = await pool.promise().getConnection();
    await connection.beginTransaction();

    // End any active activity
    await connection.query(
      `UPDATE workout_activities 
       SET is_active = FALSE, 
           end_time = NOW(),
           duration_seconds = TIMESTAMPDIFF(SECOND, start_time, NOW())
       WHERE session_id = ? AND user_id = ? AND is_active = TRUE`,
      [session_id, userId]
    );

    // Calculate total duration
    const [durationResult] = await connection.query(
      `SELECT SUM(duration_seconds) as total FROM workout_activities WHERE session_id = ?`,
      [session_id]
    );
    const totalDuration = durationResult[0]?.total || 0;

    // Update session
    await connection.query(
      `UPDATE workout_sessions 
       SET status = 'completed', 
           completed_at = NOW(),
           total_duration_seconds = ?
       WHERE id = ? AND user_id = ?`,
      [totalDuration, session_id, userId]
    );

    // If exercises data provided, save to workout_logs for compatibility
    if (exercises && Array.isArray(exercises) && exercises.length > 0) {
      // Get session info
      const [sessionInfo] = await connection.query(
        "SELECT plan_name FROM workout_sessions WHERE id = ?",
        [session_id]
      );
      const planName = sessionInfo[0]?.plan_name || "Trening";

      // Get training duration
      const [trainingDur] = await connection.query(
        `SELECT SUM(duration_seconds) as training_time FROM workout_activities 
         WHERE session_id = ? AND activity_type = 'training'`,
        [session_id]
      );

      // Get rest duration
      const [restDur] = await connection.query(
        `SELECT SUM(duration_seconds) as rest_time FROM workout_activities 
         WHERE session_id = ? AND activity_type IN ('rest', 'preparation')`,
        [session_id]
      );

      // Insert into workout_logs
      const [logResult] = await connection.query(
        `INSERT INTO workout_logs (user_id, plan_name, date_completed, duration_seconds, rest_time_seconds) 
         VALUES (?, ?, NOW(), ?, ?)`,
        [userId, planName, trainingDur[0]?.training_time || 0, restDur[0]?.rest_time || 0]
      );
      const logId = logResult.insertId;

      // Insert sets
      const setsToInsert = [];
      for (const ex of exercises) {
        if (!ex.sets || !Array.isArray(ex.sets)) continue;
        ex.sets.forEach((set, index) => {
          setsToInsert.push([logId, userId, ex.code || "UNKNOWN", index + 1, parseInt(set.reps) || 0, parseFloat(set.weight) || 0]);
        });
      }

      if (setsToInsert.length > 0) {
        await connection.query(
          "INSERT INTO workout_log_sets (workout_log_id, user_id, exercise_code, set_number, reps, weight) VALUES ?",
          [setsToInsert]
        );
      }
    }

    await connection.commit();

    // Get final summary
    const [activities] = await connection.query(
      "SELECT activity_type, SUM(duration_seconds) as total_seconds FROM workout_activities WHERE session_id = ? GROUP BY activity_type",
      [session_id]
    );

    const summary = {};
    activities.forEach(a => {
      summary[a.activity_type] = a.total_seconds;
    });

    res.json({ 
      ok: true, 
      message: "Workout completed!",
      summary: {
        total_duration: totalDuration,
        breakdown: summary
      }
    });

  } catch (error) {
    if (connection) await connection.rollback();
    console.error("Error ending session:", error);
    res.status(500).json({ error: "Server error" });
  } finally {
    if (connection) connection.release();
  }
});

// ---
// ABANDON SESSION
// ---
router.post("/session/abandon", auth(true), async (req, res) => {
  const userId = req.user?.id;
  const { session_id } = req.body;

  try {
    await pool.promise().query(
      `UPDATE workout_sessions SET status = 'abandoned', completed_at = NOW() 
       WHERE id = ? AND user_id = ?`,
      [session_id, userId]
    );

    await pool.promise().query(
      `UPDATE workout_activities 
       SET is_active = FALSE, end_time = NOW(),
           duration_seconds = TIMESTAMPDIFF(SECOND, start_time, NOW())
       WHERE session_id = ? AND is_active = TRUE`,
      [session_id]
    );

    res.json({ ok: true, message: "Session abandoned" });

  } catch (error) {
    console.error("Error abandoning session:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// ---
// GET WORKOUT STATISTICS
// ---
router.get("/session/stats", auth(true), async (req, res) => {
  const userId = req.user?.id;
  const { period } = req.query; // 'week', 'month', 'all'

  try {
    let dateFilter = "";
    if (period === 'week') {
      dateFilter = "AND start_time >= DATE_SUB(NOW(), INTERVAL 7 DAY)";
    } else if (period === 'month') {
      dateFilter = "AND start_time >= DATE_SUB(NOW(), INTERVAL 30 DAY)";
    }

    // Activity breakdown
    const [breakdown] = await pool.promise().query(
      `SELECT 
        activity_type,
        SUM(duration_seconds) as total_seconds,
        COUNT(*) as count
       FROM workout_activities 
       WHERE user_id = ? AND end_time IS NOT NULL ${dateFilter}
       GROUP BY activity_type`,
      [userId]
    );

    // Daily averages
    const [dailyStats] = await pool.promise().query(
      `SELECT 
        DATE(start_time) as date,
        activity_type,
        SUM(duration_seconds) as total_seconds
       FROM workout_activities 
       WHERE user_id = ? AND end_time IS NOT NULL ${dateFilter}
       GROUP BY DATE(start_time), activity_type
       ORDER BY date DESC
       LIMIT 30`,
      [userId]
    );

    // Session count
    const [sessionCount] = await pool.promise().query(
      `SELECT COUNT(*) as count FROM workout_sessions 
       WHERE user_id = ? AND status = 'completed' ${dateFilter.replace('start_time', 'started_at')}`,
      [userId]
    );

    // Calculate totals
    const totals = { preparation: 0, training: 0, rest: 0, cooldown: 0 };
    breakdown.forEach(b => {
      totals[b.activity_type] = b.total_seconds || 0;
    });

    const grandTotal = Object.values(totals).reduce((a, b) => a + b, 0);

    res.json({
      period: period || 'all',
      summary: {
        total_sessions: sessionCount[0]?.count || 0,
        total_time_seconds: grandTotal,
        breakdown: totals,
        percentages: {
          preparation: grandTotal > 0 ? Math.round((totals.preparation / grandTotal) * 100) : 0,
          training: grandTotal > 0 ? Math.round((totals.training / grandTotal) * 100) : 0,
          rest: grandTotal > 0 ? Math.round((totals.rest / grandTotal) * 100) : 0,
          cooldown: grandTotal > 0 ? Math.round((totals.cooldown / grandTotal) * 100) : 0,
        }
      },
      daily: dailyStats
    });

  } catch (error) {
    console.error("Error getting stats:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// ---
// HEARTBEAT - keep session alive (call every 30s from app)
// ---
router.post("/session/heartbeat", auth(true), async (req, res) => {
  const userId = req.user?.id;
  const { session_id } = req.body;

  try {
    // Just verify session exists and is active
    const [sessions] = await pool.promise().query(
      "SELECT id FROM workout_sessions WHERE id = ? AND user_id = ? AND status = 'in_progress'",
      [session_id, userId]
    );

    if (sessions.length === 0) {
      return res.json({ ok: false, message: "No active session" });
    }

    // Get current active activity elapsed time
    const [active] = await pool.promise().query(
      `SELECT activity_type, start_time, TIMESTAMPDIFF(SECOND, start_time, NOW()) as elapsed
       FROM workout_activities WHERE session_id = ? AND is_active = TRUE`,
      [session_id]
    );

    res.json({ 
      ok: true, 
      session_id,
      current: active[0] || null
    });

  } catch (error) {
    console.error("Heartbeat error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
