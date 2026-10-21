const { createClient } = require('@supabase/supabase-js');
const { SCHOOL_CODE } = require('./school.js'); // <-- school.js se auto aayega
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const SUPABASE_URL = 'https://vxdqfngvmrrupfooywwk.supabase.co';
const SUPABASE_KEY = 'sb_publishable_dvggOmxQl7wmhpIrkzbrLw_9Zp-Dm57';
console.log(`[Supabase] Active School Code: ${SCHOOL_CODE}`);
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ================== IMAGES AUTO-LINK SETUP ==================
const IMAGES_DIR = path.join(app.getPath('userData'), 'images');
console.log(`[Images] Folder: ${IMAGES_DIR}`);

function ensureImagesDir() {
  if (!fs.existsSync(IMAGES_DIR)) {
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
  }
}
ensureImagesDir();

function ensureStudentImageColumns(db) {
  try {
    const cols = db.prepare("PRAGMA table_info(students)").all().map(c => c.name);
    if (!cols.includes('image_url')) {
      db.prepare("ALTER TABLE students ADD COLUMN image_url TEXT").run();
      console.log("✅ Added offline column: image_url");
    }
    if (!cols.includes('image_name')) {
      db.prepare("ALTER TABLE students ADD COLUMN image_name TEXT").run();
      console.log("✅ Added offline column: image_name");
    }
    // === YE 2 COLUMN TUMHARE SCREENSHOT SE PATA CHALE ===
    if (!cols.includes('picture_path')) {
      db.prepare("ALTER TABLE students ADD COLUMN picture_path TEXT").run();
      console.log("✅ Added offline column: picture_path");
    }
    if (!cols.includes('pic')) {
      db.prepare("ALTER TABLE students ADD COLUMN pic TEXT").run();
      console.log("✅ Added offline column: pic");
    }
  } catch (e) {
    console.log("ensureStudentImageColumns error:", e.message);
  }
}

async function downloadImageIfNeeded(url, fileName) {
  if (!url ||!fileName) return null;
  const filePath = path.join(IMAGES_DIR, fileName);
  if (fs.existsSync(filePath)) {
    return filePath; // pehle se hai to skip
  }
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(filePath, buf);
    console.log(`✅ Image Downloaded: ${fileName}`);
    return filePath;
  } catch (err) {
    console.log(`❌ Image Failed ${fileName}:`, err.message);
    return null;
  }
}

// --- Generic wipe (for masters only - classes, subjects etc) ---
async function wipeAndInsert(table, rows, onConflict) {
  console.log(`\n--- WIPING ${table} for ${SCHOOL_CODE} ---`);
  const { error: delErr, data: delData } = await supabase.from(table).delete().eq('school_code', SCHOOL_CODE).select();
  if (delErr) { console.log(`❌ DELETE FAILED ${table}:`, delErr.message); return false; }
  console.log(`🗑️ ${table}: DELETED ${delData? delData.length : 0} rows`);
  if (!rows || rows.length === 0) return true;
  const payload = rows.map(r => ({...r, school_code: SCHOOL_CODE }));
  const { error: insErr } = await supabase.from(table).upsert(payload, { onConflict }).select();
  if (insErr) { console.log(`❌ INSERT FAILED ${table}:`, insErr.message); return false; }
  console.log(`✅ ${table}: Inserted ${payload.length} rows`);
  return true;
}

