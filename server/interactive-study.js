import { audit, today, transaction } from './db.js';

class StudyError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const fail = (status, message) => { throw new StudyError(status, message); };
const integer = value => {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) fail(400, 'المعرّف غير صحيح');
  return number;
};
const text = (value, name, min = 1, max = 4000) => {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) fail(400, `${name} غير صحيح`);
  return value.trim();
};
const fields = (body, allowed) => {
  if (!body || Array.isArray(body) || typeof body !== 'object' ||
      Object.keys(body).some(key => !allowed.includes(key))) fail(400, 'حقول الطلب غير مسموح بها');
};
const questionOptions = question => {
  if (question.question_type === 'true_false') return ['true', 'false'];
  try {
    const parsed = JSON.parse(question.options_json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};
const studentOnly = (req, res, next) => {
  if (req.user.role !== 'student') return res.status(403).json({ error: 'هذه الصفحة للطلاب فقط' });
  next();
};
const managerOnly = (req, res, next) => {
  if (!['doctor', 'admin'].includes(req.user.role)) return res.status(403).json({ error: 'إدارة المذاكرة التفاعلية متاحة للدكاترة والإدارة فقط' });
  next();
};

export function registerInteractiveStudyRoutes(app, db) {
  const canManageSubject = async (subjectId, user) => {
    const subject = (await db.query('SELECT * FROM subjects WHERE id=?', [subjectId])).rows[0];
    if (!subject) fail(404, 'المادة غير موجودة');
    if (user.role !== 'admin' && subject.doctor_id !== user.id) fail(403, 'لا يمكنك إدارة مادة دكتور آخر');
    return subject;
  };

  const managedUnit = async (id, user) => {
    const unit = (await db.query(`SELECT su.*,s.doctor_id FROM study_units su
      JOIN subjects s ON s.id=su.subject_id WHERE su.id=?`, [id])).rows[0];
    if (!unit) fail(404, 'الوحدة غير موجودة');
    if (user.role !== 'admin' && unit.doctor_id !== user.id) fail(403, 'لا يمكنك إدارة محتوى دكتور آخر');
    return unit;
  };

  const managedLesson = async (id, user) => {
    const lesson = (await db.query(`SELECT sl.*,s.name subject_name,s.doctor_id,l.name level_name,
      g.name group_name,su.title unit_title
      FROM study_lessons sl JOIN subjects s ON s.id=sl.subject_id
      JOIN levels l ON l.id=sl.level_id JOIN groups_table g ON g.id=sl.group_id
      JOIN study_units su ON su.id=sl.unit_id WHERE sl.id=?`, [id])).rows[0];
    if (!lesson) fail(404, 'الدرس غير موجود');
    if (user.role !== 'admin' && lesson.doctor_id !== user.id) fail(403, 'لا يمكنك إدارة محتوى دكتور آخر');
    return lesson;
  };

  const managedSection = async (id, user) => {
    const section = (await db.query(`SELECT ss.*,sl.id lesson_id,sl.subject_id,sl.level_id,
      s.doctor_id FROM study_sections ss JOIN study_lessons sl ON sl.id=ss.lesson_id
      JOIN subjects s ON s.id=sl.subject_id WHERE ss.id=?`, [id])).rows[0];
    if (!section) fail(404, 'القسم غير موجود');
    if (user.role !== 'admin' && section.doctor_id !== user.id) fail(403, 'لا يمكنك إدارة محتوى دكتور آخر');
    return section;
  };

  const lessonDefinition = async (lessonId, user) => {
    const lesson = await managedLesson(lessonId, user);
    const sections = (await db.query(`SELECT ss.id,ss.title,ss.content,ss.image_material_id,ss.sort_order,
      cm.file_name image_file_name FROM study_sections ss LEFT JOIN course_materials cm ON cm.id=ss.image_material_id
      WHERE ss.lesson_id=? ORDER BY ss.sort_order,ss.id`, [lesson.id])).rows;
    for (const section of sections) {
      section.image_url = section.image_material_id ? `/api/student/library/${section.image_material_id}/file` : null;
      section.questions = (await db.query(`SELECT id,question_text,question_type,options_json,
        correct_answer,explanation,sort_order FROM study_questions
        WHERE section_id=? ORDER BY sort_order,id`, [section.id])).rows.map(question => ({
        id: question.id,
        question_text: question.question_text,
        question_type: question.question_type,
        options: questionOptions(question),
        correct_answer: question.correct_answer,
        explanation: question.explanation,
        sort_order: question.sort_order
      }));
    }
    return { ...lesson, sections };
  };

  const validateImage = async (imageMaterialId, subjectId, levelId) => {
    if (imageMaterialId === null || imageMaterialId === undefined || imageMaterialId === '') return null;
    const id = integer(imageMaterialId);
    const image = (await db.query(`SELECT id FROM course_materials WHERE id=? AND subject_id=? AND level_id=?
      AND content_type IN ('image/jpeg','image/png')`, [id, subjectId, levelId])).rows[0];
    if (!image) fail(400, 'اختر صورة من مكتبة الصور الخاصة بهذه المادة والفرقة');
    return id;
  };

  const validateLessonScope = async (subjectId, unitId, levelId, groupId) => {
    const subject = (await db.query('SELECT id,level_id FROM subjects WHERE id=?', [subjectId])).rows[0];
    if (!subject) fail(404, 'المادة غير موجودة');
    if (subject.level_id !== levelId) fail(400, 'الفرقة لا تطابق فرقة المادة');
    const unit = (await db.query('SELECT id,subject_id,level_id FROM study_units WHERE id=?', [unitId])).rows[0];
    if (!unit || unit.subject_id !== subjectId || unit.level_id !== levelId) fail(400, 'الوحدة لا تتبع المادة والفرقة المحددتين');
    if (!(await db.query('SELECT id FROM groups_table WHERE id=? AND level_id=?', [groupId, levelId])).rows[0]) {
      fail(400, 'المجموعة لا تتبع الفرقة المحددة');
    }
    return subject;
  };

  const validateQuestion = body => {
    const questionText = text(body.question_text, 'السؤال', 2, 2000);
    const explanation = text(body.explanation, 'شرح الإجابة', 2, 3000);
    if (!['multiple_choice', 'true_false'].includes(body.question_type)) fail(400, 'نوع السؤال غير صحيح');
    let options, correctAnswer;
    if (body.question_type === 'multiple_choice') {
      if (!Array.isArray(body.options) || body.options.length < 2 || body.options.length > 8) fail(400, 'يجب إضافة من اختيارين إلى 8 اختيارات');
      options = body.options.map(option => text(option, 'الاختيار', 1, 240));
      if (new Set(options).size !== options.length) fail(400, 'يجب أن تكون الاختيارات مختلفة');
      correctAnswer = text(body.correct_answer, 'الإجابة الصحيحة', 1, 240);
      if (!options.includes(correctAnswer)) fail(400, 'الإجابة الصحيحة يجب أن تطابق أحد الاختيارات');
    } else {
      options = ['true', 'false'];
      if (!['true', 'false'].includes(body.correct_answer)) fail(400, 'اختر صح أو خطأ كإجابة صحيحة');
      correctAnswer = body.correct_answer;
    }
    return { questionText, explanation, questionType: body.question_type, options, correctAnswer };
  };

  const publishedLessonReady = async lessonId => {
    const counts = (await db.query(`SELECT COUNT(*) section_count,
      COUNT(*) FILTER (WHERE EXISTS(SELECT 1 FROM study_questions q WHERE q.section_id=ss.id)) sections_with_questions
      FROM study_sections ss WHERE ss.lesson_id=?`, [lessonId])).rows[0];
    if (!counts.section_count || Number(counts.section_count) !== Number(counts.sections_with_questions)) {
      fail(409, 'أضف قسمًا واحدًا على الأقل وسؤالًا واحدًا على الأقل لكل قسم قبل النشر');
    }
  };

  app.get('/api/interactive-study/manage', managerOnly, async (req, res) => {
    const subjectArgs = req.user.role === 'admin' ? [] : [req.user.id];
    const subjectWhere = req.user.role === 'admin' ? '' : 'WHERE s.doctor_id=?';
    const subjects = (await db.query(`SELECT s.id,s.name,s.level_id,l.name level_name
      FROM subjects s JOIN levels l ON l.id=s.level_id ${subjectWhere} ORDER BY l.id,s.name,s.id`, subjectArgs)).rows;
    const subjectIds = subjects.map(subject => subject.id);
    const units = subjectIds.length ? (await db.query(`SELECT su.id,su.title,su.subject_id,su.level_id,
      s.name subject_name,l.name level_name,
      (SELECT COUNT(*) FROM study_lessons sl WHERE sl.unit_id=su.id) lesson_count
      FROM study_units su JOIN subjects s ON s.id=su.subject_id JOIN levels l ON l.id=su.level_id
      WHERE su.subject_id=ANY(?) ORDER BY l.id,s.name,su.sort_order,su.id`, [subjectIds])).rows : [];
    const lessons = subjectIds.length ? (await db.query(`SELECT sl.id,sl.title,sl.description,sl.subject_id,
      sl.unit_id,sl.level_id,sl.group_id,sl.status,sl.updated_at,s.name subject_name,
      su.title unit_title,l.name level_name,g.name group_name,
      (SELECT COUNT(*) FROM study_sections ss WHERE ss.lesson_id=sl.id) section_count,
      (SELECT COUNT(*) FROM study_questions q JOIN study_sections ss ON ss.id=q.section_id
        WHERE ss.lesson_id=sl.id) question_count
      FROM study_lessons sl JOIN subjects s ON s.id=sl.subject_id JOIN study_units su ON su.id=sl.unit_id
      JOIN levels l ON l.id=sl.level_id JOIN groups_table g ON g.id=sl.group_id
      WHERE sl.subject_id=ANY(?) ORDER BY sl.updated_at DESC,sl.id DESC`, [subjectIds])).rows : [];
    const images = subjectIds.length ? (await db.query(`SELECT id,subject_id,file_name,title
      FROM course_materials WHERE subject_id=ANY(?) AND content_type IN ('image/jpeg','image/png')
      ORDER BY subject_id,title,id`, [subjectIds])).rows : [];
    res.json({
      subjects, units, lessons, images,
      levels: (await db.query('SELECT id,name FROM levels ORDER BY id', [])).rows,
      groups: (await db.query('SELECT id,name,level_id FROM groups_table ORDER BY level_id,id', [])).rows
    });
  });

  app.post('/api/interactive-study/manage/units', managerOnly, async (req, res) => {
    fields(req.body, ['subject_id', 'title']);
    const subjectId = integer(req.body.subject_id);
    const subject = await canManageSubject(subjectId, req.user);
    const title = text(req.body.title, 'اسم الوحدة', 2, 160);
    const result = await db.query('INSERT INTO study_units(subject_id,level_id,title,created_by) VALUES(?,?,?,?)',
      [subject.id, subject.level_id, title, req.user.id]);
    const id = Number(result.lastInsertRowid);
    await audit(db, req.user, 'إضافة وحدة للمذاكرة التفاعلية', 'study_unit', id, { subject_id: subject.id, title });
    res.status(201).json({ id });
  });

  app.patch('/api/interactive-study/manage/units/:id', managerOnly, async (req, res) => {
    fields(req.body, ['title']);
    const unit = await managedUnit(integer(req.params.id), req.user);
    const title = text(req.body.title, 'اسم الوحدة', 2, 160);
    await db.query('UPDATE study_units SET title=?,updated_at=to_char(clock_timestamp() AT TIME ZONE \'UTC\', \'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"\') WHERE id=?',
      [title, unit.id]);
    await audit(db, req.user, 'تعديل وحدة المذاكرة التفاعلية', 'study_unit', unit.id, { title });
    res.json({ ok: true });
  });

  app.delete('/api/interactive-study/manage/units/:id', managerOnly, async (req, res) => {
    const unit = await managedUnit(integer(req.params.id), req.user);
    if ((await db.query('SELECT id FROM study_lessons WHERE unit_id=? LIMIT 1', [unit.id])).rows[0]) fail(409, 'لا يمكن حذف وحدة تحتوي على دروس');
    await db.query('DELETE FROM study_units WHERE id=?', [unit.id]);
    await audit(db, req.user, 'حذف وحدة المذاكرة التفاعلية', 'study_unit', unit.id, { title: unit.title });
    res.json({ ok: true });
  });

  app.post('/api/interactive-study/manage/lessons', managerOnly, async (req, res) => {
    fields(req.body, ['title', 'description', 'subject_id', 'unit_id', 'level_id', 'group_id', 'status']);
    const subjectId = integer(req.body.subject_id), unitId = integer(req.body.unit_id);
    const levelId = integer(req.body.level_id), groupId = integer(req.body.group_id);
    const subject = await canManageSubject(subjectId, req.user);
    await validateLessonScope(subjectId, unitId, levelId, groupId);
    const title = text(req.body.title, 'عنوان الدرس', 2, 160);
    const description = req.body.description === undefined ? '' : text(req.body.description, 'الوصف', 0, 2000);
    const status = req.body.status || 'draft';
    if (!['draft', 'published'].includes(status)) fail(400, 'حالة الدرس غير صحيحة');
    if (status === 'published') fail(409, 'احفظ الدرس كمسودة، ثم أضف الأقسام والأسئلة وانشره');
    const result = await db.query(`INSERT INTO study_lessons
      (subject_id,unit_id,level_id,group_id,title,description,status,created_by)
      VALUES(?,?,?,?,?,?,?,?)`, [subject.id, unitId, levelId, groupId, title, description, status, req.user.id]);
    const id = Number(result.lastInsertRowid);
    await audit(db, req.user, 'إضافة درس للمذاكرة التفاعلية', 'study_lesson', id, { title, subject_id: subject.id, group_id: groupId });
    res.status(201).json({ id });
  });

  app.get('/api/interactive-study/manage/lessons/:id', managerOnly, async (req, res) => {
    res.json(await lessonDefinition(integer(req.params.id), req.user));
  });

  app.patch('/api/interactive-study/manage/lessons/:id', managerOnly, async (req, res) => {
    fields(req.body, ['title', 'description', 'subject_id', 'unit_id', 'level_id', 'group_id', 'status']);
    const existing = await managedLesson(integer(req.params.id), req.user);
    const subjectId = req.body.subject_id === undefined ? existing.subject_id : integer(req.body.subject_id);
    await canManageSubject(subjectId, req.user);
    const unitId = req.body.unit_id === undefined ? existing.unit_id : integer(req.body.unit_id);
    const levelId = req.body.level_id === undefined ? existing.level_id : integer(req.body.level_id);
    const groupId = req.body.group_id === undefined ? existing.group_id : integer(req.body.group_id);
    await validateLessonScope(subjectId, unitId, levelId, groupId);
    const title = req.body.title === undefined ? existing.title : text(req.body.title, 'عنوان الدرس', 2, 160);
    const description = req.body.description === undefined ? existing.description : text(req.body.description, 'الوصف', 0, 2000);
    const status = req.body.status === undefined ? existing.status : req.body.status;
    if (!['draft', 'published'].includes(status)) fail(400, 'حالة الدرس غير صحيحة');
    if (status === 'published') await publishedLessonReady(existing.id);
    if (subjectId !== existing.subject_id || levelId !== existing.level_id) {
      const incompatibleImage = (await db.query(`SELECT ss.id FROM study_sections ss
        WHERE ss.lesson_id=? AND ss.image_material_id IS NOT NULL
        AND NOT EXISTS(SELECT 1 FROM course_materials cm WHERE cm.id=ss.image_material_id
          AND cm.subject_id=? AND cm.level_id=? AND cm.content_type IN ('image/jpeg','image/png')) LIMIT 1`,
      [existing.id, subjectId, levelId])).rows[0];
      if (incompatibleImage) fail(409, 'عدّل صور الأقسام قبل نقل الدرس إلى مادة أو فرقة أخرى');
    }
    await db.query(`UPDATE study_lessons SET subject_id=?,unit_id=?,level_id=?,group_id=?,title=?,description=?,
      status=?,updated_at=to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      WHERE id=?`, [subjectId, unitId, levelId, groupId, title, description, status, existing.id]);
    await audit(db, req.user, status === 'published' ? 'نشر درس للمذاكرة التفاعلية' : 'تعديل درس المذاكرة التفاعلية',
      'study_lesson', existing.id, { title, status, subject_id: subjectId, group_id: groupId });
    res.json({ ok: true });
  });

  app.delete('/api/interactive-study/manage/lessons/:id', managerOnly, async (req, res) => {
    const lesson = await managedLesson(integer(req.params.id), req.user);
    if ((await db.query(`SELECT 1 FROM study_lesson_progress WHERE lesson_id=?
      UNION ALL SELECT 1 FROM study_question_attempts qa JOIN study_questions q ON q.id=qa.question_id
      JOIN study_sections ss ON ss.id=q.section_id WHERE ss.lesson_id=? LIMIT 1`, [lesson.id, lesson.id])).rows[0]) {
      fail(409, 'لا يمكن حذف درس بدأ الطلاب دراسته؛ احفظه كمسودة لإخفائه');
    }
    await db.query('DELETE FROM study_lessons WHERE id=?', [lesson.id]);
    await audit(db, req.user, 'حذف درس المذاكرة التفاعلية', 'study_lesson', lesson.id, { title: lesson.title });
    res.json({ ok: true });
  });

  app.post('/api/interactive-study/manage/lessons/:id/sections', managerOnly, async (req, res) => {
    fields(req.body, ['title', 'content', 'image_material_id']);
    const lesson = await managedLesson(integer(req.params.id), req.user);
    const title = text(req.body.title, 'عنوان القسم', 2, 160);
    const content = text(req.body.content, 'شرح القسم', 2, 12000);
    const imageMaterialId = await validateImage(req.body.image_material_id, lesson.subject_id, lesson.level_id);
    const result = await db.query(`INSERT INTO study_sections(lesson_id,title,content,image_material_id,sort_order)
      SELECT ?,?,?,?,COALESCE(MAX(sort_order),-1)+1 FROM study_sections WHERE lesson_id=?`,
    [lesson.id, title, content, imageMaterialId, lesson.id]);
    const id = Number(result.lastInsertRowid);
    await db.query(`UPDATE study_lessons SET updated_at=to_char(clock_timestamp() AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') WHERE id=?`, [lesson.id]);
    await audit(db, req.user, 'إضافة قسم للمذاكرة التفاعلية', 'study_section', id, { lesson_id: lesson.id, title });
    res.status(201).json({ id });
  });

  app.patch('/api/interactive-study/manage/sections/:id', managerOnly, async (req, res) => {
    fields(req.body, ['title', 'content', 'image_material_id']);
    const section = await managedSection(integer(req.params.id), req.user);
    const title = req.body.title === undefined ? section.title : text(req.body.title, 'عنوان القسم', 2, 160);
    const content = req.body.content === undefined ? section.content : text(req.body.content, 'شرح القسم', 2, 12000);
    const imageMaterialId = req.body.image_material_id === undefined
      ? section.image_material_id
      : await validateImage(req.body.image_material_id, section.subject_id, section.level_id);
    await db.query(`UPDATE study_sections SET title=?,content=?,image_material_id=? WHERE id=?`,
      [title, content, imageMaterialId, section.id]);
    await audit(db, req.user, 'تعديل قسم المذاكرة التفاعلية', 'study_section', section.id, { title });
    res.json({ ok: true });
  });

  app.delete('/api/interactive-study/manage/sections/:id', managerOnly, async (req, res) => {
    const section = await managedSection(integer(req.params.id), req.user);
    const lesson = await managedLesson(section.lesson_id, req.user);
    if (lesson.status === 'published') fail(409, 'احفظ الدرس كمسودة قبل حذف قسم منشور');
    if ((await db.query(`SELECT qa.id FROM study_question_attempts qa JOIN study_questions q ON q.id=qa.question_id
      WHERE q.section_id=? LIMIT 1`, [section.id])).rows[0]) fail(409, 'لا يمكن حذف قسم تمت عليه إجابات طلاب');
    await db.query('DELETE FROM study_sections WHERE id=?', [section.id]);
    await audit(db, req.user, 'حذف قسم المذاكرة التفاعلية', 'study_section', section.id, { title: section.title });
    res.json({ ok: true });
  });

  app.patch('/api/interactive-study/manage/lessons/:id/sections/order', managerOnly, async (req, res) => {
    fields(req.body, ['section_ids']);
    const lesson = await managedLesson(integer(req.params.id), req.user);
    if (!Array.isArray(req.body.section_ids) || req.body.section_ids.length > 100 ||
        req.body.section_ids.some(id => !Number.isSafeInteger(id)) ||
        new Set(req.body.section_ids).size !== req.body.section_ids.length) fail(400, 'ترتيب الأقسام غير صحيح');
    const existing = (await db.query('SELECT id FROM study_sections WHERE lesson_id=?', [lesson.id])).rows.map(row => row.id);
    if (existing.length !== req.body.section_ids.length || existing.some(id => !req.body.section_ids.includes(id))) {
      fail(400, 'يجب أن يتضمن الترتيب جميع أقسام الدرس فقط');
    }
    await transaction(db, async () => {
      for (const [sortOrder, sectionId] of req.body.section_ids.entries()) {
        await db.query('UPDATE study_sections SET sort_order=? WHERE id=? AND lesson_id=?', [sortOrder, sectionId, lesson.id]);
      }
    });
    res.json({ ok: true });
  });

  app.post('/api/interactive-study/manage/sections/:id/questions', managerOnly, async (req, res) => {
    fields(req.body, ['question_text', 'question_type', 'options', 'correct_answer', 'explanation']);
    const section = await managedSection(integer(req.params.id), req.user);
    const question = validateQuestion(req.body);
    const options = question.questionType === 'true_false' ? '[]' : JSON.stringify(question.options);
    const result = await db.query(`INSERT INTO study_questions
      (section_id,question_text,question_type,options_json,correct_answer,explanation,sort_order)
      SELECT ?,?,?,?,?,?,COALESCE(MAX(sort_order),-1)+1 FROM study_questions WHERE section_id=?`,
    [section.id, question.questionText, question.questionType, options, question.correctAnswer, question.explanation, section.id]);
    const id = Number(result.lastInsertRowid);
    await audit(db, req.user, 'إضافة سؤال للمذاكرة التفاعلية', 'study_question', id, { section_id: section.id });
    res.status(201).json({ id });
  });

  app.patch('/api/interactive-study/manage/questions/:id', managerOnly, async (req, res) => {
    fields(req.body, ['question_text', 'question_type', 'options', 'correct_answer', 'explanation']);
    const questionId = integer(req.params.id);
    const existing = (await db.query(`SELECT q.*,ss.lesson_id,s.doctor_id FROM study_questions q
      JOIN study_sections ss ON ss.id=q.section_id JOIN study_lessons sl ON sl.id=ss.lesson_id
      JOIN subjects s ON s.id=sl.subject_id WHERE q.id=?`, [questionId])).rows[0];
    if (!existing) fail(404, 'السؤال غير موجود');
    if (req.user.role !== 'admin' && existing.doctor_id !== req.user.id) fail(403, 'لا يمكنك إدارة محتوى دكتور آخر');
    const lesson = await managedLesson(existing.lesson_id, req.user);
    if (lesson.status === 'published') fail(409, 'احفظ الدرس كمسودة قبل حذف سؤال منشور');
    const merged = {
      question_text: req.body.question_text ?? existing.question_text,
      question_type: req.body.question_type ?? existing.question_type,
      options: req.body.options ?? questionOptions(existing),
      correct_answer: req.body.correct_answer ?? existing.correct_answer,
      explanation: req.body.explanation ?? existing.explanation
    };
    const question = validateQuestion(merged);
    const options = question.questionType === 'true_false' ? '[]' : JSON.stringify(question.options);
    await db.query(`UPDATE study_questions SET question_text=?,question_type=?,options_json=?,correct_answer=?,
      explanation=? WHERE id=?`, [question.questionText, question.questionType, options,
      question.correctAnswer, question.explanation, questionId]);
    await audit(db, req.user, 'تعديل سؤال المذاكرة التفاعلية', 'study_question', questionId, { section_id: existing.section_id });
    res.json({ ok: true });
  });

  app.delete('/api/interactive-study/manage/questions/:id', managerOnly, async (req, res) => {
    const questionId = integer(req.params.id);
    const existing = (await db.query(`SELECT q.id,q.section_id,s.doctor_id FROM study_questions q
      JOIN study_sections ss ON ss.id=q.section_id JOIN study_lessons sl ON sl.id=ss.lesson_id
      JOIN subjects s ON s.id=sl.subject_id WHERE q.id=?`, [questionId])).rows[0];
    if (!existing) fail(404, 'السؤال غير موجود');
    if (req.user.role !== 'admin' && existing.doctor_id !== req.user.id) fail(403, 'لا يمكنك إدارة محتوى دكتور آخر');
    if ((await db.query('SELECT id FROM study_question_attempts WHERE question_id=? LIMIT 1', [questionId])).rows[0]) {
      fail(409, 'لا يمكن حذف سؤال تمت عليه إجابات طلاب');
    }
    await db.query('DELETE FROM study_questions WHERE id=?', [questionId]);
    await audit(db, req.user, 'حذف سؤال المذاكرة التفاعلية', 'study_question', questionId, { section_id: existing.section_id });
    res.json({ ok: true });
  });

  app.patch('/api/interactive-study/manage/sections/:id/questions/order', managerOnly, async (req, res) => {
    fields(req.body, ['question_ids']);
    const section = await managedSection(integer(req.params.id), req.user);
    if (!Array.isArray(req.body.question_ids) || req.body.question_ids.length > 200 ||
        req.body.question_ids.some(id => !Number.isSafeInteger(id)) ||
        new Set(req.body.question_ids).size !== req.body.question_ids.length) fail(400, 'ترتيب الأسئلة غير صحيح');
    const existing = (await db.query('SELECT id FROM study_questions WHERE section_id=?', [section.id])).rows.map(row => row.id);
    if (existing.length !== req.body.question_ids.length || existing.some(id => !req.body.question_ids.includes(id))) {
      fail(400, 'يجب أن يتضمن الترتيب جميع أسئلة القسم فقط');
    }
    await transaction(db, async () => {
      for (const [sortOrder, questionId] of req.body.question_ids.entries()) {
        await db.query('UPDATE study_questions SET sort_order=? WHERE id=? AND section_id=?', [sortOrder, questionId, section.id]);
      }
    });
    res.json({ ok: true });
  });

  const currentStudent = async userId => {
    const student = (await db.query(`SELECT s.id,s.user_id,s.level_id,s.group_id,s.active,s.cancelled_at
      FROM students s WHERE s.user_id=?`, [userId])).rows[0];
    if (!student || !student.active || student.cancelled_at) fail(404, 'ملف الطالب غير موجود أو غير نشط');
    return student;
  };

  const studentEligibleLesson = async (lessonId, student) => {
    const day = today();
    const lesson = (await db.query(`SELECT sl.*,s.name subject_name,su.title unit_title,
      l.name level_name,g.name group_name
      FROM study_lessons sl JOIN subjects s ON s.id=sl.subject_id JOIN study_units su ON su.id=sl.unit_id
      JOIN levels l ON l.id=sl.level_id JOIN groups_table g ON g.id=sl.group_id
      WHERE sl.id=? AND sl.status='published' AND sl.level_id=? AND sl.group_id=?
      AND EXISTS(SELECT 1 FROM enrollments en WHERE en.student_id=? AND en.group_id=sl.group_id
        AND en.starts_on<=? AND (en.ends_on IS NULL OR en.ends_on>?))`,
    [lessonId, student.level_id, student.group_id, student.id, day, day])).rows[0];
    if (!lesson) fail(404, 'الدرس غير متاح لفرقتك أو مجموعتك');
    return lesson;
  };

  const latestAnswers = async (studentId, lessonId) => (await db.query(`SELECT DISTINCT ON (q.id)
    qa.id attempt_id,qa.question_id,qa.selected_answer,qa.is_correct,qa.answered_at,
    q.correct_answer,q.explanation,
    (SELECT COUNT(*) FROM study_question_attempts history WHERE history.student_id=qa.student_id
      AND history.question_id=qa.question_id) attempt_count,
    EXISTS(SELECT 1 FROM study_question_attempts history WHERE history.student_id=qa.student_id
      AND history.question_id=qa.question_id AND history.is_correct IS FALSE) has_wrong
    FROM study_question_attempts qa JOIN study_questions q ON q.id=qa.question_id
    JOIN study_sections ss ON ss.id=q.section_id
    WHERE qa.student_id=? AND ss.lesson_id=?
    ORDER BY q.id,qa.answered_at DESC,qa.id DESC`, [studentId, lessonId])).rows;

  const lessonProgress = async (studentId, lesson) => {
    const [sections, answers] = await Promise.all([
      db.query(`SELECT COUNT(*) section_count,
        COUNT(*) FILTER (WHERE NOT EXISTS(SELECT 1 FROM study_questions q WHERE q.section_id=ss.id
          AND NOT EXISTS(SELECT 1 FROM study_question_attempts qa WHERE qa.student_id=? AND qa.question_id=q.id))) completed_sections
        FROM study_sections ss WHERE ss.lesson_id=?`, [studentId, lesson.id]),
      latestAnswers(studentId, lesson.id)
    ]);
    const total = Number((await db.query(`SELECT COUNT(*) count FROM study_questions q
      JOIN study_sections ss ON ss.id=q.section_id WHERE ss.lesson_id=?`, [lesson.id])).rows[0].count);
    const correct = answers.filter(answer => answer.is_correct).length;
    const wrong = answers.filter(answer => !answer.is_correct).length;
    const sectionCount = Number(sections.rows[0].section_count);
    const completedSections = Number(sections.rows[0].completed_sections);
    const progressRow = (await db.query('SELECT completed_at FROM study_lesson_progress WHERE student_id=? AND lesson_id=?',
      [studentId, lesson.id])).rows[0];
    return {
      total, answered: answers.length, correct, wrong,
      section_count: sectionCount,
      completed_sections: completedSections,
      completion_percentage: sectionCount ? Math.round(completedSections / sectionCount * 100) : 0,
      score_percentage: answers.length ? Math.round(correct / answers.length * 100) : 0,
      completed_at: progressRow?.completed_at || null
    };
  };

  const lessonProgresses = async (studentId, lessons) => {
    if (!lessons.length) return new Map();
    const lessonIds = lessons.map(lesson => lesson.id);
    const rows = (await db.query(`WITH totals AS (
      SELECT sl.id lesson_id,COUNT(DISTINCT ss.id) section_count,COUNT(q.id) total
      FROM study_lessons sl LEFT JOIN study_sections ss ON ss.lesson_id=sl.id
      LEFT JOIN study_questions q ON q.section_id=ss.id
      WHERE sl.id=ANY(?) GROUP BY sl.id
    ), latest AS (
      SELECT DISTINCT ON (ss.lesson_id,q.id) ss.lesson_id,q.id question_id,qa.is_correct
      FROM study_question_attempts qa JOIN study_questions q ON q.id=qa.question_id
      JOIN study_sections ss ON ss.id=q.section_id
      WHERE qa.student_id=? AND ss.lesson_id=ANY(?)
      ORDER BY ss.lesson_id,q.id,qa.answered_at DESC,qa.id DESC
    ), answers AS (
      SELECT lesson_id,COUNT(*) answered,COUNT(*) FILTER (WHERE is_correct) correct,
        COUNT(*) FILTER (WHERE NOT is_correct) wrong FROM latest GROUP BY lesson_id
    ), completed AS (
      SELECT ss.lesson_id,COUNT(*) FILTER (WHERE NOT EXISTS(
        SELECT 1 FROM study_questions q WHERE q.section_id=ss.id
          AND NOT EXISTS(SELECT 1 FROM study_question_attempts qa
            WHERE qa.student_id=? AND qa.question_id=q.id))) completed_sections
      FROM study_sections ss WHERE ss.lesson_id=ANY(?) GROUP BY ss.lesson_id
    )
    SELECT t.lesson_id,t.total,t.section_count,COALESCE(a.answered,0) answered,
      COALESCE(a.correct,0) correct,COALESCE(a.wrong,0) wrong,
      COALESCE(c.completed_sections,0) completed_sections,lp.completed_at,
      CASE WHEN t.section_count=0 THEN 0 ELSE ROUND(COALESCE(c.completed_sections,0)*100.0/t.section_count)::INTEGER END completion_percentage,
      CASE WHEN COALESCE(a.answered,0)=0 THEN 0 ELSE ROUND(COALESCE(a.correct,0)*100.0/a.answered)::INTEGER END score_percentage
    FROM totals t LEFT JOIN answers a ON a.lesson_id=t.lesson_id
    LEFT JOIN completed c ON c.lesson_id=t.lesson_id
    LEFT JOIN study_lesson_progress lp ON lp.lesson_id=t.lesson_id AND lp.student_id=?`,
    [lessonIds, studentId, lessonIds, studentId, lessonIds, studentId])).rows;
    return new Map(rows.map(row => [row.lesson_id, {
      total: Number(row.total), answered: Number(row.answered), correct: Number(row.correct), wrong: Number(row.wrong),
      section_count: Number(row.section_count), completed_sections: Number(row.completed_sections),
      completion_percentage: Number(row.completion_percentage), score_percentage: Number(row.score_percentage),
      completed_at: row.completed_at || null
    }]));
  };

  app.get('/api/student/study', studentOnly, async (req, res) => {
    const student = await currentStudent(req.user.id);
    const day = today();
    const lessons = (await db.query(`SELECT sl.id,sl.title,sl.description,sl.subject_id,sl.unit_id,
      sl.status,sl.updated_at,s.name subject_name,su.title unit_title,
      (SELECT COUNT(*) FROM study_sections ss WHERE ss.lesson_id=sl.id) section_count,
      (SELECT COUNT(*) FROM study_questions q JOIN study_sections ss ON ss.id=q.section_id
        WHERE ss.lesson_id=sl.id) question_count
      FROM study_lessons sl JOIN subjects s ON s.id=sl.subject_id JOIN study_units su ON su.id=sl.unit_id
      WHERE sl.status='published' AND sl.level_id=? AND sl.group_id=?
      AND EXISTS(SELECT 1 FROM enrollments en WHERE en.student_id=? AND en.group_id=sl.group_id
        AND en.starts_on<=? AND (en.ends_on IS NULL OR en.ends_on>?))
      ORDER BY s.name,su.sort_order,su.id,sl.updated_at DESC,sl.id`,
    [student.level_id, student.group_id, student.id, day, day])).rows;
    const progressByLesson = await lessonProgresses(student.id, lessons);
    for (const lesson of lessons) lesson.progress = progressByLesson.get(lesson.id);
    const grouped = new Map();
    for (const lesson of lessons) {
      if (!grouped.has(lesson.subject_id)) grouped.set(lesson.subject_id, {
        id: lesson.subject_id, name: lesson.subject_name, units: []
      });
      const subject = grouped.get(lesson.subject_id);
      let unit = subject.units.find(item => item.id === lesson.unit_id);
      if (!unit) {
        unit = { id: lesson.unit_id, title: lesson.unit_title, lessons: [] };
        subject.units.push(unit);
      }
      unit.lessons.push(lesson);
    }
    const review = (await db.query(`SELECT COUNT(*) count FROM (
      SELECT DISTINCT ON (qa.question_id) qa.question_id,qa.is_correct FROM study_question_attempts qa
      JOIN study_questions q ON q.id=qa.question_id JOIN study_sections ss ON ss.id=q.section_id
      JOIN study_lessons sl ON sl.id=ss.lesson_id
      WHERE qa.student_id=? AND sl.status='published' AND sl.level_id=? AND sl.group_id=?
      ORDER BY qa.question_id,qa.answered_at DESC,qa.id DESC
    ) latest WHERE latest.is_correct IS FALSE`, [student.id, student.level_id, student.group_id])).rows[0].count;
    res.json({ subjects: [...grouped.values()], review_count: Number(review) });
  });

  app.get('/api/student/study/lessons/:id', studentOnly, async (req, res) => {
    const student = await currentStudent(req.user.id);
    const lesson = await studentEligibleLesson(integer(req.params.id), student);
    const progress = await lessonProgress(student.id, lesson);
    const answers = new Map((await latestAnswers(student.id, lesson.id)).map(answer => [answer.question_id, answer]));
    const sections = (await db.query(`SELECT id,title,content,image_material_id,sort_order
      FROM study_sections WHERE lesson_id=? ORDER BY sort_order,id`, [lesson.id])).rows;
    for (const section of sections) {
      section.image_url = section.image_material_id ? `/api/student/library/${section.image_material_id}/file` : null;
      section.questions = (await db.query(`SELECT id,question_text,question_type,options_json,sort_order
        FROM study_questions WHERE section_id=? ORDER BY sort_order,id`, [section.id])).rows.map(question => {
        const answer = answers.get(question.id);
        return {
          id: question.id,
          question_text: question.question_text,
          question_type: question.question_type,
          options: questionOptions(question),
          answered: Boolean(answer),
          selected_answer: answer?.selected_answer,
          is_correct: answer ? Boolean(answer.is_correct) : null,
          correct_answer: answer ? answer.correct_answer : undefined,
          explanation: answer ? answer.explanation : undefined,
          attempts: answer?.attempt_count || 0
        };
      });
    }
    const cursor = (await db.query('SELECT last_section_id FROM study_lesson_progress WHERE student_id=? AND lesson_id=?',
      [student.id, lesson.id])).rows[0];
    res.json({ ...lesson, sections, progress, current_section_id: cursor?.last_section_id || null });
  });

  app.post('/api/student/study/questions/:id/answer', studentOnly, async (req, res) => {
    fields(req.body, ['answer']);
    const student = await currentStudent(req.user.id);
    const question = (await db.query(`SELECT q.*,ss.lesson_id,ss.id section_id FROM study_questions q
      JOIN study_sections ss ON ss.id=q.section_id WHERE q.id=?`, [integer(req.params.id)])).rows[0];
    if (!question) fail(404, 'السؤال غير موجود');
    const lesson = await studentEligibleLesson(question.lesson_id, student);
    const options = questionOptions(question);
    if (typeof req.body.answer !== 'string' || !options.includes(req.body.answer)) fail(400, 'اختر إجابة من الخيارات المعروضة');
    const isCorrect = req.body.answer === question.correct_answer;
    const answeredAt = new Date().toISOString();
    await transaction(db, async () => {
      await db.query(`INSERT INTO study_question_attempts(student_id,question_id,selected_answer,is_correct,answered_at)
        VALUES(?,?,?,?,?)`, [student.id, question.id, req.body.answer, isCorrect, answeredAt]);
      await db.query(`INSERT INTO study_lesson_progress(student_id,lesson_id,last_section_id,updated_at)
        VALUES(?,?,?,?) ON CONFLICT(student_id,lesson_id) DO UPDATE
        SET last_section_id=excluded.last_section_id,updated_at=excluded.updated_at`,
      [student.id, lesson.id, question.section_id, answeredAt]);
    });
    res.json({
      correct: isCorrect,
      correct_answer: question.correct_answer,
      explanation: question.explanation,
      selected_answer: req.body.answer
    });
  });

  app.post('/api/student/study/lessons/:id/finish', studentOnly, async (req, res) => {
    fields(req.body, []);
    const student = await currentStudent(req.user.id);
    const lesson = await studentEligibleLesson(integer(req.params.id), student);
    const missing = (await db.query(`SELECT q.id FROM study_questions q JOIN study_sections ss ON ss.id=q.section_id
      WHERE ss.lesson_id=? AND NOT EXISTS(SELECT 1 FROM study_question_attempts qa
        WHERE qa.student_id=? AND qa.question_id=q.id) LIMIT 1`, [lesson.id, student.id])).rows[0];
    if (missing) fail(409, 'أجب عن جميع أسئلة الدرس قبل تسجيل الإكمال');
    const completedAt = new Date().toISOString();
    await db.query(`INSERT INTO study_lesson_progress(student_id,lesson_id,completed_at,updated_at)
      VALUES(?,?,?,?) ON CONFLICT(student_id,lesson_id) DO UPDATE
      SET completed_at=excluded.completed_at,updated_at=excluded.updated_at`,
    [student.id, lesson.id, completedAt, completedAt]);
    res.json({ ...(await lessonProgress(student.id, lesson)), lesson_title: lesson.title });
  });

  app.get('/api/student/study/review', studentOnly, async (req, res) => {
    const student = await currentStudent(req.user.id);
    const day = today();
    const items = (await db.query(`SELECT DISTINCT ON (q.id) q.id question_id,q.question_text,q.question_type,
      q.options_json,sl.id lesson_id,sl.title lesson_title,s.name subject_name,
      su.title unit_title,ss.title section_title,qa.selected_answer,qa.answered_at,qa.is_correct
      FROM study_question_attempts qa JOIN study_questions q ON q.id=qa.question_id
      JOIN study_sections ss ON ss.id=q.section_id JOIN study_lessons sl ON sl.id=ss.lesson_id
      JOIN subjects s ON s.id=sl.subject_id JOIN study_units su ON su.id=sl.unit_id
      WHERE qa.student_id=? AND sl.status='published' AND sl.level_id=? AND sl.group_id=?
      AND EXISTS(SELECT 1 FROM enrollments en WHERE en.student_id=? AND en.group_id=sl.group_id
        AND en.starts_on<=? AND (en.ends_on IS NULL OR en.ends_on>?))
      ORDER BY q.id,qa.answered_at DESC,qa.id DESC`,
    [student.id, student.level_id, student.group_id, student.id, day, day])).rows
      .filter(item => item.is_correct === false || item.is_correct === 0);
    res.json({ items: items.map(item => ({
      ...item, options: questionOptions(item)
    })) });
  });
}
