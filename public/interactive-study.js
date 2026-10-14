const displayAnswer = value => value === 'true' ? 'صح' : value === 'false' ? 'خطأ' : value;
const optionLabel = (question, value) => question.question_type === 'true_false' ? displayAnswer(value) : value;
const byId = (items, id) => items.find(item => item.id === Number(id));

export async function renderInteractiveStudyPage({ api, frame, esc, toast, state }) {
  const root = html => `<div id="interactive-study-root">${html}</div>`;
  const showError = error => toast(error.message, true);
  if (state.studyUserId !== state.user.id) {
    state.studyUserId = state.user.id;
    state.studyMode = 'catalog';
    state.studyLessonId = null;
    state.studyPosition = undefined;
    state.studyReviewQuestionId = null;
    state.studyReviewFeedback = null;
    state.studyReviewAnsweredQuestion = null;
    state.studyResult = null;
    state.studyEditLessonId = null;
  }

  async function renderCatalog() {
    const data = await api('/student/study');
    const subjectCards = data.subjects.map(subject => `<article class="study-subject-card">
      <div class="study-subject-heading"><div><span class="study-kicker">المادة</span><h2>${esc(subject.name)}</h2></div>
        <span class="study-count">${subject.units.length} ${subject.units.length === 1 ? 'وحدة' : 'وحدات'}</span></div>
      ${subject.units.map(unit => `<section class="study-unit"><h3>${esc(unit.title)}</h3>
        <div class="study-lesson-list">${unit.lessons.map(lesson => `<article class="study-lesson-card">
          <div class="study-lesson-copy"><strong>${esc(lesson.title)}</strong><span>${esc(lesson.description || 'درس تفاعلي')} · ${lesson.section_count} أقسام · ${lesson.question_count} أسئلة</span>
            <div class="study-progress-track" role="progressbar" aria-label="تقدم الدرس" aria-valuenow="${lesson.progress.completion_percentage}" aria-valuemin="0" aria-valuemax="100"><span style="width:${lesson.progress.completion_percentage}%"></span></div>
            <small>${lesson.progress.completion_percentage}% مكتمل · ${lesson.progress.answered}/${lesson.progress.total} أسئلة تمت الإجابة عنها</small></div>
          <button class="button ${lesson.progress.completion_percentage ? 'secondary' : ''}" type="button" data-study-open="${lesson.id}">${lesson.progress.completed_at ? 'مراجعة الدرس' : lesson.progress.answered ? 'استكمال الدرس' : 'ابدأ الدرس'}</button>
        </article>`).join('')}</div></section>`).join('')}
    </article>`).join('');
    frame(root(`<section class="study-welcome panel"><div><span class="study-kicker">تعلّم خطوة بخطوة</span><h2>المذاكرة التفاعلية</h2>
      <p>اقرأ الشرح، أجب عن السؤال، وتعرّف فورًا على الإجابة الصحيحة وسببها.</p></div>
      <button class="button secondary" type="button" data-study-mistakes>راجع أخطائي <span class="study-badge">${data.review_count}</span></button></section>
      ${subjectCards || '<section class="panel empty"><strong>لا توجد دروس منشورة بعد</strong>ستظهر هنا دروس المواد المخصصة لفرقتك ومجموعتك.</section>'}`),
    'المذاكرة التفاعلية', 'المواد والوحدات والدروس المخصصة لفرقتك ومجموعتك');
    bindStudentEvents();
  }

  async function getLesson() {
    return api(`/student/study/lessons/${state.studyLessonId}`);
  }

  async function renderLesson() {
    const lesson = await getLesson();
    state.studyLesson = lesson;
    const questions = lesson.sections.flatMap((section, sectionIndex) =>
      section.questions.map((question, questionIndex) => ({ section, question, sectionIndex, questionIndex })));
    if (!questions.length) throw new Error('هذا الدرس لا يحتوي على أسئلة بعد.');
    let position = questions.findIndex(item => !item.question.answered);
    if (position < 0) position = questions.length - 1;
    if (state.studyPosition !== undefined && state.studyPosition >= 0 && state.studyPosition < questions.length) {
      position = state.studyPosition;
    }
    state.studyPosition = position;
    const current = questions[position];
    const question = current.question;
    const answered = question.answered;
    const feedback = answered ? (question.is_correct
      ? `<div class="study-feedback correct" role="status"><strong>☑ إجابة صحيحة!</strong><p>${esc(question.explanation)}</p></div>`
      : `<div class="study-feedback wrong" role="status"><strong>❌ إجابة غير صحيحة</strong><p><b>الإجابة الصحيحة:</b> ${esc(optionLabel(question, question.correct_answer))}</p><p><b>💡 شرح الإجابة:</b> ${esc(question.explanation)}</p></div>`) : '';
    const choices = question.options.map((choice, index) => `<label class="study-option">
      <input type="radio" name="answer" value="${esc(choice)}" ${question.selected_answer === choice ? 'checked' : ''} ${answered ? 'disabled' : 'required'}>
      <span class="study-option-marker">${String.fromCharCode(65 + index)}</span><span>${esc(optionLabel(question, choice))}</span>
    </label>`).join('');
    const section = current.section;
    const sectionIndex = current.sectionIndex;
    const nextButton = answered
      ? position + 1 < questions.length
        ? '<button class="button" type="button" data-study-next>التالي ←</button>'
        : '<button class="button" type="button" data-study-finish>إنهاء الدرس</button>'
      : '';
    const sections = lesson.sections.map((item, index) => `<span class="study-step ${index < lesson.progress.completed_sections ? 'done' : ''} ${index === sectionIndex ? 'current' : ''}"><i>${index + 1}</i>${esc(item.title)}</span>`).join('');
    const image = section.image_url ? `<img class="study-explanation-image" src="${esc(section.image_url)}" alt="${esc(section.title)}" loading="lazy">` : '';
    frame(root(`<div class="study-topline"><button type="button" class="button secondary" data-study-home>← العودة إلى الدروس</button>
      <button type="button" class="button secondary" data-study-mistakes>راجع أخطائي</button></div>
      <section class="study-lesson-heading panel"><span>${esc(lesson.subject_name)} · ${esc(lesson.unit_title)}</span><h2>${esc(lesson.title)}</h2>
        ${lesson.description ? `<p>${esc(lesson.description)}</p>` : ''}<div class="study-progress-heading"><span>تقدم الدرس</span><strong>${lesson.progress.completion_percentage}%</strong></div>
        <div class="study-progress-track" role="progressbar" aria-label="تقدم الدرس" aria-valuenow="${lesson.progress.completion_percentage}" aria-valuemin="0" aria-valuemax="100"><span style="width:${lesson.progress.completion_percentage}%"></span></div>
        <div class="study-steps">${sections}</div></section>
      <section class="study-explanation panel"><span class="study-kicker">القسم ${sectionIndex + 1} من ${lesson.sections.length}</span><h2>${esc(section.title)}</h2><div class="study-reading">${esc(section.content)}</div>${image}</section>
      <section class="study-question-card panel"><div class="study-question-meta"><span>تحقق من فهمك</span><span>السؤال ${position + 1} من ${questions.length}</span></div>
        <h3>${esc(question.question_text)}</h3><form data-study-answer="${question.id}"><fieldset ${answered ? 'disabled' : ''}><legend class="sr-only">اختر إجابة</legend>${choices}</fieldset>
        ${answered ? feedback : '<button class="button study-submit" type="submit">تحقق من إجابتي</button>'}</form>
        <div class="study-question-navigation">${nextButton}</div></section>`),
    lesson.title, `${lesson.subject_name} · ${lesson.level_name} · ${lesson.group_name}`);
    bindStudentEvents();
  }

  async function renderFinish() {
    const lesson = state.studyLesson || await getLesson();
    state.studyLesson = lesson;
    frame(root(`<section class="study-finish panel"><span class="study-finish-icon">✓</span><span class="study-kicker">أحسنت، وصلت إلى نهاية الدرس</span>
      <h2>${esc(lesson.title)}</h2><p>أجبت عن جميع أسئلة الدرس. سجّل إكمال الدرس لعرض نتيجتك وحفظ تقدمك.</p>
      <button type="button" class="button" data-study-complete>عرض نتيجة الدرس</button>
      <button type="button" class="button secondary" data-study-home>العودة إلى الدروس</button></section>`),
    'إنهاء الدرس', `${lesson.subject_name} · ${lesson.unit_title}`);
    bindStudentEvents();
  }

  async function renderResult() {
    const result = state.studyResult;
    frame(root(`<section class="study-result panel"><span class="study-finish-icon">✓</span><span class="study-kicker">نتيجة المذاكرة التفاعلية</span>
      <h2>${esc(result.lesson_title || state.studyLesson?.title || 'الدرس')}</h2><div class="study-score-ring" style="--study-score:${result.score_percentage}"><strong>${result.score_percentage}%</strong><span>الدرجة</span></div>
      <div class="study-result-grid"><div><span>إجابات صحيحة</span><strong>${result.correct}</strong></div><div><span>إجابات خاطئة</span><strong>${result.wrong}</strong></div>
      <div><span>إجمالي الأسئلة</span><strong>${result.total}</strong></div><div><span>الإكمال</span><strong>${result.completion_percentage}%</strong></div></div>
      <p class="study-result-note">تم حفظ تقدمك. يمكنك العودة إلى الدرس في أي وقت.</p>
      <button type="button" class="button" data-study-home>العودة إلى المواد</button></section>`),
    'نتيجة الدرس', 'تم حفظ نتيجتك وتقدمك');
    bindStudentEvents();
  }

  async function renderMistakes() {
    const result = await api('/student/study/review');
    const selected = byId(result.items, state.studyReviewQuestionId) ||
      (state.studyReviewFeedback ? state.studyReviewAnsweredQuestion : null);
    const feedback = state.studyReviewFeedback;
    const reviewCard = selected ? `<article class="study-review-question panel"><div class="study-question-meta"><span>${esc(selected.subject_name)} · ${esc(selected.lesson_title)}</span><span>${esc(selected.section_title)}</span></div>
      <h2>${esc(selected.question_text)}</h2><form data-study-answer="${selected.question_id}">
      <fieldset ${feedback ? 'disabled' : ''}><legend class="sr-only">اختر إجابة</legend>${selected.options.map((option, index) => `<label class="study-option">
        <input type="radio" name="answer" value="${esc(option)}" ${feedback ? 'disabled' : 'required'}>
        <span class="study-option-marker">${String.fromCharCode(65 + index)}</span><span>${esc(optionLabel(selected, option))}</span></label>`).join('')}</fieldset>
      ${feedback ? `<div class="study-feedback ${feedback.correct ? 'correct' : 'wrong'}" role="status"><strong>${feedback.correct ? '☑ إجابة صحيحة! تم تصحيح الخطأ.' : '❌ إجابة غير صحيحة'}</strong>
        ${!feedback.correct ? `<p><b>الإجابة الصحيحة:</b> ${esc(optionLabel(selected, feedback.correct_answer))}</p>` : ''}
        <p><b>💡 شرح الإجابة:</b> ${esc(feedback.explanation)}</p></div>` : '<button class="button study-submit" type="submit">تحقق من إجابتي</button>'}
      </form><div class="study-question-navigation">${feedback ? '<button class="button" type="button" data-study-review-next>السؤال التالي</button>' : ''}</div></article>` : '';
    const list = result.items.map(item => `<button type="button" class="study-mistake-item ${item.question_id === state.studyReviewQuestionId ? 'active' : ''}" data-study-review-question="${item.question_id}">
      <span><strong>${esc(item.question_text)}</strong><small>${esc(item.subject_name)} · ${esc(item.lesson_title)}</small></span><span>تدرب مجددًا ←</span></button>`).join('');
    frame(root(`<div class="study-topline"><button type="button" class="button secondary" data-study-home>← العودة إلى المواد</button></div>
      <section class="study-welcome panel"><div><span class="study-kicker">تعلّم من المحاولة</span><h2>راجع أخطائي</h2>
      <p>أجب عن الأسئلة التي أخطأت فيها. عند الإجابة الصحيحة، سيُزال السؤال من قائمة المراجعة.</p></div><span class="study-badge">${result.items.length}</span></section>
      ${reviewCard}${list ? `<section class="study-mistake-list">${list}</section>` : '<section class="panel empty"><strong>لا توجد أخطاء للمراجعة</strong>أحسنت! ستجد هنا أي سؤال تحتاج إلى التدرب عليه مجددًا.</section>'}`),
    'راجع أخطائي', 'تدرب على الأسئلة التي أجبت عنها خطأ');
    bindStudentEvents();
  }

  function bindStudentEvents() {
    const rootElement = document.querySelector('#interactive-study-root');
    if (!rootElement) return;
    rootElement.addEventListener('click', async event => {
      const button = event.target.closest('button');
      if (!button) return;
      try {
        if (button.matches('[data-study-open]')) {
          state.studyLessonId = Number(button.dataset.studyOpen);
          state.studyMode = 'lesson';
          state.studyPosition = undefined;
          await renderLesson();
        } else if (button.matches('[data-study-home]')) {
          state.studyMode = 'catalog';
          state.studyReviewFeedback = null;
          await renderCatalog();
        } else if (button.matches('[data-study-mistakes]')) {
          state.studyMode = 'mistakes';
          state.studyReviewQuestionId = null;
          state.studyReviewFeedback = null;
          state.studyReviewAnsweredQuestion = null;
          await renderMistakes();
        } else if (button.matches('[data-study-next]')) {
          state.studyPosition += 1;
          await renderLesson();
        } else if (button.matches('[data-study-finish]')) {
          state.studyMode = 'finish';
          await renderFinish();
        } else if (button.matches('[data-study-complete]')) {
          state.studyResult = await api(`/student/study/lessons/${state.studyLessonId}/finish`, { method: 'POST', body: '{}' });
          state.studyMode = 'result';
          await renderResult();
        } else if (button.matches('[data-study-review-question]')) {
          state.studyReviewQuestionId = Number(button.dataset.studyReviewQuestion);
          state.studyReviewFeedback = null;
          state.studyReviewAnsweredQuestion = byId(result.items, state.studyReviewQuestionId);
          await renderMistakes();
        } else if (button.matches('[data-study-review-next]')) {
          state.studyReviewQuestionId = null;
          state.studyReviewFeedback = null;
          state.studyReviewAnsweredQuestion = null;
          await renderMistakes();
        }
      } catch (error) { showError(error); }
    });
    rootElement.addEventListener('submit', async event => {
      const form = event.target.closest('form[data-study-answer]');
      if (!form) return;
      event.preventDefault();
      const answer = new FormData(form).get('answer');
      if (typeof answer !== 'string') return toast('اختر إجابة أولًا', true);
      const button = form.querySelector('button[type="submit"]');
      if (button) button.disabled = true;
      try {
        const result = await api(`/student/study/questions/${form.dataset.studyAnswer}/answer`, {
          method: 'POST', body: JSON.stringify({ answer })
        });
        if (state.studyMode === 'mistakes') {
          state.studyReviewFeedback = result;
          await renderMistakes();
        } else {
          await renderLesson();
        }
      } catch (error) {
        if (button) button.disabled = false;
        showError(error);
      }
    });
  }

  async function renderStudyManager() {
    const data = await api('/interactive-study/manage');
    state.studyManageData = data;
    const subjectOptions = data.subjects.map(item => `<option value="${item.id}">${esc(item.name)} · ${esc(item.level_name)}</option>`).join('');
    const unitOptions = data.units.map(item => `<option value="${item.id}">${esc(item.title)} · ${esc(item.subject_name)}</option>`).join('');
    const levelOptions = data.levels.map(item => `<option value="${item.id}">${esc(item.name)}</option>`).join('');
    const groupOptions = data.groups.map(item => `<option value="${item.id}" data-level="${item.level_id}">${esc(item.name)} · ${esc(data.levels.find(level => level.id === item.level_id)?.name || '')}</option>`).join('');
    const imageOptions = data.images.map(item => `<option value="${item.id}">${esc(item.title)} · ${esc(item.file_name)}</option>`).join('');
    const unitsList = data.units.map(unit => `<article class="study-manage-row"><div><strong>${esc(unit.title)}</strong><span>${esc(unit.subject_name)} · ${esc(unit.level_name)} · ${unit.lesson_count} دروس</span></div>
      <button type="button" class="button secondary" data-study-unit-edit="${unit.id}">تعديل الوحدة</button><button type="button" class="button danger" data-study-unit-delete="${unit.id}">حذف</button></article>`).join('');
    const lessonsList = data.lessons.map(lesson => `<article class="study-manage-row"><div><strong>${esc(lesson.title)} <span class="study-status ${lesson.status}">${lesson.status === 'published' ? 'منشور' : 'مسودة'}</span></strong>
      <span>${esc(lesson.subject_name)} · ${esc(lesson.unit_title)} · ${esc(lesson.level_name)} · ${esc(lesson.group_name)}</span><small>${lesson.section_count} أقسام · ${lesson.question_count} أسئلة</small></div>
      <button type="button" class="button secondary" data-study-edit-lesson="${lesson.id}">إدارة المحتوى</button>
      <button type="button" class="button ${lesson.status === 'published' ? 'secondary' : ''}" data-study-publish="${lesson.id}" data-status="${lesson.status}">${lesson.status === 'published' ? 'حفظ كمسودة' : 'نشر الدرس'}</button>
      <button type="button" class="button danger" data-study-delete-lesson="${lesson.id}">حذف</button></article>`).join('');
    let editor = '';
    if (state.studyEditLessonId) {
      const lesson = await api(`/interactive-study/manage/lessons/${state.studyEditLessonId}`);
      state.studyEditorLesson = lesson;
      editor = renderLessonEditor(lesson, imageOptions);
    }
    frame(root(`<section class="study-welcome panel"><div><span class="study-kicker">إدارة المحتوى التعليمي</span><h2>إدارة المذاكرة التفاعلية</h2>
      <p>أنشئ محتوى مستقلًا عن بنك الأسئلة، وخصص كل درس لفرقة ومجموعة.</p></div></section>
      <section class="panel study-authoring-panel"><div class="panel-head"><div><h2>إضافة مادة</h2><p>تُضاف المادة باستخدام هيكل المواد الحالي في النظام.</p></div></div>
        <form class="study-form-grid" data-study-form="subject"><label>اسم المادة<input name="name" required minlength="2" maxlength="120"></label>
        <label>الفرقة<select name="level_id" required><option value="">اختر الفرقة</option>${levelOptions}</select></label>
        <button class="button" type="submit">إضافة المادة</button></form></section>
      <section class="panel study-authoring-panel"><div class="panel-head"><div><h2>إضافة وحدة / فصل</h2><p>تنظم الدروس داخل المادة.</p></div></div>
        <form class="study-form-grid" data-study-form="unit"><label>المادة<select name="subject_id" required><option value="">اختر المادة</option>${subjectOptions}</select></label>
        <label>اسم الوحدة<input name="title" required minlength="2" maxlength="160"></label><button class="button" type="submit">إضافة الوحدة</button></form>
        <div class="study-manage-list">${unitsList || '<p class="muted">لم تتم إضافة وحدات بعد.</p>'}</div></section>
      <section class="panel study-authoring-panel"><div class="panel-head"><div><h2>إنشاء درس</h2><p>ابدأ بمسودة، ثم أضف الأقسام والأسئلة وانشرها.</p></div></div>
        <form class="study-form-grid" data-study-form="lesson"><label>عنوان الدرس<input name="title" required minlength="2" maxlength="160"></label>
        <label>المادة<select name="subject_id" required><option value="">اختر المادة</option>${subjectOptions}</select></label>
        <label>الوحدة / الفصل<select name="unit_id" required><option value="">اختر الوحدة</option>${unitOptions}</select></label>
        <label>الفرقة<select name="level_id" required><option value="">اختر الفرقة</option>${levelOptions}</select></label>
        <label>المجموعة<select name="group_id" required><option value="">اختر المجموعة</option>${groupOptions}</select></label>
        <label>الحالة<select name="status"><option value="draft">مسودة (يمكن النشر بعد إضافة المحتوى)</option></select></label>
        <label class="study-field-wide">الوصف<textarea name="description" maxlength="2000" rows="2"></textarea></label>
        <button class="button" type="submit">إنشاء الدرس</button></form></section>
      ${editor}<section class="panel study-authoring-panel"><div class="panel-head"><div><h2>الدروس</h2><p>${data.lessons.length} دروس</p></div></div>
        <div class="study-manage-list">${lessonsList || '<p class="muted">لم تتم إضافة دروس بعد.</p>'}</div></section>`),
    'إدارة المذاكرة التفاعلية', 'المواد والوحدات والدروس والأقسام والأسئلة');
    bindManagerEvents();
  }

  function renderLessonEditor(lesson, imageOptions) {
    const sections = lesson.sections.map((section, sectionIndex) => `<article class="study-section-editor" data-section-id="${section.id}">
      <form class="study-form-grid study-section-form" data-study-form="section-edit" data-id="${section.id}">
        <label>عنوان القسم<input name="title" required minlength="2" maxlength="160" value="${esc(section.title)}"></label>
        <label class="study-field-wide">الشرح<textarea name="content" required minlength="2" maxlength="12000" rows="5">${esc(section.content)}</textarea></label>
        <label>صورة توضيحية من المكتبة<select name="image_material_id"><option value="">بدون صورة</option>${imageOptions.replace(`value="${section.image_material_id}"`, `value="${section.image_material_id}" selected`)}</select></label>
        <button class="button secondary" type="submit">حفظ القسم</button>
      </form><div class="study-order-actions"><button type="button" class="button secondary" data-study-move-section="-1" ${sectionIndex === 0 ? 'disabled' : ''}>↑ تقديم</button>
        <button type="button" class="button secondary" data-study-move-section="1" ${sectionIndex === lesson.sections.length - 1 ? 'disabled' : ''}>↓ تأخير</button>
        <button type="button" class="button danger" data-study-delete-section="${section.id}">حذف القسم</button></div>
      <div class="study-question-editor-list">${section.questions.map((question, questionIndex) => `<article class="study-question-editor" data-question-id="${question.id}">
        <div class="study-question-editor-top"><strong>${esc(question.question_text)}</strong><span>${question.question_type === 'true_false' ? 'صح أو خطأ' : 'اختيار من متعدد'}</span></div>
        <form class="study-form-grid" data-study-form="question-edit" data-id="${question.id}">
          <label class="study-field-wide">السؤال<input name="question_text" required minlength="2" maxlength="2000" value="${esc(question.question_text)}"></label>
          <label>نوع السؤال<select name="question_type"><option value="multiple_choice" ${question.question_type === 'multiple_choice' ? 'selected' : ''}>اختيار من متعدد</option><option value="true_false" ${question.question_type === 'true_false' ? 'selected' : ''}>صح أو خطأ</option></select></label>
          <label class="study-question-options ${question.question_type === 'true_false' ? 'hidden' : ''}">الاختيارات (كل اختيار في سطر)<textarea name="options" rows="3">${esc(question.question_type === 'true_false' ? '' : question.options.join('\n'))}</textarea></label>
          <label class="study-correct-answer">الإجابة الصحيحة<input name="correct_answer" required value="${esc(question.question_type === 'true_false' ? question.correct_answer : question.correct_answer)}"></label>
          <label class="study-field-wide">شرح الإجابة<textarea name="explanation" required minlength="2" maxlength="3000" rows="2">${esc(question.explanation)}</textarea></label>
          <button class="button secondary" type="submit">حفظ السؤال</button></form>
        <div class="study-order-actions"><button type="button" class="button secondary" data-study-move-question="-1" ${questionIndex === 0 ? 'disabled' : ''}>↑ تقديم</button>
          <button type="button" class="button secondary" data-study-move-question="1" ${questionIndex === section.questions.length - 1 ? 'disabled' : ''}>↓ تأخير</button>
          <button type="button" class="button danger" data-study-delete-question="${question.id}">حذف السؤال</button></div></article>`).join('')}
      <form class="study-form-grid study-add-question" data-study-form="question-add" data-section="${section.id}">
        <h4 class="study-field-wide">إضافة سؤال</h4><label class="study-field-wide">نص السؤال<input name="question_text" required minlength="2" maxlength="2000"></label>
        <label>نوع السؤال<select name="question_type"><option value="multiple_choice">اختيار من متعدد</option><option value="true_false">صح أو خطأ</option></select></label>
        <label class="study-question-options">الاختيارات (كل اختيار في سطر)<textarea name="options" rows="3" required></textarea></label>
        <label class="study-correct-answer">الإجابة الصحيحة<input name="correct_answer" required></label>
        <label class="study-field-wide">شرح الإجابة<textarea name="explanation" required minlength="2" maxlength="3000" rows="2"></textarea></label>
        <button class="button" type="submit">إضافة السؤال</button></form></div></article>`).join('');
    return `<section class="panel study-authoring-panel" id="study-lesson-editor"><div class="panel-head"><div><h2>محتوى الدرس: ${esc(lesson.title)}</h2><p>${esc(lesson.subject_name)} · ${esc(lesson.unit_title)} · ${esc(lesson.group_name)}</p></div>
      <button class="button secondary" type="button" data-study-close-editor>إغلاق المحرر</button></div>
      <form class="study-form-grid" data-study-form="lesson-edit" data-id="${lesson.id}">
        <label>عنوان الدرس<input name="title" required minlength="2" maxlength="160" value="${esc(lesson.title)}"></label>
        <label>المادة<select name="subject_id" required>${state.studyManageData.subjects.map(item => `<option value="${item.id}" ${item.id === lesson.subject_id ? 'selected' : ''}>${esc(item.name)} · ${esc(item.level_name)}</option>`).join('')}</select></label>
        <label>الوحدة<select name="unit_id" required>${state.studyManageData.units.map(item => `<option value="${item.id}" ${item.id === lesson.unit_id ? 'selected' : ''}>${esc(item.title)} · ${esc(item.subject_name)}</option>`).join('')}</select></label>
        <label>الفرقة<select name="level_id" required>${state.studyManageData.levels.map(item => `<option value="${item.id}" ${item.id === lesson.level_id ? 'selected' : ''}>${esc(item.name)}</option>`).join('')}</select></label>
        <label>المجموعة<select name="group_id" required>${state.studyManageData.groups.map(item => `<option value="${item.id}" ${item.id === lesson.group_id ? 'selected' : ''}>${esc(item.name)} · ${esc(state.studyManageData.levels.find(level => level.id === item.level_id)?.name || '')}</option>`).join('')}</select></label>
        <label>الحالة<select name="status"><option value="draft" ${lesson.status === 'draft' ? 'selected' : ''}>مسودة</option><option value="published" ${lesson.status === 'published' ? 'selected' : ''}>منشور</option></select></label>
        <label class="study-field-wide">الوصف<textarea name="description" maxlength="2000" rows="2">${esc(lesson.description || '')}</textarea></label>
        <button class="button" type="submit">حفظ بيانات الدرس</button></form>
      <h3 class="section-title">الأقسام والأسئلة</h3><div class="study-sections-editor">${sections || '<p class="muted">أضف القسم الأول لبدء بناء الدرس.</p>'}</div>
      <form class="study-form-grid study-add-section" data-study-form="section-add" data-lesson="${lesson.id}">
        <h3 class="study-field-wide">إضافة قسم</h3><label>عنوان القسم<input name="title" required minlength="2" maxlength="160"></label>
        <label class="study-field-wide">الشرح التعليمي<textarea name="content" required minlength="2" maxlength="12000" rows="5"></textarea></label>
        <label>صورة توضيحية من المكتبة<select name="image_material_id"><option value="">بدون صورة</option>${imageOptions}</select></label>
        <button class="button" type="submit">إضافة القسم</button></form></section>`;
  }

  function formValue(form, key) {
    return new FormData(form).get(key);
  }

  async function bindManagerEvents() {
    const rootElement = document.querySelector('#interactive-study-root');
    if (!rootElement) return;
    rootElement.addEventListener('click', async event => {
      const button = event.target.closest('button');
      if (!button) return;
      try {
        if (button.matches('[data-study-edit-lesson]')) {
          state.studyEditLessonId = Number(button.dataset.studyEditLesson);
          await renderStudyManager();
          document.querySelector('#study-lesson-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else if (button.matches('[data-study-close-editor]')) {
          state.studyEditLessonId = null;
          await renderStudyManager();
        } else if (button.matches('[data-study-publish]')) {
          const status = button.dataset.status === 'published' ? 'draft' : 'published';
          await api(`/interactive-study/manage/lessons/${button.dataset.studyPublish}`, { method: 'PATCH', body: JSON.stringify({ status }) });
          toast(status === 'published' ? 'تم نشر الدرس' : 'تم حفظ الدرس كمسودة');
          await renderStudyManager();
        } else if (button.matches('[data-study-delete-lesson]')) {
          if (!confirm('هل تريد حذف هذا الدرس ومحتواه؟')) return;
          await api(`/interactive-study/manage/lessons/${button.dataset.studyDeleteLesson}`, { method: 'DELETE', body: '{}' });
          state.studyEditLessonId = null;
          toast('تم حذف الدرس');
          await renderStudyManager();
        } else if (button.matches('[data-study-unit-edit]')) {
          const unit = byId(state.studyManageData.units, button.dataset.studyUnitEdit);
          const title = prompt('اسم الوحدة:', unit.title);
          if (title === null) return;
          await api(`/interactive-study/manage/units/${unit.id}`, { method: 'PATCH', body: JSON.stringify({ title }) });
          toast('تم تعديل الوحدة');
          await renderStudyManager();
        } else if (button.matches('[data-study-unit-delete]')) {
          if (!confirm('هل تريد حذف هذه الوحدة؟')) return;
          await api(`/interactive-study/manage/units/${button.dataset.studyUnitDelete}`, { method: 'DELETE', body: '{}' });
          toast('تم حذف الوحدة');
          await renderStudyManager();
        } else if (button.matches('[data-study-delete-section]')) {
          if (!confirm('هل تريد حذف هذا القسم وأسئلته؟')) return;
          await api(`/interactive-study/manage/sections/${button.dataset.studyDeleteSection}`, { method: 'DELETE', body: '{}' });
          toast('تم حذف القسم');
          await renderStudyManager();
        } else if (button.matches('[data-study-delete-question]')) {
          if (!confirm('هل تريد حذف هذا السؤال؟')) return;
          await api(`/interactive-study/manage/questions/${button.dataset.studyDeleteQuestion}`, { method: 'DELETE', body: '{}' });
          toast('تم حذف السؤال');
          await renderStudyManager();
        } else if (button.matches('[data-study-move-section]')) {
          const section = button.closest('[data-section-id]');
          const sections = [...section.parentElement.querySelectorAll('[data-section-id]')];
          const order = sections.map(item => Number(item.dataset.sectionId));
          const from = order.indexOf(Number(section.dataset.sectionId));
          const to = from + Number(button.dataset.studyMoveSection);
          [order[from], order[to]] = [order[to], order[from]];
          await api(`/interactive-study/manage/lessons/${state.studyEditorLesson.id}/sections/order`, { method: 'PATCH', body: JSON.stringify({ section_ids: order }) });
          await renderStudyManager();
        } else if (button.matches('[data-study-move-question]')) {
          const question = button.closest('[data-question-id]'), section = button.closest('[data-section-id]');
          const questions = [...section.querySelectorAll('[data-question-id]')];
          const order = questions.map(item => Number(item.dataset.questionId));
          const from = order.indexOf(Number(question.dataset.questionId));
          const to = from + Number(button.dataset.studyMoveQuestion);
          [order[from], order[to]] = [order[to], order[from]];
          await api(`/interactive-study/manage/sections/${section.dataset.sectionId}/questions/order`, { method: 'PATCH', body: JSON.stringify({ question_ids: order }) });
          await renderStudyManager();
        }
      } catch (error) { showError(error); }
    });
    rootElement.addEventListener('submit', async event => {
      const form = event.target.closest('form[data-study-form]');
      if (!form) return;
      event.preventDefault();
      const button = form.querySelector('button[type="submit"]');
      if (button) button.disabled = true;
      try {
        const type = form.dataset.studyForm;
        const value = key => formValue(form, key);
        if (type === 'subject') {
          await api('/academic/subjects', { method: 'POST', body: JSON.stringify({ name: value('name'), level_id: Number(value('level_id')) }) });
          toast('تمت إضافة المادة');
        } else if (type === 'unit') {
          await api('/interactive-study/manage/units', { method: 'POST', body: JSON.stringify({ subject_id: Number(value('subject_id')), title: value('title') }) });
          toast('تمت إضافة الوحدة');
        } else if (type === 'lesson') {
          const status = value('status');
          await api('/interactive-study/manage/lessons', { method: 'POST', body: JSON.stringify({
            title: value('title'), description: value('description'), subject_id: Number(value('subject_id')),
            unit_id: Number(value('unit_id')), level_id: Number(value('level_id')), group_id: Number(value('group_id')),
            status
          }) });
          toast('تم إنشاء الدرس كمسودة؛ أضف المحتوى ثم انشره');
        } else if (type === 'lesson-edit') {
          await api(`/interactive-study/manage/lessons/${form.dataset.id}`, { method: 'PATCH', body: JSON.stringify({
            title: value('title'), description: value('description'), subject_id: Number(value('subject_id')),
            unit_id: Number(value('unit_id')), level_id: Number(value('level_id')), group_id: Number(value('group_id')),
            status: value('status')
          }) });
          toast('تم حفظ بيانات الدرس');
        } else if (type === 'section-add' || type === 'section-edit') {
          const body = { title: value('title'), content: value('content'), image_material_id: value('image_material_id') || null };
          const url = type === 'section-add'
            ? `/interactive-study/manage/lessons/${form.dataset.lesson}/sections`
            : `/interactive-study/manage/sections/${form.dataset.id}`;
          await api(url, { method: type === 'section-add' ? 'POST' : 'PATCH', body: JSON.stringify(body) });
          toast(type === 'section-add' ? 'تمت إضافة القسم' : 'تم حفظ القسم');
        } else if (type === 'question-add' || type === 'question-edit') {
          const questionType = value('question_type');
          const body = {
            question_text: value('question_text'), question_type: questionType,
            options: questionType === 'multiple_choice' ? value('options').split(/\r?\n/).map(item => item.trim()).filter(Boolean) : undefined,
            correct_answer: value('correct_answer'), explanation: value('explanation')
          };
          const url = type === 'question-add'
            ? `/interactive-study/manage/sections/${form.dataset.section}/questions`
            : `/interactive-study/manage/questions/${form.dataset.id}`;
          await api(url, { method: type === 'question-add' ? 'POST' : 'PATCH', body: JSON.stringify(body) });
          toast(type === 'question-add' ? 'تمت إضافة السؤال' : 'تم حفظ السؤال');
        }
        await renderStudyManager();
      } catch (error) {
        if (button) button.disabled = false;
        showError(error);
      }
    });
    rootElement.addEventListener('change', event => {
      const select = event.target.closest('select[name="question_type"]');
      if (!select) return;
      const form = select.closest('form');
      const options = form.querySelector('.study-question-options');
      const correct = form.querySelector('[name="correct_answer"]');
      const isBoolean = select.value === 'true_false';
      options?.classList.toggle('hidden', isBoolean);
      if (options?.querySelector('textarea')) options.querySelector('textarea').required = !isBoolean;
      if (isBoolean) {
        if (!['true', 'false'].includes(correct.value)) correct.value = 'true';
        correct.setAttribute('list', 'study-boolean-options');
        let list = form.querySelector('#study-boolean-options');
        if (!list) {
          list = document.createElement('datalist');
          list.id = 'study-boolean-options';
          list.innerHTML = '<option value="true"><option value="false">';
          correct.after(list);
        }
      } else {
        correct.removeAttribute('list');
        form.querySelector('#study-boolean-options')?.remove();
        const firstOption = options?.querySelector('textarea')?.value.split(/\r?\n/).map(item => item.trim()).find(Boolean);
        if (firstOption && !options.querySelector('textarea').value.split(/\r?\n/).includes(correct.value)) correct.value = firstOption;
      }
    });
  }

  if (state.route === 'study-manage') return renderStudyManager();
  if (state.studyMode === 'lesson') return renderLesson();
  if (state.studyMode === 'finish') return renderFinish();
  if (state.studyMode === 'result') return renderResult();
  if (state.studyMode === 'mistakes') return renderMistakes();
  return renderCatalog();
}