async function smartWipeAndInsertMarks(rows, exam_id, className) {
  if (!exam_id ||!className || exam_id === 'undefined') {
    console.log("No exam/class provided - pushing all marks");
    const payload = rows.map(r => ({...r, school_code: SCHOOL_CODE }));
    const { error } = await supabase.from('student_subject_marks').upsert(payload, { onConflict: 'school_code,result_id,subject_code' });
    if (error) return false;
    return payload.length;
  }
  console.log(`\n--- SMART WIPING marks for exam=${exam_id} class=${className} ---`);
  const { error: delErr, data: delData } = await supabase.from('student_subject_marks').delete().eq('school_code', SCHOOL_CODE).eq('exam_id', parseInt(exam_id)).eq('class', className).select();
  if (delErr) { console.log(`❌ DELETE FAILED marks:`, delErr.message); return false; }
  console.log(`🗑️ marks: DELETED ${delData? delData.length : 0} rows`);
  if (!rows || rows.length === 0) return true;
  const payload = rows.map(r => ({...r, school_code: SCHOOL_CODE }));
  const { error: insErr } = await supabase.from('student_subject_marks').upsert(payload, { onConflict: 'school_code,result_id,subject_code' }).select();
  if (insErr) { console.log(`❌ INSERT FAILED marks:`, insErr.message); return false; }
  console.log(`✅ marks: Inserted ${payload.length} rows`);
  return payload.length;
}

// --- Masters ---
async function pushSubjectsOnline(db) {
  const rows = db.prepare("SELECT subject_code, subject_display_name FROM academy_subjects").all();
  return await wipeAndInsert('academy_subjects', rows, 'school_code,subject_code');
}
async function pushExamsOnline(db) {
  const rows = db.prepare("SELECT exam_id, exam_name FROM exams").all();
  return await wipeAndInsert('exams', rows, 'school_code,exam_id');
}
async function pushExamSettingsOnline(db) {
  const rows = db.prepare("SELECT exam_id, class, subject_code, total_marks FROM exam_subject_settings").all();
  return await wipeAndInsert('exam_subject_settings', rows, 'school_code,exam_id,class,subject_code');
}
async function pushClassesOnline(db) {
  const rows = db.prepare("SELECT id, class_name FROM classes").all();
  return await wipeAndInsert('classes', rows, 'school_code,id');
}
async function pushExamStudentsOnline(db) {
  const offline = db.prepare("SELECT id, registration_no, roll_no, student_name, father_name, current_class FROM students").all();
  return await wipeAndInsert('students', offline, 'school_code,id');
}
async function pushStaffOnline(db) {
  try {
    let tableName = 'staff';
    let hasStaff = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='staff'").get();
    let hasStaffTbl = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='staff_tbl'").get();
    if (hasStaffTbl) tableName = 'staff_tbl';
    else if (!hasStaff) { console.log("No staff table found, skipping"); return true; }
    console.log(`Using local table: ${tableName}`);
    const rows = db.prepare(`SELECT id, name, cnic, contact, designation, doj, salary, allowance, status, documents_held, photo FROM ${tableName}`).all();
    console.log(`OFFLINE staff count: ${rows.length}`);
    const cleaned = rows.map(r => ({
      id: r.id, name: r.name, cnic: r.cnic, contact: r.contact, designation: r.designation,
      doj: r.doj, salary: r.salary, allowance: r.allowance, status: r.status,
      documents_held: r.documents_held, photo: r.photo && r.photo.length > 100000? '' : r.photo
    }));
    return await wipeAndInsert('staff', cleaned, 'school_code,id');
  } catch (e) { console.log("pushStaffOnline error", e.message); return false; }
}
async function pushOfflineUsersToCloud(db) {
  const offline = db.prepare("SELECT username, password, usertype, permissions, assigned_class FROM users").all();
  console.log(`OFFLINE users: ${offline.length}`);
  const lowerToExact = {};
  const offlineLower = [];
  offline.forEach(r => { const low = String(r.username).trim().toLowerCase(); lowerToExact[low] = String(r.username).trim(); offlineLower.push(low); });
  const { data: onlineUsers } = await supabase.from('users').select('username').eq('school_code', SCHOOL_CODE);
  const online = onlineUsers || [];
  const toDelete = [];
  online.forEach(o => { const low = String(o.username).trim().toLowerCase(); const exactWanted = lowerToExact[low]; if (!offlineLower.includes(low)) { toDelete.push(o.username); } else if (exactWanted && o.username!== exactWanted) { toDelete.push(o.username); } });
  if (toDelete.length > 0) { console.log(`🗑️ Deleting:`, toDelete); await supabase.from('users').delete().eq('school_code', SCHOOL_CODE).in('username', toDelete); }
  if (offline.length > 0) {
    const payload = offline.map(r => ({ username: String(r.username).trim(), password: r.password, usertype: r.usertype || 'User', permissions: r.permissions || '[]', assigned_class: r.assigned_class? String(r.assigned_class).trim() : null, school_code: SCHOOL_CODE }));
    const { error } = await supabase.from('users').upsert(payload, { onConflict: 'school_code,username' });
    if (error) console.log("Upsert failed:", error.message);
  }
  return true;
}
async function pushDynamicResultsOnline(db, exam_id, className) {
  let offline = [];
  if (exam_id && className) {
    offline = db.prepare("SELECT result_id, exam_id, student_id, class, subject_code, marks_set, marks_obtained FROM student_subject_marks WHERE exam_id=? AND class=?").all(exam_id, className);
  } else {
    offline = db.prepare("SELECT result_id, exam_id, student_id, class, subject_code, marks_set, marks_obtained FROM student_subject_marks").all();
  }
  console.log(`OFFLINE marks count: ${offline.length}`);
  return await smartWipeAndInsertMarks(offline, exam_id, className);
}
async function pushResultTableOnline() { return true; }

