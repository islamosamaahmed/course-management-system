import assert from 'node:assert/strict';
import test from 'node:test';
import {
  detectIntent,
  detectMultiIntents,
  extractDateRange,
  registerAiAssistantRoutes,
  STUDENT_INTENTS
} from '../server/ai-assistant.js';
import { today } from '../server/db.js';

const cases = [
  ['عندي محاضرات إيه النهارده؟', 'schedule'],
  ['إيه جدول اليوم؟', 'schedule'],
  ['المحاضرات بتاعتي إيه؟', 'schedule'],
  ['اعرض المحاضرات القادمة', 'schedule'],
  ['محاظراتي انهارده', 'schedule'],
  ['مين حضر النهارده؟', 'groupAttendance'],
  ['عاوز أعرف مين غاب', 'groupAttendance'],
  ['أنا غبت كام مرة؟', 'myAttendance'],
  ['حضوري نسبته كام؟', 'myAttendance'],
  ['مين لسه مدفعش؟', 'dues'],
  ['هات الطلاب اللي عليهم فلوس', 'dues'],
  ['عليا كام؟', 'balance'],
  ['فاضل عليا كام؟', 'balance'],
  ['كام المتبقي في الكورس؟', 'balance'],
  ['إجمالي رسوم الكورس كام؟', 'balance'],
  ['أنا دفعت كام؟', 'balance'],
  ['سجّل حضور المجموعة', 'groupAttendance'],
  ['اعرض درجات الطلاب', 'results'],
  ['عدد الطلاب النشطين كام؟', 'studentCount'],
  ['How many students are active?', 'studentCount'],
  ['What is the number of active students?', 'studentCount'],
  ['إجمالي المدفوعات كام؟', 'paymentsTotal'],
  ['عدد المحاضرات القادمة', 'sessionCount'],
  ['عندي كام محاضرة النهارده؟', 'scheduleCount'],
  ['عندي كام محاضرة الأسبوع الجاي؟', 'scheduleCount'],
  ['كم اختبار منشور؟', 'examCount'],
  ['عندي امتحانات إمتى؟', 'exams'],
  ['هات تقرير المجموعة', 'groupReport'],
  ['مجموع المتبقي كام؟', 'duesTotal'],
  ['ابحث عن طالب', 'studentLookup'],
  ['بيانات اسلام اسامه', 'studentLookup'],
  ['هل اسلام دفع فلوس الكورس؟', 'studentLookup'],
  ['هل isalm حضر محاضرة؟', 'studentLookup'],
  ['بياناتي', 'profile'],
  ['اسمي إيه؟', 'profile'],
  ['كود الطالب بتاعي كام؟', 'profile'],
  ['أنا في فرقة إيه؟', 'profile'],
  ['أنا في مجموعة إيه؟', 'profile'],
  ['كودي ايه', 'profile'],
  ['ممكن تقولي كودي لو سمحت', 'profile'],
  ['كودي اي هو', 'profile'],
  ['عاوز اعرف كودي', 'profile'],
  ['كودي فين', 'profile'],
  ['كودي رقم كام', 'profile'],
  ['كودي عاوزه', 'profile'],
  ['ممكن أعرف رقم الطالب بتاعي', 'profile'],
  ['رقمي في النظام كام', 'profile'],
  ['إيه الفرقة بتاعتي؟', 'profile'],
  ['أنا تبع مجموعة إيه؟', 'profile'],
  ['What is my student ID?', 'profile'],
  ['Can you tell me my code please?', 'profile'],
  ['غياباتي في كل مادة كام؟', 'myAttendance'],
  ['حضرت كام محاضرة؟', 'myAttendance'],
  ['مين الدكتور في المحاضرة الجاية؟', 'schedule'],
  ['مين دكتور مادة المحاسبة؟', 'doctorLookup'],
  ['إيه المواد المقررة عليا؟', 'subjects'],
  ['إيه حالة الكورس ومواعيده؟', 'courseInfo'],
  ['نتيجتي في الامتحانات إيه؟', 'results'],
  ['What is my balance?', 'balance'],
  ['What is my attendance?', 'myAttendance'],
  ['What is my schedule today?', 'schedule'],
  ['What is my next class?', 'schedule'],
  ['How many absences do I have?', 'myAttendance'],
  ['What is my attendance percentage?', 'myAttendance'],
  ['أكّد', 'confirm'],
  ['تمام، سجل حضور المجموعة', 'groupAttendance'],
  ['لا، أكد', 'cancel'],
  ['إلغاء', 'cancel']
];

for (const [message, expected] of cases) {
  test(`classifies ${message} as ${expected}`, () => {
    assert.equal(detectIntent(message).intent, expected);
  });
}

test('does not map unrelated questions to a site-data tool', () => {
  assert.equal(detectIntent('إيه أفضل مطعم في إيطاليا؟').intent, 'unknown');
});

test('Arabic week expressions are converted to Cairo-local Saturday-to-Friday ranges', () => {
  const thisWeek = extractDateRange('محاضرات الاسبوع ده');
  const nextWeek = extractDateRange('محاضرات الاسبوع الجاي');
  assert.ok(thisWeek);
  assert.ok(nextWeek);
  assert.equal(Date.parse(`${thisWeek.end}T00:00:00Z`) - Date.parse(`${thisWeek.start}T00:00:00Z`), 6 * 86400000);
  assert.equal(Date.parse(`${nextWeek.start}T00:00:00Z`) - Date.parse(`${thisWeek.start}T00:00:00Z`), 7 * 86400000);
});

test('intent detection tolerates common Arabic misspellings', () => {
  assert.equal(detectIntent('عندي محاضره النهردة؟').intent, 'schedule');
  assert.equal(detectIntent('اختبار المحاسبه').intent, 'exams');
});

test('multi-intent detection extracts separate semantic requests', () => {
  assert.deepEqual(
    detectMultiIntents('عندي كام غياب ولسه عليا كام مصاريف')?.map(item => item.intent),
    ['myAttendance', 'balance']
  );
});

test('returns write intent metadata for an attendance command', () => {
  const parsed = detectIntent('سجل حضور مجموعة النخيل');
  assert.equal(parsed.intent, 'groupAttendance');
  assert.equal(parsed.imperative, true);
});

test('extracts a named student from profile and payment questions', () => {
  assert.equal(detectIntent('بيانات اسلام اسامه').studentName, 'اسلام اسامه');
  const payment = detectIntent('هل اسلام دفع فلوس الكورس؟');
  assert.equal(payment.intent, 'studentLookup');
  assert.equal(payment.studentName, 'اسلام');
  assert.equal(payment.studentLookupMode, 'finance');
});

function routeHarness(db) {
  const routes = new Map();
  const app = Object.fromEntries(['get', 'post', 'delete'].map(method => [
    method,
    (path, ...handlers) => routes.set(`${method} ${path}`, handlers)
  ]));
  registerAiAssistantRoutes(app, db);
  return async (method, path, req) => {
    const handlers = routes.get(`${method} ${path}`);
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; }
    };
    const next = index => {
      if (index >= handlers.length) return Promise.resolve();
      let following;
      const result = handlers[index](req, res, () => {
        following = next(index + 1);
        return following;
      });
      return Promise.resolve(result).then(() => following);
    };
    await next(0);
    return res;
  };
}

