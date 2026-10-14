import { audit, today, transaction } from './db.js';
import { dailyOperationsReport } from './daily-report.js';
import { classifyStudentIntent, STUDENT_INTENTS } from './ai-intents.js';
import { defaultPermissions } from './permissions.js';

export { STUDENT_INTENTS };

const STAFF_ROLES = new Set(['doctor', 'assistant', 'admin']);
const READ_TOOLS = {
  student: new Set([
    'schedule', 'attendance', 'myAttendance', 'balance', 'exams', 'results',
    'profile', 'doctorLookup', 'subjects', 'lastLecture', 'notifications', 'courseInfo'
  ]),
  doctor: new Set([
    'schedule', 'attendance', 'groupAttendance', 'dues', 'duesTotal', 'exams', 'results',
    'groupReport', 'stats', 'studentLookup', 'doctorLookup', 'subjects',
    'lastLecture', 'doctorAbsentees', 'studentCount'
  ]),
  assistant: new Set([
    'schedule', 'attendance', 'groupAttendance', 'dues', 'duesTotal', 'exams', 'results',
    'groupReport', 'stats', 'studentLookup', 'doctorLookup', 'subjects', 'lastLecture'
  ]),
  admin: new Set([
    'schedule', 'attendance', 'groupAttendance', 'dues', 'duesTotal', 'exams', 'results',
    'groupReport', 'stats', 'studentLookup', 'doctorLookup', 'subjects', 'lastLecture'
  ])
};
const ACTION_EXPIRY_MS = 10 * 60 * 1000;

const MENU_QUESTIONS = [
  { tool: 'schedule', question: 'جدولي النهارده إيه؟' },
  { tool: 'myAttendance', question: 'عندي كام غياب؟' },
  { tool: 'balance', question: 'فاضل عليا كام؟' },
  { tool: 'profile', question: 'كودي إيه؟' },
  { tool: 'lastLecture', question: 'آخر محاضرة كانت إمتى؟' },
  { tool: 'groupAttendance', question: 'مين حضر النهارده؟' },
  { tool: 'groupAttendance', question: 'مين غاب النهارده؟' },
  { tool: 'dues', question: 'مين لسه مدفعش؟' },
  { tool: 'duesTotal', question: 'مجموع المتبقي كام؟' },
  { tool: 'exams', question: 'اعرض الاختبارات القادمة' },
  { tool: 'results', question: 'اعرض درجات الطلاب' },
  { tool: 'groupReport', question: 'اعرض تقرير المجموعة' },
  { tool: 'studentLookup', question: 'ابحث عن طالب' },
  { tool: 'doctorLookup', question: 'مين دكتور المواد؟' },
  { tool: 'subjects', question: 'اعرض المواد المقررة' },
  { tool: 'stats', intent: 'studentCount', question: 'عدد الطلاب النشطين كام؟' },
  { tool: 'stats', intent: 'paymentsTotal', question: 'إجمالي المدفوعات كام؟' },
  { tool: 'stats', intent: 'sessionCount', question: 'عدد المحاضرات القادمة كام؟' },
  { tool: 'stats', intent: 'examCount', question: 'عدد الاختبارات كام؟' },
  { tool: 'doctorAbsentees', question: 'مين غاب في محاضراتي النهارده؟' },
  { tool: 'notifications', question: 'اعرض إشعاراتي' },
  { tool: 'courseInfo', question: 'إيه حالة الكورس ومواعيده؟' }
];

const TOOL_PERMISSIONS = {
  schedule: ['LECTURES_VIEW'],
  lastLecture: ['LECTURES_VIEW'],
  subjects: ['LECTURES_VIEW'],
  doctorLookup: ['LECTURES_VIEW'],
  attendance: ['ATTENDANCE_VIEW'],
  groupAttendance: ['ATTENDANCE_VIEW'],
  doctorAbsentees: ['ATTENDANCE_VIEW'],
  dues: ['PAYMENTS_VIEW', 'FINANCIAL_REPORTS_VIEW'],
  duesTotal: ['PAYMENTS_VIEW', 'FINANCIAL_REPORTS_VIEW'],
  balance: ['PAYMENTS_VIEW'],
  exams: ['EXAMS_VIEW'],
  results: ['EXAM_RESULTS_VIEW'],
  groupReport: ['REPORTS_VIEW', 'ATTENDANCE_VIEW', 'FINANCIAL_REPORTS_VIEW'],
  studentLookup: ['STUDENTS_VIEW'],
  stats: [],
  studentCount: ['STUDENTS_VIEW'],
  notifications: [],
  courseInfo: []
};
const TOOL_REQUIRE_ALL_PERMISSIONS = new Set(['groupReport']);

function userPermissions(user) {
  return Array.isArray(user.permissions) ? user.permissions : defaultPermissions(user.role);
}

function canUseTool(user, tool, intent = null) {
  const tools = READ_TOOLS[user.role];
  if (!tools?.has(tool)) return false;
  if (user.role === 'student') return true;
  const permissions = userPermissions(user);
  const statPermissions = {
    studentCount: ['STUDENTS_VIEW'],
    paymentsTotal: ['FINANCIAL_REPORTS_VIEW', 'PAYMENTS_VIEW'],
    sessionCount: ['LECTURES_VIEW'],
    examCount: ['EXAMS_VIEW']
  };
  const required = tool === 'stats' && intent
    ? statPermissions[intent] || []
    : TOOL_PERMISSIONS[tool] || [];
  if (!required.length) return false;
  return TOOL_REQUIRE_ALL_PERMISSIONS.has(tool)
    ? required.every(permission => permissions.includes(permission))
    : required.some(permission => permissions.includes(permission));
}

function questionsForRole(user) {
  return MENU_QUESTIONS
    .filter(({ tool, intent }) => canUseTool(user, tool, intent))
    .filter((item, index, all) => all.findIndex(candidate =>
      candidate.question === item.question) === index)
    .map(({ question }) => question);
}

function suggestedQuestionsForRole(user) {
  return questionsForRole(user).slice(0, 4);
}

// اقتراحات متابعة مرتبطة بموضوع السؤال نفسه، تظهر بعد كل رد ناجح
// بدل الاقتراحات العامة، وتُرشَّح وفق أدوات الدور المتاحة.
const CONTEXTUAL_SUGGESTIONS = {
  schedule: [
    { tool: 'schedule', question: 'عندي إيه بكرة؟' },
    { tool: 'schedule', question: 'مين دكتور المحاضرة الجاية؟' },
    { tool: 'lastLecture', question: 'آخر محاضرة كانت إمتى؟' }
  ],
  scheduleCount: [
    { tool: 'schedule', question: 'عندي إيه بكرة؟' },
    { tool: 'schedule', question: 'مين دكتور المحاضرة الجاية؟' },
    { tool: 'lastLecture', question: 'آخر محاضرة كانت إمتى؟' }
  ],
  lastLecture: [
    { tool: 'schedule', question: 'عندي إيه بكرة؟' },
    { tool: 'schedule', question: 'مين دكتور المحاضرة الجاية؟' }
  ],
  myAttendance: [
    { tool: 'myAttendance', question: 'غبت كام مرة؟' },
    { tool: 'myAttendance', question: 'غياباتي في كل مادة كام؟' },
    { tool: 'schedule', question: 'جدولي إيه بكرة؟' }
  ],
  attendance: [
    { tool: 'attendance', question: 'مين حضر النهارده؟' },
    { tool: 'myAttendance', question: 'غبت كام مرة؟' },
    { tool: 'groupAttendance', question: 'مين غاب النهارده؟' }
  ],
  groupAttendance: [
    { tool: 'groupAttendance', question: 'مين غاب النهارده؟' },
    { tool: 'groupAttendance', question: 'مين حضر في المجموعة؟' },
    { tool: 'groupReport', question: 'اعرض تقرير المجموعة' }
  ],
  balance: [
    { tool: 'balance', question: 'دفعت كام لحد دلوقتي؟' },
    { tool: 'balance', question: 'إجمالي رسوم الكورس كام؟' },
    { tool: 'subjects', question: 'إيه المواد المقررة؟' }
  ],
  dues: [
    { tool: 'dues', question: 'مين لسه مدفعش؟' },
    { tool: 'dues', question: 'المجموع المتبقي كام؟' },
    { tool: 'studentLookup', question: 'ابحث عن طالب بالاسم' }
  ],
  exams: [
    { tool: 'exams', question: 'الاختبار الجاي إمتى؟' },
    { tool: 'results', question: 'جبت كام في آخر اختبار؟' },
    { tool: 'schedule', question: 'جدولي إيه بكرة؟' }
  ],
  examCount: [
    { tool: 'exams', question: 'الاختبار الجاي إمتى؟' },
    { tool: 'results', question: 'جبت كام في آخر اختبار؟' }
  ],
  results: [
    { tool: 'results', question: 'متوسط درجاتي كام؟' },
    { tool: 'myAttendance', question: 'غبت كام مرة؟' },
    { tool: 'exams', question: 'الاختبار الجاي إمتى؟' }
  ],
  profile: [
    { tool: 'balance', question: 'فاضل عليا كام؟' },
    { tool: 'myAttendance', question: 'عندي كام غياب؟' },
    { tool: 'subjects', question: 'إيه المواد المقررة؟' }
  ],
  studentLookup: [
    { tool: 'studentLookup', question: 'ابحث عن طالب بالاسم' },
    { tool: 'dues', question: 'مين لسه مدفعش؟' },
    { tool: 'results', question: 'اعرض درجات الطلاب' }
  ],
  groupReport: [
    { tool: 'groupReport', question: 'اعرض تقرير المجموعة' },
    { tool: 'groupAttendance', question: 'مين حضر النهارده؟' },
    { tool: 'stats', question: 'عدد الطلاب كام؟' }
  ],
  notifications: [
    { tool: 'notifications', question: 'في إعلان جديد؟' },
    { tool: 'schedule', question: 'جدولي إيه بكرة؟' },
    { tool: 'courseInfo', question: 'إيه حالة الكورس؟' }
  ],
  subjects: [
    { tool: 'doctorLookup', question: 'مين دكتور المحاسبة؟' },
    { tool: 'schedule', question: 'جدولي إيه بكرة؟' }
  ],
  doctorLookup: [
    { tool: 'subjects', question: 'إيه المواد المقررة؟' },
    { tool: 'schedule', question: 'جدولي إيه بكرة؟' }
  ],
  courseInfo: [
    { tool: 'schedule', question: 'جدولي إيه بكرة؟' },
    { tool: 'balance', question: 'فاضل عليا كام؟' },
    { tool: 'exams', question: 'الاختبار الجاي إمتى؟' }
  ],
  stats: [
    { tool: 'stats', question: 'عدد الطلاب كام؟' },
    { tool: 'dues', question: 'مين لسه مدفعش؟' },
    { tool: 'groupReport', question: 'اعرض تقرير المجموعة' }
  ],
  studentCount: [
    { tool: 'stats', question: 'عدد الطلاب كام؟' },
    { tool: 'dues', question: 'مين لسه مدفعش؟' },
    { tool: 'groupReport', question: 'اعرض تقرير المجموعة' }
  ],
  paymentsTotal: [
    { tool: 'stats', question: 'إجمالي المدفوعات كام؟' },
    { tool: 'dues', question: 'مين لسه مدفعش؟' },
    { tool: 'groupReport', question: 'اعرض تقرير المجموعة' }
  ],
  sessionCount: [
    { tool: 'schedule', question: 'عندي إيه بكرة؟' },
    { tool: 'lastLecture', question: 'آخر محاضرة كانت إمتى؟' }
  ]
};

function questionsForIntent(intent, user) {
  const contextual = CONTEXTUAL_SUGGESTIONS[intent];
  if (!contextual) return [];
  return [...new Set(contextual
    .filter(({ tool }) => canUseTool(user, tool))
    .map(({ question }) => question))].slice(0, 3);
}

// مطالبات متابعة خالصة بلا معلومات جديدة («وإيه تاني؟»، «وبعدها؟»)
function isPureContinuation(normalized) {
  return /^(?:و?طب|طيب|وبعدها|وبعد كده|وبعد|بعدها|تاني|تانيه|و?ايه تاني|و?اي تاني|كمان ايه|كمان|برضه|برضو|تفضل|then|what else|and then|else)$/.test(normalized);
}

function suggestedQuestionsForMessage(message, user) {
  const contextual = questionsForIntent(detectIntent(message).intent, user);
  return contextual.length ? contextual : suggestedQuestionsForRole(user);
}

function chatBootstrapForUser(user) {
  const greetings = {
    student: `أهلًا ${user.name}، أقدر أساعدك في جدولك وحضورك ودرجاتك ومدفوعاتك.`,
    doctor: `أهلًا د. ${user.name}، أقدر أساعدك في مجموعاتك والحضور والتقارير.`,
    assistant: `أهلًا ${user.name}، أقدر أساعدك في متابعة الطلاب والحضور والتقارير.`,
    admin: `أهلًا ${user.name}، أقدر أساعدك في ملخصات الكورس والطلاب والمدفوعات.`
  };
  return {
    greeting: greetings[user.role] || `أهلًا ${user.name}، كيف أساعدك؟`,
    suggestedQuestions: suggestedQuestionsForRole(user),
    allQuestions: questionsForRole(user)
  };
}

async function responseButtons(db, user, message, response) {
  const parsed = detectIntent(message);
  const groupTools = new Set(['groupAttendance', 'dues', 'duesTotal', 'groupReport']);
  const groupPrompt = /^(?:ما المجموعة المقصودة|أي مجموعة تقصد|اختار الفرقة والمجموعة|اختار الفرقة|أي مجموعة)/.test(response);
  if (groupPrompt || groupTools.has(parsed.intent)) {
    const groups = await accessibleGroups(db, user);
    const groupResult = resolveGroup(parsed.normalized, groups);
    if (groups.length && !groupResult.group) {
      const levels = [...new Set(groups.map(group => group.level_name).filter(Boolean))];
      const normalizedMessage = parsed.normalized;
      const selectedLevel = levels.find(level =>
        normalizedMessage.includes(normalizeArabic(level)));
      const choices = selectedLevel
        ? groups.filter(group => group.level_name === selectedLevel).map(group => ({
          label: group.name,
          message: `${message} ${group.name}`
        }))
        : levels.map(level => ({
          label: level,
          message: `${message} ${level}`
        }));
      return appendMenuQuestions(choices, user, message);
    }
  }
  if ((parsed.intent === 'studentLookup' && !parsed.studentName || /اذكر اسم الطالب أو كوده/.test(response)) &&
      canUseTool(user, 'studentLookup')) {
    const rows = (await db.query(`SELECT name,code FROM students
      WHERE active=1 AND cancelled_at IS NULL ORDER BY name,id LIMIT 100`, [])).rows;
    if (rows.length) {
      const choices = rows.map(student => ({
        label: `${student.name} (${student.code})`,
        message: `${message} ${student.code}`
      }));
      return appendMenuQuestions(choices, user, message);
    }
  }
  return appendMenuQuestions(
    questionsForIntent(detectIntent(message).intent, user)
      .map(question => ({ label: question, message: question })),
    user,
    message
  );
}

function appendMenuQuestions(primary, user, currentMessage) {
  const seen = new Set([normalizeArabic(currentMessage)]);
  const options = [];
  for (const option of [...primary, ...questionsForRole(user).map(question => ({
    label: question,
    message: question
  }))]) {
    const normalized = normalizeArabic(option.message);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    options.push(option);
  }
  return options;
}