async function pullTeacherMarksOnline(db, exam_id, className) {
  console.log(`\n--- PULLING Teacher Online Marks for exam=${exam_id} class=${className} ---`);
  if (!exam_id ||!className) return { success: false, error: "Select Exam and Class first" };
  let realExamId = parseInt(exam_id);
  if (isNaN(realExamId)) {
    const f2 = db.prepare("SELECT exam_id FROM exams WHERE exam_name=?").get(exam_id);
    realExamId = f2? f2.exam_id : null;
  }
  if (!realExamId) return { success: false, error: `Exam id not found for ${exam_id}` };
  const { data, error } = await supabase.from('student_subject_marks').select('result_id, subject_code, marks_obtained_online').eq('school_code', SCHOOL_CODE).eq('exam_id', realExamId).eq('class', className).not('marks_obtained_online', 'is', null);
  if (error) return { success: false, error: error.message };
  if (!data.length) return { success: true, count: 0 };
  console.log(`Found ${data.length} teacher marks to pull`);
  const stmt = db.prepare(`UPDATE student_subject_marks SET marks_obtained_online =?, updated_at =? WHERE result_id =? AND subject_code =?`);
  const trans = db.transaction((rows) => {
    let count = 0; const now = new Date().toISOString();
    for (const r of rows) { const res = stmt.run(r.marks_obtained_online, now, r.result_id, r.subject_code); if (res.changes > 0) count++; }
    return count;
  });
  const updated = trans(data);
  console.log(`✅ Pulled ${updated} teacher online marks`);
  return { success: true, count: updated };
}

// ================== QUESTION BANK ENGINE - MERGE SAFE ==================
async function pushQuestionBankOnline(db) {
  const offlineRows = db.prepare("SELECT id, class_id, subject, lesson_no, question_type, question_text, diagram_path, opt1, opt2, opt3, opt4, correct_answer FROM question_bank").all();
  console.log(`OFFLINE question_bank count: ${offlineRows.length}`);
  if (!offlineRows.length) return true;
  const { data: onlineExisting } = await supabase.from('question_bank').select('id, question_text').eq('school_code', SCHOOL_CODE);
  const onlineMap = new Map((onlineExisting || []).map(r => [r.id, r.question_text]));
  let maxId = Math.max(0,...(onlineExisting || []).map(r => Number(r.id) || 0),...offlineRows.map(r => Number(r.id) || 0));
  const toUpsert = [];
  for (let r of offlineRows) {
    let row = {...r, school_code: SCHOOL_CODE };
    if (onlineMap.has(r.id)) {
      if (onlineMap.get(r.id) === r.question_text) continue;
      maxId++;
      row.id = maxId;
    }
    toUpsert.push(row);
  }
  if (!toUpsert.length) { console.log("QB: All duplicates, nothing to push"); return true; }
  const { error } = await supabase.from('question_bank').upsert(toUpsert, { onConflict: 'school_code,id' });
  if (error) { console.log(`❌ QB PUSH FAILED:`, error.message); return false; }
  console.log(`✅ QB PUSHED ${toUpsert.length} rows`);
  return true;
}

