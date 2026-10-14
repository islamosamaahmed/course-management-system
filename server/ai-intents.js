const EXAMPLES = {
  profile: {
    egyptian: ['بياناتي إيه؟', 'أنا مسجل باسم إيه؟', 'جروب كام أنا؟'],
    formal: ['ما بيانات ملفي؟', 'ما الرقم الجامعي المسجل لي؟'],
    short: ['معلوماتي؟', 'كودي؟'],
    typos: ['كودي ايه', 'بياناتى ايه'],
    numeric: ['أنا في مجموعة رقم 2؟'],
    dates: ['بياناتي المسجلة حتى اليوم؟'],
    subjects: ['أنا مسجل في مادة المحاسبة؟']
  },
  schedule: {
    egyptian: ['عندي إيه النهارده؟', 'محاضرتي الجاية إمتى؟', 'المحاضرة فين؟'],
    formal: ['ما جدول محاضراتي هذا الأسبوع؟', 'ما موعد المحاضرة القادمة؟'],
    short: ['جدولي؟', 'المحاضرة إمتى؟'],
    typos: ['محاظرتي امتى', 'المحاضره فين'],
    numeric: ['عندي كام محاضرة الأسبوع ده؟'],
    dates: ['جدولي بكرة وبعد بكرة؟', 'ما محاضرات الأسبوع القادم؟'],
    subjects: ['المحاضرة الجاية في مادة المحاسبة؟']
  },
  attendance: {
    egyptian: ['غبت كام مرة؟', 'حضرت كام محاضرة؟', 'أنا منتظم في الحضور؟'],
    formal: ['ما نسبة حضوري؟', 'ما سجل الغياب الخاص بي؟'],
    short: ['غيابي؟', 'حضوري عامل إيه؟'],
    typos: ['غبت كام مره', 'حضوري كام'],
    numeric: ['هل غبت أكثر من 3 مرات؟'],
    dates: ['غبت إمتى الأسبوع اللي فات؟'],
    subjects: ['حضوري في مادة المحاسبة كام؟']
  },
  finance: {
    egyptian: ['عليا كام؟', 'دفعت كام وفاضل كام؟', 'آخر دفعة كانت إمتى؟'],
    formal: ['ما إجمالي ما سددته؟', 'ما المبلغ المتبقي من الرسوم؟'],
    short: ['فاضل عليا؟', 'دفعت كام؟'],
    typos: ['لسه عليا فلوس', 'المبلغ المتبقي كام'],
    numeric: ['هل عليّ أكثر من 500 جنيه؟', 'دفعت 800 جنيه؟'],
    dates: ['آخر دفعة كانت إمتى؟'],
    subjects: ['دفعت كام للكورس؟']
  },
  exam: {
    egyptian: ['الاختبار الجاي إمتى؟', 'دخلت الاختبار ده؟', 'غلطت في كام سؤال؟'],
    formal: ['هل لدي اختبار قريب؟', 'ما نتيجة آخر اختبار لي؟'],
    short: ['نتيجة الاختبار؟', 'اختبار قريب؟'],
    typos: ['الامتحان الجاى امتى', 'اختبار المحاسبه'],
    numeric: ['جبت أكثر من 80 في الاختبار؟'],
    dates: ['الاختبار إمتى الأسبوع الجاي؟'],
    subjects: ['نتيجتي في اختبار المحاسبة كام؟']
  },
  results: {
    egyptian: ['مجموعي كام؟', 'أنا جبت كام؟', 'أعلى درجة جبتها كام؟'],
    formal: ['ما متوسط درجاتي؟', 'ما نتيجتي في هذه المادة؟'],
    short: ['درجاتي؟', 'نتيجتي؟'],
    typos: ['نتيجتي كام', 'درجاتى ايه'],
    numeric: ['هل درجتي أعلى من 80؟'],
    dates: ['نتيجتي في آخر اختبار؟'],
    subjects: ['درجتي في مادة المحاسبة؟']
  },
  notifications: {
    egyptian: ['في إعلان جديد؟', 'عندي تنبيه؟', 'في حاجة مهمة لازم أعرفها؟'],
    formal: ['ما آخر الإشعارات المرسلة إلي؟', 'هل صدر إعلان جديد؟'],
    short: ['إشعاراتي؟', 'في جديد؟'],
    typos: ['في اعلان جديد', 'عندي اشعار'],
    numeric: ['عندي كام إشعار غير مقروء؟'],
    dates: ['آخر إعلان النهارده؟'],
    subjects: ['في إعلان بخصوص محاضرة المحاسبة؟']
  },
  account: {
    egyptian: ['أغير الباسورد إزاي؟', 'حسابي مربوط بجوجل؟', 'أقدر أفصل Google؟'],
    formal: ['كيف أغيّر كلمة المرور؟', 'هل حسابي مرتبط بحساب Google؟'],
    short: ['حسابي آمن؟', 'جوجل مربوط؟'],
    typos: ['اربط جوجل ازاى', 'نسيت الباسورد'],
    numeric: ['كلمة المرور لازم تكون كام حرف؟'],
    dates: ['متى ربطت حساب Google؟'],
    subjects: ['إيميل Google المرتبط بحسابي إيه؟']
  }
};