export const studentQueryStopWords = new Set([
  'هل', 'هو', 'هي', 'مين', 'من', 'اللي', 'الطالب', 'طالبه', 'طلاب', 'طالب', 'بياناتي',
  'بيانات', 'بياناته', 'بياناتها', 'ملف', 'ملفاته', 'دفع', 'دفعت', 'مدفوع',
  'مدفوعه', 'يدفع', 'يدفغ', 'فلوس', 'فلوسه', 'الفلوس', 'الكورس', 'كورس',
  'عليه', 'عليها', 'عليهم', 'علي', 'عليا', 'باقي', 'متبقي', 'متبقيه',
  'رصيد', 'كام', 'كم', 'عنده', 'عندها', 'عندي', 'له', 'لها', 'اسمه', 'اسمها',
  'المجموعه', 'مجموعه', 'جروب', 'دفعة', 'دفعه', 'الدفعة', 'الدفعب', 'فرقه',
  'الفرقه', 'الاولى', 'الاول', 'الثانيه', 'الثاني', 'التانيه', 'التاني',
  'الثالثه', 'الثالث', 'الرابعه', 'الرابع', 'المحاضره', 'محاضره', 'محاضرات', 'محاضراتي', 'محاضرتي',
  'جدول', 'جدولي', 'امتحان', 'امتحانات', 'امتحاناتي', 'اختبار', 'اختبارات', 'اختباري', 'اختباراتي',
  'درجات', 'درجه', 'درجاتي', 'نتيجه', 'نتايج', 'حضور', 'حضوري', 'حضر', 'حاضرين', 'حاضر',
  'غياب', 'غيابي', 'غياباتي', 'غاب', 'غايب', 'غايبين', 'مره', 'مرة',
  'تقرير', 'تقارير', 'ملخص', 'كشف', 'اوله', 'الاوله', 'اولي', 'الاولي',
  'فاضل', 'اجمالي', 'مجموع', 'عدد', 'اعرض', 'هات', 'جيب', 'وريني', 'طلع',
  'اعمل', 'سجل', 'اكتب', 'اريد', 'عايز', 'عاوز', 'ممكن', 'اعرف', 'النهارده',
  'النهاردا', 'اليوم', 'بكره', 'غدا', 'النشطين', 'نشطين', 'نشط',
  'مدفوعات', 'مستحقات', 'كامله', 'كامل', 'الكل', 'كل',
  'لسه', 'مدفعش', 'مدفعتش', 'مادفعش', 'ما', 'دفعته', 'طب', 'طيب',
  'ايه', 'إيه', 'شو', 'فين', 'في', 'امتى', 'إمتى', 'متى', 'قد', 'اد', 'سنه', 'سنة',
  'اسمي', 'كود', 'كودي', 'كودك', 'رقمي', 'رقمك', 'الرقم',   'ماده', 'مواد', 'مقرر', 'المقرره', 'محاسبه', 'محاسبة', 'ندوه', 'ندوات',
  'رسوم', 'الرسوم', 'سعر', 'السعر',  'مصاريف', 'المصاريف', 'فلوس', 'الفلوس', 'المبلغ', 'الاختبارات', 'الاختبارات',
  'اكتر', 'اكثر', 'فوق', 'اقل', 'اعلي', 'جبت', 'جبتها', 'مدخلتهاش', 'دخلتهاش',
  'المتبقي', 'الباقي', 'انتظام', 'مهمه', 'ضروري', 'عاجل',
  'سمحت', 'لو', 'عامل',
  'نتائجي', 'نتايجي', 'النتائج', 'النتيجه', 'مستوايا', 'مستواي',
  'what', 'is', 'my', 'mine', 'me', 'i', 'am', 'do', 'does', 'the', 'student',
  'balance', 'attendance', 'schedule', 'exam', 'exams', 'grade', 'grades', 'result',
  'results', 'course', 'fee', 'fees', 'paid', 'payment', 'payments', 'name', 'code',
  'group', 'level', 'year', 'today', 'tomorrow', 'how', 'many', 'much', 'can', 'see',
  'another', 'please', 'show',
  // حروف الجر والروابط وأفعال شائعة لا تدخل في أسماء الطلاب
  'من', 'الى', 'الي', 'عن', 'مع', 'عند', 'منذ', 'خلال', 'بين', 'بدون', 'حتي', 'حتى',
  'قبل', 'بعد', 'بعدين', 'تاني', 'كمان', 'ايضا', 'برضه', 'برضو', 'بس', 'اه', 'ايوه',
  'تمام', 'مش', 'ليه', 'ازاي', 'دلوقتي', 'دلوقت', 'حالا', 'هل', 'اي', 'انهي', 'هذا',
  'هذين', 'هذه', 'ذلك', 'تلك', 'هنا', 'هناك', 'هو', 'هي', 'هما', 'هم', 'هن',
  'طلعت', 'ظهرت', 'جت', 'جات', 'وصلت', 'لقيت', 'عرفت', 'فيه', 'فيها', 'حضرت', 'غبت',
  'اتسجلت', 'اتسجل', 'اتعملت', 'اتحدثت', 'خلصت', 'عدت', 'شاف', 'شافت', 'قال', 'قالت',
  // ضمائر المفعول تشير إلى طالب سابق في المحادثة لا إلى اسم جديد
  'نتيجته', 'نتيجتها', 'درجته', 'درجتها', 'درجاتهم', 'نتيجتهم', 'حضوره', 'حضورها',
  'غيابه', 'غيابها', 'فلوسه', 'فلوسها', 'رصيده', 'رصيدها', 'حسابه', 'حسابها',
  'ملفه', 'ملفها', 'كوده', 'كودها', 'امتحانه', 'امتحانها', 'حالته', 'حالها',
  'مصاريفه', 'مصاريفها', 'بياناته', 'بياناتها', 'سعره', 'سعرها', 'حصته', 'حصتها'
]);

export function normalizeArabic(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[\u064B-\u065F\u0670\u00A0\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// الكلمة قد تأتي ملتصقة بأدوات الربط (و، ف، ب، ك، ل) أو أداة التعريف (ال)
// فنولّد الصيغ الممكنة لنفس الكلمة ونطابق معها لتفهم المحادثة الكتابات الملتصقة.
function wordForms(word) {
  const forms = new Set([word]);
  let current = word;
  for (let round = 0; round < 2; round += 1) {
    const withoutArticle = current.replace(/^ال/, '');
    if (withoutArticle !== current) {
      forms.add(withoutArticle);
      current = withoutArticle;
      continue;
    }
    const withoutConjunction = current.replace(/^[وف](?=[\p{L}]{3,})/u, '');
    if (withoutConjunction !== current) {
      forms.add(withoutConjunction);
      current = withoutConjunction;
      continue;
    }
    const withoutPreposition = current.replace(/^[بكل](?=[\p{L}]{4,})/u, '');
    if (withoutPreposition !== current) {
      forms.add(withoutPreposition);
      current = withoutPreposition;
    }
  }
  return [...forms];
}

// مطابقة تقريبية محدودة المسافة تتسامح مع أخطاء الكتابة الشائعة
// (ح/ه، ظ/ض، س/ش، حذف أو إضافة حرف) دون أن تفتح باب تطابقات خاطئة واسعة.
function withinEditDistance(left, right, maxDistance) {
  if (left === right) return true;
  if (Math.abs(left.length - right.length) > maxDistance) return false;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    const current = [row];
    let rowMinimum = current[0];
    for (let column = 1; column <= right.length; column += 1) {
      const substitution = previous[column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1);
      current[column] = Math.min(previous[column] + 1, current[column - 1] + 1, substitution);
      rowMinimum = Math.min(rowMinimum, current[column]);
    }
    if (rowMinimum > maxDistance) return false;
    previous = current;
  }
  return previous[right.length] <= maxDistance;
}

function hasTerm(text, term) {
  const nTerm = normalizeArabic(term);
  if (!nTerm) return false;
  const termForms = wordForms(nTerm);
  const padded = ` ${text} `;
  if (termForms.some(form => padded.includes(` ${form} `))) return true;
  for (const token of text.split(' ')) {
    for (const tokenForm of wordForms(token)) {
      for (const form of termForms) {
        if (tokenForm === form) return true;
        if (Math.min(tokenForm.length, form.length) >= 4 &&
            (tokenForm.startsWith(form) || form.startsWith(tokenForm))) return true;
        if (Math.min(tokenForm.length, form.length) >= 5 &&
            tokenForm.slice(0, 3) === form.slice(0, 3)) {
          // نقارن كلمات تتفق في بدايتها فقط حتى لا يتحول «تقرير» إلى «تقدير»
          const tolerance = Math.max(tokenForm.length, form.length) >= 8 ? 2 : 1;
          if (withinEditDistance(tokenForm, form, tolerance)) return true;
        }
      }
    }
  }
  return false;
}

function matchesAny(text, list) {
  return list.some(term => hasTerm(text, term));
}

function isEnglish(text) {
  const letters = String(text ?? '').replace(/[^a-zA-Z]/g, '');
  const arabic = String(text ?? '').replace(/[^\u0600-\u06FF]/g, '');
  return letters.length >= 3 && arabic.length === 0;
}

export function extractStudentName(message) {
  const normalizedMessage = normalizeArabic(message);
  const financialAmount = /(عليه|عليا|فلوس|مصاريف|اكتر من|اكثر من|اقل من|فوق|دفعت|مديون)/.test(normalizedMessage) &&
    !/(كود|رقم الطالب|student code|student id)/.test(normalizedMessage);
  const tokens = String(message ?? '')
    .normalize('NFKC')
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .match(/[\p{L}\p{N}-]+/gu) || [];
  const retained = [];
  for (const token of tokens) {
    const normalized = normalizeArabic(token);
    // «كود1» أو «رقم2» يقصدان كود الطالب وليس اسمًا
    const attachedCode = normalized.match(/^(?:كود|رقم)(\d{1,6})$/);
    if (attachedCode) {
      retained.push(attachedCode[1]);
      continue;
    }
    if (financialAmount && /^\d+$/.test(normalized)) continue;
    if (wordForms(normalized).some(form => studentQueryStopWords.has(form))) continue;
    retained.push(token);
  }
  if (!retained.length || retained.length > 6) return null;
  return retained.join(' ').trim();
}

export function cairoDateOffset(offset) {
  const [year, month, day] = today().split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + offset));
  return date.toISOString().slice(0, 10);
}