test('unknown chat requests include clickable role-specific suggestions in messages and history', async () => {
  const unknownMessage = 'إيه أفضل مطعم في إيطاليا؟';
  const db = {
    async query(sql) {
      if (sql.includes('SELECT message,response FROM ai_chat_messages')) return { rows: [] };
      if (sql.includes('SELECT id,user_id,user_name,user_role,message,response,created_at')) {
        return { rows: [{
          id: 1, user_id: 41, user_name: 'طالب', user_role: 'student',
          message: unknownMessage, response: 'لم أتمكن من تحديد وظيفة مناسبة.',
          created_at: '2026-10-05T18:00:00Z'
        }] };
      }
      if (sql.includes('DELETE FROM ai_pending_actions')) return { rows: [], changes: 0 };
      if (sql.includes('INSERT INTO ai_chat_messages')) {
        return { rows: [{ id: 2, created_at: '2026-10-05T18:01:00Z' }] };
      }
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  const request = routeHarness(db);
  const user = { id: 41, name: 'طالب', role: 'student' };
  const response = await request('post', '/api/ai/chat/message', {
    user,
    body: { message: unknownMessage }
  });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body.suggestedQuestions, [
    'جدولي النهارده إيه؟',
    'عندي كام غياب؟',
    'فاضل عليا كام؟',
    'كودي إيه؟'
  ]);

  const history = await request('get', '/api/ai/chat/history', { user });
  assert.equal(history.statusCode, 200);
  assert.deepEqual(history.body.messages[0].suggestedQuestions, response.body.suggestedQuestions);
});

test('chat bootstrap returns role-specific suggestions without querying student data', async () => {
  const db = {
    async query() {
      throw new Error('The chat bootstrap must not query application data.');
    }
  };
  const request = routeHarness(db);
  const response = await request('get', '/api/ai/chat/bootstrap', {
    user: { id: 9, name: 'Mona', role: 'assistant' }
  });
  assert.equal(response.statusCode, 200);
  assert.match(response.body.greeting, /Mona/);
  assert.ok(Array.isArray(response.body.suggestedQuestions));
  assert.equal(response.body.suggestedQuestions.length, 4);
  assert.ok(response.body.suggestedQuestions.every(question => typeof question === 'string' && question.length > 0));
  assert.ok(response.body.allQuestions.length >= response.body.suggestedQuestions.length);
});

test('chat bootstrap limits buttons to tools granted by the authenticated permissions', async () => {
  const db = {
    async query() {
      throw new Error('The chat bootstrap must not query application data.');
    }
  };
  const request = routeHarness(db);
  const response = await request('get', '/api/ai/chat/bootstrap', {
    user: {
      id: 9,
      name: 'Assistant',
      role: 'assistant',
      permissions: ['LECTURES_VIEW']
    }
  });
  assert.ok(response.body.allQuestions.includes('آخر محاضرة كانت إمتى؟'));
  assert.ok(response.body.allQuestions.includes('اعرض المواد المقررة'));
  assert.ok(!response.body.allQuestions.some(question =>
    /مدفعش|حضر|تقرير المجموعة|إجمالي المدفوعات/.test(question)));
});

test('group attendance prompts offer level buttons followed by group buttons', async () => {
  const groups = [
    { id: 17, name: 'مجموعة النخيل', level_id: 1, level_name: 'الفرقة الأولى' },
    { id: 18, name: 'مجموعة الورد', level_id: 1, level_name: 'الفرقة الأولى' },
    { id: 19, name: 'مجموعة البحر', level_id: 2, level_name: 'الفرقة الثانية' }
  ];
  const db = {
    async query(sql) {
      if (sql.includes('SELECT message,response FROM ai_chat_messages')) return { rows: [] };
      if (sql.includes('DELETE FROM ai_pending_actions')) return { rows: [], changes: 0 };
      if (sql.includes('SELECT g.id,g.name,g.level_id,l.name level_name')) return { rows: groups };
      if (sql.includes('INSERT INTO ai_chat_messages')) {
        return { rows: [{ id: 3, created_at: '2026-10-05T10:00:00Z' }] };
      }
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  const request = routeHarness(db);
  const response = await request('post', '/api/ai/chat/message', {
    user: { id: 7, name: 'Admin', role: 'admin' },
    body: { message: 'مين حضر النهارده؟' }
  });
  assert.equal(response.statusCode, 200);
  assert.match(response.body.response, /اختار الفرقة والمجموعة من الأزرار/);
  assert.deepEqual(response.body.suggestedQuestions.slice(0, 2), [
    { label: 'الفرقة الأولى', message: 'مين حضر النهارده؟ الفرقة الأولى' },
    { label: 'الفرقة الثانية', message: 'مين حضر النهارده؟ الفرقة الثانية' }
  ]);
  assert.ok(response.body.suggestedQuestions.length > 4);

  const next = await request('post', '/api/ai/chat/message', {
    user: { id: 7, name: 'Admin', role: 'admin' },
    body: { message: 'مين حضر النهارده؟ الفرقة الأولى' }
  });
  assert.deepEqual(next.body.suggestedQuestions.slice(0, 2), [
    {
      label: 'مجموعة النخيل',
      message: 'مين حضر النهارده؟ الفرقة الأولى مجموعة النخيل'
    },
    {
      label: 'مجموعة الورد',
      message: 'مين حضر النهارده؟ الفرقة الأولى مجموعة الورد'
    }
  ]);
  assert.ok(next.body.suggestedQuestions.length > 4);
});

test('new group requests ignore groups selected earlier in chat history', async () => {
  const groups = [
    { id: 17, name: 'مجموعة النخيل', level_id: 1, level_name: 'الفرقة الأولى' },
    { id: 19, name: 'مجموعة البحر', level_id: 2, level_name: 'الفرقة الثانية' }
  ];
  const db = {
    async query(sql) {
      if (sql.includes('SELECT message,response FROM ai_chat_messages')) {
        return { rows: [{
          message: 'مين حضر النهارده؟ الفرقة الأولى مجموعة النخيل',
          response: 'حضور مجموعة النخيل'
        }] };
      }
      if (sql.includes('DELETE FROM ai_pending_actions')) return { rows: [], changes: 0 };
      if (sql.includes('SELECT g.id,g.name,g.level_id,l.name level_name')) return { rows: groups };
      if (sql.includes('INSERT INTO ai_chat_messages')) {
        return { rows: [{ id: 5, created_at: '2026-10-05T10:00:00Z' }] };
      }
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  const request = routeHarness(db);
  const response = await request('post', '/api/ai/chat/message', {
    user: { id: 7, name: 'Admin', role: 'admin' },
    body: { message: 'مين غاب النهارده؟' }
  });
  assert.match(response.body.response, /اختار الفرقة والمجموعة من الأزرار/);
  assert.deepEqual(response.body.suggestedQuestions.slice(0, 2), [
    { label: 'الفرقة الأولى', message: 'مين غاب النهارده؟ الفرقة الأولى' },
    { label: 'الفرقة الثانية', message: 'مين غاب النهارده؟ الفرقة الثانية' }
  ]);
});

test('remaining total is requested within a chosen group rather than guessed from history', async () => {
  const groups = [
    { id: 17, name: 'مجموعة النخيل', level_id: 1, level_name: 'الفرقة الأولى' }
  ];
  const db = {
    async query(sql) {
      if (sql.includes('SELECT message,response FROM ai_chat_messages')) {
        return { rows: [{
          message: 'مين لسه مدفعش؟ الفرقة الأولى مجموعة النخيل',
          response: 'مستحقات مجموعة النخيل'
        }] };
      }
      if (sql.includes('DELETE FROM ai_pending_actions')) return { rows: [], changes: 0 };
      if (sql.includes('SELECT g.id,g.name,g.level_id,l.name level_name')) return { rows: groups };
      if (sql.includes('INSERT INTO ai_chat_messages')) {
        return { rows: [{ id: 6, created_at: '2026-10-05T10:00:00Z' }] };
      }
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  const request = routeHarness(db);
  const response = await request('post', '/api/ai/chat/message', {
    user: { id: 7, name: 'Admin', role: 'admin' },
    body: { message: 'مجموع المتبقي كام؟' }
  });
  assert.match(response.body.response, /اختار الفرقة والمجموعة من الأزرار لحساب مجموع/);
  assert.equal(response.body.suggestedQuestions[0].label, 'الفرقة الأولى');
});

test('student search button opens a selectable list of students', async () => {
  const db = {
    async query(sql) {
      if (sql.includes('SELECT message,response FROM ai_chat_messages')) return { rows: [] };
      if (sql.includes('DELETE FROM ai_pending_actions')) return { rows: [], changes: 0 };
      if (sql.includes('SELECT name,code FROM students')) {
        return { rows: [
          { name: 'طالب أول', code: 'ST01' },
          { name: 'طالب ثان', code: 'ST02' }
        ] };
      }
      if (sql.includes('INSERT INTO ai_chat_messages')) {
        return { rows: [{ id: 4, created_at: '2026-10-05T10:00:00Z' }] };
      }
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  const request = routeHarness(db);
  const response = await request('post', '/api/ai/chat/message', {
    user: {
      id: 7,
      name: 'Assistant',
      role: 'assistant',
      permissions: ['STUDENTS_VIEW']
    },
    body: { message: 'ابحث عن طالب' }
  });
  assert.equal(response.statusCode, 200);
  assert.match(response.body.response, /اذكر اسم الطالب أو كوده/);
  assert.deepEqual(response.body.suggestedQuestions.slice(0, 2), [
    { label: 'طالب أول (ST01)', message: 'ابحث عن طالب ST01' },
    { label: 'طالب ثان (ST02)', message: 'ابحث عن طالب ST02' }
  ]);
});

test('student balance uses only their authenticated student record and payment rows', async () => {
  const seen = [];
  const db = {
    async query(sql, params = []) {
      seen.push({ sql, params });
      if (sql.includes('SELECT message,response FROM ai_chat_messages')) return { rows: [] };
      if (sql.includes('DELETE FROM ai_pending_actions')) return { rows: [], changes: 0 };
      if (sql.includes('FROM students s JOIN groups_table')) {
        return { rows: [{
          id: 27, user_id: 41, name: 'طالب تجريبي', code: 'ST27',
          group_id: 8, group_name: 'مجموعة النخيل', level_id: 2,
          level_name: 'الفرقة الثانية', price: 120000
        }] };
      }
      if (sql.includes('FROM payments WHERE student_id=?')) return { rows: [{ total: 80000 }] };
      if (sql.includes('INSERT INTO ai_chat_messages')) {
        return { rows: [{ id: 1, created_at: '2026-10-04T18:00:00Z' }] };
      }
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  const request = routeHarness(db);
  const response = await request('post', '/api/ai/chat/message', {
    user: { id: 41, name: 'طالب تجريبي', role: 'student' },
    body: { message: 'كام المتبقي في الكورس؟' }
  });
  assert.equal(response.statusCode, 200);
  assert.match(response.body.response, /متبقي/);
  assert.ok(seen.some(query => query.sql.includes('FROM payments WHERE student_id=?') &&
    query.params[0] === 27));
});

test('student course info combines only their own fees with their upcoming schedule', async () => {
  const studentQueries = [];
  const db = {
    async query(sql, params = []) {
      if (sql.includes('SELECT message,response FROM ai_chat_messages')) return { rows: [] };
      if (sql.includes('DELETE FROM ai_pending_actions')) return { rows: [], changes: 0 };
      if (sql.includes('FROM students s JOIN groups_table')) {
        studentQueries.push(params[0]);
        return { rows: [{
          id: 27, user_id: 41, name: 'طالب تجريبي', code: 'ST27',
          group_id: 8, group_name: 'مجموعة النخيل', level_id: 2,
          level_name: 'الفرقة الثانية', price: 120000
        }] };
      }
      if (sql.includes('FROM payments WHERE student_id=?')) {
        assert.equal(params[0], 27);
        return { rows: [{ total: 80000 }] };
      }
      if (sql.includes('FROM course_sessions cs') && sql.includes('EXISTS')) {
        assert.equal(params.at(-1), 27);
        return { rows: [] };
      }
      if (sql.includes('INSERT INTO ai_chat_messages')) return { rows: [{ id: 2, created_at: '2026-10-05T10:00:00Z' }] };
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  const request = routeHarness(db);
  const response = await request('post', '/api/ai/chat/message', {
    user: { id: 41, name: 'طالب تجريبي', role: 'student' },
    body: { message: 'إيه حالة الكورس ومواعيده؟' }
  });
  assert.equal(response.statusCode, 200);
  assert.match(response.body.response, /المتبقي/);
  assert.equal(response.body.response.match(/محاضرات قادمة/g)?.length, 1);
  assert.ok(studentQueries.length > 0);
  assert.ok(studentQueries.every(id => id === 41));
});

test('student doctor lookup matches Arabic subject spelling variants', async () => {
  const db = {
    async query(sql, params = []) {
      if (sql.includes('SELECT message,response FROM ai_chat_messages')) return { rows: [] };
      if (sql.includes('DELETE FROM ai_pending_actions')) return { rows: [], changes: 0 };
      if (sql.includes('FROM students s JOIN groups_table')) {
        assert.equal(params[0], 41);
        return { rows: [{
          id: 27, user_id: 41, name: 'طالب تجريبي', code: 'ST27',
          group_id: 8, group_name: 'مجموعة النخيل', level_id: 2,
          level_name: 'الفرقة الثانية'
        }] };
      }
      if (sql.includes('FROM subjects s JOIN users u ON u.id=s.doctor_id')) {
        assert.deepEqual(params, [2]);
        return { rows: [{ subject_name: 'محاسبة', doctor_name: 'أحمد رشاد' }] };
      }
      if (sql.includes('INSERT INTO ai_chat_messages')) return { rows: [{ id: 3, created_at: '2026-10-05T10:00:00Z' }] };
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  const request = routeHarness(db);
  const response = await request('post', '/api/ai/chat/message', {
    user: { id: 41, name: 'طالب تجريبي', role: 'student' },
    body: { message: 'مين دكتور مادة المحاسبة؟' }
  });
  assert.equal(response.statusCode, 200);
  assert.match(response.body.response, /أحمد رشاد/);
  assert.doesNotMatch(response.body.response, /د\. د\./);
});

test('student can request their absence breakdown by subject', async () => {
  const db = {
    async query(sql, params = []) {
      if (sql.includes('SELECT message,response FROM ai_chat_messages')) return { rows: [] };
      if (sql.includes('DELETE FROM ai_pending_actions')) return { rows: [], changes: 0 };
      if (sql.includes('FROM students s JOIN groups_table')) {
        assert.equal(params[0], 41);
        return { rows: [{
          id: 27, user_id: 41, name: 'طالب تجريبي', code: 'ST27',
          group_id: 8, group_name: 'مجموعة النخيل', level_id: 2
        }] };
      }
      if (sql.includes('SELECT COALESCE(s.name, cs.title) subject_name')) {
        assert.deepEqual(params, [27, 27, today()]);
        return { rows: [{ subject_name: 'محاسبة', count: 2 }] };
      }
      if (sql.includes('INSERT INTO ai_chat_messages')) return { rows: [{ id: 4, created_at: '2026-10-05T10:00:00Z' }] };
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  const request = routeHarness(db);
  const response = await request('post', '/api/ai/chat/message', {
    user: { id: 41, name: 'طالب تجريبي', role: 'student' },
    body: { message: 'غياباتي في كل مادة كام؟' }
  });
  assert.equal(response.statusCode, 200);
  assert.match(response.body.response, /محاسبة: 2 غياب/);
});

test('student attendance questions include their attendance percentage', async () => {
  const db = {
    async query(sql, params = []) {
      if (sql.includes('SELECT message,response FROM ai_chat_messages')) return { rows: [] };
      if (sql.includes('DELETE FROM ai_pending_actions')) return { rows: [], changes: 0 };
      if (sql.includes('FROM students s JOIN groups_table')) {
        assert.equal(params[0], 41);
        return { rows: [{
          id: 27, user_id: 41, name: 'طالب تجريبي', code: 'ST27',
          group_id: 8, group_name: 'مجموعة النخيل', level_id: 2
        }] };
      }
      if (sql.includes('SELECT cs.date,cs.title,g.name group_name')) {
        assert.deepEqual(params, [27, 27, today()]);
        return { rows: [
          { status: 'حاضر' },
          { status: 'غائب' },
          { status: 'حاضر' }
        ] };
      }
      if (sql.includes('INSERT INTO ai_chat_messages')) return { rows: [{ id: 5, created_at: '2026-10-05T10:00:00Z' }] };
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  const request = routeHarness(db);
  const response = await request('post', '/api/ai/chat/message', {
    user: { id: 41, name: 'طالب تجريبي', role: 'student' },
    body: { message: 'What is my attendance percentage?' }
  });
  assert.equal(response.statusCode, 200);
  assert.match(response.body.response, /67% attendance/);
  assert.match(response.body.response, /absent 1/);
});

test('student lecture counts use their own schedule instead of global statistics', async () => {
  const calls = [];
  const db = {
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (sql.includes('SELECT message,response FROM ai_chat_messages')) return { rows: [] };
      if (sql.includes('DELETE FROM ai_pending_actions')) return { rows: [], changes: 0 };
      if (sql.includes('FROM students s JOIN groups_table')) {
        return { rows: [{
          id: 27, user_id: 41, name: 'طالب', code: 'ST27',
          group_id: 8, group_name: 'مجموعة النخيل', level_id: 2
        }] };
      }
      if (sql.includes('FROM course_sessions cs') && sql.includes('EXISTS')) {
        return { rows: [
          { id: 1, title: 'محاضرة المحاسبة', date: today(), start_time: '10:00', doctor_name: 'أحمد' },
          { id: 2, title: 'محاضرة الإدارة', date: today(), start_time: '12:00', doctor_name: 'محمود' }
        ] };
      }
      if (sql.includes('INSERT INTO ai_chat_messages')) return { rows: [{ id: 20, created_at: '2026-10-05T10:00:00Z' }] };
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  const request = routeHarness(db);
  const response = await request('post', '/api/ai/chat/message', {
    user: { id: 41, name: 'طالب', role: 'student' },
    body: { message: 'عندي كام محاضرة النهارده ومين الدكاترة؟' }
  });
  assert.equal(response.statusCode, 200);
  assert.match(response.body.response, /عندك 2 محاضرة/);
  assert.match(response.body.response, /أحمد/);
  assert.match(response.body.response, /محمود/);
  assert.ok(calls.some(({ sql, params }) => sql.includes('EXISTS') && params.at(-1) === 27));
  assert.ok(!calls.some(({ sql }) => sql.startsWith('SELECT COUNT(*) total FROM course_sessions')));
});

test('compound personal requests return both actual attendance and balance', async () => {
  const db = {
    async query(sql) {
      if (sql.includes('SELECT message,response FROM ai_chat_messages')) return { rows: [] };
      if (sql.includes('DELETE FROM ai_pending_actions')) return { rows: [], changes: 0 };
      if (sql.includes('FROM students s JOIN groups_table')) {
        return { rows: [{
          id: 27, user_id: 41, name: 'طالب', code: 'ST27',
          group_id: 8, group_name: 'مجموعة النخيل', level_id: 2,
          level_name: 'الفرقة الثانية', price: 120000
        }] };
      }
      if (sql.includes('SELECT cs.date,cs.title,g.name group_name')) {
        return { rows: [
          { status: 'غائب', date: '2026-10-01' },
          { status: 'حاضر', date: '2026-10-02' }
        ] };
      }
      if (sql.includes('FROM payments WHERE student_id=?')) return { rows: [{ total: 80000 }] };
      if (sql.includes('INSERT INTO ai_chat_messages')) return { rows: [{ id: 21, created_at: '2026-10-05T10:00:00Z' }] };
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  const request = routeHarness(db);
  const response = await request('post', '/api/ai/chat/message', {
    user: { id: 41, name: 'طالب', role: 'student' },
    body: { message: 'عندي كام غياب ولسه عليا كام مصاريف؟' }
  });
  assert.equal(response.statusCode, 200);
  assert.match(response.body.response, /غبت 1/);
  assert.match(response.body.response, /المبلغ المتبقي عليك/);
});

test('schedule follow-up asking who the doctor is re-queries the authenticated user schedule', async () => {
  let scheduleParams;
  let authenticatedStudentId;
  const db = {
    async query(sql, params = []) {
      if (sql.includes('SELECT message,response FROM ai_chat_messages')) {
        return { rows: [{ message: 'عندي محاضرات النهارده؟', response: 'محاضرة المحاسبة' }] };
      }
      if (sql.includes('DELETE FROM ai_pending_actions')) return { rows: [], changes: 0 };
      if (sql.includes('FROM students s JOIN groups_table')) {
        authenticatedStudentId = params[0];
        return { rows: [{
          id: 27, user_id: 41, name: 'طالب', code: 'ST27',
          group_id: 8, group_name: 'مجموعة النخيل', level_id: 2
        }] };
      }
      if (sql.includes('FROM course_sessions cs') && sql.includes('EXISTS')) {
        scheduleParams = params;
        return { rows: [{
          id: 1, title: 'محاضرة المحاسبة', subject_name: 'محاسبة',
          doctor_name: 'أحمد رشاد', date: today(), start_time: '10:00'
        }] };
      }
      if (sql.includes('INSERT INTO ai_chat_messages')) return { rows: [{ id: 22, created_at: '2026-10-05T10:00:00Z' }] };
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  const request = routeHarness(db);
  const response = await request('post', '/api/ai/chat/message', {
    user: { id: 41, name: 'طالب', role: 'student' },
    body: { message: 'مين الدكتور؟' }
  });
  assert.equal(response.statusCode, 200);
  assert.match(response.body.response, /أحمد رشاد/);
  assert.equal(authenticatedStudentId, 41);
  assert.ok(scheduleParams?.includes(27));
});

test('confirming an action requires a standalone confirmation message', () => {
  assert.notEqual(detectIntent('أنا موافق على تسجيل الحضور').intent, 'confirm');
  assert.notEqual(detectIntent('لو مناسب أكد بعدين').intent, 'confirm');
  assert.equal(detectIntent('لا، أكد').intent, 'cancel');
});

test('assistant can access student results through AI', async () => {
  const seen = [];
  const db = {
    async query(sql, params = []) {
      seen.push(sql);
      if (sql.includes('SELECT message,response FROM ai_chat_messages')) return { rows: [] };
      if (sql.includes('DELETE FROM ai_pending_actions')) return { rows: [], changes: 0 };
      if (sql.includes('FROM groups_table g JOIN levels')) return { rows: [] };
      if (sql.includes('FROM exams e JOIN subjects s')) {
        assert.doesNotMatch(sql, /WHERE e\.doctor_id/);
        assert.deepEqual(params, []);
        return { rows: [{
          exam_title: 'اختبار عام', subject_name: 'رياضيات',
          student_name: 'طالب', code: 'S1', score: 18, total_questions: 20, percentage: 90
        }] };
      }
      if (sql.includes('INSERT INTO ai_chat_messages')) return { rows: [{ id: 2, created_at: '2026-10-04T18:00:00Z' }] };
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  const request = routeHarness(db);
  const response = await request('post', '/api/ai/chat/message', {
    user: { id: 9, name: 'مساعدة', role: 'assistant' },
    body: { message: 'اعرض درجات الطلاب' }
  });
  assert.equal(response.statusCode, 200);
  assert.match(response.body.response, /اختبار عام/);
  assert.ok(seen.some(sql => sql.includes('JOIN exam_attempts a')));
});

test('staff can look up a named student and get actual payment totals', async () => {
    const seen = [];
    const db = {
      async query(sql, params = []) {
        seen.push({ sql, params });
        if (sql.includes('SELECT message,response FROM ai_chat_messages')) return { rows: [] };
        if (sql.includes('DELETE FROM ai_pending_actions')) return { rows: [], changes: 0 };
        if (sql.includes('FROM students s JOIN levels l')) {
          assert.match(sql, /s\.name ILIKE/);
          assert.deepEqual(params, ['%اسلام اسامه%', '%اسلام اسامه%']);
          return { rows: [{
            id: 7, name: 'اسلام اسامه', code: 'ST7', level_name: 'الفرقة الأولى',
            group_name: 'المجموعة الأولى', price: 120000, paid: 80000, remaining: 40000,
            payment_status: 'دفع جزئي'
          }] };
        }
        if (sql.includes('INSERT INTO ai_chat_messages')) return { rows: [{ id: 8, created_at: '2026-10-04T18:00:00Z' }] };
        throw new Error(`Unexpected query: ${sql}`);
      }
    };
    const request = routeHarness(db);
    const response = await request('post', '/api/ai/chat/message', {
      user: { id: 9, name: 'مساعدة', role: 'assistant' },
      body: { message: 'بيانات اسلام اسامه' }
    });
    assert.equal(response.statusCode, 200);
    assert.match(response.body.response, /اسلام اسامه/);
  assert.match(response.body.response, /٨٠٠/);
  assert.match(response.body.response, /٤٠٠/);
  assert.ok(seen.some(query => query.sql.includes('FROM payments WHERE voided_at IS NULL')));
});

test('a payment question about a named student uses the finance lookup', async () => {
    let searchedName = null;
    const db = {
      async query(sql, params = []) {
        if (sql.includes('SELECT message,response FROM ai_chat_messages')) return { rows: [] };
        if (sql.includes('DELETE FROM ai_pending_actions')) return { rows: [], changes: 0 };
        if (sql.includes('FROM students s JOIN levels l')) {
          searchedName = params[0];
          return { rows: [{
            id: 12, name: 'اسلام', code: 'ST12', level_name: 'الفرقة الأولى',
            group_name: 'المجموعة الأولى', price: 120000, paid: 80000, remaining: 40000,
            payment_status: 'دفع جزئي'
          }] };
        }
        if (sql.includes('INSERT INTO ai_chat_messages')) return { rows: [{ id: 9, created_at: '2026-10-04T18:00:00Z' }] };
        throw new Error(`Unexpected query: ${sql}`);
      }
    };
    const request = routeHarness(db);
    const response = await request('post', '/api/ai/chat/message', {
      user: { id: 9, name: 'دنيا', role: 'assistant' },
      body: { message: 'هل اسلام دفع فلوس الكورس؟' }
    });
    assert.equal(response.statusCode, 200);
    assert.equal(searchedName, '%اسلام%');
    assert.match(response.body.response, /دفع جزئي/);
});

test('an attendance question about a named student uses their attendance lookup', async () => {
    let searchedStudentId = null;
    const db = {
      async query(sql, params = []) {
        if (sql.includes('SELECT message,response FROM ai_chat_messages')) return { rows: [] };
        if (sql.includes('DELETE FROM ai_pending_actions')) return { rows: [], changes: 0 };
        if (sql.includes('FROM students s JOIN levels l')) {
          return { rows: [{
            id: 12, name: 'isalm', code: '1', level_name: 'الرابعه',
            group_name: 'مجموعة أ', price: 150000, paid: 50000,
            remaining: 100000, payment_status: 'دفع جزئي'
          }] };
        }
        if (sql.includes('FROM course_sessions cs') && sql.includes('JOIN enrollments e')) {
          searchedStudentId = params[0];
          return { rows: [{ total: 5, attended: 4 }] };
        }
        if (sql.includes('INSERT INTO ai_chat_messages')) return { rows: [{ id: 1, created_at: '2026-10-05T18:00:00Z' }] };
        throw new Error(`Unexpected query: ${sql}`);
      }
    };
    const response = await routeHarness(db)('post', '/api/ai/chat/message', {
      user: { id: 9, name: 'دنيا', role: 'assistant' },
      body: { message: 'هل isalm حضر محاضرة؟' }
    });
    assert.equal(response.statusCode, 200);
    assert.equal(searchedStudentId, 12);
    assert.match(response.body.response, /حضر 4 من أصل 5/);
    assert.match(response.body.response, /غاب عن 1/);
});

test('a finance follow-up reuses the previous named student', async () => {
  let searchedName = null;
  const db = {
    async query(sql, params = []) {
      if (sql.includes('SELECT message,response FROM ai_chat_messages')) {
        return { rows: [{ message: 'بيانات اسلام اسامه', response: 'بيانات الطالب...' }] };
      }
      if (sql.includes('DELETE FROM ai_pending_actions')) return { rows: [], changes: 0 };
      if (sql.includes('FROM students s JOIN levels l')) {
        searchedName = params[0];
        return { rows: [{
          id: 12, name: 'اسلام اسامه', code: 'ST12', level_name: 'الفرقة الأولى',
          group_name: 'المجموعة الأولى', price: 120000, paid: 80000, remaining: 40000,
          payment_status: 'دفع جزئي'
        }] };
      }
      if (sql.includes('INSERT INTO ai_chat_messages')) return { rows: [{ id: 11, created_at: '2026-10-04T18:00:00Z' }] };
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  const request = routeHarness(db);
  const response = await request('post', '/api/ai/chat/message', {
    user: { id: 9, name: 'دنيا', role: 'assistant' },
    body: { message: 'طيب دفع كام؟' }
  });
  assert.equal(response.statusCode, 200);
  assert.equal(searchedName, '%اسلام اسامه%');
  assert.match(response.body.response, /المدفوع ٨٠٠/);
});

test('generic staff queries do not inherit a previous named-student context', async () => {
  const executed = [];
  const db = {
    async query(sql, params = []) {
      executed.push(sql);
      if (sql.includes('SELECT message,response FROM ai_chat_messages')) {
        return { rows: [{ message: 'بيانات اسلام اسامه', response: 'بيانات الطالب...' }] };
      }
      if (sql.includes('DELETE FROM ai_pending_actions')) return { rows: [], changes: 0 };
      if (sql.includes('FROM groups_table g JOIN levels')) return { rows: [] };
      if (sql.includes('GREATEST(0,s.course_price_snapshot')) return { rows: [] };
      if (sql.includes('FROM exams e JOIN subjects s')) return { rows: [] };
      if (sql.includes('INSERT INTO ai_chat_messages')) return { rows: [{ id: 12, created_at: '2026-10-05T18:00:00Z' }] };
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  const request = routeHarness(db);
  const user = { id: 9, name: 'د. اختبار', role: 'doctor' };

  const dues = await request('post', '/api/ai/chat/message', {
    user,
    body: { message: 'مين لسه مدفعش؟' }
  });
  assert.equal(dues.statusCode, 200);
  assert.match(dues.body.response, /لا توجد مستحقات متبقية/);

  const results = await request('post', '/api/ai/chat/message', {
    user,
    body: { message: 'اعرض درجات الطلاب' }
  });
  assert.equal(results.statusCode, 200);
  assert.match(results.body.response, /لا توجد نتائج امتحانات مكتملة/);
  assert.equal(executed.filter(sql => sql.includes('FROM students s JOIN levels l')).length, 0);
  assert.ok(executed.some(sql => sql.includes('GREATEST(0,s.course_price_snapshot')));
  assert.ok(executed.some(sql => sql.includes('FROM exams e JOIN subjects s')));
});

test('student follow-ups keep the same student across profile, finance, results, and attendance questions', async () => {
  const turns = [];
  const searchedNames = [];
  const db = {
    async query(sql, params = []) {
      if (sql.includes('SELECT message,response FROM ai_chat_messages')) {
        return { rows: [...turns].slice(-8).reverse() };
      }
      if (sql.includes('DELETE FROM ai_pending_actions')) return { rows: [], changes: 0 };
      if (sql.includes('FROM students s JOIN levels l')) {
        searchedNames.push(params[0]);
        return { rows: [{
          id: 12, name: 'اسلام اسامه', code: 'ST12', level_name: 'الفرقة الأولى',
          group_name: 'المجموعة الأولى', price: 120000, paid: 80000, remaining: 40000,
          payment_status: 'دفع جزئي'
        }] };
      }
      if (sql.includes('FROM exam_attempts a JOIN exams e')) {
        return { rows: [{
          exam_title: 'اختبار أول', subject_name: 'المحاسبة', score: 8,
          total_questions: 10, percentage: 80
        }] };
      }
      if (sql.includes('FROM course_sessions cs') && sql.includes('JOIN enrollments e')) {
        return { rows: [{ total: 5, attended: 4 }] };
      }
      if (sql.includes('INSERT INTO ai_chat_messages')) {
        turns.push({ message: params[3], response: params[4] });
        return { rows: [{ id: turns.length, created_at: '2026-10-04T18:00:00Z' }] };
      }
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  const request = routeHarness(db);
  const user = { id: 9, name: 'دنيا', role: 'assistant' };
  const ask = async message => {
    const response = await request('post', '/api/ai/chat/message', { user, body: { message } });
    assert.equal(response.statusCode, 200);
    return response.body.response;
  };

  assert.match(await ask('بيانات اسلام اسامه'), /اسلام اسامه/);
  assert.match(await ask('هو في فرقة ايه؟'), /الفرقة الأولى/);
  assert.match(await ask('هو في مجموعة إيه؟'), /المجموعة الأولى/);
  assert.match(await ask('طيب دفع كام؟'), /المدفوع ٨٠٠/);
  assert.match(await ask('قول لي أكتر'), /إجمالي رسوم الكورس ١٬٢٠٠/);
  assert.match(await ask('نتيجته إيه؟'), /اختبار أول/);
  assert.match(await ask('هو غاب كام مرة؟'), /غاب عن 1/);
  assert.deepEqual(searchedNames, Array(7).fill('%اسلام اسامه%'));
});

test('staff can find a student using a one-digit student code', async () => {
  let searchedCode = null;
  const db = {
    async query(sql, params = []) {
      if (sql.includes('SELECT message,response FROM ai_chat_messages')) return { rows: [] };
      if (sql.includes('DELETE FROM ai_pending_actions')) return { rows: [], changes: 0 };
      if (sql.includes('FROM students s JOIN levels l')) {
        searchedCode = params[0];
        return { rows: [{
          id: 1, name: 'isalm', code: '1', level_name: 'الرابعه',
          group_name: 'مجموعة أ', price: 150000, paid: 50000,
          remaining: 100000, payment_status: 'دفع جزئي'
        }] };
      }
      if (sql.includes('INSERT INTO ai_chat_messages')) return { rows: [{ id: 1, created_at: '2026-10-05T18:00:00Z' }] };
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  const response = await routeHarness(db)('post', '/api/ai/chat/message', {
    user: { id: 9, name: 'دنيا', role: 'assistant' },
    body: { message: 'بيانات 1' }
  });
  assert.equal(response.statusCode, 200);
  assert.equal(searchedCode, '%1%');
  assert.match(response.body.response, /بيانات isalm/);
});

test('ordinal group aliases resolve reports against the actual group id', async () => {
    const reportFilters = [];
    const db = {
      async query(sql, params = []) {
        if (sql.includes('SELECT message,response FROM ai_chat_messages')) return { rows: [] };
        if (sql.includes('DELETE FROM ai_pending_actions')) return { rows: [], changes: 0 };
        if (sql.includes('FROM groups_table g JOIN levels')) {
          return { rows: [
            { id: 3, name: 'المجموعة الأولى', level_id: 1, level_name: 'الفرقة الأولى' },
            { id: 4, name: 'المجموعة الثانية', level_id: 1, level_name: 'الفرقة الأولى' }
          ] };
        }
        if (sql.includes('FROM course_sessions cs')) {
          reportFilters.push({ sql, params });
          return { rows: [] };
        }
        if (sql.includes('FROM payments p')) return { rows: [] };
        if (sql.includes('INSERT INTO ai_chat_messages')) return { rows: [{ id: 10, created_at: '2026-10-04T18:00:00Z' }] };
        throw new Error(`Unexpected query: ${sql}`);
      }
    };
    const request = routeHarness(db);
    const response = await request('post', '/api/ai/chat/message', {
      user: { id: 9, name: 'مساعدة', role: 'assistant' },
      body: { message: 'تقرير دفعة الاوله' }
    });
    assert.equal(response.statusCode, 200);
    assert.match(response.body.response, /تقرير المجموعة الأولى/);
    assert.equal(reportFilters.length, 2);
    assert.ok(reportFilters.every(({ sql, params }) => sql.includes('cs.group_id=?') && params[1] === 3));
});

test('group attendance requires explicit confirmation before writing records', async () => {
  let pending = null;
  const writes = [];
  const db = {
    pool: {
      async connect() {
        return {
          async query() {},
          release() {}
        };
      }
    },
    async query(sql, params = []) {
      if (sql.includes('SELECT message,response FROM ai_chat_messages')) return { rows: [] };
      if (sql.includes('FROM groups_table g JOIN levels')) {
        return { rows: [{ id: 8, name: 'مجموعة النخيل', level_id: 2 }] };
      }
      if (sql.includes('SELECT course_starts_at FROM course_settings')) {
        return { rows: [{ course_starts_at: '2020-01-01T00:00:00Z' }] };
      }
      if (sql.includes('FROM course_sessions') && sql.includes('ORDER BY start_time,id')) {
        return { rows: [{ id: 3, title: 'محاضرة الحساب', start_time: '17:00' }] };
      }
      if (sql.includes('SELECT s.id FROM enrollments e JOIN students s')) {
        return { rows: [{ id: 10 }, { id: 11 }] };
      }
      if (sql.includes('INSERT INTO ai_pending_actions')) {
        pending = { action: params[1], payload: params[2], expires_at: params[3] };
        return { rows: [] };
      }
      if (sql.includes('INSERT INTO ai_chat_messages')) return { rows: [{ id: 3, created_at: '2026-10-04T18:00:00Z' }] };
      if (sql.includes('FROM ai_pending_actions')) return { rows: pending ? [pending] : [] };
      if (sql.includes('WHERE id=? AND group_id=? AND date=? AND cancelled=0 FOR UPDATE')) {
        return { rows: [{
          id: 3, group_id: 8, date: params[2], title: 'محاضرة الحساب', cancelled: 0
        }] };
      }
      if (sql.includes('SELECT s.id,s.name,s.active,s.cancelled_at FROM enrollments')) {
        return { rows: [{ id: 10, name: 'الأول' }, { id: 11, name: 'الثاني' }] };
      }
      if (sql.includes('INSERT INTO attendance')) {
        writes.push({ sql, params });
        return { rows: [] };
      }
      if (sql.includes('INSERT INTO audit_logs')) return { rows: [] };
      if (sql.includes('DELETE FROM ai_pending_actions')) {
        pending = null;
        return { changes: 1, rows: [] };
      }
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  const request = routeHarness(db);
  const user = { id: 51, name: 'دنيا', role: 'assistant' };
  const first = await request('post', '/api/ai/chat/message', {
    user,
    body: { message: 'سجل حضور مجموعة النخيل' }
  });
  assert.equal(first.statusCode, 200);
  assert.match(first.body.response, /أرسل «أكد»/);
  assert.equal(writes.length, 0);

  const confirmed = await request('post', '/api/ai/chat/message', {
    user,
    body: { message: 'أكد' }
  });
  assert.equal(confirmed.statusCode, 200);
  assert.match(confirmed.body.response, /تم تسجيل حضور 2 طالبًا/);
  assert.equal(writes.length, 2);
});

test('a short follow-up date reuses the previous schedule intent', async () => {
  const calls = [];
  const [year, month, day] = today().split('-').map(Number);
  const tomorrow = new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
  const db = {
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (sql.includes('SELECT message,response FROM ai_chat_messages')) {
        return { rows: [{ message: 'عندي محاضرات النهارده؟', response: '...' }] };
      }
      if (sql.includes('DELETE FROM ai_pending_actions')) return { rows: [], changes: 0 };
      if (sql.includes('FROM students s JOIN groups_table')) {
        return { rows: [{
          id: 27, user_id: 41, name: 'طالب', code: 'ST27',
          group_id: 8, group_name: 'مجموعة النخيل', level_id: 2, level_name: 'الفرقة الثانية'
        }] };
      }
      if (sql.includes('FROM course_sessions cs') && sql.includes('EXISTS')) return { rows: [] };
      if (sql.includes('INSERT INTO ai_chat_messages')) return { rows: [{ id: 4, created_at: '2026-10-04T18:00:00Z' }] };
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  const request = routeHarness(db);
  const response = await request('post', '/api/ai/chat/message', {
    user: { id: 41, name: 'طالب', role: 'student' },
    body: { message: 'طب بكرة؟' }
  });
  assert.equal(response.statusCode, 200);
  assert.ok(calls.some(query => query.sql.includes('WHERE cs.date=?') &&
    query.params[0] === tomorrow));
});

test('upcoming lecture questions query dates from today onward', async () => {
  const calls = [];
  const db = {
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (sql.includes('SELECT message,response FROM ai_chat_messages')) return { rows: [] };
      if (sql.includes('DELETE FROM ai_pending_actions')) return { rows: [], changes: 0 };
      if (sql.includes('FROM students s JOIN groups_table')) {
        return { rows: [{
          id: 27, user_id: 41, name: 'طالب', code: 'ST27',
          group_id: 8, group_name: 'مجموعة النخيل', level_id: 2, level_name: 'الفرقة الثانية'
        }] };
      }
      if (sql.includes('FROM course_sessions cs') && sql.includes('EXISTS')) {
        return { rows: [{ title: 'محاضرة قادمة', date: today(), start_time: '17:00' }] };
      }
      if (sql.includes('INSERT INTO ai_chat_messages')) return { rows: [{ id: 6, created_at: '2026-10-04T18:00:00Z' }] };
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  const request = routeHarness(db);
  const response = await request('post', '/api/ai/chat/message', {
    user: { id: 41, name: 'طالب', role: 'student' },
    body: { message: 'اعرض المحاضرات القادمة' }
  });
  assert.equal(response.statusCode, 200);
  assert.match(response.body.response, /المحاضرات القادمة/);
  assert.ok(calls.some(query => query.sql.includes('WHERE cs.date>=?') &&
    query.params[0] === today()));
});

test('student group-attendance questions return only that student’s own status', async () => {
  const seen = [];
  const db = {
    async query(sql, params = []) {
      seen.push({ sql, params });
      if (sql.includes('SELECT message,response FROM ai_chat_messages')) return { rows: [] };
      if (sql.includes('DELETE FROM ai_pending_actions')) return { rows: [], changes: 0 };
      if (sql.includes('FROM students s JOIN groups_table')) {
        return { rows: [{
          id: 27, user_id: 41, name: 'طالب', code: 'ST27',
          group_id: 8, group_name: 'مجموعة النخيل', level_id: 2, level_name: 'الفرقة الثانية'
        }] };
      }
      if (sql.includes('FROM course_sessions cs JOIN enrollments e')) {
        return { rows: [{ title: 'محاضرة الحساب', start_time: '17:00', attendance_id: 10 }] };
      }
      if (sql.includes('INSERT INTO ai_chat_messages')) return { rows: [{ id: 5, created_at: '2026-10-04T18:00:00Z' }] };
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  const request = routeHarness(db);
  const response = await request('post', '/api/ai/chat/message', {
    user: { id: 41, name: 'طالب', role: 'student' },
    body: { message: 'مين حضر النهارده؟' }
  });
  assert.equal(response.statusCode, 200);
  assert.match(response.body.response, /حضورك بتاريخ/);
  assert.equal(seen.some(query => query.sql.includes('FROM enrollments e JOIN students s')), false);
});

test('staff dues queries return real unpaid amounts and remain staff-only', async () => {
  const statements = [];
  const db = {
    async query(sql, params = []) {
      statements.push({ sql, params });
      if (sql.includes('SELECT message,response FROM ai_chat_messages')) return { rows: [] };
      if (sql.includes('DELETE FROM ai_pending_actions')) return { rows: [], changes: 0 };
      if (sql.includes('FROM groups_table g JOIN levels')) return { rows: [] };
      if (sql.includes('FROM students s JOIN groups_table g')) {
        return { rows: [{
          name: 'طالب عليه مستحق', code: 'S17', group_name: 'مجموعة النخيل',
          price: 120000, paid: 80000, remaining: 40000
        }] };
      }
      if (sql.includes('INSERT INTO ai_chat_messages')) return { rows: [{ id: 7, created_at: '2026-10-04T18:00:00Z' }] };
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  const request = routeHarness(db);
  const response = await request('post', '/api/ai/chat/message', {
    user: { id: 52, name: 'مساعدة', role: 'assistant' },
    body: { message: 'هات الطلاب اللي عليهم فلوس' }
  });
  assert.equal(response.statusCode, 200);
  assert.match(response.body.response, /طالب عليه مستحق/);
  assert.match(response.body.response, /٤٠٠/);
  assert.ok(statements.some(query => query.sql.includes('FROM payments WHERE voided_at IS NULL')));
});

test('doctor results are scoped to the authenticated doctor’s exams', async () => {
  const statements = [];
  const db = {
    async query(sql, params = []) {
      statements.push({ sql, params });
      if (sql.includes('SELECT message,response FROM ai_chat_messages')) return { rows: [] };
      if (sql.includes('DELETE FROM ai_pending_actions')) return { rows: [], changes: 0 };
      if (sql.includes('FROM groups_table g JOIN levels')) return { rows: [] };
      if (sql.includes('FROM exams e JOIN subjects s')) {
        return { rows: [{
          exam_title: 'اختبار الحساب', subject_name: 'حساب',
          student_name: 'طالب أول', code: 'S1', score: 18,
          total_questions: 20, percentage: 90
        }] };
      }
      if (sql.includes('INSERT INTO ai_chat_messages')) return { rows: [{ id: 8, created_at: '2026-10-04T18:00:00Z' }] };
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  const request = routeHarness(db);
  const response = await request('post', '/api/ai/chat/message', {
    user: { id: 77, name: 'دكتور', role: 'doctor' },
    body: { message: 'اعرض درجات الطلاب' }
  });
  assert.equal(response.statusCode, 200);
  assert.match(response.body.response, /اختبار الحساب/);
  assert.ok(statements.some(query => query.sql.includes('WHERE e.doctor_id=?') &&
    query.params[0] === 77));
});

test('assistant upcoming exams are not restricted to an individual doctor', async () => {
  const statements = [];
  const db = {
    async query(sql, params = []) {
      statements.push({ sql, params });
      if (sql.includes('SELECT message,response FROM ai_chat_messages')) return { rows: [] };
      if (sql.includes('DELETE FROM ai_pending_actions')) return { rows: [], changes: 0 };
      if (sql.includes('FROM groups_table g JOIN levels')) return { rows: [] };
      if (sql.includes('FROM exams e JOIN course_lectures')) {
        return { rows: [{
          title: 'امتحان منشور', subject_name: 'علوم',
          lecture_date: '2026-10-05', lecture_title: 'محاضرة', doctor_name: 'دكتور'
        }] };
      }
      if (sql.includes('INSERT INTO ai_chat_messages')) return { rows: [{ id: 14, created_at: '2026-10-04T18:00:00Z' }] };
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  const request = routeHarness(db);
  const response = await request('post', '/api/ai/chat/message', {
    user: { id: 52, name: 'مساعدة', role: 'assistant' },
    body: { message: 'عندنا امتحانات إمتى؟' }
  });
  assert.equal(response.statusCode, 200);
  assert.match(response.body.response, /امتحان منشور/);
  const examQuery = statements.find(query => query.sql.includes('FROM exams e JOIN course_lectures'));
  assert.ok(examQuery);
  assert.doesNotMatch(examQuery.sql, /WHERE[\s\S]*e\.doctor_id/);
  assert.deepEqual(examQuery.params, [today()]);
  assert.match(examQuery.sql, /e\.status='published'/);
});

test('student upcoming exams are filtered by their level, enrollment, and date', async () => {
  const statements = [];
  const db = {
    async query(sql, params = []) {
      statements.push({ sql, params });
      if (sql.includes('SELECT message,response FROM ai_chat_messages')) return { rows: [] };
      if (sql.includes('DELETE FROM ai_pending_actions')) return { rows: [], changes: 0 };
      if (sql.includes('FROM students s JOIN groups_table')) {
        return { rows: [{
          id: 27, user_id: 41, name: 'طالب', code: 'ST27',
          group_id: 8, group_name: 'مجموعة النخيل', level_id: 2, level_name: 'الفرقة الثانية'
        }] };
      }
      if (sql.includes('FROM exams e JOIN course_lectures')) {
        return { rows: [{
          title: 'امتحان قادم', subject_name: 'حساب', lecture_date: '2026-10-05',
          lecture_title: 'محاضرة قادمة', doctor_name: 'دكتور'
        }] };
      }
      if (sql.includes('INSERT INTO ai_chat_messages')) return { rows: [{ id: 9, created_at: '2026-10-04T18:00:00Z' }] };
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  const request = routeHarness(db);
  const response = await request('post', '/api/ai/chat/message', {
    user: { id: 41, name: 'طالب', role: 'student' },
    body: { message: 'عندي امتحانات إمتى؟' }
  });
  assert.equal(response.statusCode, 200);
  assert.match(response.body.response, /امتحان قادم/);
  assert.ok(statements.some(query => query.sql.includes('en.student_id=?') &&
    query.params[0] === 2 && query.params[2] === 27));
});

test('group report delegates to the existing daily operations report function', async () => {
  const statements = [];
  const db = {
    async query(sql, params = []) {
      statements.push({ sql, params });
      if (sql.includes('SELECT message,response FROM ai_chat_messages')) return { rows: [] };
      if (sql.includes('DELETE FROM ai_pending_actions')) return { rows: [], changes: 0 };
      if (sql.includes('FROM groups_table g JOIN levels')) {
        return { rows: [{ id: 8, name: 'مجموعة النخيل', level_id: 2, level_name: 'الثانية' }] };
      }
      if (sql.includes('LEFT JOIN attendance')) {
        return { rows: [{
          session_id: 3, title: 'محاضرة', start_time: '17:00',
          group_name: 'مجموعة النخيل', level_name: 'الثانية',
          code: 'S1', student_name: 'طالب', attendance_id: 10
        }] };
      }
      if (sql.includes('FROM course_sessions cs') && !sql.includes('LEFT JOIN attendance')) {
        return { rows: [{ id: 3, title: 'محاضرة', start_time: '17:00' }] };
      }
      if (sql.includes('FROM payments p')) return { rows: [] };
      if (sql.includes('INSERT INTO ai_chat_messages')) return { rows: [{ id: 10, created_at: '2026-10-04T18:00:00Z' }] };
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  const request = routeHarness(db);
  const response = await request('post', '/api/ai/chat/message', {
    user: { id: 52, name: 'مساعدة', role: 'assistant' },
    body: { message: 'هات تقرير مجموعة النخيل' }
  });
  assert.equal(response.statusCode, 200);
  assert.match(response.body.response, /الحاضرون: 1/);
  assert.equal(statements.filter(query => query.sql.includes('FROM payments p')).length, 1);
});

test('staff group attendance returns the current session roster and actual statuses', async () => {
  const db = {
    async query(sql) {
      if (sql.includes('SELECT message,response FROM ai_chat_messages')) return { rows: [] };
      if (sql.includes('DELETE FROM ai_pending_actions')) return { rows: [], changes: 0 };
      if (sql.includes('FROM groups_table g JOIN levels')) {
        return { rows: [{ id: 8, name: 'مجموعة النخيل', level_id: 2 }] };
      }
      if (sql.includes('FROM course_sessions') && sql.includes('WHERE group_id=? AND date=?')) {
        return { rows: [{ id: 3, title: 'محاضرة الحساب', date: today(), start_time: '17:00' }] };
      }
      if (sql.includes('SELECT s.id,s.code,s.name')) {
        return { rows: [
          { name: 'حضر', code: 'S1', status: 'حاضر' },
          { name: 'غاب', code: 'S2', status: 'غائب' }
        ] };
      }
      if (sql.includes('INSERT INTO ai_chat_messages')) return { rows: [{ id: 11, created_at: '2026-10-04T18:00:00Z' }] };
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  const request = routeHarness(db);
  const response = await request('post', '/api/ai/chat/message', {
    user: { id: 52, name: 'مساعدة', role: 'assistant' },
    body: { message: 'مين حضر النهارده في مجموعة النخيل؟' }
  });
  assert.equal(response.statusCode, 200);
  assert.match(response.body.response, /حضر 1/);
  assert.match(response.body.response, /غاب 1/);
  assert.match(response.body.response, /حضر \(S1\)/);
  assert.match(response.body.response, /غاب \(S2\)/);
});

test('group attendance narrows repeated group names by the mentioned level', async () => {
  let queriedGroupId = null;
  const db = {
    async query(sql, params = []) {
      if (sql.includes('SELECT message,response FROM ai_chat_messages')) return { rows: [] };
      if (sql.includes('DELETE FROM ai_pending_actions')) return { rows: [], changes: 0 };
      if (sql.includes('FROM groups_table g JOIN levels')) {
        return { rows: [
          { id: 1, name: 'مجموعة أ', level_id: 1, level_name: 'الأولى' },
          { id: 2, name: 'مجموعة أ', level_id: 2, level_name: 'الثانية' },
          { id: 3, name: 'مجموعة أ', level_id: 3, level_name: 'الثالثة' },
          { id: 4, name: 'مجموعة أ', level_id: 4, level_name: 'الرابعه' }
        ] };
      }
      if (sql.includes('FROM course_sessions') && sql.includes('WHERE group_id=? AND date=?')) {
        queriedGroupId = params[0];
        return { rows: [] };
      }
      if (sql.includes('INSERT INTO ai_chat_messages')) return { rows: [{ id: 1, created_at: '2026-10-05T18:00:00Z' }] };
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  const response = await routeHarness(db)('post', '/api/ai/chat/message', {
    user: { id: 52, name: 'مساعدة', role: 'assistant' },
    body: { message: 'مين حضر النهارده في مجموعة أ في الفرقة الرابعة؟' }
  });
  assert.equal(response.statusCode, 200);
  assert.equal(queriedGroupId, 4);
  assert.match(response.body.response, /لم أجد محاضرة مسجلة/);
});

test('staff aggregate intents use their matching data queries', async () => {
  const cases = [
    ['عدد الطلاب كام؟', 'studentCount', /عدد الطلاب النشطين/],
    ['إجمالي المدفوعات', 'paymentsTotal', /إجمالي المدفوعات/],
    ['عدد المحاضرات القادمة', 'sessionCount', /عدد المحاضرات القادمة/],
    ['كم اختبار منشور؟', 'examCount', /عدد الامتحانات المنشورة/]
  ];
  for (const [message, table, responsePattern] of cases) {
    let aggregateQuery = '';
    const db = {
      async query(sql) {
        if (sql.includes('SELECT message,response FROM ai_chat_messages')) return { rows: [] };
        if (sql.includes('DELETE FROM ai_pending_actions')) return { rows: [], changes: 0 };
        if (sql.includes('INSERT INTO ai_chat_messages')) return { rows: [{ id: 12, created_at: '2026-10-04T18:00:00Z' }] };
        aggregateQuery = sql;
        return { rows: [{ total: table === 'paymentsTotal' ? 83000 : 14 }] };
      }
    };
    const request = routeHarness(db);
    const response = await request('post', '/api/ai/chat/message', {
      user: { id: 52, name: 'مساعدة', role: 'assistant' },
      body: { message }
    });
    assert.equal(response.statusCode, 200);
    assert.match(response.body.response, responsePattern);
    assert.ok(aggregateQuery.includes({
      studentCount: 'FROM students',
      paymentsTotal: 'FROM payments',
      sessionCount: 'FROM course_sessions',
      examCount: 'FROM exams'
    }[table]));
  }
});

test('student profile data is selected by the authenticated user id', async () => {
  const statements = [];
  const db = {
    async query(sql, params = []) {
      statements.push({ sql, params });
      if (sql.includes('SELECT message,response FROM ai_chat_messages')) return { rows: [] };
      if (sql.includes('DELETE FROM ai_pending_actions')) return { rows: [], changes: 0 };
      if (sql.includes('FROM students s JOIN groups_table')) {
        return { rows: [{
          id: 27, user_id: 41, name: 'طالب', code: 'ST27',
          group_id: 8, group_name: 'مجموعة النخيل', level_id: 2, level_name: 'الفرقة الثانية'
        }] };
      }
      if (sql.includes('INSERT INTO ai_chat_messages')) return { rows: [{ id: 13, created_at: '2026-10-04T18:00:00Z' }] };
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  const request = routeHarness(db);
  const response = await request('post', '/api/ai/chat/message', {
    user: { id: 41, name: 'طالب', role: 'student' },
    body: { message: 'ممكن تقولي كودي لو سمحت' }
  });
  assert.equal(response.statusCode, 200);
  assert.match(response.body.response, /كودك هو ST27/);
  assert.ok(statements.some(query => query.sql.includes('WHERE s.user_id=?') &&
    query.params[0] === 41));
});

const naturalLanguageCases = [
  ['ما هي محاضراتي اليوم؟', 'schedule'],
  ['عندي محاضرات النهارده؟', 'schedule'],
  ['إيه اللي عندي النهارده؟', 'schedule'],
  ['وريني محاضراتي', 'schedule'],
  ['جدولي النهارده إيه؟', 'schedule'],
  ['في محاضرة النهارده؟', 'schedule'],
  ['أنا عندي إيه اليوم؟', 'schedule'],
  ['محاضراتي اليوم ايه', 'schedule'],
  ['محاضراتي انهارده', 'schedule'],
  ['عندي محاضره النهرده؟', 'schedule'],
  ['عندي ايه النهارده؟', 'schedule'],
  ['وريني جدولي', 'schedule'],
  ['في محاضرة بكرة؟', 'schedule'],
  ['إيه المحاضرات اللي عندي بكرة؟', 'schedule'],
  ['عندي كام غياب؟', 'myAttendance'],
  ['أنا غبت قد ايه؟', 'myAttendance'],
  ['غيابي عامل إيه؟', 'myAttendance'],
  ['لسه عليا فلوس؟', 'balance'],
  ['المتبقي كام؟', 'balance'],
  ['المتبقي عليا كام؟', 'balance'],
  ['لسه عليا كام؟', 'balance'],
  ['المتبقي عليا كام فلوس', 'balance'],
  ['عندي اختبار؟', 'exams'],
  ['في امتحان متاح ليا؟', 'exams'],
  ['في امتحان ليا؟', 'exams'],
  ['اختبار المحاسبة إمتى؟', 'exams'],
  ['اختبار المحاسبه', 'exams'],
  ['آخر محاضرة كانت إمتى؟', 'lastLecture'],
  ['أنا في سنة كام؟', 'profile'],
  ['أنا تبع جروب إيه؟', 'profile'],
  ['مين دكتور المحاسبة؟', 'doctorLookup'],
  ['مين الدكتور بتاع المادة دي؟', 'doctorLookup'],
  ['طيب وحضوري؟', 'myAttendance'],
  ['مواعيد الكورس؟', 'schedule']
];

for (const [message, expected] of naturalLanguageCases) {
  test(`classifies natural variation "${message}" as ${expected}`, () => {
    assert.equal(detectIntent(message).intent, expected);
  });
}

const variationWrappers = {
  prefixes: ['', 'ممكن أعرف ', 'لو سمحت ', 'أنا عايز أعرف '],
  suffixes: ['', '؟', ' لو سمحت']
};

function expandQuestions(stems) {
  return stems.flatMap(stem => variationWrappers.prefixes.flatMap(prefix =>
    variationWrappers.suffixes.map(suffix => `${prefix}${stem}${suffix}`)
  ));
}

const generatedIntentSuites = [
  {
    name: 'financial',
    stems: [
      'عليا كام', 'باقي عليا كام', 'فاضل عليا كام', 'لسه عليا فلوس',
      'أنا مديون بكام', 'المبلغ المتبقي عليا كام', 'دفعت كام', 'أنا دفعت قد إيه',
      'باقي المصاريف كام', 'حسابي المالي إيه', 'هل عليا أكتر من 500 جنيه',
      'هل دفعت أكثر من 1000'
    ],
    allowed: ['MY_PAYMENT_STATUS', 'MY_TOTAL_PAID', 'MY_REMAINING_BALANCE']
  },
  {
    name: 'attendance',
    stems: [
      'حضرت كام محاضرة', 'غبت كام مرة', 'أنا غبت كام', 'نسبة حضوري كام',
      'نسبة الغياب عندي كام', 'حضوري عامل إيه', 'أنا منتظم في الحضور',
      'غبت إمتى', 'آخر مرة غبت فيها إمتى', 'حضرت آخر محاضرة',
      'غبت كام مرة في المحاسبة', 'حضوري في مادة المحاسبة كام'
    ],
    allowed: ['MY_ATTENDANCE', 'MY_ABSENCES', 'ATTENDANCE_PERCENTAGE', 'ABSENCE_PERCENTAGE',
      'ATTENDANCE_HISTORY', 'ABSENCE_HISTORY', 'LAST_ATTENDANCE', 'ATTENDANCE_BY_SUBJECT']
  },
  {
    name: 'schedule',
    stems: [
      'عندي محاضرة النهارده', 'محاضرتي النهارده إمتى', 'عندي إيه النهارده',
      'النهارده عندي إيه', 'محاضرتي الساعة كام', 'المحاضرة الجاية إمتى',
      'عندي محاضرة بكرة', 'محاضرات الأسبوع ده إيه', 'جدول الأسبوع بتاعي',
      'آخر محاضرة كانت إمتى', 'المحاضرة فين', 'المحاضرة الجاية مادة إيه'
    ],
    allowed: ['TODAY_SCHEDULE', 'UPCOMING_LECTURES', 'LECTURE_DETAILS', 'WEEK_SCHEDULE',
      'LAST_LECTURE', 'LECTURE_LOCATION', 'LECTURE_TIME', 'LECTURE_SUBJECT']
  },
  {
    name: 'exam',
    stems: [
      'عندي اختبار', 'في اختبار قريب', 'الاختبار إمتى', 'الاختبار الجاي إمتى',
      'اختبار مادة المحاسبة', 'دخلت الاختبار ده', 'إيه الاختبارات اللي دخلتها',
      'إيه الاختبارات اللي لسه مدخلتهاش', 'غلطت في كام سؤال', 'أقدر أدخل الاختبار تاني',
      'نتيجتي في آخر اختبار', 'مدة الاختبار كام'
    ],
    allowed: ['MY_EXAMS', 'UPCOMING_EXAMS', 'MY_EXAM_RESULTS', 'MY_EXAM_SCORE',
      'MY_EXAM_HISTORY', 'MY_WRONG_ANSWERS', 'EXAM_STATUS']
  },
  {
    name: 'results',
    stems: [
      'نتيجتي إيه', 'مجموعي كام', 'متوسط درجاتي كام', 'أعلى درجة جبتها كام',
      'أقل درجة جبتها كام', 'نتيجتي في مادة المحاسبة', 'أنا مستوايا عامل إيه',
      'أنا جبت كام', 'درجاتي إيه', 'وريني نتائجي', 'نتيجتي في الاختبار الأخير'
    ],
    allowed: ['MY_RESULTS', 'MY_AVERAGE', 'MY_SCORE', 'MY_RESULT_BY_SUBJECT',
      'MY_EXAM_RESULTS', 'MY_EXAM_SCORE']
  },
  {
    name: 'profile',
    stems: ['بياناتي إيه', 'أنا مسجل باسم إيه', 'اسمي إيه عندكم', 'الكود بتاعي إيه', 'أنا في مجموعة كام',
      'أنا في سنة كام', 'أنا تبع المجموعة إيه', 'رقم الطالب بتاعي كام', 'بيانات الطالب بتاعتي إيه', 'أنا مسجل في الكورس'],
    allowed: ['STUDENT_PROFILE']
  },
  {
    name: 'notifications',
    stems: ['في إعلان جديد', 'آخر إعلان إيه', 'في أخبار جديدة', 'عندي إشعارات', 'في حاجة مهمة لازم أعرفها',
      'آخر حاجة اتقالت إيه', 'في تنبيه ليا', 'الإدارة أعلنت حاجة', 'في تغيير جديد', 'إعلان عن المحاضرات'],
    allowed: ['LATEST_ANNOUNCEMENTS', 'MY_NOTIFICATIONS', 'IMPORTANT_NOTIFICATIONS']
  },
  {
    name: 'account',
    stems: ['أغير الباسورد إزاي', 'نسيت الباسورد أعمل إيه', 'حسابي مربوط بجوجل',
      'أقدر أربط حساب Google', 'أقدر أفصل Google', 'الإيميل المرتبط بحسابي إيه',
      'عايز أغير كلمة السر', 'إزاي أربط Google', 'الإيميل المرتبط بجوجل إيه',
      'تغيير البريد الإلكتروني إزاي'],
    allowed: ['ACCOUNT_SECURITY']
  }
];

for (const suite of generatedIntentSuites) {
  test(`understands 100+ natural ${suite.name} question variations`, () => {
    const questions = expandQuestions(suite.stems);
    assert.ok(questions.length >= 100);
    for (const question of questions) {
      const parsed = detectIntent(question);
      assert.ok(suite.allowed.includes(parsed.studentIntent), `${question} -> ${parsed.studentIntent}`);
    }
  });
}

test('student intent catalog documents access, required data, parameters, and example categories', () => {
  assert.ok(Object.keys(STUDENT_INTENTS).length >= 40);
  for (const [name, definition] of Object.entries(STUDENT_INTENTS)) {
    assert.equal(definition.name, name);
    assert.ok(definition.description);
    assert.ok(Array.isArray(definition.requiredData));
    assert.ok(Array.isArray(definition.optionalParameters));
    assert.ok(definition.permission);
    assert.ok(Object.values(definition.examples).some(values => values.length > 0));
  }
});

test('extracts money comparisons and typed subject/date parameters', () => {
  const financial = detectIntent('مين عليه فلوس أكتر من ٥٠٠ جنيه؟');
  assert.equal(financial.studentIntent, 'STUDENT_FINANCIAL_FILTER');
  assert.equal(financial.parameters.amount, 500);
  assert.equal(financial.parameters.amountOperator, 'gt');
  const schedule = detectIntent('جدول محاضراتي الأسبوع اللي فات في مادة المحاسبة');
  assert.ok(schedule.parameters.dateRange);
  assert.equal(schedule.parameters.subject, 'المحاسبه');
});

test('combined requests preserve distinct intents within one data domain', () => {
  const combinations = expandQuestions([
    'دفعت كام وفاضل كام', 'أنا دفعت قد إيه وباقي عليا كام',
    'إجمالي اللي دفعته وفاضل كام', 'دفعت كام ولسه عليا كام',
    'أنا دفعت 800 وفاضل 400', 'دفعت أكتر من 500 وباقي عليا كام',
    'أنا مخلص الدفع ولا لسه عليا فلوس', 'كم دفعت وكم المتبقي',
    'دفعت كام للكورس والمبلغ المتبقي كام', 'حسابي المالي: المدفوع والمتبقي'
  ]);
  let assertions = 0;
  for (const message of combinations) {
    const intents = detectMultiIntents(message);
    if (intents) {
      assert.ok(new Set(intents.map(item => item.studentIntent)).size >= 2, message);
      assertions += 1;
    }
  }
  assert.ok(assertions >= 100, `Only ${assertions} combined variants were recognized.`);
  assert.ok(detectMultiIntents('حضرت كام محاضرة وغبت كام مرة')?.length >= 2);
  assert.ok(detectMultiIntents('أنا دفعت كام وفاضل كام')?.length >= 2);
});

test('detects first-person balance intent separately from payment and extracts numeric parameters', () => {
  assert.equal(detectIntent('دفعت كام؟').studentIntent, 'MY_TOTAL_PAID');
  assert.equal(detectIntent('لسه عليا فوق 300 جنيه؟').parameters.amount, 300);
  assert.equal(detectIntent('لسه عليا أقل من 250؟').parameters.amountOperator, 'lt');
  assert.equal(detectIntent('حسابي المالي إيه؟').studentIntent, 'MY_PAYMENT_STATUS');
});

test('prior-week date range uses the actual application date', () => {
  const previousWeek = extractDateRange('جدول الأسبوع اللي فات');
  const thisWeek = extractDateRange('جدول الأسبوع ده');
  assert.ok(previousWeek);
  assert.ok(thisWeek);
  assert.equal(Date.parse(`${thisWeek.start}T00:00:00Z`) - Date.parse(`${previousWeek.start}T00:00:00Z`), 7 * 86400000);
  assert.equal(Date.parse(`${previousWeek.end}T00:00:00Z`) - Date.parse(`${previousWeek.start}T00:00:00Z`), 6 * 86400000);
});

test('student financial filters are denied without querying other students', async () => {
  const statements = [];
  const db = {
    async query(sql) {
      statements.push(sql);
      if (sql.includes('SELECT message,response FROM ai_chat_messages')) return { rows: [] };
      if (sql.includes('DELETE FROM ai_pending_actions')) return { rows: [], changes: 0 };
      if (sql.includes('INSERT INTO ai_chat_messages')) return { rows: [{ id: 900, created_at: today() }] };
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  const request = routeHarness(db);
  const response = await request('post', '/api/ai/chat/message', {
    user: { id: 41, name: 'طالب', role: 'student' },
    body: { message: 'مين عليه فلوس أكتر من 500؟' }
  });
  assert.equal(response.statusCode, 200);
  assert.match(response.body.response, /بيانات الطلاب الآخرين المالية غير متاحة/);
  assert.equal(statements.some(sql => sql.includes('FROM students s JOIN groups_table')), false);
  assert.equal(statements.some(sql => sql.includes('FROM payments WHERE')), false);
});

test('authorized staff financial filter binds threshold as a parameter in the scoped query', async () => {
  const statements = [];
  const db = {
    async query(sql, params = []) {
      statements.push({ sql, params });
      if (sql.includes('SELECT message,response FROM ai_chat_messages')) return { rows: [] };
      if (sql.includes('DELETE FROM ai_pending_actions')) return { rows: [], changes: 0 };
      if (sql.includes('FROM groups_table g JOIN levels')) return { rows: [] };
      if (sql.includes('FROM students s JOIN groups_table g')) return { rows: [] };
      if (sql.includes('INSERT INTO ai_chat_messages')) return { rows: [{ id: 901, created_at: today() }] };
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  const request = routeHarness(db);
  const response = await request('post', '/api/ai/chat/message', {
    user: { id: 52, name: 'مساعدة', role: 'assistant' },
    body: { message: 'مين عليه فلوس أكتر من 500 جنيه؟' }
  });
  assert.equal(response.statusCode, 200);
  const filteredQuery = statements.find(({ sql }) => sql.includes('GREATEST(0,s.course_price_snapshot-COALESCE(p.paid,0)) > ?'));
  assert.ok(filteredQuery);
  assert.ok(filteredQuery.params.includes(50000));
});

test('combined personal payment question returns distinct paid and remaining amounts', async () => {
  const db = {
    async query(sql, params = []) {
      if (sql.includes('SELECT message,response FROM ai_chat_messages')) return { rows: [] };
      if (sql.includes('DELETE FROM ai_pending_actions')) return { rows: [], changes: 0 };
      if (sql.includes('FROM students s JOIN groups_table')) {
        assert.equal(params[0], 41);
        return { rows: [{
          id: 27, user_id: 41, name: 'طالب', code: 'ST27', group_id: 8,
          group_name: 'مجموعة النخيل', level_id: 2, price: 120000
        }] };
      }
      if (sql.includes('FROM payments WHERE student_id=?')) return { rows: [{ total: 80000 }] };
      if (sql.includes('INSERT INTO ai_chat_messages')) return { rows: [{ id: 902, created_at: today() }] };
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  const request = routeHarness(db);
  const response = await request('post', '/api/ai/chat/message', {
    user: { id: 41, name: 'طالب', role: 'student' },
    body: { message: 'أنا دفعت كام وفاضل كام؟' }
  });
  assert.equal(response.statusCode, 200);
  assert.match(response.body.response, /إجمالي ما دفعته ٨٠٠ جنيه/);
  assert.match(response.body.response, /المبلغ المتبقي عليك ٤٠٠ جنيه/);
});

test('last-exam follow-up returns only the authenticated student’s most recent result', async () => {
  const db = {
    async query(sql, params = []) {
      if (sql.includes('SELECT message,response FROM ai_chat_messages')) {
        return { rows: [{ message: 'آخر اختبار ليا كان إمتى؟', response: 'آخر اختبار مكتمل مسجل لك...' }] };
      }
      if (sql.includes('DELETE FROM ai_pending_actions')) return { rows: [], changes: 0 };
      if (sql.includes('FROM students s JOIN groups_table')) {
        assert.equal(params[0], 41);
        return { rows: [{
          id: 27, user_id: 41, name: 'طالب', code: 'ST27', group_id: 8,
          group_name: 'مجموعة النخيل', level_id: 2
        }] };
      }
      if (sql.includes('FROM exam_attempts a JOIN exams e ON e.id=a.exam_id')) {
        assert.deepEqual(params, [27]);
        assert.doesNotMatch(sql, /correct_answer|exam_answers|exam_questions/i);
        return { rows: [{
          exam_title: 'اختبار المحاسبة', subject_name: 'محاسبة',
          score: 8, total_questions: 10, percentage: 80, submitted_at: today(), lecture_date: today()
        }] };
      }
      if (sql.includes('INSERT INTO ai_chat_messages')) return { rows: [{ id: 903, created_at: today() }] };
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  const request = routeHarness(db);
  const response = await request('post', '/api/ai/chat/message', {
    user: { id: 41, name: 'طالب', role: 'student' },
    body: { message: 'وجبت فيه كام؟' }
  });
  assert.equal(response.statusCode, 200);
  assert.match(response.body.response, /الاختبار الأخير اختبار المحاسبة حصلت على 8 من 10/);
});

test('student notification intent reads only their own notifications and honors unread filter', async () => {
  const db = {
    async query(sql, params = []) {
      if (sql.includes('SELECT message,response FROM ai_chat_messages')) return { rows: [] };
      if (sql.includes('DELETE FROM ai_pending_actions')) return { rows: [], changes: 0 };
      if (sql.includes('FROM students s JOIN groups_table')) {
        assert.equal(params[0], 41);
        return { rows: [{
          id: 27, user_id: 41, name: 'طالب', code: 'ST27', group_id: 8,
          group_name: 'مجموعة النخيل', level_id: 2
        }] };
      }
      if (sql.includes('FROM notifications WHERE student_id=?')) {
        assert.match(sql, /is_read=0/);
        assert.deepEqual(params, [27]);
        return { rows: [{ title: 'تنبيه', message: 'موعد المحاضرة تغير' }] };
      }
      if (sql.includes('INSERT INTO ai_chat_messages')) return { rows: [{ id: 904, created_at: today() }] };
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  const request = routeHarness(db);
  const response = await request('post', '/api/ai/chat/message', {
    user: { id: 41, name: 'طالب', role: 'student' },
    body: { message: 'عندي إشعارات غير مقروءة؟' }
  });
  assert.equal(response.statusCode, 200);
  assert.match(response.body.response, /موعد المحاضرة تغير/);
});

test('Google-link status reads only the authenticated account and never links by email', async () => {
  const queries = [];
  const db = {
    async query(sql, params = []) {
      queries.push({ sql, params });
      if (sql.includes('SELECT message,response FROM ai_chat_messages')) return { rows: [] };
      if (sql.includes('DELETE FROM ai_pending_actions')) return { rows: [], changes: 0 };
      if (sql.includes('SELECT google_email FROM google_accounts WHERE user_id=?')) {
        return { rows: [{ google_email: 'student@example.test' }] };
      }
      if (sql.includes('INSERT INTO ai_chat_messages')) return { rows: [{ id: 905, created_at: today() }] };
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  const request = routeHarness(db);
  const response = await request('post', '/api/ai/chat/message', {
    user: { id: 41, name: 'طالب', role: 'student' },
    body: { message: 'حسابي مربوط بجوجل؟' }
  });
  assert.equal(response.statusCode, 200);
  assert.match(response.body.response, /student@example\.test/);
  const statusQuery = queries.find(({ sql }) => sql.includes('FROM google_accounts'));
  assert.deepEqual(statusQuery.params, [41]);
  assert.equal(queries.some(({ sql }) => /INSERT INTO google_accounts/i.test(sql)), false);
});

test('natural schedule question returns real lectures without exact match', async () => {
  const db = {
    async query(sql) {
      if (sql.includes('SELECT message,response FROM ai_chat_messages')) return { rows: [] };
      if (sql.includes('DELETE FROM ai_pending_actions')) return { rows: [], changes: 0 };
      if (sql.includes('FROM students s JOIN groups_table')) {
        return { rows: [{ id: 1, user_id: 10, name: 'سارة', code: 'ST10', group_id: 1, level_id: 1 }] };
      }
      if (sql.includes('FROM course_sessions cs') && sql.includes('EXISTS')) {
        return { rows: [
          { id: 101, title: 'محاضرة محاسبة', subject_name: 'محاسبة', start_time: '10:00', doctor_name: 'أحمد' },
          { id: 102, title: 'محاضرة إدارة', subject_name: 'إدارة', start_time: '12:00', doctor_name: 'محمود' }
        ] };
      }
      if (sql.includes('INSERT INTO ai_chat_messages')) return { rows: [{ id: 100, created_at: '2026-10-05T10:00:00Z' }] };
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  const request = routeHarness(db);
  const response = await request('post', '/api/ai/chat/message', {
    user: { id: 10, name: 'سارة', role: 'student' },
    body: { message: 'عندي محاضرات النهارده؟' }
  });
  assert.equal(response.statusCode, 200);
  assert.match(response.body.response, /محاسبة/);
  assert.match(response.body.response, /إدارة/);
  assert.match(response.body.response, /أحمد/);
});

test('handles multi-intent message asking about absences and balance', async () => {
  const db = {
    async query(sql) {
      if (sql.includes('SELECT message,response FROM ai_chat_messages')) return { rows: [] };
      if (sql.includes('DELETE FROM ai_pending_actions')) return { rows: [], changes: 0 };
      if (sql.includes('FROM students s JOIN groups_table')) {
        return { rows: [{ id: 1, user_id: 10, name: 'سارة', code: 'ST10', group_id: 1, level_id: 1, price: 120000 }] };
      }
      if (sql.includes('SELECT cs.date,cs.title,g.name group_name')) {
        return { rows: [
          { status: 'حاضر' },
          { status: 'حاضر' },
          { status: 'حاضر' },
          { status: 'حاضر' },
          { status: 'حاضر' },
          { status: 'حاضر' },
          { status: 'حاضر' },
          { status: 'غائب' },
          { status: 'غائب' },
          { status: 'غائب' }
        ] };
      }
      if (sql.includes('FROM payments WHERE student_id=?')) return { rows: [{ total: 80000 }] };
      if (sql.includes('INSERT INTO ai_chat_messages')) return { rows: [{ id: 101, created_at: '2026-10-05T10:00:00Z' }] };
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  const request = routeHarness(db);
  const response = await request('post', '/api/ai/chat/message', {
    user: { id: 10, name: 'سارة', role: 'student' },
    body: { message: 'عندي كام غياب ولسه عليا كام في المصاريف؟' }
  });
  assert.equal(response.statusCode, 200);
  assert.match(response.body.response, /غبت 3/);
  assert.match(response.body.response, /٤٠٠/);
});

test('absence follow-up "في مادة إيه؟" returns breakdown by subject', async () => {
  const db = {
    async query(sql) {
      if (sql.includes('SELECT message,response FROM ai_chat_messages')) {
        return { rows: [{ message: 'عندي كام غياب؟', response: 'عندك 3 غيابات.' }] };
      }
      if (sql.includes('DELETE FROM ai_pending_actions')) return { rows: [], changes: 0 };
      if (sql.includes('FROM students s JOIN groups_table')) {
        return { rows: [{ id: 1, user_id: 10, name: 'سارة', code: 'ST10', group_id: 1, level_id: 1 }] };
      }
      if (sql.includes('SELECT COALESCE(s.name, cs.title) subject_name, COUNT(*) count')) {
        return { rows: [
          { subject_name: 'محاسبة', count: 2 },
          { subject_name: 'إدارة', count: 1 }
        ] };
      }
      if (sql.includes('INSERT INTO ai_chat_messages')) return { rows: [{ id: 102, created_at: '2026-10-05T10:00:00Z' }] };
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  const request = routeHarness(db);
  const response = await request('post', '/api/ai/chat/message', {
    user: { id: 10, name: 'سارة', role: 'student' },
    body: { message: 'في مادة إيه؟' }
  });
  assert.equal(response.statusCode, 200);
  assert.match(response.body.response, /محاسبة: 2/);
  assert.match(response.body.response, /إدارة: 1/);
});

test('doctor schedule follow-up "عنده محاضرة بكرة؟" queries that doctor schedule', async () => {
  const db = {
    async query(sql, params = []) {
      if (sql.includes('SELECT message,response FROM ai_chat_messages')) {
        return { rows: [{ message: 'مين دكتور المحاسبة؟', response: 'دكتور مادة المحاسبة هو د. أحمد رشاد.' }] };
      }
      if (sql.includes('DELETE FROM ai_pending_actions')) return { rows: [], changes: 0 };
      if (sql.includes('FROM users') && sql.includes('name ILIKE')) {
        return { rows: [{ id: 5, name: 'أحمد رشاد' }] };
      }
      if (sql.includes('FROM course_sessions cs') && sql.includes('WHERE cs.doctor_id=?')) {
        return { rows: [{ id: 201, title: 'محاسبة متقدمة', group_name: 'المجموعة الأولى', start_time: '10:00' }] };
      }
      if (sql.includes('INSERT INTO ai_chat_messages')) return { rows: [{ id: 103, created_at: '2026-10-05T10:00:00Z' }] };
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  const request = routeHarness(db);
  const response = await request('post', '/api/ai/chat/message', {
    user: { id: 10, name: 'سارة', role: 'student' },
    body: { message: 'عنده محاضرة بكرة؟' }
  });
  assert.equal(response.statusCode, 200);
  assert.match(response.body.response, /أحمد رشاد/);
  assert.match(response.body.response, /محاسبة متقدمة/);
});

test('ambiguous generic exam query asks clarification when multiple exist', async () => {
  const db = {
    async query(sql) {
      if (sql.includes('SELECT message,response FROM ai_chat_messages')) return { rows: [] };
      if (sql.includes('DELETE FROM ai_pending_actions')) return { rows: [], changes: 0 };
      if (sql.includes('FROM students s JOIN groups_table')) {
        return { rows: [{ id: 1, user_id: 10, name: 'سارة', code: 'ST10', group_id: 1, level_id: 1 }] };
      }
      if (sql.includes('FROM exams e JOIN course_lectures cl')) {
        return { rows: [
          { id: 1, title: 'اختبار المحاسبة', subject_name: 'محاسبة', lecture_date: '2026-10-10', doctor_name: 'أحمد' },
          { id: 2, title: 'اختبار الإدارة', subject_name: 'إدارة', lecture_date: '2026-10-12', doctor_name: 'محمود' }
        ] };
      }
      if (sql.includes('INSERT INTO ai_chat_messages')) return { rows: [{ id: 104, created_at: '2026-10-05T10:00:00Z' }] };
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  const request = routeHarness(db);
  const response = await request('post', '/api/ai/chat/message', {
    user: { id: 10, name: 'سارة', role: 'student' },
    body: { message: 'وريني الاختبار' }
  });
  assert.equal(response.statusCode, 200);
  assert.match(response.body.response, /تقصد/);
  assert.match(response.body.response, /اختبار المحاسبة/);
  assert.match(response.body.response, /اختبار الإدارة/);
});

test('security: student cannot access other student data via student lookup', async () => {
  const db = {
    async query(sql) {
      if (sql.includes('SELECT message,response FROM ai_chat_messages')) return { rows: [] };
      if (sql.includes('DELETE FROM ai_pending_actions')) return { rows: [], changes: 0 };
      if (sql.includes('INSERT INTO ai_chat_messages')) return { rows: [{ id: 105, created_at: '2026-10-05T10:00:00Z' }] };
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  const request = routeHarness(db);
  const response = await request('post', '/api/ai/chat/message', {
    user: { id: 10, name: 'سارة', role: 'student' },
    body: { message: 'بيانات اسلام اسامه' }
  });
  assert.equal(response.statusCode, 200);
  assert.match(response.body.response, /لا يملك صلاحية/);
});

test('security: student cannot access dues tool', async () => {
  const db = {
    async query(sql) {
      if (sql.includes('SELECT message,response FROM ai_chat_messages')) return { rows: [] };
      if (sql.includes('DELETE FROM ai_pending_actions')) return { rows: [], changes: 0 };
      if (sql.includes('INSERT INTO ai_chat_messages')) return { rows: [{ id: 106, created_at: '2026-10-05T10:00:00Z' }] };
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  const request = routeHarness(db);
  const response = await request('post', '/api/ai/chat/message', {
    user: { id: 10, name: 'سارة', role: 'student' },
    body: { message: 'مين عليه فلوس؟' }
  });
  assert.equal(response.statusCode, 200);
  assert.match(response.body.response, /بيانات الطلاب الآخرين المالية غير متاحة/);
});

test('doctor role can ask about student count and today absentees', async () => {
  const db = {
    async query(sql) {
      if (sql.includes('SELECT message,response FROM ai_chat_messages')) return { rows: [] };
      if (sql.includes('DELETE FROM ai_pending_actions')) return { rows: [], changes: 0 };
      if (sql.includes('SELECT COUNT(DISTINCT e.student_id) total')) return { rows: [{ total: 35 }] };
      if (sql.includes('INSERT INTO ai_chat_messages')) return { rows: [{ id: 107, created_at: '2026-10-05T10:00:00Z' }] };
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  const request = routeHarness(db);
  const response = await request('post', '/api/ai/chat/message', {
    user: { id: 2, name: 'د. تامر', role: 'doctor' },
    body: { message: 'عندي كام طالب؟' }
  });
  assert.equal(response.statusCode, 200);
  assert.match(response.body.response, /35 طالبًا/);
});