function intent(name, description, requiredData, permission, examples, optionalParameters = []) {
  return Object.freeze({
    name,
    description,
    requiredData: Object.freeze(requiredData),
    optionalParameters: Object.freeze(optionalParameters),
    permission,
    examples: Object.freeze(examples)
  });
}

const STUDENT_ONLY = 'authenticated student; own account only';
const STUDENT_OR_AUTHORIZED_STAFF = 'authenticated user; staff data access follows role permissions';
const STAFF_ONLY = 'assistant/admin only; respect existing role policy';
const STUDENT_ACCOUNT = 'authenticated account owner';

export const STUDENT_INTENTS = Object.freeze({
  STUDENT_PROFILE: intent('STUDENT_PROFILE', 'Read the authenticated student profile and enrollment details.', ['student profile'], STUDENT_ONLY, EXAMPLES.profile, ['profileField']),
  TODAY_SCHEDULE: intent('TODAY_SCHEDULE', 'List the authenticated student’s lectures for the current application date.', ['own active enrollment', 'lecture schedule'], STUDENT_ONLY, EXAMPLES.schedule, ['date']),
  UPCOMING_LECTURES: intent('UPCOMING_LECTURES', 'List the authenticated student’s next scheduled lectures.', ['own active enrollment', 'lecture schedule'], STUDENT_ONLY, EXAMPLES.schedule, ['date', 'limit']),
  LECTURE_DETAILS: intent('LECTURE_DETAILS', 'Return stored details for a lecture the student is enrolled in.', ['own active enrollment', 'lecture schedule'], STUDENT_ONLY, EXAMPLES.schedule, ['date', 'subject']),
  WEEK_SCHEDULE: intent('WEEK_SCHEDULE', 'List the student’s lectures over the requested week.', ['own active enrollment', 'lecture schedule'], STUDENT_ONLY, EXAMPLES.schedule, ['dateRange']),
  LAST_LECTURE: intent('LAST_LECTURE', 'Return the latest past lecture in the student’s enrollment history.', ['own active enrollment', 'lecture schedule'], STUDENT_ONLY, EXAMPLES.schedule, ['subject']),
  LECTURE_LOCATION: intent('LECTURE_LOCATION', 'Read a lecture location only when that value is stored by the application.', ['own lecture', 'stored location'], STUDENT_ONLY, EXAMPLES.schedule, ['date', 'subject']),
  LECTURE_TIME: intent('LECTURE_TIME', 'Return the stored time for an enrolled lecture.', ['own active enrollment', 'lecture schedule'], STUDENT_ONLY, EXAMPLES.schedule, ['date', 'subject']),
  LECTURE_SUBJECT: intent('LECTURE_SUBJECT', 'Return the stored subject or topic of an enrolled lecture.', ['own active enrollment', 'lecture schedule'], STUDENT_ONLY, EXAMPLES.schedule, ['date', 'subject']),
  MY_ATTENDANCE: intent('MY_ATTENDANCE', 'Summarize only the authenticated student’s attendance records.', ['own attendance records'], STUDENT_ONLY, EXAMPLES.attendance, ['subject', 'dateRange']),
  MY_ABSENCES: intent('MY_ABSENCES', 'Count absences recorded for the authenticated student.', ['own attendance records'], STUDENT_ONLY, EXAMPLES.attendance, ['subject', 'dateRange']),
  ATTENDANCE_PERCENTAGE: intent('ATTENDANCE_PERCENTAGE', 'Calculate attendance percentage from the student’s own recorded sessions.', ['own attendance records'], STUDENT_ONLY, EXAMPLES.attendance, ['subject', 'dateRange']),
  ABSENCE_PERCENTAGE: intent('ABSENCE_PERCENTAGE', 'Calculate absence percentage from the student’s own recorded sessions.', ['own attendance records'], STUDENT_ONLY, EXAMPLES.attendance, ['subject', 'dateRange']),
  ATTENDANCE_HISTORY: intent('ATTENDANCE_HISTORY', 'Show the authenticated student’s attendance history.', ['own attendance records'], STUDENT_ONLY, EXAMPLES.attendance, ['subject', 'dateRange']),
  ABSENCE_HISTORY: intent('ABSENCE_HISTORY', 'Show the authenticated student’s absence history.', ['own attendance records'], STUDENT_ONLY, EXAMPLES.attendance, ['subject', 'dateRange']),
  LAST_ATTENDANCE: intent('LAST_ATTENDANCE', 'Report the latest attendance status recorded for the student.', ['own attendance records'], STUDENT_ONLY, EXAMPLES.attendance, ['subject']),
  ATTENDANCE_BY_SUBJECT: intent('ATTENDANCE_BY_SUBJECT', 'Summarize the student’s absences by subject.', ['own attendance records', 'lecture subjects'], STUDENT_ONLY, EXAMPLES.attendance, ['subject']),
  MY_PAYMENT_STATUS: intent('MY_PAYMENT_STATUS', 'Summarize fees, payments and remaining balance for the authenticated student.', ['own course price', 'own non-voided payments'], STUDENT_ONLY, EXAMPLES.finance),
  MY_TOTAL_PAID: intent('MY_TOTAL_PAID', 'Calculate the amount paid by the authenticated student.', ['own non-voided payments'], STUDENT_ONLY, EXAMPLES.finance, ['comparison', 'amount']),
  MY_REMAINING_BALANCE: intent('MY_REMAINING_BALANCE', 'Calculate the authenticated student’s remaining course balance.', ['own course price', 'own non-voided payments'], STUDENT_ONLY, EXAMPLES.finance, ['comparison', 'amount']),
  MY_PAYMENT_HISTORY: intent('MY_PAYMENT_HISTORY', 'Show payment transactions only when the application stores a payment history.', ['own payment records'], STUDENT_ONLY, EXAMPLES.finance, ['dateRange']),
  LAST_PAYMENT: intent('LAST_PAYMENT', 'Return the latest payment only when transaction dates are stored.', ['own payment records'], STUDENT_ONLY, EXAMPLES.finance),
  COURSE_PRICE: intent('COURSE_PRICE', 'Read the course price snapshot associated with the authenticated student.', ['own course price'], STUDENT_ONLY, EXAMPLES.finance),
  STUDENT_FINANCIAL_FILTER: intent('STUDENT_FINANCIAL_FILTER', 'Filter other students by a financial condition; only roles explicitly permitted by policy may see results.', ['authorized student financial records'], STAFF_ONLY, EXAMPLES.finance, ['comparison', 'amount', 'group']),
  MY_EXAMS: intent('MY_EXAMS', 'List published exams available to the authenticated student.', ['own active enrollment', 'published exams'], STUDENT_ONLY, EXAMPLES.exam, ['subject', 'date']),
  UPCOMING_EXAMS: intent('UPCOMING_EXAMS', 'List the authenticated student’s upcoming published exams.', ['own active enrollment', 'published exams'], STUDENT_ONLY, EXAMPLES.exam, ['subject', 'dateRange']),
  MY_EXAM_RESULTS: intent('MY_EXAM_RESULTS', 'Read submitted exam attempts belonging to the authenticated student.', ['own submitted exam attempts'], STUDENT_ONLY, EXAMPLES.exam, ['subject']),
  MY_EXAM_SCORE: intent('MY_EXAM_SCORE', 'Read the student’s score from submitted attempts without exposing active exam answers.', ['own submitted exam attempts'], STUDENT_ONLY, EXAMPLES.exam, ['subject', 'exam']),
  MY_EXAM_HISTORY: intent('MY_EXAM_HISTORY', 'List exam attempts belonging to the authenticated student.', ['own exam attempts'], STUDENT_ONLY, EXAMPLES.exam, ['subject']),
  MY_WRONG_ANSWERS: intent('MY_WRONG_ANSWERS', 'Summarize the student’s wrong-answer count only for completed attempts; never reveal active exam answers.', ['own completed exam attempts'], STUDENT_ONLY, EXAMPLES.exam, ['subject', 'exam']),
  EXAM_STATUS: intent('EXAM_STATUS', 'Check published exam availability or the student’s own recorded attempt status.', ['own active enrollment', 'published exams or own attempts'], STUDENT_ONLY, EXAMPLES.exam, ['subject', 'exam']),
  MY_RESULTS: intent('MY_RESULTS', 'Show submitted exam results for the authenticated student.', ['own submitted exam attempts'], STUDENT_ONLY, EXAMPLES.results, ['subject']),
  MY_AVERAGE: intent('MY_AVERAGE', 'Calculate an average from the authenticated student’s submitted exam scores.', ['own submitted exam attempts'], STUDENT_ONLY, EXAMPLES.results, ['subject']),
  MY_SCORE: intent('MY_SCORE', 'Read the authenticated student’s own recorded score.', ['own submitted exam attempts'], STUDENT_ONLY, EXAMPLES.results, ['subject', 'exam']),
  MY_RESULT_BY_SUBJECT: intent('MY_RESULT_BY_SUBJECT', 'Filter the authenticated student’s submitted results by subject.', ['own submitted exam attempts', 'subject'], STUDENT_ONLY, EXAMPLES.results, ['subject']),
  LATEST_ANNOUNCEMENTS: intent('LATEST_ANNOUNCEMENTS', 'Show recent announcements only if they are available in the student’s notification feed.', ['own notifications'], STUDENT_ONLY, EXAMPLES.notifications, ['dateRange']),
  MY_NOTIFICATIONS: intent('MY_NOTIFICATIONS', 'Show notifications addressed to the authenticated student.', ['own notifications'], STUDENT_ONLY, EXAMPLES.notifications, ['unreadOnly']),
  IMPORTANT_NOTIFICATIONS: intent('IMPORTANT_NOTIFICATIONS', 'Show important notifications addressed to the authenticated student.', ['own notifications'], STUDENT_ONLY, EXAMPLES.notifications, ['unreadOnly']),
  STUDENT_QR_CODE: intent('STUDENT_QR_CODE', 'Refer to an existing student code or QR feature; do not claim a QR is available if it is not stored.', ['own student code'], STUDENT_ONLY, EXAMPLES.profile),
  ACCOUNT_SECURITY: intent('ACCOUNT_SECURITY', 'Answer account-security navigation questions without changing credentials or linking identities.', ['authenticated account security status'], STUDENT_ACCOUNT, EXAMPLES.account, ['securityAction']),
  OTHER_STUDENT_PRIVATE_DATA: intent('OTHER_STUDENT_PRIVATE_DATA', 'Detect a request for other students’ private data and deny it unless an explicit role permission allows access.', [], STUDENT_OR_AUTHORIZED_STAFF, EXAMPLES.profile)
});