async function pullQuestionBankOnline(db) {
  console.log(`\n--- PULLING QB FOR ${SCHOOL_CODE} (No Overwrite) ---`);
  const { data: onlineRows, error } = await supabase.from('question_bank').select('*').eq('school_code', SCHOOL_CODE);
  if (error) { console.log('Pull QB failed', error.message); return { success: false, error: error.message, count: 0 }; }
  if (!onlineRows?.length) return { success: true, count: 0 };
  const checkId = db.prepare("SELECT id FROM question_bank WHERE id=?");
  const checkText = db.prepare("SELECT id FROM question_bank WHERE question_text=? AND class_id=? AND subject=?");
  const insert = db.prepare(`INSERT OR IGNORE INTO question_bank (id, class_id, subject, lesson_no, question_type, question_text, diagram_path, opt1, opt2, opt3, opt4, correct_answer) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  let inserted = 0;
  const tx = db.transaction(() => {
    for (const r of onlineRows) {
      if (checkId.get(r.id)) continue;
      if (checkText.get(r.question_text, r.class_id, r.subject)) continue;
      insert.run(r.id, r.class_id, r.subject, r.lesson_no, r.question_type, r.question_text, r.diagram_path, r.opt1, r.opt2, r.opt3, r.opt4, r.correct_answer);
      inserted++;
    }
  });
  tx();
  console.log(`✅ QB PULLED ${inserted} new`);
  return { success: true, count: inserted };
}

async function pushExamPapersOnline(db) {
  const rows = db.prepare("SELECT exam_type, paper_name, class_id, total_marks, passing_marks, exam_date, note_objective, note_subjective, obj_marks, subj_marks FROM exam_papers").all();
  console.log(`OFFLINE exam_papers count: ${rows.length}`);
  if (!rows.length) return true;
  const payload = rows.map(r => ({...r, school_code: SCHOOL_CODE }));
  const { error } = await supabase.from('exam_papers').upsert(payload, { onConflict: 'school_code,exam_type,paper_name,class_id' });
  if (error) { console.log("Insert paper failed", error.message); return false; }
  console.log(`✅ exam_papers PUSHED ${payload.length}`);
  return true;
}

async function pushPaperQuestionsOnline(db) {
  const rows = db.prepare("SELECT exam_type, paper_name, class_id, question_id, marks_assigned FROM paper_questions").all();
  console.log(`OFFLINE paper_questions count: ${rows.length}`);
  if (!rows.length) return true;
  const payload = rows.map(r => ({...r, school_code: SCHOOL_CODE }));
  const { error } = await supabase.from('paper_questions').upsert(payload, { onConflict: 'school_code,exam_type,paper_name,class_id,question_id' });
  if (error) { console.log("Insert paper_questions failed", error.message); return false; }
  console.log(`✅ paper_questions PUSHED ${payload.length}`);
  return true;
}

async function pullExamPapersOnline(db) {
  console.log(`\n--- PULLING Exam Papers FOR ${SCHOOL_CODE} ---`);
  const { data: onlineRows, error } = await supabase.from('exam_papers').select('*').eq('school_code', SCHOOL_CODE);
  if (error) { return { success: false, error: error.message, count: 0 }; }
  if (!onlineRows?.length) return { success: true, count: 0 };
  const check = db.prepare("SELECT 1 FROM exam_papers WHERE exam_type=? AND paper_name=? AND class_id=?");
  const insert = db.prepare(`INSERT OR IGNORE INTO exam_papers (exam_type, paper_name, class_id, total_marks, passing_marks, exam_date, note_objective, note_subjective, obj_marks, subj_marks) VALUES (?,?,?,?,?,?,?,?,?,?)`);
  let inserted = 0;
  const tx = db.transaction(() => {
    for (const r of onlineRows) {
      if (check.get(r.exam_type, r.paper_name, r.class_id)) continue;
      insert.run(r.exam_type, r.paper_name, r.class_id, r.total_marks, r.passing_marks, r.exam_date, r.note_objective, r.note_subjective, r.obj_marks, r.subj_marks);
      inserted++;
    }
  });
  tx();
  console.log(`✅ exam_papers PULLED ${inserted} new`);
  return { success: true, count: inserted };
}

async function pullPaperQuestionsOnline(db) {
  console.log(`\n--- PULLING Paper Questions FOR ${SCHOOL_CODE} ---`);
  const { data: onlineRows, error } = await supabase.from('paper_questions').select('*').eq('school_code', SCHOOL_CODE);
  if (error) { return { success: false, error: error.message, count: 0 }; }
  if (!onlineRows?.length) return { success: true, count: 0 };
  const check = db.prepare("SELECT 1 FROM paper_questions WHERE exam_type=? AND paper_name=? AND class_id=? AND question_id=?");
  const insert = db.prepare(`INSERT OR IGNORE INTO paper_questions (exam_type, paper_name, class_id, question_id, marks_assigned) VALUES (?,?,?,?,?)`);
  let inserted = 0;
  const tx = db.transaction(() => {
    for (const r of onlineRows) {
      if (check.get(r.exam_type, r.paper_name, r.class_id, r.question_id)) continue;
      insert.run(r.exam_type, r.paper_name, r.class_id, r.question_id, r.marks_assigned);
      inserted++;
    }
  });
  tx();
  console.log(`✅ paper_questions PULLED ${inserted} new`);
  return { success: true, count: inserted };
}

// ================== FULL SYNC LOGIC FOR PULL BUTTON ==================
async function wipeOnlineQBAndPapers() {
  console.log(`\n--- WIPING ONLINE QB/PAPERS FOR ${SCHOOL_CODE} ---`);
  await supabase.from('question_bank').delete().eq('school_code', SCHOOL_CODE);
  await supabase.from('paper_questions').delete().eq('school_code', SCHOOL_CODE);
  await supabase.from('exam_papers').delete().eq('school_code', SCHOOL_CODE);
  console.log(`🗑️ Online QB/Papers wiped for ${SCHOOL_CODE}`);
  return true;
}

async function fullSyncQuestionBank(db) {
  console.log(`\n========== FULL SYNC START FOR ${SCHOOL_CODE} ==========`);
  const qbPull = await pullQuestionBankOnline(db);
  const paperPull = await pullExamPapersOnline(db);
  const pqPull = await pullPaperQuestionsOnline(db);
  const pulledTotal = (qbPull.count || 0) + (paperPull.count || 0) + (pqPull.count || 0);
  console.log(`⬇️ PULLED TOTAL ${pulledTotal}`);
  await wipeOnlineQBAndPapers();
  await pushQuestionBankOnline(db);
  await pushExamPapersOnline(db);
  await pushPaperQuestionsOnline(db);
  console.log(`========== FULL SYNC DONE ==========`);
  return { success: true, pulled: pulledTotal, qb: qbPull.count, papers: paperPull.count + pqPull.count };
}

async function pullAttendanceOnline(db, date) {
  if (!date) date = new Date().toISOString().split('T')[0];
  console.log(`\n--- PULLING ONLY MISSING for ${SCHOOL_CODE} date=${date} ---`);
  const { data: studentAtt } = await supabase.from('student_attendance').select('student_id, class_id, date, status').eq('school_code', SCHOOL_CODE).eq('date', date);
  const { data: staffAtt } = await supabase.from('staff_attendance').select('staff_id, date, status').eq('school_code', SCHOOL_CODE).eq('date', date);
  const checkStud = db.prepare(`SELECT 1 FROM student_attendance WHERE student_id=? AND date=?`);
  const checkStaff = db.prepare(`SELECT 1 FROM staff_attendance WHERE staff_id=? AND date=?`);
  const insStud = db.prepare(`INSERT INTO student_attendance (student_id, class_id, date, status) VALUES (?,?,?,?)`);
  const insStaff = db.prepare(`INSERT INTO staff_attendance (staff_id, date, status) VALUES (?,?,?)`);
  let inserted = 0, skipped = 0;
  const tx = db.transaction(() => {
    for (const r of (studentAtt || [])) {
      if (checkStud.get(r.student_id, r.date)) { skipped++; continue; }
      insStud.run(r.student_id, r.class_id, r.date, r.status); inserted++;
    }
    for (const r of (staffAtt || [])) {
      if (checkStaff.get(r.staff_id, r.date)) continue;
      insStaff.run(r.staff_id, r.date, r.status);
    }
  });
  tx();
  return { student_count: inserted, skipped_count: skipped, staff_count: staffAtt?.length || 0 };
}

// ================== FIXED PULL STUDENTS - FINAL ==================
async function pullStudentsOnline(db) {
  console.log(`\n--- PULLING STUDENTS FOR ${SCHOOL_CODE} ---`);
  ensureImagesDir();
  ensureStudentImageColumns(db);

  const { data: mainStudents, error: err1 } = await supabase.from('students').select('*').eq('school_code', SCHOOL_CODE);
  if (err1) { return { success: false, error: err1.message }; }
  const { data: addOnline, error: err2 } = await supabase.from('student_add_online').select('*').eq('school_code', SCHOOL_CODE);
  if (err2) console.log("student_add_online pull error:", err2.message);

  const combined = [...(mainStudents || []),...(addOnline || [])];
  console.log(`Found ${mainStudents?.length || 0} from students + ${addOnline?.length || 0} from student_add_online = ${combined.length} total`);

  const map = new Map();
  combined.forEach(s => { if (s.registration_no) map.set(String(s.registration_no).trim(), s); });
  const unique = [...map.values()];

  if (unique.length === 0) return { success: true, count: 0, images: 0 };

  // ---- DOWNLOAD IMAGES ONE BY ONE ----
  let imagesDownloaded = 0;
  for (const s of unique) {
    if (s.image_url && s.image_name) {
      const saved = await downloadImageIfNeeded(s.image_url, s.image_name);
      if (saved) imagesDownloaded++;
    } else if (s.image_url &&!s.image_name) {
      const fallbackName = s.image_url.split('/').pop().split('?')[0];
      if (fallbackName) {
        const saved = await downloadImageIfNeeded(s.image_url, fallbackName);
        if (saved) {
          s.image_name = fallbackName;
          imagesDownloaded++;
        }
      }
    }
  }
  console.log(`🖼️ Images downloaded: ${imagesDownloaded}/${unique.length}`);

  const colsInfo = db.prepare("PRAGMA table_info(students)").all();
  const offlineCols = colsInfo.map(c => c.name);

  const insertable = unique.map(s => {
    const obj = {};
    for (let k of offlineCols) { if (s[k]!== undefined && s[k]!== null) obj[k] = s[k]; }

    if (!obj.registration_no) obj.registration_no = s.registration_no;
    if (!obj.student_name) obj.student_name = s.student_name;
    if (!obj.current_class) obj.current_class = s.current_class || s.admission_class;
    if (!obj.status) obj.status = s.status || 'Active';

    // ========== FINAL FIX - PICTURE_PATH MAPPING ==========
    if (s.image_name) {
      obj.image_name = s.image_name;
      if (offlineCols.includes('picture_path')) obj.picture_path = s.image_name;
      if (offlineCols.includes('pic')) obj.pic = s.image_name;
      if (offlineCols.includes('photo')) obj.photo = s.image_name;
    }
    if (s.image_url && offlineCols.includes('image_url')) {
      obj.image_url = s.image_url;
    }
    // =====================================================

    return obj;
  }).filter(s => s.registration_no);

  const tx = db.transaction(() => {
    let count = 0;
    for (const st of insertable) {
      const keys = Object.keys(st);
      const placeholders = keys.map(() => '?').join(',');
      const sql = `INSERT OR REPLACE INTO students (${keys.join(',')}) VALUES (${placeholders})`;
      try { db.prepare(sql).run(...keys.map(k => st[k])); count++; } catch (e) { console.log("Insert error", e.message); }
    }
    return count;
  });
  const inserted = tx();

  // Extra sync for old records
  try {
    if (offlineCols.includes('picture_path')) {
      db.prepare(`UPDATE students SET picture_path = image_name WHERE image_name IS NOT NULL AND (picture_path IS NULL OR picture_path = '')`).run();
    }
    if (offlineCols.includes('pic')) {
      db.prepare(`UPDATE students SET pic = image_name WHERE image_name IS NOT NULL AND (pic IS NULL OR pic = '')`).run();
    }
    console.log("🔗 Synced picture_path & pic with image_name");
  } catch (e) { console.log("Sync error:", e.message); }

  console.log(`✅ PULLED ${inserted} students + ${imagesDownloaded} images linked to ${IMAGES_DIR}`);
  return { success: true, count: inserted, images: imagesDownloaded };
}

// === DELETE ALL ONLINE DATA FOR CURRENT SCHOOL ===
async function wipeAllOnlineData() {
  const tables = ['academy_subjects', 'exams', 'exam_subject_settings', 'classes', 'students', 'staff', 'question_bank', 'exam_papers', 'paper_questions', 'student_subject_marks', 'users', 'student_attendance', 'staff_attendance'];
  const deleted = {};
  for (let t of tables) {
    try {
      const { data, error } = await supabase.from(t).delete().eq('school_code', SCHOOL_CODE).select();
      deleted[t] = error? `error: ${error.message}` : (data? data.length : 0);
    } catch (e) { deleted[t] = 0; }
  }
  return deleted;
}
//fee notificaiton
async function pushFeeNotificationsOnline(db) {
  console.log(`\n--- PUSHING ONLY CURRENT MONTH FEE FOR ${SCHOOL_CODE} ---`);
  try {
    const now = new Date();
    const currentMonthName = now.toLocaleString('en-US', { month: 'long' });
    const currentMonthShort = now.toLocaleString('en-US', { month: 'short' });
    const currentYear = now.getFullYear().toString();
    const currentMonthNum = (now.getMonth() + 1).toString();

    console.log(`Current: ${currentMonthName} ${currentYear}`);

    const allTables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
    const candidates = ['fee_records', 'fees', 'fee_invoices', 'invoices', 'student_fees', 'fee', 'fee_tbl'];
    let feeTable = candidates.find(c => allTables.includes(c));
    if (!feeTable) {
      for (let t of allTables) {
        try {
          const cols = db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name);
          if (cols.includes('registration_no') && cols.includes('monthly_fee') && cols.includes('invoice_month')) { feeTable = t; break; }
        } catch {}
      }
    }
    if (!feeTable) { console.log("❌ No fee table found"); return false; }

    const rows = db.prepare(`SELECT * FROM ${feeTable}`).all();
    
    const currentRows = rows.filter(r => {
      const m = String(r.invoice_month || r.month || '').toLowerCase();
      const y = String(r.invoice_year || r.year || '').toLowerCase();
      const mMatch = m === currentMonthName.toLowerCase() || m === currentMonthShort.toLowerCase() || m === currentMonthNum || m === currentMonthNum.padStart(2,'0');
      const yMatch = y === currentYear || y === currentYear.slice(-2);
      return mMatch && yMatch;
    });

    console.log(`Total offline: ${rows.length} | Current month filtered: ${currentRows.length} for ${currentMonthName} ${currentYear}`);

    const { error: delErr, data: delData } = await supabase.from('notifications').delete().eq('school_code', SCHOOL_CODE).eq('type', 'fee').select();
    if (delErr) console.log("Delete error:", delErr.message);
    else console.log(`🗑️ DELETED ${delData?.length || 0} old fee notifications`);

    if (currentRows.length === 0) {
      console.log(`No fee for current month, online fee table now empty`);
      return true;
    }

    const payload = currentRows.map(r => {
      const total = parseFloat(r.total_fee || 0) + parseFloat(r.arrears || 0);
      const collection = parseFloat(r.collection || 0);
      const balance = total - collection;
      let status = balance <= 0 && collection > 0 ? 'PAID' : collection > 0 ? 'PARTIAL' : 'DUE';
      const invNo = r.id || r.invoice_no || '-';
      const sName = r.student_name || 'Student';
      const regNo = String(r.registration_no || '').trim();
      const className = r.class_name || r.class || r.current_class || 'N/A';
      
      const title = status === 'PAID' ? `[FEE] ${currentMonthName} ${currentYear} - Inv #${invNo} - PAID ✅` : `[FEE] ${currentMonthName} ${currentYear} - Inv #${invNo} - DUE Rs.${balance}`;
      
      // === FIXED BREAKDOWN START ===
      let breakdown = '';
      if (parseFloat(r.monthly_fee) > 0) breakdown += `Tuition: Rs. ${r.monthly_fee}\n`;
      if (parseFloat(r.adm_fee) > 0) breakdown += `Admission: Rs. ${r.adm_fee}\n`;
      if (parseFloat(r.exam_fee) > 0) breakdown += `Exam: Rs. ${r.exam_fee}\n`;
      if (parseFloat(r.lab_fee) > 0) breakdown += `Lab: Rs. ${r.lab_fee}\n`;
      if (parseFloat(r.reg_fee) > 0) breakdown += `Reg: Rs. ${r.reg_fee}\n`;
      if (parseFloat(r.annual_fund) > 0) breakdown += `Annual Fund: Rs. ${r.annual_fund}\n`;
      if (parseFloat(r.stationary_fund) > 0) breakdown += `Stationary: Rs. ${r.stationary_fund}\n`;
      if (parseFloat(r.bus_charges) > 0) breakdown += `Bus: Rs. ${r.bus_charges}\n`;
      if (parseFloat(r.security) > 0) breakdown += `Security: Rs. ${r.security}\n`;
      if (parseFloat(r.misc_fee) > 0) breakdown += `Misc: Rs. ${r.misc_fee}\n`;
      // === FIXED BREAKDOWN END ===

      const message = `Fee for ${sName} (${regNo})\nMonth: ${currentMonthName} ${currentYear}\nInv: #${invNo}\n${breakdown}Total: Rs.${total}\nPaid: Rs.${collection}\nBalance: Rs.${balance}\nStatus: ${status}`;

      return {
        school_code: SCHOOL_CODE,
        class_id: className,
        registration_no: regNo,
        student_id: r.student_id || regNo,
        title, message, type: 'fee',
        invoice_no: String(invNo),
        invoice_month: currentMonthName,
        invoice_year: currentYear,
        total_fee: total, balance, status
      };
    }).filter(n => n.registration_no);

    for (let i = 0; i < payload.length; i += 100) {
      const batch = payload.slice(i, i + 100);
      const { error } = await supabase.from('notifications').insert(batch);
      if (error) {
        const fallback = batch.map(({invoice_no, invoice_month, invoice_year, total_fee, balance, status, ...rest}) => rest);
        await supabase.from('notifications').insert(fallback);
      }
    }

    console.log(`✅ PUSHED ONLY ${payload.length} records for ${currentMonthName} ${currentYear}`);
    return true;

  } catch (e) {
    console.log("pushFeeNotificationsOnline error:", e.message);
    return false;
  }
}
module.exports = {
  supabase, SCHOOL_CODE,
  pushSubjectsOnline, pushExamsOnline, pushExamSettingsOnline,
  pushExamStudentsOnline, pushOfflineUsersToCloud,
  pushDynamicResultsOnline, pushResultTableOnline,
  pushStaffOnline, wipeAndInsert, pullTeacherMarksOnline,
  pushQuestionBankOnline, pullQuestionBankOnline,
  pushExamPapersOnline, pushPaperQuestionsOnline,
  pullExamPapersOnline, pullPaperQuestionsOnline,
  pushClassesOnline,
  pullAttendanceOnline, pullStudentsOnline, wipeAllOnlineData,
  wipeOnlineQBAndPapers, fullSyncQuestionBank,pushFeeNotificationsOnline,
  IMAGES_DIR, downloadImageIfNeeded, ensureImagesDir
};