export function extractDate(normalized) {
  normalized = normalizeArabic(normalized);
  const explicit = normalized.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (explicit) {
    const value = `${explicit[1]}-${explicit[2]}-${explicit[3]}`;
    return Number.isFinite(Date.parse(value)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
      ? value
      : null;
  }
  if (/(^|\s)(بعد بكره|بعد بكرة|بعد غد)(\s|$)/.test(normalized)) return cairoDateOffset(2);
  if (/(^|\s)(اول امبارح|اول امس)(\s|$)/.test(normalized)) return cairoDateOffset(-2);
  if (/(^|\s)(بكره|بكرة|غدا|غداً|غد|tomorrow)(\s|$)/.test(normalized)) return cairoDateOffset(1);
  if (/(^|\s)(امبارح|مبارح|امس|أمس|yesterday)(\s|$)/.test(normalized)) return cairoDateOffset(-1);
  if (/(^|\s)(النهارده|النهاردا|اليوم|انهارده|انهاردا|النهردة|النهرده|النهاردة|انهرده|today)(\s|$)/.test(normalized)) return today();

  const days = [
    { names: ['السبت', 'saturday'], day: 6 },
    { names: ['الحد', 'الاحد', 'الأحد', 'sunday'], day: 0 },
    { names: ['الاثنين', 'الإثنين', 'التنين', 'monday'], day: 1 },
    { names: ['التلات', 'الثلاثاء', 'تلات', 'tuesday'], day: 2 },
    { names: ['الاربع', 'الأربعاء', 'اربع', 'wednesday'], day: 3 },
    { names: ['الخميس', 'خميس', 'thursday'], day: 4 },
    { names: ['الجمعة', 'الجمعه', 'friday'], day: 5 }
  ];
  for (const { names, day } of days) {
    if (names.some(name => hasTerm(normalized, name))) {
      const cairoDate = new Date(`${today()}T00:00:00Z`);
      const currentDay = cairoDate.getUTCDay();
      let diff = (day - currentDay + 7) % 7;
      if (diff === 0 && !/(النهارده|اليوم)/.test(normalized)) diff = 7;
      return cairoDateOffset(diff);
    }
  }

  return null;
}

export function extractDateRange(normalized) {
  normalized = normalizeArabic(normalized);
  const nextWeek = /(^|\s)(الاسبوع الجاي|الاسبوع القادم|الاسبوع المقبل|next week)(\s|$)/.test(normalized);
  const thisWeek = /(^|\s)(الاسبوع ده|الاسبوع دا|الاسبوع الحالي|هذا الاسبوع|this week)(\s|$)/.test(normalized);
  const lastWeek = /(^|\s)(الاسبوع اللي فات|الاسبوع الماضي|الاسبوع السابق|last week)(\s|$)/.test(normalized);
  if (!nextWeek && !thisWeek && !lastWeek) return null;
  const current = new Date(`${today()}T00:00:00Z`);
  const daysSinceSaturday = (current.getUTCDay() + 1) % 7;
  const weekOffset = nextWeek ? 7 : lastWeek ? -7 : 0;
  const start = cairoDateOffset(-daysSinceSaturday + weekOffset);
  return { start, end: cairoDateOffset(-daysSinceSaturday + weekOffset + 6) };
}

function detectBaseIntent(message) {
  const normalized = normalizeArabic(message);

  if (/^(?:(?:تمام|ايوه|اه)\s+)?(?:اكد|اكدها|اوافق|موافق|ايوه|اه|تمام|نفذ|نفذها|نعم|yes|confirm)$/.test(normalized)) {
    return { intent: 'confirm', normalized };
  }
  if (/^(?:الغ|الغي|الغاء|تراجع|مش موافق|لا|لأ|رفض|cancel)(?:\s+(?:اكد|اكدها|نفذ|نفذها))?$/.test(normalized)) {
    return { intent: 'cancel', normalized };
  }
  if (/(مين انت|انت مين|اسمك ايه|مين الناس دى|مين الناس دي|who are you|what is your name|are you a bot|انت روبوت)/.test(normalized)) {
    return { intent: 'identity', normalized };
  }
  if (/(^|\s)(مرحبا|مرحبًا|اهلا|السلام|صباح|مساء|ازيك|ازايك|هاي|هلا|hello|hi|hey)(\s|$)/.test(normalized)) {
    return { intent: 'greeting', normalized };
  }
  if (/(ساعدني|ماذا تستطيع|ايه اللي تقدر|تقدر تعمل|ايه اللي تعرفه|ايه وظائفك|بتعمل ايه|ازاي استخدم|ازاي تستخدم|كيف تستخدم|كيف استخدمك|كيف تعمل|help|capabilities|how can you|how do I use you|what can you do)/.test(normalized)) {
    return { intent: 'help', normalized };
  }
  if (/(شكرا|شكراً|متشكر|مشكور|تسلم|الله يخليك|يعطيك العافيه|thanks|thank you)/.test(normalized)) {
    return { intent: 'thanks', normalized };
  }

  const imperative = /(^|\s)(سجل|سجلي|اثبت|اضف|ضيف|علم|اعرض|اعرضلي|هات|جيب|وريني|طلع|اعمل)(\s|$)/.test(normalized);
  const personal = /(^|\s)(انا|عندي|لي|ليا|عليا|خاصتي|بتاعي|بتاعتي|حسابي|بياناتي|اسمي|كودي|رقمي|كودك|رقمك|my|mine|me|i|حضوري|غيابي|غياباتي|محاضراتي|محاضرتي|جدولي|امتحاناتي|اختباراتي|درجاتي|نتيجتي|نتايجي|رصيدي|فلوسي)(\s|$)/.test(normalized) ||
    /(^|\s)(محاضراتي|محاضرتي|جدولي|غيابي|غياباتي|حضوري|امتحاناتي|اختباراتي|درجاتي|رصيدي)(\s|$)/.test(normalized) ||
    /(^|\s)و?(حضوري|غيابي|غياباتي|درجاتي|امتحاناتي|محاضراتي)(\s|$)/.test(normalized) ||
    /(^|\s)(غبت|غيبت|حضرت|دفعت)(\s|$)/.test(normalized);

  const asksForCount = /(^|\s)(عدد|كم|كام|قد ايه|اد ايه|اجمالي|مجموع|total|count)(\s|$)|\b(how many|number of)\b/.test(normalized);
  const aggregateQuery = /(^|\s)(اجمالي|مجموع|الكل|كل|النشطين|نشطين)(\s|$)/.test(normalized);

  const isSchedule = matchesAny(normalized, [
    'محاضره', 'محاضرات', 'محاضرتي', 'محاضراتي', 'محاظره', 'محاظرات',
    'جدول', 'جدولي', 'حصه', 'حصص', 'درس', 'دروس', 'جلسه', 'جلسات',
    'ندوه', 'ندوات', 'ورشه', 'ورش', 'ميعاد', 'مواعيد',
    'lecture', 'lectures', 'schedule', 'class', 'classes', 'timetable', 'session', 'sessions', 'workshop', 'workshops'
  ]);

  const isAbsence = matchesAny(normalized, [
    'غياب', 'غيابات', 'غاب', 'غبت', 'غيبت', 'غايب', 'غايبين', 'absent', 'absence', 'absences'
  ]);

  const isAttendance = /(^|\s)و?(حضوري|غيابي|غياباتي)(\s|$)/.test(normalized) || matchesAny(normalized, [
    'حضور', 'حضرت', 'حضر', 'حاضرين', 'حاضر', 'حضوري', 'نسبته', 'attendance', 'present', 'attend', 'attended'
  ]);

  const isBalance = matchesAny(normalized, [
    'عليا', 'رصيد', 'باقي', 'متبقي', 'فاضل', 'ادفع', 'فلوس', 'مبلغ', 'مديون',
    'دفع', 'دفعت', 'دفعات', 'مدفوع', 'مدفوعات', 'سداد', 'مستحق', 'مستحقات',
    'مصاريف', 'رسوم', 'سعر', 'قسط', 'payment', 'payments', 'balance', 'paid',
    'fee', 'fees', 'cost'
  ]);

  const isDues = matchesAny(normalized, [
    'عليه', 'عليهم', 'مدفعش', 'مدفعتش', 'مادفعش', 'ما دفع', 'متاخر', 'ديون', 'unpaid'
  ]);
  const asksForRemainingTotal = aggregateQuery && !personal && isBalance &&
    matchesAny(normalized, ['متبقي', 'باقي', 'مستحق', 'ديون', 'unpaid']);

  const isExams = matchesAny(normalized, [
    'امتحان', 'امتحانات', 'اختبار', 'اختبارات', 'الختبار', 'كويز', 'quiz', 'exam', 'exams', 'test'
  ]);

  const isResults = matchesAny(normalized, [
    'درجه', 'درجات', 'درجاتي', 'نتيجه', 'نتيجتي', 'نتايج', 'نتائجي', 'النتائج', 'علامه', 'علامات', 'تقدير',
    'score', 'result', 'results', 'grade', 'grades', 'marks'
  ]);

  const isReport = matchesAny(normalized, [
    'تقرير', 'تقارير', 'ملخص', 'كشف', 'report'
  ]);

  const asksForOwnCode = /(كودي|كودك|رقمي|رقمك|my code|my student id|my id|student id)/.test(normalized) ||
    /(?:كود|رقم)(?:\s+(?:الطالب|الطالبه|التسجيل|القيد))?\s+(?:بتاعي|بتاعتي|الخاص بيا|الخاصة بيا)/.test(normalized);
  const asksForOwnLevel = /(فرقتي|سنتي|مستوايا|مستواي|my year|my level)/.test(normalized) ||
    /(?:انا\s+)?(?:في|تبع)\s+(?:ال)?(?:فرقه|سنه|مستوى)\s+(?:بتاعتي|بتاعي|ايه|كام)/.test(normalized) ||
    /(?:ال)?(?:فرقه|سنه|مستوى)\s+(?:بتاعتي|بتاعي)/.test(normalized);
  const asksForOwnGroup = /(مجموعتي|جروبي|my group)/.test(normalized) ||
    /(?:انا\s+)?(?:في|تبع)\s+(?:ال)?(?:مجموعه|جروب)\s+(?:بتاعتي|بتاعي|ايه|كام)/.test(normalized) ||
    /(?:ال)?(?:مجموعه|جروب)\s+(?:بتاعتي|بتاعي)/.test(normalized);

  const isProfile = matchesAny(normalized, [
    'بياناتي', 'ملفي', 'حسابي', 'اسمي', 'profile'
  ]) || asksForOwnCode || asksForOwnLevel || asksForOwnGroup ||
    /(سنه كام|جروب ايه|مجموعتي|فرقتي|انا في (?:ال)?فرقه|انا في (?:ال)?سنه|انا في (?:ال)?مجموعه|تابع لمين|كود (?:ال)?طالب|رقم (?:ال)?طالب|بيانات (?:الطالب )?(?:بتاعي|بتاعتي)|معلومات (?:الطالب )?(?:بتاعي|بتاعتي)|مسجل باسم|الاسم المسجل|my name|what is my name)/.test(normalized);

  const isDoctor = matchesAny(normalized, [
    'دكتور', 'دكتوره', 'دكاتره', 'محاضر', 'استاذ', 'مستر', 'مدرس',
    'بيدرس', 'يدرس', 'بيدي', 'doctor'
  ]);

  const isSubject = matchesAny(normalized, [
    'ماده', 'مواد', 'مقرر', 'كورس', 'subject'
  ]);

  const isLast = /(^|\s)(اخر|آخر)(\s|$)/.test(normalized);

  const studentSearchMatch = normalized.match(/^(?:ابحث|دور|بحث)\s+(?:عن|على)\s+(?:ال)?طالب(?:\s+(.+))?$/) ||
    normalized.match(/^(?:search for a student|student lookup)(?:\s+(.+))?$/);
  if (studentSearchMatch) {
    const rawSearchTerm = String(message ?? '').replace(
      /^(?:ابحث|دور|بحث)\s+(?:عن|على)\s+(?:ال)?طالب|^(?:search for a student|student lookup)/i,
      ''
    ).trim();
    return {
      intent: 'studentLookup',
      normalized,
      imperative,
      personal,
      studentName: rawSearchTerm ? extractStudentName(rawSearchTerm) : null,
      studentLookupMode: 'profile'
    };
  }

  const studentName = extractStudentName(message);

  if (asksForRemainingTotal) {
    return { intent: 'duesTotal', normalized, imperative, personal, remainingTotal: true };
  }

  if (/(حاله الكورس|حاله كورسي|انا مسجل (?:في|بال) (?:ال)?كورس|course status|course info)/.test(normalized)) {
    return { intent: 'courseInfo', normalized, imperative, personal: true };
  }

  // بحث بالكود مباشرة: «كود1» / «رقم 2»
  const bareCode = normalized.match(/^(?:كود|رقم|كود الطالب|رقم الطالب)\s*(\d{1,6})$/);
  if (bareCode && !personal) {
    return {
      intent: 'studentLookup',
      normalized,
      imperative,
      personal,
      studentName: bareCode[1],
      studentLookupMode: 'profile'
    };
  }

  // Staff named student queries
  if (studentName && !personal &&
      (isProfile || isBalance || isDues || isResults ||
        ((isAttendance || isAbsence) && !imperative &&
          !/(مجموعه|جروب|دفعه|الدفعب)/.test(normalized)) || /دفع فلوس|دفع الكورس/.test(normalized))) {
    return {
      intent: 'studentLookup',
      normalized,
      imperative,
      personal,
      studentName,
      studentLookupMode: isResults ? 'results' : (isBalance || isDues || /دفع/.test(normalized)) ? 'finance' :
        (isAttendance || isAbsence) ? 'attendance' : 'profile'
    };
  }

  // Profile queries
  if (isProfile && personal) return { intent: 'profile', normalized, imperative, personal };
  if (isProfile && !personal && !studentName) return { intent: 'profile', normalized, imperative, personal };

  // Results
  if (isResults) return { intent: 'results', normalized, imperative, personal };

  // Group Report
  if (isReport) return { intent: 'groupReport', normalized, imperative, personal };

  if (isSubject && /(ايه المواد|المواد بتاعتي|وريني المواد|المواد المقرره|المواد المقرره عليا|المواد عليا|my subjects|my courses)/.test(normalized)) {
    return { intent: 'subjects', normalized, imperative, personal };
  }

  // Personal Balance before aggregate payments
  const personalFeeQuestion = /(رسوم الكورس|سعر الكورس|اجمالي رسوم|اجمالي الكورس|course fee|course fees)/.test(normalized);
  const personalBalanceMarkers = /(عليا|فاضل عليا|باقي عليا|دفعت|رصيدي|فلوسي|المتبقي|الباقي|فاضل|باقي|متبقي|لسه عليا|مصاريف)/.test(normalized);
  if (isBalance && (personal || personalBalanceMarkers || personalFeeQuestion) &&
      (!aggregateQuery || personal || personalBalanceMarkers || personalFeeQuestion)) {
    return { intent: 'balance', normalized, imperative, personal };
  }

  if (isAbsence && personal) {
    return { intent: 'myAttendance', normalized, imperative, personal };
  }
  if (isAttendance && personal && !imperative && !/(مين حضر|مين غاب)/.test(normalized)) {
    return { intent: 'myAttendance', normalized, imperative, personal };
  }

  // Counts / Stats for staff
  if (asksForCount && isExams) return { intent: 'examCount', normalized };
  if (asksForCount && isSchedule) {
    const dateSpecific = Boolean(extractDate(normalized) || extractDateRange(normalized)) || personal ||
      /(^|\s)(عندي|لينا|لنا|بتاعي|بتاعتي)(\s|$)/.test(normalized);
    return { intent: dateSpecific ? 'scheduleCount' : 'sessionCount', normalized, imperative, personal };
  }
  if (asksForCount && /(طلاب|طالب|students)/.test(normalized)) return { intent: 'studentCount', normalized };
  if (asksForCount && isBalance && aggregateQuery) return { intent: 'paymentsTotal', normalized };
  if (/(اجمالي المدفوعات|مجموع المدفوعات|اجمالي الدفعات|payments total)/.test(normalized)) return { intent: 'paymentsTotal', normalized };

  // Dues (staff asking who owes money)
  if (isDues && !personal && !/(عليا|فاضل عليا|باقي عليا)/.test(normalized)) {
    return { intent: 'dues', normalized, imperative, personal };
  }

  // Fallback balance
  if (isBalance && !aggregateQuery) {
    return { intent: 'balance', normalized, imperative, personal };
  }

  // Personal Absences vs Group Attendance
  if (isAttendance || isAbsence) {
    if (personal && !imperative && !/(مين حضر|مين غاب)/.test(normalized)) {
      return { intent: 'myAttendance', normalized, imperative, personal };
    }
    return { intent: 'groupAttendance', normalized, imperative, personal };
  }

  // Last / Next Lecture
  if (isLast && isSchedule) {
    return { intent: 'lastLecture', normalized, imperative, personal };
  }

  // Doctor & Subject lookup
  if (isDoctor && isSchedule && /(جاي|قاد|بكره|غدا|next|upcoming)/.test(normalized)) {
    return { intent: 'schedule', normalized, imperative, personal };
  }
  if (isDoctor && (isSubject || /(مين|من هو)/.test(normalized))) {
    return { intent: 'doctorLookup', normalized, imperative, personal };
  }

  // Exams
  if (isExams) return { intent: 'exams', normalized, imperative, personal };

  // Schedule / Lectures
  if (isSchedule) return { intent: 'schedule', normalized, imperative, personal };

  // Egyptian colloquial questions for schedule:
  if (personal && /(^|\s)(النهارده|النهاردا|اليوم|انهارده|انهاردا|النهردة|النهرده|النهاردة|انهرده|بكره|غدا|غد|امبارح)(\s|$)/.test(normalized)) {
    return { intent: 'schedule', normalized, imperative, personal };
  }
  if (/(عندي ايه|ايه اللي عندي|وريني اللي عندي)/.test(normalized)) {
    return { intent: 'schedule', normalized, imperative, personal };
  }

  // Notifications
  if (matchesAny(normalized, ['اشعار', 'اشعارات', 'تنبيه', 'تنبيهات', 'اعلان', 'اعلانات', 'اعلن', 'اعلنت', 'اخبار', 'notifications'])) {
    return { intent: 'notifications', normalized, imperative, personal };
  }

  return { intent: 'unknown', normalized };
}

export function detectIntent(message) {
  const parsed = detectBaseIntent(message);
  const semantic = classifyStudentIntent(message, parsed.intent);
  if (semantic.studentIntent === 'STUDENT_FINANCIAL_FILTER') {
    parsed.intent = 'dues';
    parsed.studentName = null;
    parsed.studentLookupMode = null;
  } else if (['MY_PAYMENT_STATUS', 'MY_TOTAL_PAID', 'MY_REMAINING_BALANCE', 'MY_PAYMENT_HISTORY', 'LAST_PAYMENT', 'COURSE_PRICE'].includes(semantic.studentIntent)) {
    parsed.intent = 'balance';
  } else if (semantic.studentIntent === 'STUDENT_QR_CODE') {
    parsed.intent = 'profile';
  } else if (semantic.studentIntent === 'ACCOUNT_SECURITY') {
    parsed.intent = 'accountSecurity';
  } else if (semantic.studentIntent === 'STUDENT_PROFILE' &&
      semantic.parameters.profileField === 'enrollment') {
    parsed.intent = 'profile';
  } else if (['LATEST_ANNOUNCEMENTS', 'MY_NOTIFICATIONS', 'IMPORTANT_NOTIFICATIONS'].includes(semantic.studentIntent)) {
    parsed.intent = 'notifications';
  } else if (semantic.studentIntent === 'MY_EXAMS' && parsed.intent === 'examCount') {
    parsed.intent = 'exams';
  } else if (['MY_EXAM_RESULTS', 'MY_EXAM_SCORE', 'MY_EXAM_HISTORY', 'MY_WRONG_ANSWERS'].includes(semantic.studentIntent)) {
    parsed.intent = 'results';
  } else if (['MY_RESULTS', 'MY_AVERAGE', 'MY_SCORE', 'MY_RESULT_BY_SUBJECT'].includes(semantic.studentIntent) &&
      !parsed.studentName) {
    parsed.intent = 'results';
  }
  if (parsed.remainingTotal) {
    parsed.intent = 'duesTotal';
    parsed.studentIntent = 'STUDENT_FINANCIAL_FILTER';
  }
  const date = extractDate(parsed.normalized);
  const dateRange = extractDateRange(parsed.normalized);
  const subject = parsed.normalized.match(/(?:ماده|مقرر|اختبار|امتحان|subject)\s+([\p{L}]+)/u)?.[1] || null;
  return {
    ...parsed,
    studentIntent: semantic.studentIntent,
    parameters: { ...semantic.parameters, date, dateRange, subject }
  };
}

export function detectMultiIntents(message) {
  const parts = message.split(/\s+و\s*|\s+وكمان\s+|\s+بالاضافة الى\s+|\s+بالإضافة إلى\s+|\s+and\s+/i);
  if (parts.length > 1) {
    const intents = parts
      .map(part => ({ ...detectIntent(part.trim()), source: part.trim() }))
      .filter(item => item.intent !== 'unknown' && item.intent !== 'confirm' && item.intent !== 'cancel');
    const uniqueIntents = [...new Map(intents.map(i => [i.studentIntent || i.intent, i])).values()];
    if (uniqueIntents.length >= 2) {
      return uniqueIntents;
    }
  }
  return null;
}

function studentFollowUpMode(message) {
  const normalized = normalizeArabic(message);
  const parsed = detectIntent(message);
  const refersToPreviousStudent = /(^|\s)(هو|هي|له|لها|عنده|عندها|عليه|عليها|درجته|نتيجته|حضوره|غيابه|فلوسه|his|her|their)(\s|$)/.test(normalized);
  if (parsed.intent === 'studentLookup' && parsed.studentName &&
      !studentQueryStopWords.has(normalizeArabic(parsed.studentName))) {
    return null;
  }
  if (/^(قول لي اكتر|قولي اكتر|وضحلي|وضح اكتر|تفاصيل اكتر|معلومات اكتر|اشرحلي|tell me more|more details)$/.test(normalized)) {
    return 'details';
  }
  if (!normalized ||
      /(اجمالي|مجموع (الطلاب|المدفوعات|الدفعات)|كل الطلاب|جميع الطلاب|طلاب|الطلاب|مين حضر|مين غاب|تقرير|المجموعة الاولى|المجموعة الثانيه)/.test(normalized) ||
      (['dues', 'studentCount', 'paymentsTotal', 'sessionCount', 'examCount', 'groupReport', 'groupAttendance'].includes(parsed.intent) && !refersToPreviousStudent) ||
      (parsed.intent === 'results' && /(طلاب|الطلاب|كل|جميع)/.test(normalized))) {
    return null;
  }
  if (/(نتائج|نتيج(?:ه|ته|تها|تهم)|درجات|درج(?:ه|ته|تها|تهم)|امتحان|اختبار|score|grade|results)/.test(normalized)) return 'results';
  if (/(دفع|مدفوع|مصاريف|متبقي|باقي|فلوس|رصيد|عليه|paid|payment|balance)/.test(normalized)) return 'finance';
  if (/(حضر|غاب|غياب|حضور|attendance|absent)/.test(normalized)) return 'attendance';
  if (/(فرقه|سنه|مستوى|مرحله|جروب|مجموعه|كود|كوده|كودها|اسمه|اسمها|بياناته|بياناتها|ملفه|ملفها|level|group|code|name|profile)/.test(normalized)) {
    return 'profile';
  }
  return null;
}

export function analyzeConversationContext(history) {
  const context = {
    lastTopic: null,
    lastDoctor: null,
    lastSubject: null,
    lastExam: null,
    lastStudentName: null,
    lastStudentLookupMode: null
  };

  if (!history || !history.length) return context;

  for (const turn of history) {
    const userMsg = turn.message || '';
    const aiResp = turn.response || '';
    const normUser = normalizeArabic(userMsg);

    const docMatch = aiResp.match(/د\.\s*([\p{L}\s]+?)(?:[،\n\r•\(\)—]|$)/u) ||
                     userMsg.match(/دكتور\s+([\p{L}\s]+?)(?:[؟\?\s،]|$)/u);
    if (docMatch) {
      context.lastDoctor = docMatch[1].trim();
    }

    const subMatch = aiResp.match(/(?:مادة|مقرر|ماده)\s+([\p{L}]+)/u) ||
                     userMsg.match(/(?:مادة|مقرر|ماده)\s+([\p{L}]+)/u) ||
                     userMsg.match(/(?:اختبار|امتحان)\s+([\p{L}]+)/u);
    if (subMatch && !['ايه', 'إيه', 'دي', 'ده'].includes(subMatch[1])) {
      context.lastSubject = subMatch[1].trim();
    } else if (/(محاسبة|محاسبه)/.test(userMsg + ' ' + aiResp)) {
      context.lastSubject = 'محاسبة';
    } else if (/(إدارة|ادارة|اداره)/.test(userMsg + ' ' + aiResp)) {
      context.lastSubject = 'إدارة';
    }

    const parsedTurn = detectIntent(userMsg);
    const followUpMode = studentFollowUpMode(userMsg);
    const stName = parsedTurn.intent === 'studentLookup' && !followUpMode ? parsedTurn.studentName : null;
    if (stName) {
      context.lastStudentName = stName;
      context.lastStudentLookupMode = parsedTurn.studentLookupMode || 'profile';
    } else if (context.lastStudentName && followUpMode) {
      context.lastStudentLookupMode = followUpMode;
    } else if (parsedTurn.intent === 'studentLookup' && followUpMode) {
      context.lastStudentName = null;
      context.lastStudentLookupMode = null;
    } else if (parsedTurn.intent !== 'unknown' && !['confirm', 'cancel'].includes(parsedTurn.intent)) {
      context.lastStudentName = null;
      context.lastStudentLookupMode = null;
    }

    if (/(غياب|غبت|حضور|حضوري)/.test(normUser)) {
      context.lastTopic = 'absence';
    } else if (/(امتحان|اختبار|كويز)/.test(normUser)) {
      context.lastTopic = 'exams';
    } else if (/(محاضره|محاضرات|جدول)/.test(normUser)) {
      context.lastTopic = 'schedule';
    } else if (/(دكتور|محاضر|بيدرس|بيدي)/.test(normUser)) {
      context.lastTopic = 'doctor';
    } else if (/(فلوس|رصيد|باقي|متبقي|دفع)/.test(normUser)) {
      context.lastTopic = 'balance';
    } else if (/(نتائج|نتايج|نتيجه|درجات|علامه)/.test(normUser)) {
      context.lastTopic = 'results';
    } else if (/(اشعار|اشعارات|اعلان|اخبار)/.test(normUser)) {
      context.lastTopic = 'notifications';
    }
  }

  return context;
}

function groupMatches(normalized, groups) {
  const mentioned = groups.filter(group => {
    const name = normalizeArabic(group.name);
    return name && (` ${normalized} `).includes(` ${name} `);
  });
  if (mentioned.length > 1) {
    const levelMatches = mentioned.filter(group => group.level_name && hasTerm(normalized, group.level_name));
    if (levelMatches.length) return levelMatches;
  }
  if (mentioned.length) return mentioned;
  const ordinal = [
    ['اول', 'اوله', 'الاولي', 'first', '1'],
    ['ثاني', 'تاني', 'تانيه', 'الثانيه', 'second', '2'],
    ['ثالث', 'تالته', 'تالت', 'الثالثه', 'third', '3'],
    ['رابع', 'رابعه', 'الرابعه', 'fourth', '4']
  ].find(terms => terms.some(term => hasTerm(normalized, term)));
  if (ordinal && /(مجموعه|جروب|دفعة|دفعه|الدفعة|الدفعب|فرقه|الفرقه|تقرير|حضور|طلاب)/.test(normalized)) {
    return groups.filter(group => {
      const name = normalizeArabic(group.name).split(' ').map(token => token.startsWith('ال') ? token.slice(2) : token);
      return ordinal.slice(0, 4).some(term => name.some(token => token.startsWith(normalizeArabic(term).replace(/^ال/, ''))));
    });
  }
  const number = normalized.match(/(?:مجموعه|جروب|group)\s*(\d+)/);
  if (!number) return [];
  const byId = groups.filter(group => String(group.id) === number[1]);
  if (byId.length) return byId;
  return groups.filter(group => normalizeArabic(group.name).split(' ').some(token => token === number[1]));
}

function money(amount, inEnglish = false) {
  return (Number(amount || 0) / 100).toLocaleString(inEnglish ? 'en-US' : 'ar-EG', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
}

function displayDoctorName(name) {
  return String(name ?? '').replace(/^(?:(?:دكتور\s+|د\.\s*|Dr\.?\s*))+/i, '').trim();
}

function formatTime(value, inEnglish = false) {
  if (!value) return inEnglish ? 'Unspecified time' : 'موعد غير محدد';
  const [hours, minutes] = value.split(':').map(Number);
  const date = new Date(Date.UTC(2020, 0, 1, hours, minutes));
  return new Intl.DateTimeFormat(inEnglish ? 'en-US' : 'ar-EG', {
    timeZone: 'UTC',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).format(date);
}

async function activeStudent(db, userId) {
  const student = (await db.query(`SELECT s.id,s.user_id,s.name,s.code,s.level_id,s.group_id,
      s.course_price_snapshot price,s.active,s.cancelled_at,g.name group_name,l.name level_name
    FROM students s JOIN groups_table g ON g.id=s.group_id JOIN levels l ON l.id=s.level_id
    WHERE s.user_id=? AND s.active=1 AND s.cancelled_at IS NULL`, [userId])).rows[0];
  return student || null;
}

async function accessibleGroups(db, user) {
  if (user.role === 'student') {
    const student = await activeStudent(db, user.id);
    return student ? [{ id: student.group_id, name: student.group_name, level_id: student.level_id }] : [];
  }
  if (!STAFF_ROLES.has(user.role)) return [];
  return (await db.query(`SELECT g.id,g.name,g.level_id,l.name level_name
    FROM groups_table g JOIN levels l ON l.id=g.level_id ORDER BY l.id,g.id`, [])).rows;
}

function resolveGroup(normalized, groups) {
  const mentioned = groupMatches(normalized, groups);
  if (mentioned.length === 1) return { group: mentioned[0] };
  if (mentioned.length > 1) return { ambiguous: true, groups: mentioned };
  return {};
}

function permissionMessage(role, intent, inEnglish = false) {
  if (inEnglish) {
    return 'Your current role does not have permission to perform this request.';
  }
  const labels = {
    schedule: 'استعراض المحاضرات',
    attendance: 'استعراض الحضور',
    myAttendance: 'استعراض الحضور الشخصي',
    groupAttendance: 'استعراض حضور مجموعة',
    balance: 'استعراض الرصيد',
    dues: 'استعراض مستحقات الطلاب',
    exams: 'استعراض الامتحانات',
    results: 'استعراض النتائج والدرجات',
    groupReport: 'عرض تقرير المجموعة',
    profile: 'استعراض الملف الشخصي',
    studentLookup: 'استعراض بيانات طالب'
  };
  if ((intent === 'balance' || intent === 'myAttendance') && role !== 'student') {
    return 'وضح اسم الطالب أو المجموعة التي تريد الاستعلام عنها.';
  }
  return `دورك الحالي لا يملك صلاحية ${labels[intent] || 'تنفيذ هذا الطلب'} حسب صلاحيات النظام.`;
}

async function scheduleTool(db, user, date, upcoming = false, endDate = null) {
  const dateCondition = endDate ? 'cs.date BETWEEN ? AND ?' : upcoming ? 'cs.date>=?' : 'cs.date=?';
  const dateParams = endDate ? [date, endDate] : [date];
  if (user.role === 'student') {
    const student = await activeStudent(db, user.id);
    if (!student) return { error: 'لم أجد ملف طالب نشطًا مرتبطًا بحسابك.' };
    const rows = (await db.query(`SELECT cs.id,cs.title,cs.date,cs.start_time,cs.end_time,
        g.name group_name,s.name subject_name,u.name doctor_name
      FROM course_sessions cs
      JOIN groups_table g ON g.id=cs.group_id
      LEFT JOIN subjects s ON s.id=cs.subject_id
      LEFT JOIN users u ON u.id=cs.doctor_id
      WHERE ${dateCondition} AND cs.cancelled=0 AND EXISTS(
        SELECT 1 FROM enrollments e WHERE e.student_id=? AND e.group_id=cs.group_id
          AND e.starts_on<=cs.date AND (e.ends_on IS NULL OR e.ends_on>cs.date))
      ORDER BY cs.date,cs.start_time,cs.id`, [...dateParams, student.id])).rows;
    return { rows, date, upcoming };
  }
  if (!STAFF_ROLES.has(user.role)) return null;
  const doctorFilter = user.role === 'doctor' ? ' AND cs.doctor_id=?' : '';
  const params = user.role === 'doctor' ? [...dateParams, user.id] : dateParams;
  const rows = (await db.query(`SELECT cs.id,cs.title,cs.date,cs.start_time,cs.end_time,
      g.name group_name,l.name level_name,s.name subject_name,u.name doctor_name
    FROM course_sessions cs JOIN groups_table g ON g.id=cs.group_id JOIN levels l ON l.id=g.level_id
    LEFT JOIN subjects s ON s.id=cs.subject_id LEFT JOIN users u ON u.id=cs.doctor_id
    WHERE ${dateCondition} AND cs.cancelled=0${doctorFilter}
    ORDER BY cs.date,cs.start_time,l.name,g.name,cs.id LIMIT 100`, params)).rows;
  return { rows, date, upcoming };
}

async function lastLectureTool(db, user) {
  if (user.role === 'student') {
    const student = await activeStudent(db, user.id);
    if (!student) return { error: 'لم أجد ملف طالب نشطًا مرتبطًا بحسابك.' };
    const rows = (await db.query(`SELECT cs.id,cs.title,cs.date,cs.start_time,cs.end_time,
        g.name group_name,s.name subject_name,u.name doctor_name
      FROM course_sessions cs
      JOIN groups_table g ON g.id=cs.group_id
      LEFT JOIN subjects s ON s.id=cs.subject_id
      LEFT JOIN users u ON u.id=cs.doctor_id
      WHERE cs.date<=? AND cs.cancelled=0 AND EXISTS(
        SELECT 1 FROM enrollments e WHERE e.student_id=? AND e.group_id=cs.group_id
          AND e.starts_on<=cs.date AND (e.ends_on IS NULL OR e.ends_on>cs.date))
      ORDER BY cs.date DESC,cs.start_time DESC,cs.id DESC LIMIT 1`, [today(), student.id])).rows;
    return rows[0] || null;
  }
  const doctorFilter = user.role === 'doctor' ? ' AND cs.doctor_id=?' : '';
  const params = user.role === 'doctor' ? [today(), user.id] : [today()];
  const rows = (await db.query(`SELECT cs.id,cs.title,cs.date,cs.start_time,cs.end_time,
      g.name group_name,s.name subject_name,u.name doctor_name
    FROM course_sessions cs
    JOIN groups_table g ON g.id=cs.group_id
    LEFT JOIN subjects s ON s.id=cs.subject_id
    LEFT JOIN users u ON u.id=cs.doctor_id
    WHERE cs.date<=? AND cs.cancelled=0${doctorFilter}
    ORDER BY cs.date DESC,cs.start_time DESC,cs.id DESC LIMIT 1`, params)).rows;
  return rows[0] || null;
}

async function ownAttendanceTool(db, user) {
  const student = await activeStudent(db, user.id);
  if (!student) return { error: 'لم أجد ملف طالب نشطًا مرتبطًا بحسابك.' };
  const rows = (await db.query(`SELECT cs.date,cs.title,g.name group_name,cs.start_time,
      CASE WHEN a.id IS NULL THEN 'غائب' ELSE 'حاضر' END status
    FROM course_sessions cs JOIN groups_table g ON g.id=cs.group_id
    JOIN enrollments e ON e.student_id=? AND e.group_id=cs.group_id
      AND e.starts_on<=cs.date AND (e.ends_on IS NULL OR e.ends_on>cs.date)
    LEFT JOIN attendance a ON a.session_id=cs.id AND a.student_id=?
    WHERE cs.cancelled=0 AND cs.date<=?
    ORDER BY cs.date DESC,cs.id DESC`, [student.id, student.id, today()])).rows;
  const present = rows.filter(row => row.status === 'حاضر').length;
  return { rows, present, absent: rows.length - present, total: rows.length };
}

async function absenceBreakdownTool(db, user) {
  const student = await activeStudent(db, user.id);
  if (!student) return { error: 'لم أجد ملف طالب نشطًا مرتبطًا بحسابك.' };
  const rows = (await db.query(`SELECT COALESCE(s.name, cs.title) subject_name, COUNT(*) count
    FROM course_sessions cs
    JOIN enrollments e ON e.student_id=? AND e.group_id=cs.group_id
      AND e.starts_on<=cs.date AND (e.ends_on IS NULL OR e.ends_on>cs.date)
    LEFT JOIN subjects s ON s.id=cs.subject_id
    LEFT JOIN attendance a ON a.session_id=cs.id AND a.student_id=?
    WHERE cs.cancelled=0 AND cs.date<=? AND a.id IS NULL
    GROUP BY COALESCE(s.name, cs.title)
    ORDER BY count DESC`, [student.id, student.id, today()])).rows;
  return rows;
}

async function ownAttendanceOnDate(db, user, group, date) {
  const student = await activeStudent(db, user.id);
  if (!student || student.group_id !== group.id) return null;
  const rows = (await db.query(`SELECT cs.title,cs.start_time,a.id attendance_id
    FROM course_sessions cs JOIN enrollments e ON e.student_id=? AND e.group_id=cs.group_id
      AND e.starts_on<=cs.date AND (e.ends_on IS NULL OR e.ends_on>cs.date)
    LEFT JOIN attendance a ON a.session_id=cs.id AND a.student_id=e.student_id
    WHERE cs.group_id=? AND cs.date=? AND cs.cancelled=0
    ORDER BY cs.start_time,cs.id`, [student.id, group.id, date])).rows;
  return rows;
}

async function groupAttendanceTool(db, group, date) {
  const sessions = (await db.query(`SELECT id,title,date,start_time FROM course_sessions
    WHERE group_id=? AND date=? AND cancelled=0 ORDER BY start_time,id`, [group.id, date])).rows;
  if (!sessions.length) return { sessions: [], group, date, students: [] };
  if (sessions.length > 1) return { sessions, group, date, ambiguous: true };
  const session = sessions[0];
  const students = (await db.query(`SELECT s.id,s.code,s.name,
      CASE WHEN a.id IS NULL THEN 'غائب' ELSE 'حاضر' END status
    FROM enrollments e JOIN students s ON s.id=e.student_id
    LEFT JOIN attendance a ON a.student_id=s.id AND a.session_id=?
    WHERE e.group_id=? AND e.starts_on<=? AND (e.ends_on IS NULL OR e.ends_on>?)
      AND s.active=1 AND s.cancelled_at IS NULL
    ORDER BY s.name,s.id`, [session.id, group.id, date, date])).rows;
  return { sessions, session, group, date, students };
}

async function ownBalanceTool(db, user) {
  const student = await activeStudent(db, user.id);
  if (!student) return { error: 'لم أجد ملف طالب نشطًا مرتبطًا بحسابك.' };
  const paid = Number((await db.query(`SELECT COALESCE(SUM(amount),0) total
    FROM payments WHERE student_id=? AND voided_at IS NULL`, [student.id])).rows[0].total || 0);
  return { price: Number(student.price || 0), paid, remaining: Math.max(0, Number(student.price || 0) - paid) };
}

async function ownPaymentHistoryTool(db, user) {
  const student = await activeStudent(db, user.id);
  if (!student) return { error: 'لم أجد ملف طالب نشطًا مرتبطًا بحسابك.' };
  return (await db.query(`SELECT amount,created_at FROM payments
    WHERE student_id=? AND voided_at IS NULL
    ORDER BY created_at DESC,id DESC LIMIT 10`, [student.id])).rows;
}

async function ownAttendanceBySubjectTool(db, user) {
  const student = await activeStudent(db, user.id);
  if (!student) return { error: 'لم أجد ملف طالب نشطًا مرتبطًا بحسابك.' };
  return (await db.query(`SELECT COALESCE(s.name,cs.title) subject_name,
      COUNT(DISTINCT cs.id) total,COUNT(DISTINCT a.session_id) present
    FROM course_sessions cs
    JOIN enrollments e ON e.student_id=? AND e.group_id=cs.group_id
      AND e.starts_on<=cs.date AND (e.ends_on IS NULL OR e.ends_on>cs.date)
    LEFT JOIN subjects s ON s.id=cs.subject_id
    LEFT JOIN attendance a ON a.session_id=cs.id AND a.student_id=?
    WHERE cs.cancelled=0 AND cs.date<=?
    GROUP BY COALESCE(s.name,cs.title)
    ORDER BY subject_name`, [student.id, student.id, today()])).rows;
}

async function duesTool(db, group, financialFilter = null) {
  const groupFilter = group ? ' AND s.group_id=?' : '';
  const params = group ? [group.id] : [];
  let comparison = '';
  if (financialFilter && Number.isFinite(financialFilter.amount)) {
    const operator = { gt: '>', lt: '<', eq: '=' }[financialFilter.amountOperator];
    if (operator) {
      comparison = ` AND GREATEST(0,s.course_price_snapshot-COALESCE(p.paid,0)) ${operator} ?`;
      params.push(Math.round(financialFilter.amount * 100));
    }
  }
  const rows = (await db.query(`SELECT s.name,s.code,g.name group_name,l.name level_name,
      s.course_price_snapshot price,COALESCE(p.paid,0) paid,
      GREATEST(0,s.course_price_snapshot-COALESCE(p.paid,0)) remaining
    FROM students s JOIN groups_table g ON g.id=s.group_id JOIN levels l ON l.id=s.level_id
    LEFT JOIN (SELECT student_id,SUM(amount) paid FROM payments WHERE voided_at IS NULL GROUP BY student_id) p
      ON p.student_id=s.id
    WHERE s.active=1 AND s.cancelled_at IS NULL
      AND GREATEST(0,s.course_price_snapshot-COALESCE(p.paid,0))>0${groupFilter}${comparison}
    ORDER BY remaining DESC,s.name,s.id LIMIT 50`, params)).rows;
  return rows;
}

async function duesTotalTool(db, group) {
  const result = await db.query(`SELECT COALESCE(SUM(
      GREATEST(0,s.course_price_snapshot-COALESCE(p.paid,0))
    ),0) total
    FROM students s
    LEFT JOIN (
      SELECT student_id,SUM(amount) paid
      FROM payments WHERE voided_at IS NULL GROUP BY student_id
    ) p ON p.student_id=s.id
    WHERE s.active=1 AND s.cancelled_at IS NULL AND s.group_id=?`, [group.id]);
  return Number(result.rows?.[0]?.total || 0);
}

async function examsTool(db, user, date) {
  if (user.role === 'student') {
    const student = await activeStudent(db, user.id);
    if (!student) return { error: 'لم أجد ملف طالب نشطًا مرتبطًا بحسابك.' };
    const rows = (await db.query(`SELECT e.id,e.title,e.status,e.duration_minutes,e.question_count,cl.lecture_date,s.name subject_name,
        cl.title lecture_title,u.name doctor_name
      FROM exams e JOIN course_lectures cl ON cl.id=e.lecture_id
      JOIN subjects s ON s.id=e.subject_id JOIN users u ON u.id=e.doctor_id
      WHERE e.level_id=? AND e.status='published' AND cl.status<>'cancelled'
        AND cl.lecture_date>=? AND EXISTS(SELECT 1 FROM enrollments en
          WHERE en.student_id=? AND en.group_id=cl.group_id
            AND en.starts_on<=cl.lecture_date AND (en.ends_on IS NULL OR en.ends_on>cl.lecture_date))
      ORDER BY cl.lecture_date,e.id LIMIT 50`, [student.level_id, date, student.id])).rows;
    return rows;
  }
  const doctorFilter = user.role === 'doctor' ? ' AND e.doctor_id=?' : '';
  const params = user.role === 'doctor' ? [date, user.id] : [date];
  const rows = (await db.query(`SELECT e.id,e.title,e.status,e.duration_minutes,e.question_count,cl.lecture_date,s.name subject_name,
      cl.title lecture_title,u.name doctor_name
    FROM exams e JOIN course_lectures cl ON cl.id=e.lecture_id
    JOIN subjects s ON s.id=e.subject_id JOIN users u ON u.id=e.doctor_id
    WHERE e.status='published' AND cl.status<>'cancelled' AND cl.lecture_date>=?${doctorFilter}
    ORDER BY cl.lecture_date,e.id LIMIT 50`, params)).rows;
  return rows;
}

async function ownExamStatusTool(db, user) {
  const student = await activeStudent(db, user.id);
  if (!student) return { error: 'لم أجد ملف طالب نشطًا مرتبطًا بحسابك.' };
  return (await db.query(`SELECT e.id,e.title,e.status,cl.lecture_date,s.name subject_name,
      a.status attempt_status,a.score,a.percentage
    FROM exams e JOIN course_lectures cl ON cl.id=e.lecture_id
    JOIN subjects s ON s.id=e.subject_id
    LEFT JOIN exam_attempts a ON a.exam_id=e.id AND a.student_id=?
    WHERE e.level_id=? AND e.status IN ('published','closed') AND cl.status<>'cancelled'
      AND EXISTS(SELECT 1 FROM enrollments en WHERE en.student_id=? AND en.group_id=cl.group_id
        AND en.starts_on<=cl.lecture_date AND (en.ends_on IS NULL OR en.ends_on>cl.lecture_date))
    ORDER BY cl.lecture_date DESC,e.id DESC LIMIT 50`,
  [student.id, student.level_id, student.id])).rows;
}

async function resultsTool(db, user) {
  if (user.role === 'student') {
    const student = await activeStudent(db, user.id);
    if (!student) return { error: 'لم أجد ملف طالب نشطًا مرتبطًا بحسابك.' };
    return (await db.query(`SELECT e.title exam_title,s.name subject_name,cl.lecture_date,a.score,a.total_questions,
        a.percentage,a.submitted_at,a.wrong_answers,a.status
      FROM exam_attempts a JOIN exams e ON e.id=a.exam_id JOIN subjects s ON s.id=e.subject_id
      JOIN course_lectures cl ON cl.id=e.lecture_id
      WHERE a.student_id=? AND a.status IN ('submitted','timed_out')
      ORDER BY a.submitted_at DESC,a.id DESC`, [student.id])).rows;
  }
  if (!STAFF_ROLES.has(user.role)) return null;
  const doctorFilter = user.role === 'doctor' ? ' WHERE e.doctor_id=?' : '';
  const params = user.role === 'doctor' ? [user.id] : [];
  return (await db.query(`SELECT e.title exam_title,s.name subject_name,cl.title lecture_title,
      st.name student_name,st.code,a.score,a.total_questions,a.percentage,a.submitted_at
    FROM exams e JOIN subjects s ON s.id=e.subject_id
    JOIN course_lectures cl ON cl.id=e.lecture_id
    JOIN exam_attempts a ON a.exam_id=e.id AND a.status IN ('submitted','timed_out')
    JOIN students st ON st.id=a.student_id
    ${doctorFilter} ORDER BY a.submitted_at DESC,a.id DESC LIMIT 100`, params)).rows;
}

async function profileTool(db, user) {
  if (user.role !== 'student') return null;
  const student = await activeStudent(db, user.id);
  if (!student) return { error: 'لم أجد ملف طالب نشطًا مرتبطًا بحسابك.' };
  return student;
}

async function doctorLookupTool(db, user, subjectKeyword = null) {
  if (user.role === 'student') {
    const student = await activeStudent(db, user.id);
    if (!student) return { error: 'لم أجد ملف طالب نشطًا مرتبطًا بحسابك.' };
    const rows = (await db.query(`SELECT s.name subject_name, u.name doctor_name
      FROM subjects s JOIN users u ON u.id=s.doctor_id
      WHERE s.level_id=? ORDER BY s.name`, [student.level_id])).rows;
    if (!subjectKeyword) return rows;
    const keyword = normalizeArabic(subjectKeyword).replace(/^ال/, '');
    return rows.filter(row => normalizeArabic(row.subject_name).replace(/^ال/, '').includes(keyword));
  }
  const rows = (await db.query(`SELECT s.name subject_name, u.name doctor_name, l.name level_name
    FROM subjects s JOIN users u ON u.id=s.doctor_id JOIN levels l ON l.id=s.level_id
    ORDER BY l.id,s.name`, [])).rows;
  if (!subjectKeyword) return rows;
  const keyword = normalizeArabic(subjectKeyword).replace(/^ال/, '');
  return rows.filter(row => normalizeArabic(row.subject_name).replace(/^ال/, '').includes(keyword));
}

async function doctorScheduleTool(db, doctorName, date) {
  const doc = (await db.query(`SELECT id,name FROM users
    WHERE (role='doctor' OR role='admin') AND name ILIKE ? LIMIT 1`, [`%${doctorName}%`])).rows[0];
  if (!doc) return { error: `لم أجد دكتورًا باسم «${doctorName}».` };
  const rows = (await db.query(`SELECT cs.id,cs.title,cs.date,cs.start_time,cs.end_time,
      g.name group_name,s.name subject_name,u.name doctor_name
    FROM course_sessions cs
    JOIN groups_table g ON g.id=cs.group_id
    LEFT JOIN subjects s ON s.id=cs.subject_id
    JOIN users u ON u.id=cs.doctor_id
    WHERE cs.doctor_id=? AND cs.date=? AND cs.cancelled=0
    ORDER BY cs.start_time,cs.id`, [doc.id, date])).rows;
  return { doctor: doc, rows, date };
}

async function subjectsTool(db, user) {
  if (user.role === 'student') {
    const student = await activeStudent(db, user.id);
    if (!student) return { error: 'لم أجد ملف طالب نشطًا مرتبطًا بحسابك.' };
    return (await db.query(`SELECT s.name subject_name, u.name doctor_name
      FROM subjects s JOIN users u ON u.id=s.doctor_id
      WHERE s.level_id=? ORDER BY s.name`, [student.level_id])).rows;
  }
  return (await db.query(`SELECT s.name subject_name, u.name doctor_name, l.name level_name
    FROM subjects s JOIN users u ON u.id=s.doctor_id JOIN levels l ON l.id=s.level_id
    ORDER BY l.id,s.name`, [])).rows;
}

async function notificationsTool(db, user, options = {}) {
  if (user.role !== 'student') return null;
  const student = await activeStudent(db, user.id);
  if (!student) return { error: 'لم أجد ملف طالب نشطًا مرتبطًا بحسابك.' };
  const filters = [];
  const params = [student.id];
  if (options.unreadOnly) filters.push(' AND is_read=0');
  if (options.importantOnly) {
    filters.push(" AND type IN ('PAYMENT_REMINDER','ATTENDANCE_WARNING','SYSTEM')");
  }
  return (await db.query(`SELECT id,title,message,type,is_read,created_at
    FROM notifications WHERE student_id=?${filters.join('')} ORDER BY id DESC LIMIT 5`, params)).rows;
}

async function googleAccountStatusTool(db, user) {
  return (await db.query(
    'SELECT google_email FROM google_accounts WHERE user_id=?',
    [user.id]
  )).rows[0] || null;
}

async function doctorAbsenteesTodayTool(db, user, date) {
  return (await db.query(`SELECT s.name, s.code, cs.title session_title, g.name group_name
    FROM course_sessions cs
    JOIN groups_table g ON g.id=cs.group_id
    JOIN enrollments e ON e.group_id=cs.group_id AND e.starts_on<=cs.date AND (e.ends_on IS NULL OR e.ends_on>cs.date)
    JOIN students s ON s.id=e.student_id
    WHERE cs.doctor_id=? AND cs.date=? AND cs.cancelled=0 AND s.active=1 AND s.cancelled_at IS NULL
      AND NOT EXISTS(SELECT 1 FROM attendance a WHERE a.session_id=cs.id AND a.student_id=s.id)
    ORDER BY s.name, s.id`, [user.id, date])).rows;
}

async function doctorStudentsCountTool(db, user) {
  const result = await db.query(`SELECT COUNT(DISTINCT e.student_id) total
    FROM course_sessions cs
    JOIN enrollments e ON e.group_id=cs.group_id
    JOIN students s ON s.id=e.student_id
    WHERE cs.doctor_id=? AND cs.cancelled=0 AND s.active=1 AND s.cancelled_at IS NULL`, [user.id]);
  return Number(result.rows?.[0]?.total || 0);
}

async function findStudentsByName(db, name) {
  if (!name || (name.length < 2 && !/^\d+$/.test(name))) return [];
  const escaped = name.replace(/[!%_]/g, character => `!${character}`);
  return (await db.query(`SELECT s.id,s.name,s.code,
      s.course_price_snapshot price,l.name level_name,g.name group_name,
      COALESCE(p.paid,0) paid,
      GREATEST(0,s.course_price_snapshot-COALESCE(p.paid,0)) remaining,
      CASE WHEN s.cancelled_at IS NOT NULL THEN 'ملغي'
        WHEN COALESCE(p.paid,0)=0 THEN 'لم يدفع'
        WHEN COALESCE(p.paid,0)<s.course_price_snapshot THEN 'دفع جزئي'
        ELSE 'مدفوع بالكامل' END payment_status
    FROM students s JOIN levels l ON l.id=s.level_id JOIN groups_table g ON g.id=s.group_id
    LEFT JOIN (SELECT student_id,SUM(amount) paid FROM payments WHERE voided_at IS NULL GROUP BY student_id) p
      ON p.student_id=s.id
    WHERE s.active=1 AND s.cancelled_at IS NULL
      AND (s.name ILIKE ? ESCAPE '!' OR s.code ILIKE ? ESCAPE '!')
    ORDER BY s.name,s.id LIMIT 6`, [`%${escaped}%`, `%${escaped}%`])).rows;
}

async function studentResultsTool(db, user, studentId) {
  const doctorFilter = user.role === 'doctor' ? ' AND e.doctor_id=?' : '';
  const params = user.role === 'doctor' ? [studentId, user.id] : [studentId];
  return (await db.query(`SELECT e.title exam_title,s.name subject_name,cl.lecture_date,a.score,a.total_questions,
      a.percentage,a.submitted_at,a.wrong_answers,a.status
    FROM exam_attempts a JOIN exams e ON e.id=a.exam_id JOIN subjects s ON s.id=e.subject_id
    JOIN course_lectures cl ON cl.id=e.lecture_id
    WHERE a.student_id=? AND a.status IN ('submitted','timed_out')${doctorFilter}
    ORDER BY a.submitted_at DESC,a.id DESC LIMIT 50`, params)).rows;
}

async function studentAttendanceTool(db, user, studentId) {
  const doctorFilter = user.role === 'doctor' ? ' AND cs.doctor_id=?' : '';
  const params = user.role === 'doctor'
    ? [studentId, studentId, today(), user.id]
    : [studentId, studentId, today()];
  const row = (await db.query(`SELECT COUNT(DISTINCT cs.id) total,
    COUNT(DISTINCT a.session_id) attended
    FROM course_sessions cs
    JOIN enrollments e ON e.group_id=cs.group_id AND e.student_id=?
    AND e.starts_on<=cs.date AND (e.ends_on IS NULL OR e.ends_on>cs.date)
    LEFT JOIN attendance a ON a.session_id=cs.id AND a.student_id=?
    WHERE cs.cancelled=0 AND cs.date<=?${doctorFilter}`, params)).rows[0] || {};
  return { total: Number(row.total || 0), attended: Number(row.attended || 0) };
}

async function statsTool(db, intent) {
  const queries = {
    studentCount: 'SELECT COUNT(*) total FROM students WHERE active=1 AND cancelled_at IS NULL',
    paymentsTotal: 'SELECT COALESCE(SUM(amount),0) total FROM payments WHERE voided_at IS NULL',
    sessionCount: 'SELECT COUNT(*) total FROM course_sessions WHERE cancelled=0 AND date>=?',
    examCount: "SELECT COUNT(*) total FROM exams WHERE status<>'draft'"
  };
  const params = intent === 'sessionCount' ? [today()] : [];
  const result = await db.query(queries[intent], params);
  return Number(result.rows?.[0]?.total || 0);
}

function renderScheduleCount(result, date, inEnglish = false, endDate = null) {
  if (!result || result.error) return renderSchedule(result, date, false, inEnglish);
  const count = result.rows.length;
  const dateLabel = endDate ? `${date} إلى ${endDate}` : date;
  const summary = inEnglish
    ? `You have ${count} lecture${count === 1 ? '' : 's'} from ${dateLabel}.`
    : `عندك ${count} محاضرة خلال الفترة من ${dateLabel}.`;
  if (!count) return summary;
  const schedule = renderSchedule(result, date, false, inEnglish, endDate);
  return `${summary}\n${schedule.split('\n').slice(1).join('\n')}`;
}

function renderSchedule(result, date, upcoming, inEnglish = false, endDate = null) {
  if (!result) return inEnglish ? 'No schedule data.' : 'لا توجد بيانات للجدول.';
  if (result.error) return result.error;
  const dateLabel = endDate ? `${date} to ${endDate}` : date;
  const dateLabelAr = endDate ? `${date} إلى ${endDate}` : date;
  if (!result.rows.length) {
    if (inEnglish) {
      return upcoming
        ? `No upcoming lectures starting from ${date}.`
        : `No lectures scheduled${endDate ? ` from ${dateLabel}` : ` on ${date}`}.`;
    }
    return upcoming
      ? `لا توجد محاضرات قادمة مسجلة ابتداءً من ${date}.`
      : `لا توجد محاضرات مسجلة${endDate ? ` خلال الفترة من ${dateLabelAr}` : ` بتاريخ ${date}`}.`;
  }
  const isToday = date === today();
  const items = result.rows.map(row =>
    `• ${row.title}${row.subject_name ? ` — ${row.subject_name}` : ''}، ${formatTime(row.start_time, inEnglish)}${row.group_name ? `، ${row.group_name}` : ''}${row.doctor_name ? `، د. ${displayDoctorName(row.doctor_name)}` : ''}`
  );
  if (inEnglish) {
    return `${upcoming ? `Upcoming lectures starting from ${date}` : endDate ? `Lectures from ${dateLabel}` : `Lectures on ${date}`}:\n${items.join('\n')}`;
  }
  const header = isToday && !upcoming && !endDate ? 'عندك المحاضرات التالية النهارده' : (upcoming ? `المحاضرات القادمة ابتداءً من ${date}` : endDate ? `المحاضرات خلال الفترة من ${dateLabelAr}` : `المحاضرات بتاريخ ${date}`);
  return `${header}:\n${items.join('\n')}`;
}

function renderAttendance(result, inEnglish = false) {
  if (!result) return inEnglish ? 'No attendance record.' : 'لا يوجد سجل حضور.';
  if (result.error) return result.error;
  if (!result.total) {
    return inEnglish
      ? 'No lectures recorded in your attendance history yet.'
      : 'لا توجد محاضرات مسجلة ضمن سجل حضورك حتى الآن.';
  }
  const attendancePercent = Math.round(result.present / result.total * 100);
  if (inEnglish) {
    return `Your attendance record: Attended ${result.present} out of ${result.total} lectures (${attendancePercent}% attendance), and absent ${result.absent}.`;
  }
  return `سجل حضورك: حضرت ${result.present} من ${result.total} محاضرة (نسبة الحضور ${attendancePercent}%)، وغبت ${result.absent}.`;
}

function renderGroupAttendance(result, inEnglish = false) {
  if (!result.sessions.length) {
    return inEnglish
      ? `No lecture recorded for group ${result.group.name} on ${result.date}.`
      : `لم أجد محاضرة مسجلة للمجموعة ${result.group.name} بتاريخ ${result.date}.`;
  }
  if (result.ambiguous) {
    return inEnglish
      ? `Found more than one lecture for group ${result.group.name} on this date. Please specify.`
      : `وجدت أكثر من محاضرة للمجموعة ${result.group.name} في هذا التاريخ. حدّد عنوان المحاضرة أو وقتها.`;
  }
  if (!result.students.length) {
    return inEnglish
      ? `No active students found in ${result.group.name} on ${result.date}.`
      : `لم أجد طلابًا نشطين مسجلين في ${result.group.name} بتاريخ ${result.date}.`;
  }
  const present = result.students.filter(student => student.status === 'حاضر');
  const absent = result.students.filter(student => student.status === 'غائب');
  const list = values => values.length
    ? values.map(student => `${student.name} (${student.code})`).join('، ')
    : (inEnglish ? 'None' : 'لا يوجد');
  return `حضور ${result.group.name} — ${result.session.title} بتاريخ ${result.date}:\nحضر ${present.length}: ${list(present)}\nغاب ${absent.length}: ${list(absent)}`;
}

function renderDues(rows, group, inEnglish = false) {
  if (!rows.length) {
    return inEnglish
      ? `No remaining dues${group ? ` in ${group.name}` : ''}.`
      : `لا توجد مستحقات متبقية${group ? ` في ${group.name}` : ''} وفق البيانات الحالية.`;
  }
  const total = rows.reduce((sum, row) => sum + Number(row.remaining || 0), 0);
  const details = rows.slice(0, 20).map(row => `• ${row.name} (${row.code}) — ${money(row.remaining, inEnglish)} جنيه${group ? '' : `، ${row.group_name}`}`);
  return `عدد الطلاب ذوي المبالغ المتبقية: ${rows.length}${rows.length === 50 ? ' على الأقل (عرض أول 50)' : ''}. مجموع المتبقي في القائمة المعروضة: ${money(total, inEnglish)} جنيه.\n${details.join('\n')}`;
}

function renderExams(rows, inEnglish = false) {
  if (rows.error) return rows.error;
  if (!rows.length) {
    return inEnglish
      ? 'No published upcoming exams recorded for your account.'
      : 'لا توجد امتحانات منشورة قادمة مسجلة لحسابك.';
  }
  if (inEnglish) {
    return `Upcoming exams:\n${rows.map(row => `• ${row.title} — ${row.subject_name}, ${row.lecture_date}${row.doctor_name ? `, Dr. ${displayDoctorName(row.doctor_name)}` : ''}`).join('\n')}`;
  }
  return `الامتحانات القادمة:\n${rows.map(row =>
    `• ${row.title} — ${row.subject_name}، ${row.lecture_date}${row.doctor_name ? `، د. ${displayDoctorName(row.doctor_name)}` : ''}`
  ).join('\n')}`;
}

function renderResults(rows, isStudent, inEnglish = false) {
  if (rows.error) return rows.error;
  if (!rows.length) {
    return inEnglish
      ? 'No completed exam results available in the record.'
      : 'لا توجد نتائج امتحانات مكتملة متاحة في السجل.';
  }
  if (inEnglish) {
    return `Exam results:\n${rows.slice(0, 10).map(row =>
      `• ${isStudent ? row.subject_name + ' — ' : `${row.student_name} (${row.code}) — `}${row.exam_title}: ${row.score} / ${row.total_questions} (${Math.round(Number(row.percentage))}%)`
    ).join('\n')}`;
  }
  return `نتائج الامتحانات:\n${rows.slice(0, 10).map(row =>
    `• ${isStudent ? row.subject_name + ' — ' : `${row.student_name} (${row.code}) — `}${row.exam_title}: ${row.score} من ${row.total_questions} (${Math.round(Number(row.percentage))}%)`
  ).join('\n')}`;
}

function renderReport(report, group, inEnglish = false) {
  const summary = report.summary;
  if (inEnglish) {
    return `Report for ${group.name} on ${report.date}:\nSessions: ${summary.session_count}, Scheduled: ${summary.scheduled}, Present: ${summary.present}, Absent: ${summary.absent}, Payments: ${summary.payment_count} totaling ${money(summary.payment_total * 100, true)} EGP.`;
  }
  return `تقرير ${group.name} بتاريخ ${report.date}:\nالمحاضرات: ${summary.session_count}، المتوقع حضورهم: ${summary.scheduled}، الحاضرون: ${summary.present}، الغائبون: ${summary.absent}، الدفعات المسجلة: ${summary.payment_count} بإجمالي ${money(summary.payment_total * 100)} جنيه.`;
}

async function queueAttendanceConfirmation(db, user, group, date) {
  if (user.role !== 'assistant') return 'تسجيل الحضور متاح للأسستنت فقط وفق صلاحيات النظام الحالية.';
  if (date !== today()) return 'الأسستنت يستطيع تسجيل حضور اليوم فقط. لا أستطيع تسجيل أو تعديل حضور تاريخ آخر.';
  const settings = (await db.query('SELECT course_starts_at FROM course_settings WHERE id=1', [])).rows[0];
  if (!settings?.course_starts_at || Date.parse(settings.course_starts_at) > Date.now()) {
    return 'لم يبدأ الكورس بعد؛ تسجيل الحضور غير متاح حاليًا.';
  }
  const sessions = (await db.query(`SELECT id,title,start_time FROM course_sessions
    WHERE group_id=? AND date=? AND cancelled=0 ORDER BY start_time,id`, [group.id, date])).rows;
  if (!sessions.length) return `لا توجد محاضرة مسجلة اليوم للمجموعة ${group.name}. حدّد المحاضرة بعد تسجيلها في الجدول.`;
  if (sessions.length > 1) return `للمجموعة ${group.name} أكثر من محاضرة اليوم. اذكر عنوان المحاضرة أو وقتها.`;
  const session = sessions[0];
  const roster = (await db.query(`SELECT s.id FROM enrollments e JOIN students s ON s.id=e.student_id
    WHERE e.group_id=? AND e.starts_on<=? AND (e.ends_on IS NULL OR e.ends_on>?)
      AND s.active=1 AND s.cancelled_at IS NULL
      AND NOT EXISTS(SELECT 1 FROM attendance a WHERE a.student_id=s.id AND a.session_id=?)`,
  [group.id, date, date, session.id])).rows;
  if (!roster.length) return `لا يوجد طلاب غير مسجل حضورهم في ${group.name} لهذه المحاضرة.`;
  await db.query(`INSERT INTO ai_pending_actions(user_id,action,payload,expires_at)
    VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET
      action=EXCLUDED.action,payload=EXCLUDED.payload,expires_at=EXCLUDED.expires_at`,
  [user.id, 'record_group_attendance', JSON.stringify({
    group_id: group.id,
    group_name: group.name,
    session_id: session.id,
    session_title: session.title,
    date,
    student_ids: roster.map(student => student.id)
  }), Date.now() + ACTION_EXPIRY_MS]);
  return `سأعتبر الطلاب النشطين المسجلين وغير الموجود لهم سجل حضور في ${group.name} حاضرين في «${session.title}» اليوم (${roster.length} طالبًا). هذا إجراء جماعي يؤثر في سجلات الطلاب. أرسل «أكد» للتنفيذ أو «إلغاء» للتراجع.`;
}

async function confirmPendingAttendance(db, user) {
  const pending = (await db.query(`SELECT action,payload,expires_at FROM ai_pending_actions
    WHERE user_id=?`, [user.id])).rows[0];
  if (!pending || Number(pending.expires_at) <= Date.now()) {
    if (pending) await db.query('DELETE FROM ai_pending_actions WHERE user_id=?', [user.id]);
    return 'لا يوجد إجراء معلّق للتأكيد. اذكر المطلوب من جديد.';
  }
  if (pending.action !== 'record_group_attendance' || user.role !== 'assistant') {
    await db.query('DELETE FROM ai_pending_actions WHERE user_id=?', [user.id]);
    return 'تعذر تنفيذ هذا الإجراء وفق صلاحيات حسابك.';
  }
  const payload = JSON.parse(pending.payload);
  const settings = (await db.query('SELECT course_starts_at FROM course_settings WHERE id=1', [])).rows[0];
  if (payload.date !== today() || !settings?.course_starts_at || Date.parse(settings.course_starts_at) > Date.now()) {
    await db.query('DELETE FROM ai_pending_actions WHERE user_id=?', [user.id]);
    return 'انتهت صلاحية تأكيد الحضور أو لم يبدأ الكورس؛ لم يتم تعديل أي سجل.';
  }
  const result = await transaction(db, async () => {
    const session = (await db.query(`SELECT * FROM course_sessions
      WHERE id=? AND group_id=? AND date=? AND cancelled=0 FOR UPDATE`,
    [payload.session_id, payload.group_id, payload.date])).rows[0];
    if (!session || session.title !== payload.session_title) {
      throw Object.assign(new Error('تغيرت بيانات المحاضرة؛ لم يتم تسجيل الحضور.'), { status: 409 });
    }
    const students = (await db.query(`SELECT s.id,s.name,s.active,s.cancelled_at FROM enrollments e
      JOIN students s ON s.id=e.student_id
      WHERE e.group_id=? AND e.starts_on<=? AND (e.ends_on IS NULL OR e.ends_on>?)
        AND s.active=1 AND s.cancelled_at IS NULL
        AND NOT EXISTS(SELECT 1 FROM attendance a WHERE a.student_id=s.id AND a.session_id=?)
      ORDER BY s.id FOR UPDATE OF s`,
    [payload.group_id, payload.date, payload.date, payload.session_id])).rows;
    const selectedIds = new Set(payload.student_ids.map(Number));
    const selectedStudents = students.filter(student => selectedIds.has(Number(student.id)));
    for (const student of selectedStudents) {
      await db.query('INSERT INTO attendance(student_id,session_id,recorded_by) VALUES(?,?,?)',
        [student.id, payload.session_id, user.id]);
      await audit(db, user, 'تسجيل حضور', 'student', student.id, {
        name: student.name, session_id: payload.session_id, date: payload.date, source: 'ai_chat'
      });
    }
    await db.query('DELETE FROM ai_pending_actions WHERE user_id=?', [user.id]);
    return selectedStudents.length;
  });
  return result
    ? `تم تسجيل حضور ${result} طالبًا في ${payload.group_name} — ${payload.session_title} بتاريخ ${payload.date}.`
    : `لم يتم تسجيل حضور جديد في ${payload.group_name}؛ قد تكون السجلات قد أضيفت بالفعل.`;
}

export async function buildResponse(message, user, db, history) {
  const inEnglish = isEnglish(message);
  const parsed = detectIntent(message);
  const context = analyzeConversationContext(history);
  const previousTurns = history.slice(-8).reverse();
  const previousRequest = previousTurns.map(turn => detectIntent(turn.message))
    .find(turn => turn.intent !== 'unknown' && turn.intent !== 'confirm' && turn.intent !== 'cancel');
  const previousIntent = previousRequest?.intent;
  const continuingStudentConversation = Boolean(context.lastStudentName);
  const followUpMode = studentFollowUpMode(message);
  const continuationDate = extractDate(parsed.normalized);
  const continuationRange = extractDateRange(parsed.normalized);

  if (user.role === 'student' && parsed.studentIntent === 'STUDENT_FINANCIAL_FILTER') {
    return 'أقدر أساعدك في بيانات حسابك أنت، لكن بيانات الطلاب الآخرين المالية غير متاحة لك.';
  }
  if (user.role === 'student' && parsed.studentIntent === 'OTHER_STUDENT_PRIVATE_DATA') {
    return 'أقدر أساعدك في بيانات حسابك أنت، لكن بيانات الطلاب الآخرين غير متاحة لك.';
  }
  if (parsed.studentIntent === 'STUDENT_FINANCIAL_FILTER' &&
      Number.isFinite(parsed.parameters.amount) &&
      !['assistant', 'admin'].includes(user.role)) {
    return permissionMessage(user.role, 'dues', inEnglish);
  }
  if (parsed.studentIntent === 'ACCOUNT_SECURITY') {
    const securityAction = parsed.parameters.securityAction;
    if (securityAction === 'google_link' && /(مربوط|متصل|الايميل المرتبط|البريد المرتبط|connected|linked)/.test(parsed.normalized)) {
      const account = await googleAccountStatusTool(db, user);
      if (inEnglish) {
        return account
          ? `Google is linked to your account with ${account.google_email}.`
          : 'Google is not linked to your account. Sign in normally, then use “Google Account” in the menu to connect it.';
      }
      return account
        ? `حساب Google مرتبط بحسابك بالبريد ${account.google_email}.`
        : 'حساب Google غير مرتبط بحسابك حاليًا. يمكنك ربطه من خيار «حساب Google» في القائمة، بعد تسجيل الدخول بالطريقة المعتادة.';
    }
    if (securityAction === 'google_link') {
      return inEnglish
        ? 'Sign in to your existing account, then use “Google Account” in the menu to link Google. Linking will not create a new account.'
        : 'اربط Google من خيار «حساب Google» في القائمة بعد تسجيل الدخول إلى حسابك الحالي. لن ينشئ الربط حسابًا جديدًا.';
    }
    if (securityAction === 'disconnect_google') {
      return inEnglish
        ? 'Manage Google from “Google Account” in the menu. I cannot change the link in chat, and the system prevents disconnecting it if no safe sign-in method remains.'
        : 'لإدارة ربط Google استخدم خيار «حساب Google» في القائمة. لا أغيّر الربط من المحادثة، وسيمنع النظام فصله إذا لم يتبقَّ للحساب وسيلة دخول آمنة.';
    }
    if (securityAction === 'email_change') {
      return inEnglish
        ? 'I cannot change the account email in chat. Contact the course administration for an identity-verified change.'
        : 'لا أستطيع تغيير البريد الإلكتروني من المحادثة. تواصل مع إدارة الدورة لإجراء التغيير بعد التحقق من هويتك.';
    }
    if (securityAction === 'password_recovery') {
      return inEnglish
        ? 'Contact the course assistant to verify your identity and reset your password safely.'
        : 'لاستعادة كلمة المرور تواصل مع مساعد الدورة ليتحقق من هويتك ويعيد ضبطها بأمان.';
    }
    return inEnglish
      ? 'After signing in, use “Change password” in the side menu.'
      : 'يمكنك تغيير كلمة المرور من خيار «تغيير كلمة المرور» في القائمة الجانبية بعد تسجيل الدخول.';
  }

  if (parsed.intent === 'confirm') return confirmPendingAttendance(db, user);
  if (parsed.intent === 'cancel') {
    const deleted = await db.query('DELETE FROM ai_pending_actions WHERE user_id=?', [user.id]);
    return deleted.changes ? 'تم إلغاء الإجراء المعلّق، ولم يتم تعديل أي بيانات.' : 'لا يوجد إجراء معلّق لإلغائه.';
  }
  await db.query('DELETE FROM ai_pending_actions WHERE user_id=?', [user.id]);

  // Check multi-intent
  const multiIntents = detectMultiIntents(message);
  if (multiIntents && multiIntents.length >= 2 &&
      !multiIntents.some(item => item.intent === 'courseInfo')) {
    if (multiIntents.some(item =>
      item.intent === 'groupAttendance' && item.imperative &&
      /(سجل|اثبت|اضف|ضيف|علم)/.test(item.normalized)
    )) {
      return inEnglish
        ? 'Please send attendance changes as a separate request so I can confirm them safely.'
        : 'افصل تسجيل الحضور عن باقي الطلبات، عشان أعرض لك ملخصًا وأطلب تأكيدًا قبل تعديل السجلات.';
    }
    const hasSchedule = multiIntents.some(item => ['schedule', 'scheduleCount'].includes(item.intent));
    const requestsUnscopedDoctors = item =>
      item.intent === 'doctorLookup' && !/(ماده|مقرر|subject)/.test(item.normalized);
    const parts = [];
    for (const sub of multiIntents) {
      if (hasSchedule && requestsUnscopedDoctors(sub)) continue;
      const response = await buildResponse(sub.source, user, db, history);
      if (response) parts.push(response);
    }
    if (parts.length >= 2) return parts.join('\n\n');
  }

  // Follow-up context handling
  if (parsed.intent === 'unknown' && (continuationDate || continuationRange) &&
      ['schedule', 'scheduleCount', 'exams', 'groupReport', 'groupAttendance'].includes(previousIntent)) {
    parsed.intent = ['schedule', 'scheduleCount'].includes(previousIntent) ? 'schedule' : previousIntent;
  }
  if (parsed.intent === 'unknown' && context.lastTopic === 'exams' &&
      /(جبت|درجه|درجته|نتيجته|score|grade)/.test(parsed.normalized)) {
    parsed.intent = 'results';
    parsed.studentIntent = 'MY_SCORE';
  }
  if (parsed.intent === 'unknown' && previousIntent === 'groupAttendance' &&
      /(مين|من|اللي|غايب|غايبين|حضر|حاضرين|غياب)/.test(parsed.normalized)) {
    parsed.intent = 'groupAttendance';
  }
  if (parsed.intent === 'unknown' && previousIntent === 'groupReport' &&
      /(مجموعه|جروب|دفعة|دفعه|الدفعة|الدفعب|فرقه|الفرقه|اول|اوله|تاني|ثاني|ثالث|رابع|[0-9])/.test(parsed.normalized)) {
    parsed.intent = 'groupReport';
  }
  if (STAFF_ROLES.has(user.role) && continuingStudentConversation && followUpMode &&
      !(parsed.intent === 'studentLookup' && parsed.studentName)) {
    parsed.intent = 'studentLookup';
    parsed.studentName = context.lastStudentName;
    parsed.studentLookupMode = followUpMode;
  }
  if (parsed.intent === 'unknown' && /(طب|طيب|وبكره|وبعده|كمان|هناك)/.test(parsed.normalized) &&
      previousIntent && ['schedule', 'exams', 'groupReport', 'groupAttendance'].includes(previousIntent)) {
    parsed.intent = previousIntent;
  }

  // Follow-up: "في مادة إيه؟"
  if (/(في مادة ايه|في ماده ايه|في اي مادة|في انهي مادة)/.test(parsed.normalized) || (parsed.normalized === 'في مادة ايه' || parsed.normalized === 'في ماده ايه')) {
    if (context.lastTopic === 'absence' && user.role === 'student') {
      const breakdown = await absenceBreakdownTool(db, user);
      if (!breakdown.length) return inEnglish ? 'You have no absences recorded.' : 'ما عندكش أي غيابات مسجلة.';
      return inEnglish
        ? `Absences by subject:\n${breakdown.map(r => `• ${r.subject_name}: ${r.count}`).join('\n')}`
        : `غياباتك موزعة على المواد كالتالي:\n${breakdown.map(r => `• ${r.subject_name}: ${r.count} غياب`).join('\n')}`;
    }
  }

  // Follow-up: "عنده محاضرة بكرة؟" / "عنده محاضرات؟"
  if (/(عنده محاضره|عنده محاضرات|محاضراته)/.test(parsed.normalized) && context.lastDoctor) {
    const targetDate = extractDate(parsed.normalized) || today();
    const docSched = await doctorScheduleTool(db, context.lastDoctor, targetDate);
    if (docSched.error) return docSched.error;
    if (!docSched.rows.length) {
      return `لا، د. ${docSched.doctor.name} ما عندوش محاضرات مسجلة بتاريخ ${targetDate}.`;
    }
    return `أيوه، د. ${docSched.doctor.name} عنده المحاضرات التالية بتاريخ ${targetDate}:\n${docSched.rows.map(r => `• ${r.title} (${r.group_name})، ${formatTime(r.start_time, inEnglish)}`).join('\n')}`;
  }

  // Follow-up: "امتى؟" / "الساعة كام؟"
  if (/^(امتى|إمتى|متى|الساعه كام|ميعاده امتى|ميعادها امتى)$/.test(parsed.normalized)) {
    if (context.lastTopic === 'exams' && user.role === 'student') {
      const exams = await examsTool(db, user, today());
      const exam = context.lastSubject
        ? exams.find(e => normalizeArabic(e.subject_name).includes(normalizeArabic(context.lastSubject)))
        : exams.length === 1 ? exams[0] : null;
      if (exam) {
        return `اختبار ${exam.subject_name || exam.title} ميعاده يوم ${exam.lecture_date} مع د. ${displayDoctorName(exam.doctor_name)}.`;
      }
      if (exams.length > 1) {
        return `تقصد ميعاد أي اختبار؟ ${exams.slice(0, 5).map(e => `${e.subject_name} (${e.lecture_date})`).join('، ')}.`;
      }
      if (context.lastSubject) return `لا يوجد اختبار قادم مسجل لمادة ${context.lastSubject}.`;
    }
  }

  if (/^(مين الدكتور|الدكتور مين|مين المحاضر|المحاضر مين|مين دكتورها|اسم الدكتور)$/.test(parsed.normalized) &&
      context.lastTopic === 'schedule') {
    if (!READ_TOOLS[user.role]?.has('schedule')) return permissionMessage(user.role, 'schedule', inEnglish);
    const priorSchedule = previousTurns.find(turn =>
      ['schedule', 'scheduleCount'].includes(detectIntent(turn.message).intent)
    );
    if (priorSchedule) {
      const previousMessage = normalizeArabic(priorSchedule.message);
      const range = extractDateRange(previousMessage);
      const date = range?.start || extractDate(previousMessage) || today();
      const upcoming = !range && /(قادم|قادمه|جايه|جاي|القادمه|الجاية|الاسبوع الجاي|upcoming|next)/.test(previousMessage);
      const schedule = await scheduleTool(db, user, date, upcoming, range?.end || null);
      if (schedule?.error) return schedule.error;
      const rows = schedule?.rows || [];
      const doctors = [...new Set(rows.map(row => row.doctor_name).filter(Boolean))];
      if (doctors.length === 1) return `دكتور المحاضرة هو د. ${displayDoctorName(doctors[0])}.`;
      if (doctors.length > 1) {
        return `عندك أكثر من محاضرة بدكاترة مختلفين:\n${rows.filter(row => row.doctor_name)
          .map(row => `• ${row.title}${row.subject_name ? ` — ${row.subject_name}` : ''}: د. ${displayDoctorName(row.doctor_name)}`)
          .join('\n')}\nتقصد دكتور أنهي محاضرة؟`;
      }
      return 'مش لاقي اسم دكتور مسجل للمحاضرة في الجدول.';
    }
  }

  // Follow-up: "الدكتور مين؟" / "مين الدكتور؟"
  if (/^(مين|الدكتور مين|مين الدكتور|مين بيدرسها)$/.test(parsed.normalized) && context.lastSubject) {
    const docs = await doctorLookupTool(db, user, context.lastSubject);
    if (Array.isArray(docs) && docs.length) {
      return `دكتور مادة ${docs[0].subject_name} هو د. ${displayDoctorName(docs[0].doctor_name)}.`;
    }
  }

  // متابعة خالصة بلا معلومات جديدة («وإيه تاني؟»، «وبعدها؟»): بدل رد الخطأ
  // نعرض أسئلة متابعة مرتبطة بموضوع السؤال السابق ودور حسابك.
  if (parsed.intent === 'unknown' && previousIntent && isPureContinuation(parsed.normalized)) {
    const related = questionsForIntent(previousIntent, user);
    if (related.length) {
      return inEnglish
        ? `Continuing the previous topic. You can ask, for example:\n${related.map(question => `• ${question}`).join('\n')}`
        : `أكملنا موضوع السؤال السابق. ممكن تحدد أكثر، مثل:\n${related.map(question => `• ${question}`).join('\n')}`;
    }
  }

  const intent = parsed.intent;

  if (intent === 'identity') {
    if (inEnglish) {
      return 'I am the S.T.C course assistant. I answer with the real course data your role can access: schedule, attendance, payments, exams, results, and reports.';
    }
    return 'أنا مساعد S.T.C الذكي، بجيبلك بيانات حقيقية من نظام الكورس وفق صلاحيات حسابك: الجدول والحضور والمدفوعات والامتحانات والنتائج والتقارير. اسألني بأي صيغة مفهومة لك.';
  }
  if (intent === 'greeting') {
    if (inEnglish) return `Hello ${user.name}. How can I assist you with the course management system?`;
    return `أهلًا ${user.name}. أقدر أجيب بيانات النظام المتاحة لدورك، مثل جدولك أو حضورك أو تقارير المجموعة.`;
  }
  if (intent === 'help') {
    if (inEnglish) {
      return `Choose one of the available actions: ${questionsForRole(user).join(', ')}.`;
    }
    const available = questionsForRole(user);
    return available.length
      ? `اختار من الأزرار المتاحة لحسابك: ${available.join('، ')}.`
      : 'لا توجد أدوات بيانات متاحة لدور حسابك.';
  }
  if (intent === 'thanks') {
    return inEnglish ? 'You are welcome! I am here to help.' : 'عفوًا، أنا هنا لمساعدتك.';
  }
  if (intent === 'unknown') {
    if (inEnglish) {
      return 'I could not identify a matching function from the site data for this request. Please specify the area you need (schedule, attendance, balance, exams, results, or report), or pick one of the suggested questions below.';
    }
    return 'لم أتمكن من تحديد وظيفة مناسبة من بيانات الموقع لهذا الطلب. اذكر المجال المطلوب (جدول، حضور، رصيد، امتحانات، درجات أو تقرير) أو اختر أحد الاقتراحات بالأسفل، وسأتحقق من صلاحيات حسابك والبيانات الفعلية.';
  }

  // Server-side security check on tool permission
  const toolKey = ['studentCount', 'paymentsTotal', 'sessionCount', 'examCount'].includes(intent)
    ? 'stats'
    : intent === 'scheduleCount' ? 'schedule'
    : intent === 'myAttendance' ? 'attendance' : intent;

  if (!canUseTool(user, toolKey, intent) && !canUseTool(user, intent)) {
    return permissionMessage(user.role, intent, inEnglish);
  }
  console.info('AI chat tool selected:', { role: user.role, tool: toolKey });

  // Doctor role specific questions
  if (user.role === 'doctor') {
    if (intent === 'studentCount' && /(عندي|بتاعي|طلابي)/.test(parsed.normalized)) {
      const count = await doctorStudentsCountTool(db, user);
      return inEnglish ? `You have ${count} enrolled students.` : `عدد الطلاب المسجلين في مقرراتك: ${count} طالبًا.`;
    }
    if (intent === 'groupAttendance' && /(مين غاب|غياب)/.test(parsed.normalized)) {
      const absentees = await doctorAbsenteesTodayTool(db, user, today());
      if (!absentees.length) return 'ما فيش غياب مسجل في محاضراتك النهارده.';
      return `الطلاب الغائبون اليوم في محاضراتك:\n${absentees.map(s => `• ${s.name} (${s.code}) — ${s.session_title}`).join('\n')}`;
    }
  }

  // Stats intents
  if (['studentCount', 'paymentsTotal', 'sessionCount', 'examCount'].includes(intent)) {
    const value = await statsTool(db, intent);
    if (inEnglish) {
      const responsesEn = {
        studentCount: `Total active students: ${value}.`,
        paymentsTotal: `Total non-voided payments: ${money(value, true)} EGP.`,
        sessionCount: `Total upcoming lectures: ${value}.`,
        examCount: `Total exams: ${value}.`
      };
      return responsesEn[intent];
    }
    const responses = {
      studentCount: `عدد الطلاب النشطين حاليًا: ${value}.`,
      paymentsTotal: `إجمالي المدفوعات غير الملغاة: ${money(value)} جنيه.`,
      sessionCount: `عدد المحاضرات القادمة المسجلة: ${value}.`,
      examCount: `عدد الامتحانات المنشورة أو المغلقة: ${value}.`
    };
    return responses[intent];
  }

  // Student lookup (Staff only)
  if (intent === 'studentLookup') {
    if (!STAFF_ROLES.has(user.role)) return permissionMessage(user.role, intent, inEnglish);
    if (!parsed.studentName) return inEnglish ? 'Please provide the student name or code.' : 'اذكر اسم الطالب أو كوده حتى أبحث في سجلات الطلاب.';
    const matches = await findStudentsByName(db, parsed.studentName);
    if (!matches.length) return `لم أجد طالبًا نشطًا يطابق «${parsed.studentName}». تحقق من كتابة الاسم أو أرسل كود الطالب.`;
    if (matches.length > 1) {
      return `وجدت أكثر من طالب يطابق الاسم. حدّد الطالب بالكود:\n${matches.map(student =>
        `• ${student.name} — ${student.code}، ${student.level_name}، ${student.group_name}`
      ).join('\n')}`;
    }
    const student = matches[0];
    if (parsed.studentLookupMode === 'results') {
      const rows = await studentResultsTool(db, user, student.id);
      return rows.length
        ? `نتائج ${student.name} (${student.code}):\n${rows.map(row =>
          `• ${row.subject_name} — ${row.exam_title}: ${row.score} من ${row.total_questions} (${Math.round(Number(row.percentage))}%)`
        ).join('\n')}`
        : `لا توجد نتائج مكتملة متاحة لـ${student.name} في نطاق صلاحيات حسابك.`;
    }
    if (parsed.studentLookupMode === 'attendance') {
      const attendance = await studentAttendanceTool(db, user, student.id);
      return attendance.total
        ? `حضور ${student.name}: حضر ${attendance.attended} من أصل ${attendance.total} محاضرة، وغاب عن ${attendance.total - attendance.attended}.`
        : `لا توجد محاضرات مكتملة مسجلة لـ${student.name} في نطاق صلاحيات حسابك.`;
    }
    if (parsed.studentLookupMode === 'finance') {
      return `حالة دفع ${student.name}: ${student.payment_status}. المدفوع ${money(student.paid, inEnglish)} جنيه، والمتبقي ${money(student.remaining, inEnglish)} جنيه.`;
    }
    if (parsed.studentLookupMode === 'details') {
      return `تفاصيل ${student.name} (${student.code}): ${student.level_name}، ${student.group_name}. إجمالي رسوم الكورس ${money(student.price, inEnglish)} جنيه. حالة الدفع: ${student.payment_status}. المدفوع ${money(student.paid, inEnglish)} جنيه، والمتبقي ${money(student.remaining, inEnglish)} جنيه.`;
    }
    if (parsed.studentLookupMode === 'profile') {
      if (/(فرقه|سنه|مستوى|مرحله|level|year)/.test(parsed.normalized)) {
        return `${student.name} في ${student.level_name}.`;
      }
      if (/(جروب|مجموعه|group)/.test(parsed.normalized)) {
        return `${student.name} في ${student.group_name} (${student.level_name}).`;
      }
      if (/(كود|code)/.test(parsed.normalized)) {
        return `كود ${student.name} هو ${student.code}.`;
      }
      return `بيانات ${student.name} (${student.code}): ${student.level_name}، ${student.group_name}.\nحالة الدفع: ${student.payment_status}. المدفوع ${money(student.paid, inEnglish)} جنيه، والمتبقي ${money(student.remaining, inEnglish)} جنيه.`;
    }
    return `بيانات ${student.name} (${student.code}): ${student.level_name}، ${student.group_name}.\nحالة الدفع: ${student.payment_status}. المدفوع ${money(student.paid, inEnglish)} جنيه، والمتبقي ${money(student.remaining, inEnglish)} جنيه.`;
  }

  // Group resolution
  const groupNames = await accessibleGroups(db, user);
  const dateRange = extractDateRange(parsed.normalized);
  const date = dateRange?.start || extractDate(parsed.normalized) || today();
  const upcoming = !dateRange && !extractDate(parsed.normalized) &&
    /(قادم|قادمه|جايه|جاي|القادمه|الجاية|الاسبوع الجاي|مواعيد|upcoming|next)/.test(parsed.normalized);
  const groupResult = resolveGroup(parsed.normalized, groupNames);
  if (!groupResult.group && user.role === 'student' && groupNames.length === 1) {
    groupResult.group = groupNames[0];
  }
  if (groupResult.ambiguous) {
    return inEnglish
      ? `Which group do you mean? ${groupResult.groups.map(g => g.name).join(', ')}.`
      : `أي مجموعة تقصد؟ ${groupResult.groups.map(group => `${group.level_name ? `${group.level_name} — ` : ''}${group.name}`).join('، ')}.`;
  }

  // Schedule
  if (intent === 'scheduleCount') {
    return renderScheduleCount(await scheduleTool(db, user, date, false, dateRange?.end || null),
      date, inEnglish, dateRange?.end || null);
  }
  if (intent === 'schedule') {
    if (parsed.studentIntent === 'LECTURE_LOCATION') {
      return 'مكان المحاضرة غير مسجل حاليًا في بيانات الجدول، لذلك لا أستطيع تأكيده.';
    }
    const rows = await scheduleTool(db, user, date, upcoming, dateRange?.end || null);
    if (!rows?.error && upcoming &&
        /(محاضره(?:ي)?\s+(?:ال)?(?:جايه|قادم|قادمه)|الدرس\s+ال?جاي|next lecture)/.test(parsed.normalized)) {
      rows.rows = rows.rows.slice(0, 1);
    }
    return renderSchedule(rows, date, upcoming, inEnglish, dateRange?.end || null);
  }

  if (intent === 'courseInfo') {
    if (user.role !== 'student') return permissionMessage(user.role, intent, inEnglish);
    const balance = await ownBalanceTool(db, user);
    if (balance.error) return balance.error;
    const schedule = await scheduleTool(db, user, today(), true);
    if (schedule?.error) return schedule.error;
    const paymentStatus = balance.remaining > 0
      ? (inEnglish ? 'partially paid' : 'مدفوع جزئيًا')
      : (inEnglish ? 'paid in full' : 'مدفوع بالكامل');
    const balanceLine = inEnglish
      ? `Course fees: ${money(balance.price, true)} EGP; paid ${money(balance.paid, true)} EGP; remaining ${money(balance.remaining, true)} EGP (${paymentStatus}).`
      : `حالة رسوم الكورس: ${paymentStatus}. الإجمالي ${money(balance.price)} جنيه، المدفوع ${money(balance.paid)} جنيه، والمتبقي ${money(balance.remaining)} جنيه.`;
    return `${balanceLine}\n${renderSchedule(schedule, today(), true, inEnglish)}`;
  }

  // Last Lecture
  if (intent === 'lastLecture') {
    const lecture = await lastLectureTool(db, user);
    if (!lecture) return inEnglish ? 'No past lectures recorded.' : 'مش لاقي محاضرات سابقة مسجلة في السجل.';
    return inEnglish
      ? `Last lecture was on ${lecture.date}: ${lecture.title}${lecture.subject_name ? ` — ${lecture.subject_name}` : ''} at ${formatTime(lecture.start_time, true)}.`
      : `آخر محاضرة كانت بتاريخ ${lecture.date}: ${lecture.title}${lecture.subject_name ? ` — ${lecture.subject_name}` : ''}، ${formatTime(lecture.start_time)}${lecture.doctor_name ? `، د. ${displayDoctorName(lecture.doctor_name)}` : ''}.`;
  }

  // Personal Attendance / Absences
  if (intent === 'myAttendance') {
    if (user.role !== 'student') return permissionMessage(user.role, intent, inEnglish);
    if (parsed.studentIntent === 'ATTENDANCE_BY_SUBJECT') {
      if (/(غياب|غبت|غايب|absence|absent)/.test(parsed.normalized)) {
        const absences = await absenceBreakdownTool(db, user);
        if (absences.error) return absences.error;
        if (!absences.length) return 'ما عندكش أي غيابات مسجلة.';
        return `غياباتك موزعة على المواد كالتالي:\n${absences.map(row =>
          `• ${row.subject_name}: ${row.count} غياب`
        ).join('\n')}`;
      }
      const breakdown = await ownAttendanceBySubjectTool(db, user);
      if (breakdown.error) return breakdown.error;
      if (!breakdown.length) return 'لا توجد محاضرات مسجلة في سجل حضورك حتى الآن.';
      return `حضورك حسب المادة:\n${breakdown.map(row => {
        const total = Number(row.total || 0);
        const present = Number(row.present || 0);
        const absent = total - present;
        return `• ${row.subject_name}: حضرت ${present} من ${total}، وغيبت ${absent}.`;
      }).join('\n')}`;
    }
    if (/(في كل ماده|حسب الماده|لكل ماده|by subject|per subject)/.test(parsed.normalized)) {
      const breakdown = await absenceBreakdownTool(db, user);
      if (breakdown?.error) return breakdown.error;
      if (!breakdown.length) return inEnglish ? 'You have no absences recorded.' : 'ما عندكش أي غيابات مسجلة.';
      return inEnglish
        ? `Absences by subject:\n${breakdown.map(row => `• ${row.subject_name}: ${row.count}`).join('\n')}`
        : `غياباتك موزعة على المواد كالتالي:\n${breakdown.map(row => `• ${row.subject_name}: ${row.count} غياب`).join('\n')}`;
    }
    const attendance = await ownAttendanceTool(db, user);
    if (parsed.studentIntent === 'LAST_ATTENDANCE') {
      const last = attendance.rows?.[0];
      if (!last) return 'لا توجد محاضرات مسجلة في سجل حضورك حتى الآن.';
      return `آخر محاضرة في سجل حضورك كانت بتاريخ ${last.date}: ${last.status}${last.title ? ` — ${last.title}` : ''}.`;
    }
    if (parsed.studentIntent === 'ABSENCE_PERCENTAGE') {
      if (!attendance.total) return 'لا توجد محاضرات مسجلة لحساب نسبة الغياب حتى الآن.';
      const absencePercent = Math.round(attendance.absent / attendance.total * 100);
      return `نسبة غيابك ${absencePercent}٪ (${attendance.absent} من ${attendance.total} محاضرة).`;
    }
    if (['ATTENDANCE_HISTORY', 'ABSENCE_HISTORY'].includes(parsed.studentIntent)) {
      const rows = (attendance.rows || []).filter(row =>
        (!parsed.parameters.date || row.date === parsed.parameters.date) &&
        (!parsed.parameters.dateRange ||
          row.date >= parsed.parameters.dateRange.start && row.date <= parsed.parameters.dateRange.end) &&
        (parsed.studentIntent !== 'ABSENCE_HISTORY' || row.status !== 'حاضر')
      );
      if (!rows.length) return parsed.studentIntent === 'ABSENCE_HISTORY'
        ? 'لا توجد غيابات مسجلة في سجل حضورك.'
        : 'لا توجد محاضرات مسجلة في سجل حضورك حتى الآن.';
      return `سجل حضورك:\n${rows.slice(0, 10).map(row =>
        `• ${row.date} — ${row.title}: ${row.status}`
      ).join('\n')}`;
    }
    return renderAttendance(attendance, inEnglish);
  }

  // Group Attendance
  if (intent === 'groupAttendance') {
    const writeRequested = parsed.imperative && /(سجل|اثبت|اضف|ضيف|علم)/.test(parsed.normalized);
    if (!groupResult.group) {
      return inEnglish
        ? 'Please choose a level and group from the buttons.'
        : 'اختار الفرقة والمجموعة من الأزرار لعرض الحضور.';
    }
    if (writeRequested) {
      if (!STAFF_ROLES.has(user.role)) return 'تسجيل حضور الطلاب غير متاح لدور حسابك.';
      return queueAttendanceConfirmation(db, user, groupResult.group, date);
    }
    if (user.role === 'student') {
      const own = await activeStudent(db, user.id);
      if (!own || own.group_id !== groupResult.group.id) return permissionMessage(user.role, intent, inEnglish);
      const rows = await ownAttendanceOnDate(db, user, groupResult.group, date);
      if (!rows?.length) return `لا توجد محاضرة مسجلة لمجموعتك بتاريخ ${date}. أستطيع عرض حضورك فقط، وليس سجل بقية الطلاب.`;
      return `حضورك بتاريخ ${date}:\n${rows.map(row =>
        `• ${row.title} — ${row.attendance_id ? 'مسجل حاضر' : 'لا يوجد سجل حضور'}${row.start_time ? `، ${formatTime(row.start_time, inEnglish)}` : ''}`
      ).join('\n')}`;
    }
    const result = await groupAttendanceTool(db, groupResult.group, date);
    return renderGroupAttendance(result, inEnglish);
  }

  // Personal Balance
  if (intent === 'balance') {
    if (user.role !== 'student') return permissionMessage(user.role, intent, inEnglish);
    if (parsed.studentIntent === 'MY_PAYMENT_HISTORY' || parsed.studentIntent === 'LAST_PAYMENT') {
      const payments = await ownPaymentHistoryTool(db, user);
      if (payments.error) return payments.error;
      if (!payments.length) return 'لا توجد دفعات مسجلة لحسابك حاليًا.';
      if (parsed.studentIntent === 'LAST_PAYMENT') {
        return `آخر دفعة مسجلة: ${money(payments[0].amount)} جنيه بتاريخ ${payments[0].created_at}.`;
      }
      return `آخر دفعاتك المسجلة:\n${payments.map(payment =>
        `• ${money(payment.amount)} جنيه — ${payment.created_at}`
      ).join('\n')}`;
    }
    if (parsed.studentIntent === 'COURSE_PRICE') {
      const student = await activeStudent(db, user.id);
      if (!student) return 'لم أجد ملف طالب نشطًا مرتبطًا بحسابك.';
      return `إجمالي رسوم الكورس المسجلة لحسابك ${money(student.price, inEnglish)} جنيه.`;
    }
    const balance = await ownBalanceTool(db, user);
    if (balance.error) return balance.error;
    const value = parsed.studentIntent === 'MY_TOTAL_PAID' ? balance.paid : balance.remaining;
    if (Number.isFinite(parsed.parameters.amount) &&
        ['gt', 'lt', 'eq'].includes(parsed.parameters.amountOperator)) {
      const passes = parsed.parameters.amountOperator === 'gt' ? value > parsed.parameters.amount * 100
        : parsed.parameters.amountOperator === 'lt' ? value < parsed.parameters.amount * 100
          : value === parsed.parameters.amount * 100;
      const subject = parsed.studentIntent === 'MY_TOTAL_PAID' ? 'المدفوع' : 'المتبقي عليك';
      return passes
        ? `نعم، ${subject} ${parsed.studentIntent === 'MY_TOTAL_PAID' ? 'أكثر' : ''} من ${money(parsed.parameters.amount * 100, inEnglish)} جنيه.`
        : `لا، ${subject} ليس ${parsed.studentIntent === 'MY_TOTAL_PAID' ? 'أكثر' : 'أعلى'} من ${money(parsed.parameters.amount * 100, inEnglish)} جنيه.`;
    }
    if (inEnglish) {
      if (parsed.studentIntent === 'MY_TOTAL_PAID') {
        return `You have paid ${money(balance.paid, true)} EGP.`;
      }
      if (parsed.studentIntent === 'COURSE_PRICE') {
        return `The recorded course price is ${money(balance.price, true)} EGP.`;
      }
      return `Paid amount: ${money(balance.paid, true)} EGP, remaining balance: ${money(balance.remaining, true)} EGP out of ${money(balance.price, true)} EGP.`;
    }
    if (parsed.studentIntent === 'MY_TOTAL_PAID') {
      return `إجمالي ما دفعته ${money(balance.paid)} جنيه.`;
    }
    if (parsed.studentIntent === 'MY_REMAINING_BALANCE') {
      return `المبلغ المتبقي عليك ${money(balance.remaining)} جنيه.`;
    }
    return `إجمالي المدفوع ${money(balance.paid)} جنيه، والمتبقي ${money(balance.remaining)} جنيه من إجمالي ${money(balance.price)} جنيه.`;
  }

  // Staff Dues
  if (intent === 'dues') {
    const financialFilter = parsed.studentIntent === 'STUDENT_FINANCIAL_FILTER'
      ? parsed.parameters : null;
    if (!groupResult.group) {
      return inEnglish
        ? 'Please choose a level and group from the buttons.'
        : 'اختار الفرقة والمجموعة من الأزرار لعرض الطلاب المتبقي عليهم رسوم.';
    }
    const rows = await duesTool(db, groupResult.group || null, financialFilter);
    return renderDues(rows, groupResult.group || null, inEnglish);
  }
  if (intent === 'duesTotal') {
    if (!groupResult.group) {
      return inEnglish
        ? 'Please choose a level and group from the buttons to total the remaining balances.'
        : 'اختار الفرقة والمجموعة من الأزرار لحساب مجموع المبالغ المتبقية.';
    }
    const total = await duesTotalTool(db, groupResult.group);
    return inEnglish
      ? `Total remaining for ${groupResult.group.name}: ${money(total, true)} EGP.`
      : `مجموع المبالغ المتبقية في ${groupResult.group.name}: ${money(total)} جنيه.`;
  }

  // Exams (with ambiguity check if multiple exist)
  if (intent === 'exams') {
    if (parsed.studentIntent === 'EXAM_STATUS') {
      const attempts = await ownExamStatusTool(db, user);
      if (attempts.error) return attempts.error;
      const requestedSubject = parsed.parameters.subject;
      const filteredAttempts = requestedSubject && !['ايه', 'اي', 'دي', 'ده', 'المادة'].includes(requestedSubject)
        ? attempts.filter(row => normalizeArabic(row.subject_name).includes(requestedSubject) ||
          normalizeArabic(row.title).includes(requestedSubject))
        : attempts;
      if (!filteredAttempts.length) return 'لا توجد بيانات اختبار منشورة أو محاولات مسجلة لحسابك تطابق السؤال.';
      return `حالة اختباراتك:\n${filteredAttempts.slice(0, 10).map(row =>
        `• ${row.title} — ${row.subject_name}: ${row.attempt_status === 'submitted' || row.attempt_status === 'timed_out' ? 'تم الدخول' : row.attempt_status === 'in_progress' ? 'بدأت ولم تُسلّم بعد' : row.status === 'published' ? 'متاح' : 'مغلق'}${row.score !== null && row.score !== undefined ? `، الدرجة ${row.score}` : ''}`
      ).join('\n')}`;
    }
    if (parsed.studentIntent === 'MY_WRONG_ANSWERS') {
      const attempts = await resultsTool(db, user);
      if (attempts.error) return attempts.error;
      if (!attempts.length) return 'لا توجد محاولات مكتملة مسجلة لحسابك لعرض عدد الإجابات الخاطئة.';
      return `عدد إجاباتك الخاطئة في المحاولات المكتملة:\n${attempts.slice(0, 10).map(row =>
        `• ${row.subject_name} — ${row.exam_title}: ${row.wrong_answers ?? 'غير متاح'}`
      ).join('\n')}`;
    }
    if (parsed.studentIntent === 'MY_EXAM_SCORE' || parsed.studentIntent === 'MY_EXAM_RESULTS' ||
        parsed.studentIntent === 'MY_EXAM_HISTORY') {
      return renderResults(await resultsTool(db, user), user.role === 'student', inEnglish);
    }
    const rows = await examsTool(db, user, date);
    if (rows.error) return rows.error;
    if (!rows.length) return inEnglish ? 'No published upcoming exams recorded for your account.' : 'لا توجد امتحانات منشورة قادمة مسجلة لحسابك.';
    if (parsed.parameters.examField === 'duration') {
      return `مدة الاختبار ${rows[0].duration_minutes
        ? `${rows[0].duration_minutes} دقيقة`
        : 'غير مسجلة'}${rows[0].title ? ` (${rows[0].title})` : ''}.`;
    }
    if (parsed.parameters.examField === 'question_count') {
      return `عدد أسئلة الاختبار ${rows[0].question_count ?? 'غير متاح'}${rows[0].title ? ` (${rows[0].title})` : ''}.`;
    }

    // Check if user specifically requested a subject
    const subjectMatch = parsed.normalized.match(/(?:اختبار|امتحان)\s+([\p{L}]+)/u);
    if (subjectMatch && !['متاح', 'ليا', 'عندي'].includes(subjectMatch[1])) {
      const filtered = rows.filter(r =>
        normalizeArabic(r.subject_name).includes(subjectMatch[1]) ||
        normalizeArabic(r.title).includes(subjectMatch[1])
      );
      if (filtered.length) {
        return renderExams(filtered, inEnglish);
      }
    }

    // Ambiguity handling for student if asking generically "وريني الاختبار" with multiple exams
    if (user.role === 'student' && rows.length > 1 && /(وريني الاختبار|اعرض الاختبار|عندي اختبار|عندي امتحان)/.test(parsed.normalized)) {
      return inEnglish
        ? `You have ${rows.length} available exams: ${rows.map(r => r.title).join(' and ')}. Which one do you mean?`
        : `عندك ${rows.length} اختبارات متاحة: ${rows.map(r => r.title).join(' و')}. تقصد ${rows[0].title} ولا ${rows[1].title}؟`;
    }

    return renderExams(rows, inEnglish);
  }

  // Results
  if (intent === 'results') {
    const rows = await resultsTool(db, user);
    if (rows.error) return rows.error;
    const asksLastExam = /(اخر|آخر).*?(اختبار|امتحان)/.test(parsed.normalized);
    const priorLastExamQuestion = previousTurns.some(turn =>
      /(اخر|آخر).*?(اختبار|امتحان)/.test(normalizeArabic(turn.message))
    );
    const examScoreFollowUp = user.role === 'student' && context.lastTopic === 'exams' &&
      priorLastExamQuestion && /(فيه|فيها|ده|دي|جبت|درجته|نتيجته)/.test(parsed.normalized);
    if (user.role === 'student' && asksLastExam && rows.length) {
      const last = rows[0];
      const dateLabel = last.lecture_date || last.submitted_at;
      if (/(جبت|درجه|درجته|score)/.test(parsed.normalized)) {
        return `آخر اختبار مكتمل لك كان ${last.subject_name} — ${last.exam_title}: ${last.score} من ${last.total_questions} (${Math.round(Number(last.percentage))}٪).`;
      }
      return `آخر اختبار مكتمل مسجل لك كان ${last.subject_name} — ${last.exam_title} بتاريخ ${dateLabel}.`;
    }
    if (examScoreFollowUp && rows.length) {
      const last = rows[0];
      return `في الاختبار الأخير ${last.exam_title} حصلت على ${last.score} من ${last.total_questions} (${Math.round(Number(last.percentage))}٪).`;
    }
    const subject = parsed.parameters.subject;
    const filtered = subject && !['ايه', 'اي', 'دي', 'ده', 'المادة', 'كام'].includes(subject)
      ? rows.filter(row => normalizeArabic(row.subject_name).includes(subject))
      : rows;
    if (parsed.studentIntent === 'MY_AVERAGE') {
      if (!filtered.length) return inEnglish ? 'No completed exam results available.' : 'لا توجد نتائج مكتملة لحساب متوسط درجاتك.';
      const average = filtered.reduce((sum, row) => sum + Number(row.percentage || 0), 0) / filtered.length;
      return inEnglish
        ? `Your average across ${filtered.length} completed exams is ${average.toFixed(1)}%.`
        : `متوسط درجاتك في ${filtered.length} اختبارات مكتملة ${average.toFixed(1)}٪.`;
    }
    if (['MY_RESULT_BY_SUBJECT', 'MY_SCORE'].includes(parsed.studentIntent) && !filtered.length) {
      return 'لا توجد نتيجة مكتملة مسجلة في المادة المطلوبة.';
    }
    return renderResults(filtered, user.role === 'student', inEnglish);
  }

  // Profile
  if (intent === 'profile') {
    const profile = await profileTool(db, user);
    if (!profile) return permissionMessage(user.role, intent, inEnglish);
    if (profile.error) return profile.error;
    if (parsed.parameters.profileField === 'enrollment') {
      return inEnglish
        ? `Your active course enrollment is ${profile.level_name}, ${profile.group_name}.`
        : `أنت مسجل في ${profile.level_name}، مجموعة ${profile.group_name}.`;
    }
    if (parsed.studentIntent === 'STUDENT_QR_CODE') {
      return `كود الطالب الخاص بحسابك هو ${profile.code}. اعرضه من ملفك الشخصي؛ لا تتوفر في بيانات النظام الحالية معلومات مؤكدة عن تنزيل QR.`;
    }
    if (inEnglish) {
      if (/(my name|what is my name)/.test(parsed.normalized)) return `Your name is ${profile.name}.`;
      if (/(my code|student code|student id|my id)/.test(parsed.normalized)) return `Your student code is ${profile.code}.`;
      if (/(my group|my level|my year)/.test(parsed.normalized)) {
        return `You are enrolled in ${profile.level_name}, ${profile.group_name}.`;
      }
      return `Profile: ${profile.name} (${profile.code}), ${profile.level_name}, ${profile.group_name}.`;
    }
    if (/(اسمي)/.test(parsed.normalized)) return `اسمك هو ${profile.name}.`;
    if (/(كود|رقم)/.test(parsed.normalized)) return `كودك هو ${profile.code}.`;
    if (/(سنه|سنة|فرقه|مستوى)/.test(parsed.normalized)) {
      return `أنت مسجل في ${profile.level_name}.`;
    }
    if (/(جروب|مجموعه)/.test(parsed.normalized)) {
      return `أنت مسجل في ${profile.group_name} (${profile.level_name}).`;
    }
    return `ملفك: ${profile.name} (${profile.code})، ${profile.level_name}، ${profile.group_name}.`;
  }

  // Group Report
  if (intent === 'groupReport') {
    if (!groupResult.group) return inEnglish
      ? 'Please choose a level and group from the buttons.'
      : 'اختار الفرقة والمجموعة من الأزرار لعرض التقرير.';
    const report = await dailyOperationsReport(db, { date, groupId: groupResult.group.id });
    return renderReport(report, groupResult.group, inEnglish);
  }

  // Doctor Lookup
  if (intent === 'doctorLookup') {
    const subjectMatch = parsed.normalized.match(/(?:ماده|مقرر)\s+([\p{L}]+)/u) ||
                         parsed.normalized.match(/(?:دكتور|مدرس|محاضر)\s+([\p{L}]+)/u);
    const extractedSubject = subjectMatch?.[1];
    const genericSubject = extractedSubject && /^(دي|ده|هذه|هذا|الماده|ماده|المقرر|مقرر|بتاع|بتاعة|في)$/.test(extractedSubject);
    const subjectName = extractedSubject && !genericSubject ? extractedSubject : (context.lastSubject || null);
    const rows = await doctorLookupTool(db, user, subjectName);
    if (!Array.isArray(rows) || !rows.length) {
      return inEnglish
        ? `No doctor data found for subject "${subjectName || 'unspecified'}".`
        : `مش لاقي بيانات مسجلة عن دكتور مادة «${subjectName || 'المحددة'}» حاليًا.`;
    }
    if (inEnglish) {
      return `Doctor details:\n${rows.map(r => `• ${r.subject_name} — Dr. ${displayDoctorName(r.doctor_name)}`).join('\n')}`;
    }
    if (rows.length === 1) {
      return `دكتور مادة ${rows[0].subject_name} هو د. ${displayDoctorName(rows[0].doctor_name)}.`;
    }
    return `دكاترة المواد:\n${rows.map(r => `• ${r.subject_name} — د. ${displayDoctorName(r.doctor_name)}`).join('\n')}`;
  }

  // Subjects
  if (intent === 'subjects') {
    const rows = await subjectsTool(db, user);
    if (!Array.isArray(rows) || !rows.length) return inEnglish ? 'No subjects found.' : 'لا توجد مواد مسجلة حاليًا.';
    if (inEnglish) {
      return `Your subjects:\n${rows.map(r => `• ${r.subject_name}${r.doctor_name ? ` — Dr. ${displayDoctorName(r.doctor_name)}` : ''}`).join('\n')}`;
    }
    return `المواد المقررة:\n${rows.map(r => `• ${r.subject_name}${r.doctor_name ? ` — د. ${displayDoctorName(r.doctor_name)}` : ''}`).join('\n')}`;
  }

  // Notifications
  if (intent === 'notifications') {
    const items = await notificationsTool(db, user, {
      unreadOnly: parsed.parameters.unreadOnly,
      importantOnly: parsed.studentIntent === 'IMPORTANT_NOTIFICATIONS'
    });
    if (items?.error) return items.error;
    if (!Array.isArray(items) || !items.length) return inEnglish ? 'No notifications available.' : 'ما فيش إشعارات جديدة مسجلة في صندوق الإشعارات.';
    return `إشعاراتك:\n${items.map(n => `• ${n.title}: ${n.message}`).join('\n')}`;
  }

  return inEnglish ? 'Could not execute the request.' : 'لم أتمكن من تنفيذ الطلب من خلال الأدوات المتاحة.';
}

export function registerAiAssistantRoutes(app, db) {
  const authenticated = (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'يجب تسجيل الدخول' });
    next();
  };

  app.get('/api/ai/chat/bootstrap', authenticated, (req, res) => {
    res.json(chatBootstrapForUser({
      name: req.user.name,
      role: req.user.role,
      permissions: req.user.permissions
    }));
  });

  app.get('/api/ai/chat/history', authenticated, async (req, res) => {
    try {
      const result = await db.query(`SELECT id,user_id,user_name,user_role,message,response,created_at
        FROM ai_chat_messages WHERE user_id=? ORDER BY created_at ASC,id ASC LIMIT 100`, [req.user.id]);
      const user = {
        id: req.user.id,
        name: req.user.name,
        role: req.user.role,
        permissions: req.user.permissions
      };
      const messages = await Promise.all((result.rows || []).map(async message => ({
        ...message,
        suggestedQuestions: await responseButtons(db, user, message.message, message.response)
      })));
      res.json({ messages });
    } catch (error) {
      console.error('AI chat history read failed:', error);
      res.status(500).json({ error: 'حدث خطأ أثناء جلب سجل المحادثة' });
    }
  });

  app.post('/api/ai/chat/message', authenticated, async (req, res) => {
    try {
      const { message } = req.body || {};
      if (typeof message !== 'string' || !message.trim() || message.trim().length > 2000) {
        return res.status(400).json({ error: 'اكتب رسالة من 1 إلى 2000 حرف' });
      }
      const user = {
        id: req.user.id,
        name: req.user.name,
        role: req.user.role,
        permissions: req.user.permissions
      };
      const previous = await db.query(`SELECT message,response FROM ai_chat_messages
        WHERE user_id=? ORDER BY created_at DESC,id DESC LIMIT 8`, [user.id]);
      const history = (previous.rows || []).reverse();
      const intent = detectIntent(message);
      console.info('AI chat intent:', { role: user.role, intent: intent.intent });
      const response = await buildResponse(message.trim(), user, db, history);
      const saved = await db.query(`INSERT INTO ai_chat_messages
        (user_id,user_name,user_role,message,response,created_at)
        VALUES(?,?,?,?,?,?) RETURNING id,created_at`,
      [user.id, user.name, user.role, message.trim(), response, new Date().toISOString()]);
      res.json({
        id: saved.rows[0].id,
        message: message.trim(),
        response,
        suggestedQuestions: await responseButtons(db, user, message.trim(), response),
        created_at: saved.rows[0].created_at
      });
    } catch (error) {
      console.error('AI chat request failed:', { status: error.status || 500, error: error.name });
      res.status(error.status || 503).json({
        error: error.status && error.status < 500
          ? error.message
          : 'تعذر الوصول إلى بيانات المساعد الآن. لم يتم تأكيد تنفيذ أي عملية؛ حاول مرة أخرى.'
      });
    }
  });

  app.delete('/api/ai/chat/history', authenticated, async (req, res) => {
    try {
      await transaction(db, async () => {
        await db.query('DELETE FROM ai_chat_messages WHERE user_id=?', [req.user.id]);
        await db.query('DELETE FROM ai_pending_actions WHERE user_id=?', [req.user.id]);
      });
      res.json({ ok: true });
    } catch (error) {
      console.error('AI chat history clear failed:', error);
      res.status(500).json({ error: 'حدث خطأ أثناء مسح سجل المحادثة' });
    }
  });
}