const FINANCIAL_WORDS = /(فلوس|مصاريف|رسوم|مديون|عليا|عليه|عليهم|متبقي|الباقي|فاضل|باقي|رصيد|دفع|دفعت|دفعات|مدفوع|سداد|مالي|payment|balance|paid|fee|fees)/;
const OTHER_STUDENT_WORDS = /(^|\s)(مين|الطلاب|طلاب|طالب|الطالب|ناس|غيري|التانيين|الاخرين)(\s|$)|(^|\s)من\s+(عليه|عليهم|غاب|حضر|جاب|دفع|طلاب)/;
const NUMBER_PATTERN = /(?:^|\s)(\d+(?:[.,]\d+)?)(?:\s|$)/;

function amountParameters(normalized) {
  const comparison = normalized.match(/(?:اكتر من|اكثر من|فوق|اعلى من|يزيد عن|greater than|more than|over)\s*(\d+(?:[.,]\d+)?)/) ||
    normalized.match(/(?:اقل من|أقل من|تحت|less than|under)\s*(\d+(?:[.,]\d+)?)/);
  const exact = normalized.match(NUMBER_PATTERN);
  const match = comparison?.[1] || exact?.[1];
  if (!match) return {};
  const operator = comparison
    ? /(اقل من|أقل من|تحت|less than|under)/.test(comparison[0]) ? 'lt' : 'gt'
    : 'eq';
  const amount = Number(match.replace(',', '.'));
  if (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000_000) return {};
  return { amount, amountOperator: operator, currency: /(جنيه|جنيهات|ج\.م|egp|pound)/.test(normalized) ? 'EGP' : null };
}

export function classifyStudentIntent(message, baseIntent) {
  const normalized = String(message ?? '').toLowerCase()
    .normalize('NFKC')
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[^\p{L}\p{N}\s.,-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const parameters = amountParameters(normalized);
  const asksOthers = OTHER_STUDENT_WORDS.test(normalized) &&
    !/(بياناتي|فلوسي|عليا|رصيدي|غيابي|حضوري|درجاتي|نتيجتي|معلوماتي|بتاعي|بتاعتي|الخاص بيا|الخاصة بيا)/.test(normalized);
  const hasFinance = FINANCIAL_WORDS.test(normalized) || baseIntent === 'dues' || baseIntent === 'balance';
  const ownGroupAttendanceRequest = /(^|\s)مين\s+(حضر|غاب)(\s|$)/.test(normalized) &&
    !/(اكتر|اكثر|اعلى|عدد من|مين فيهم|who.*more)/.test(normalized);

  if (asksOthers && hasFinance) {
    return { studentIntent: 'STUDENT_FINANCIAL_FILTER', parameters: { ...parameters, target: 'other_students' } };
  }
  if (asksOthers && !ownGroupAttendanceRequest &&
      /(تليفون|موبايل|رقم|ايميل|بريد|بيانات|درجات|درجه|نتايج|نتيجه|حضور|حضر|غياب|غاب|غايب|حاضرين|score|rank)/.test(normalized)) {
    return { studentIntent: 'OTHER_STUDENT_PRIVATE_DATA', parameters: { target: 'other_students' } };
  }
  if (baseIntent === 'courseInfo' && /(انا مسجل (?:في|بال) (?:ال)?كورس)/.test(normalized)) {
    return { studentIntent: 'STUDENT_PROFILE', parameters: { profileField: 'enrollment' } };
  }
  if (/(اعلان|اعلانات|اخبار|اعلنت|اخر حاجه اتقالت|تغيير جديد|تنبيه|notifications)/.test(normalized)) {
    return { studentIntent: /(اهم|مهم|ضروري|important)/.test(normalized)
      ? 'IMPORTANT_NOTIFICATIONS' : 'LATEST_ANNOUNCEMENTS', parameters: { unreadOnly: false } };
  }
  if (/(qr|كيو ار|كارت الطالب|بطاقة الطالب)/.test(normalized)) {
    return { studentIntent: 'STUDENT_QR_CODE', parameters: { profileField: 'code' } };
  }
  if (/(باسورد|كلمه السر|كلمة السر|كلمه المرور|كلمة المرور|نسيت.*(باسورد|سر)|google|جوجل|ايميل المرتبط|البريد المرتبط|تغيير الايميل|تغيير البريد|اغير.*(ايميل|بريد))/.test(normalized)) {
    const securityAction = /(افصل|الغاء الربط|disconnect)/.test(normalized)
      ? 'disconnect_google'
      : /(اغير.*(ايميل|بريد)|تغيير الايميل|تغيير البريد)/.test(normalized)
        ? 'email_change'
        : /(google|جوجل|ايميل المرتبط|البريد المرتبط|الايميل المرتبط|اربط|ربط|connected|linked)/.test(normalized)
          ? 'google_link'
          : /(نسيت|استعاده|استرجاع)/.test(normalized) ? 'password_recovery' : 'password_change';
    return { studentIntent: 'ACCOUNT_SECURITY', parameters: { securityAction } };
  }
  if (baseIntent === 'profile' && hasFinance) {
    return { studentIntent: /(دفعت|المدفوع|paid amount)/.test(normalized) ? 'MY_TOTAL_PAID' : 'MY_PAYMENT_STATUS', parameters };
  }
  if (baseIntent === 'profile' && /(مستوايا|مستواي|درجاتي|مجموعي|جبتها كام)/.test(normalized)) {
    return { studentIntent: /(متوسط|معدل)/.test(normalized) ? 'MY_AVERAGE' : 'MY_SCORE', parameters };
  }
  if (baseIntent === 'profile') return { studentIntent: 'STUDENT_PROFILE', parameters: { profileField: /كود|رقم الطالب|student id|student code/.test(normalized) ? 'code' : /اسم/.test(normalized) ? 'name' : /سنه|فرقه|مستوى/.test(normalized) ? 'academic_year' : /جروب|مجموعه/.test(normalized) ? 'group' : null } };
  if (baseIntent === 'notifications' ||
      /(اخر حاجه اتقالت|حاجه مهمه لازم اعرفها|تنبيه مهم|تغيير جديد|اعلنت الاداره|الاداره اعلنت)/.test(normalized)) {
    return { studentIntent: /(اهم|مهم|ضروري|important)/.test(normalized) ? 'IMPORTANT_NOTIFICATIONS' : /(اعلان|اعلانات|اخبار)/.test(normalized) ? 'LATEST_ANNOUNCEMENTS' : 'MY_NOTIFICATIONS', parameters: { unreadOnly: /(غير مقروء|غير مقروءه|لسه ماقريتش|unread)/.test(normalized) } };
  }
  if (baseIntent === 'balance' || /حسابي المالي|حساب مالي/.test(normalized)) {
    const studentIntent = /(اخر|آخر)\s*(دفع|دفعة)|اخر مره دفعت|last payment/.test(normalized)
      ? 'LAST_PAYMENT'
      : /(تفاصيل|وريني|الدفعات|دفعاتي|payment history|payment details)/.test(normalized)
        ? 'MY_PAYMENT_HISTORY'
        : /(سعر|اجمالي الكورس|رسوم الكورس|course price|course fee)/.test(normalized)
          ? 'COURSE_PRICE'
          : /(دفعت|المدفوع|paid amount|how much.*paid)/.test(normalized)
            ? 'MY_TOTAL_PAID'
            : /(فاضل|باقي|متبقي|عليا|مديون|remaining|balance)/.test(normalized)
              ? 'MY_REMAINING_BALANCE'
              : 'MY_PAYMENT_STATUS';
    return { studentIntent, parameters };
  }
  if (baseIntent === 'myAttendance') {
    const studentIntent = /(نسبه الحضور|نسبة الحضور|نسبه حضوري|attendance percentage|حضوري نسبته)/.test(normalized)
      ? 'ATTENDANCE_PERCENTAGE'
      : /(نسبه الغياب|نسبة الغياب|absence percentage)/.test(normalized)
        ? 'ABSENCE_PERCENTAGE'
        : /(حسب الماده|كل ماده|في ماده|في مادة|by subject|per subject)/.test(normalized)
          ? 'ATTENDANCE_BY_SUBJECT'
          : /(اخر مره|آخر مرة|اخر غياب|آخر غياب|آخر محاضره|اخر محاضره|last attendance)/.test(normalized)
            ? 'LAST_ATTENDANCE'
            : /(غبت|غياب|غايب|absen)/.test(normalized)
              ? /(امتى|متى|ايمتى|when|history|تاريخ|قائمه)/.test(normalized) ? 'ABSENCE_HISTORY' : 'MY_ABSENCES'
              : /(تاريخ|سجل|history|حضرت)/.test(normalized) ? 'ATTENDANCE_HISTORY' : 'MY_ATTENDANCE';
    return { studentIntent, parameters };
  }
  if (baseIntent === 'lastLecture') return { studentIntent: 'LAST_LECTURE', parameters };
  if (baseIntent === 'schedule' || baseIntent === 'scheduleCount') {
    const studentIntent = /(مكان|فين|اين|location)/.test(normalized)
      ? 'LECTURE_LOCATION'
      : /(الساعه|ميعاد|امتى|متى|وقت|time)/.test(normalized)
        ? 'LECTURE_TIME'
        : /(موضوع|ماده|مادة|subject)/.test(normalized)
          ? 'LECTURE_SUBJECT'
          : /(الاسبوع|week)/.test(normalized)
            ? 'WEEK_SCHEDULE'
            : /(الجاي|القادم|بكره|بكرة|بعد بكره|upcoming|next)/.test(normalized)
              ? 'UPCOMING_LECTURES'
              : /(تفاصيل|محاضره .* دي|lecture details)/.test(normalized)
                ? 'LECTURE_DETAILS'
                : /(النهارده|النهاردا|اليوم|today)/.test(normalized)
                  ? 'TODAY_SCHEDULE' : 'UPCOMING_LECTURES';
    return { studentIntent, parameters };
  }
  if (baseIntent === 'exams') {
    const studentIntent = /(غلط|اخطاء|أخطاء|wrong answer)/.test(normalized)
      ? 'MY_WRONG_ANSWERS'
      : /(لسه.*(مدخلتهاش|ما دخلتهاش)|لم ادخل|not taken)/.test(normalized)
        ? 'EXAM_STATUS'
      : /(اخر|آخر).*?(اختبار|امتحان)/.test(normalized) &&
        !/(درجه|جبت.*كام|نتيجه|score|result)/.test(normalized)
          ? 'MY_EXAM_HISTORY'
      : /(درجه|نتيجه|جبت.*كام|score|result)/.test(normalized)
        ? /(اخر|آخر|تاريخ|history|دخلت)/.test(normalized) ? 'MY_EXAM_RESULTS' : 'MY_EXAM_SCORE'
        : /(دخلت|محاول|attempt|حالته|حاله|status)/.test(normalized)
          ? 'EXAM_STATUS'
          : /(امتحاناتي|اختباراتي|الاختبارات اللي دخلتها|exam history)/.test(normalized)
            ? 'MY_EXAM_HISTORY'
            : /(قريب|جاي|القادم|بكره|بكرة|upcoming|next)/.test(normalized)
              ? 'UPCOMING_EXAMS' : 'MY_EXAMS';
    return { studentIntent, parameters };
  }
  if (baseIntent === 'examCount' && /(مده|مدة|كام سؤال|عدد الاسئله|question count|duration)/.test(normalized)) {
    return { studentIntent: 'MY_EXAMS', parameters: { ...parameters, examField: /مده|duration/.test(normalized) ? 'duration' : 'question_count' } };
  }
  if (/(غلطت|الاجابات الخاطئه|الاجابات الغلط|الاسئله اللي غلط|wrong answers)/.test(normalized)) {
    return { studentIntent: 'MY_WRONG_ANSWERS', parameters };
  }
  if (baseIntent === 'results') {
    const studentIntent = /(متوسط|معدل|average)/.test(normalized)
      ? 'MY_AVERAGE'
      : /(في ماده|في مادة|حسب الماده|by subject)/.test(normalized)
        ? 'MY_RESULT_BY_SUBJECT'
        : /(اختبار|امتحان|اخر|آخر)/.test(normalized) ? 'MY_EXAM_RESULTS'
        : /(درجه|جبت كام|score)/.test(normalized) ? 'MY_SCORE' : 'MY_RESULTS';
    return { studentIntent, parameters };
  }
  if (/(نتائجي|النتائج|نتايجي|نتايج)/.test(normalized)) {
    return { studentIntent: 'MY_RESULTS', parameters };
  }
  if (/(جبت كام|جبتها كام|و?جبت\s+(?:فيه|فيها|ده|دي\s+)?كام|مجموعي|درجاتي|مستوايا|مستواي|اعلي درجه|اقل درجه|اعلي نتيجه|اقل نتيجه)/.test(normalized)) {
    return { studentIntent: /(متوسط|معدل)/.test(normalized) ? 'MY_AVERAGE' : 'MY_SCORE', parameters };
  }
  if (baseIntent === 'dues') return { studentIntent: 'STUDENT_FINANCIAL_FILTER', parameters: { ...parameters, target: 'other_students' } };
  if (baseIntent === 'studentLookup' && asksOthers) {
    return { studentIntent: 'OTHER_STUDENT_PRIVATE_DATA', parameters: { target: 'other_students' } };
  }
  return { studentIntent: null, parameters };
}
