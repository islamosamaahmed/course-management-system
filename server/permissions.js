export const permissionCatalog = [
  ['STUDENTS_VIEW', 'الطلاب', 'عرض بيانات الطلاب والبحث فيها'],
  ['DOCTOR_STUDENTS_VIEW', 'الطلاب', 'عرض متابعة الطلاب المرتبطين بمواد ومحاضرات الدكتور'],
  ['STUDENTS_CREATE', 'الطلاب', 'إضافة طالب جديد'],
  ['STUDENTS_EDIT', 'الطلاب', 'تعديل بيانات الطالب'],
  ['STUDENTS_DISABLE', 'الطلاب', 'إيقاف أو إعادة تفعيل حساب الطالب'],
  ['STUDENTS_DELETE', 'الطلاب', 'حذف طالب عند عدم وجود سجلات تاريخية مرتبطة'],
  ['ATTENDANCE_VIEW', 'الحضور', 'عرض سجلات الحضور والغياب'],
  ['ATTENDANCE_CREATE', 'الحضور', 'تسجيل حضور الطالب'],
  ['ATTENDANCE_EDIT', 'الحضور', 'تصحيح سجل الحضور'],
  ['ATTENDANCE_DELETE', 'الحضور', 'حذف سجل حضور'],
  ['PAYMENTS_VIEW', 'المدفوعات', 'عرض الدفعات والأرصدة المالية'],
  ['PAYMENTS_CREATE', 'المدفوعات', 'تسجيل دفعة مالية'],
  ['PAYMENTS_EDIT', 'المدفوعات', 'تعديل سجل دفعة'],
  ['PAYMENTS_DELETE', 'المدفوعات', 'إلغاء دفعة مع الاحتفاظ بسجلها'],
  ['LECTURES_VIEW', 'المحاضرات', 'عرض المحاضرات والمواد'],
  ['LECTURES_CREATE', 'المحاضرات', 'إضافة محاضرة أو مادة'],
  ['LECTURES_EDIT', 'المحاضرات', 'تعديل محاضرة أو مادة'],
  ['LECTURES_DELETE', 'المحاضرات', 'حذف محاضرة أو مادة'],
  ['EXAMS_VIEW', 'الاختبارات', 'عرض الاختبارات'],
  ['EXAMS_CREATE', 'الاختبارات', 'إنشاء اختبار وإضافة أسئلته'],
  ['EXAMS_EDIT', 'الاختبارات', 'تعديل اختبار وأسئلته'],
  ['EXAMS_DELETE', 'الاختبارات', 'حذف اختبار أو سؤال'],
  ['EXAM_RESULTS_VIEW', 'الاختبارات', 'عرض نتائج الاختبارات ومحاولات الطلاب'],
  ['REPORTS_VIEW', 'التقارير', 'عرض تقارير الطلاب والحضور'],
  ['FINANCIAL_REPORTS_VIEW', 'التقارير', 'عرض التقارير المالية والأرصدة'],
  ['USERS_VIEW', 'المستخدمون', 'عرض حسابات المستخدمين وسجل نشاطهم'],
  ['USERS_CREATE', 'المستخدمون', 'إنشاء حساب مستخدم'],
  ['USERS_EDIT', 'المستخدمون', 'تعديل اسم المستخدم ونوع الحساب'],
  ['USERS_DISABLE', 'المستخدمون', 'تعطيل حساب أو إعادة تفعيله'],
  ['USERS_DELETE', 'المستخدمون', 'حذف حساب بلا سجلات تاريخية مرتبطة'],
  ['PERMISSIONS_VIEW', 'الصلاحيات', 'عرض صلاحيات الحساب'],
  ['PERMISSIONS_EDIT', 'الصلاحيات', 'تعديل صلاحيات الحساب'],
  ['SETTINGS_VIEW', 'الإعدادات', 'عرض إعدادات النظام والكورس'],
  ['SETTINGS_EDIT', 'الإعدادات', 'تعديل إعدادات النظام والكورس'],
  ['ACTIVITY_LOG_VIEW', 'سجل النشاط', 'عرض سجل العمليات والتغييرات'],
  ['LIBRARY_VIEW', 'المكتبة', 'عرض مواد مكتبة المحاضرات'],
  ['LIBRARY_CREATE', 'المكتبة', 'إضافة مادة إلى مكتبة المحاضرات'],
  ['LIBRARY_EDIT', 'المكتبة', 'تعديل مادة في مكتبة المحاضرات'],
  ['LIBRARY_DELETE', 'المكتبة', 'حذف مادة من مكتبة المحاضرات'],
  ['STUDY_VIEW', 'المذاكرة التفاعلية', 'عرض وإدارة محتوى المذاكرة التفاعلية'],
  ['STUDY_CREATE', 'المذاكرة التفاعلية', 'إنشاء وحدات ودروس وأقسام وأسئلة للمذاكرة التفاعلية'],
  ['STUDY_EDIT', 'المذاكرة التفاعلية', 'تعديل محتوى المذاكرة التفاعلية ونشره'],
  ['STUDY_DELETE', 'المذاكرة التفاعلية', 'حذف محتوى المذاكرة التفاعلية']
].map(([key, category, description]) => ({ key, category, description }));

const doctorDefaults = new Set([
  'LECTURES_VIEW', 'LECTURES_CREATE', 'LECTURES_EDIT',
  'DOCTOR_STUDENTS_VIEW',
  'EXAMS_VIEW', 'EXAMS_CREATE', 'EXAMS_EDIT', 'EXAM_RESULTS_VIEW',
  'LIBRARY_VIEW', 'LIBRARY_CREATE', 'LIBRARY_EDIT', 'LIBRARY_DELETE',
  'STUDY_VIEW', 'STUDY_CREATE', 'STUDY_EDIT', 'STUDY_DELETE'
]);

const assistantDefaults = new Set([
  'STUDENTS_VIEW', 'STUDENTS_CREATE', 'STUDENTS_EDIT', 'STUDENTS_DISABLE', 'STUDENTS_DELETE',
  'ATTENDANCE_VIEW', 'ATTENDANCE_CREATE', 'ATTENDANCE_EDIT', 'ATTENDANCE_DELETE',
  'PAYMENTS_VIEW', 'PAYMENTS_CREATE', 'PAYMENTS_EDIT', 'PAYMENTS_DELETE',
  'LECTURES_VIEW', 'LECTURES_CREATE', 'LECTURES_EDIT', 'LECTURES_DELETE',
  'REPORTS_VIEW', 'FINANCIAL_REPORTS_VIEW',
  'SETTINGS_VIEW', 'SETTINGS_EDIT',
  'LIBRARY_VIEW'
]);

export function defaultPermissions(accountType) {
  if (accountType === 'admin') return permissionCatalog.map(permission => permission.key);
  if (accountType === 'doctor') return [...doctorDefaults];
  if (accountType === 'assistant') return [...assistantDefaults];
  return [];
}

export function effectivePermissions(accountType, overrides = []) {
  const result = new Set(defaultPermissions(accountType));
  for (const entry of overrides) {
    if (entry.granted) result.add(entry.permission_key);
    else result.delete(entry.permission_key);
  }
  return [...result];
}

export function hasPermission(user, permissionKey) {
  return user?.role === 'admin' || user?.permissions?.includes(permissionKey) === true;
}

export function routePermission(path, method, query = {}, role = '') {
  const normalizedPath = path.replace(/^\/api(?=\/|$)/, '');
  const verb = method.toUpperCase();
  const isRead = ['GET', 'HEAD'].includes(verb);
  const isCreate = verb === 'POST';
  const isEdit = ['PATCH', 'PUT'].includes(verb);
  const isDelete = verb === 'DELETE';
  const action = isRead ? 'VIEW' : isCreate ? 'CREATE' : isEdit ? 'EDIT' : isDelete ? 'DELETE' : null;
  const matches = (pattern) => pattern.test(normalizedPath);

  if (matches(/^\/(?:users)(?:\/|$)/)) {
    if (normalizedPath === '/users' && isRead) return 'USERS_VIEW';
    if (normalizedPath === '/users' && isCreate) return 'USERS_CREATE';
    if (matches(/^\/users\/\d+\/permissions$/)) return isRead ? 'PERMISSIONS_VIEW' : 'PERMISSIONS_EDIT';
    if (matches(/^\/users\/\d+\/activity$/)) return 'USERS_VIEW';
    if (matches(/^\/users\/\d+$/)) {
      if (isRead) return 'USERS_VIEW';
      if (isEdit && (query.active !== undefined || query.status !== undefined)) return 'USERS_DISABLE';
      if (isEdit && query.password !== undefined) return 'USERS_EDIT';
      if (isDelete) return 'USERS_DELETE';
      if (isEdit) return 'USERS_EDIT';
    }
    if (matches(/^\/permissions$/)) return isRead ? 'PERMISSIONS_VIEW' : 'PERMISSIONS_EDIT';
  }
  if (matches(/^\/audit$/)) return 'ACTIVITY_LOG_VIEW';
  if (matches(/^\/students\/\d+\/certificate$/)) return 'EXAM_RESULTS_VIEW';
  if (matches(/^\/students(?:\/|$)/)) {
    if (matches(/^\/students\/\d+\/qr$/)) return 'STUDENTS_VIEW';
    if (matches(/^\/students\/\d+\/(?:password|qr\/rotate)$/)) return 'STUDENTS_EDIT';
    if (matches(/^\/students\/\d+$/) && isEdit && (query.active !== undefined || query.cancelled !== undefined)) return 'STUDENTS_DISABLE';
    return `STUDENTS_${action}`;
  }
  if (matches(/^\/attendance(?:\/|$)/)) return `ATTENDANCE_${action}`;
  if (matches(/^\/payments\/\d+\/receipt$/)) return 'PAYMENTS_VIEW';
  if (matches(/^\/payments\/\d+\/void$/)) return 'PAYMENTS_DELETE';
  if (matches(/^\/payments(?:\/|$)/)) return `PAYMENTS_${action}`;
  if (matches(/^\/notifications\/payment-reminder$/)) return 'PAYMENTS_VIEW';
  if (matches(/^\/dashboard$/)) return 'FINANCIAL_REPORTS_VIEW';
  if (matches(/^\/session-options$/)) return 'LECTURES_VIEW';
  if (matches(/^\/course\/prices(?:\/|$)/)) return isRead ? 'SETTINGS_VIEW' : 'SETTINGS_EDIT';
  if (matches(/^\/course\/settings$/)) return isRead ? 'SETTINGS_VIEW' : 'SETTINGS_EDIT';
  if (matches(/^\/sessions(?:\/|$)/)) return `LECTURES_${action}`;
  if (matches(/^\/reports(?:\/|$)/)) {
    if (!query.type || ['payments', 'students', 'daily'].includes(query.type)) return 'FINANCIAL_REPORTS_VIEW';
    if (query.type === 'attendance') return 'ATTENDANCE_VIEW';
    return 'REPORTS_VIEW';
  }
  if (matches(/^\/academic\/library(?:\/|$)/)) return `LIBRARY_${action}`;
  if (matches(/^\/interactive-study\/manage(?:\/|$)/)) return `STUDY_${action}`;
  if (matches(/^\/academic\/lectures\/\d+\/exams(?:\/|$)/)) return `EXAMS_${action}`;
  if (matches(/^\/academic\/exams\/\d+\/results$/)) return 'EXAM_RESULTS_VIEW';
  if (matches(/^\/academic\/(?:dashboard|subjects|lectures)(?:\/|$)/)) {
    return `LECTURES_${action}`;
  }
  if (matches(/^\/academic\/exams(?:\/|$)/) || matches(/^\/academic\/questions(?:\/|$)/) ||
      matches(/^\/academic\/exam-attempts\/\d+\/certificate$/)) {
    if (matches(/\/results$/)) return 'EXAM_RESULTS_VIEW';
    if (matches(/\/certificate$/)) return 'EXAM_RESULTS_VIEW';
    return `EXAMS_${action}`;
  }
  if (matches(/^\/course(?:\/|$)/)) return isRead ? 'SETTINGS_VIEW' : 'SETTINGS_EDIT';
  if (matches(/^\/structure(?:\/|$)/)) return isRead ? 'SETTINGS_VIEW' : 'SETTINGS_EDIT';
  if (matches(/^\/backup(?:\/|$)/)) return isRead ? 'SETTINGS_VIEW' : 'SETTINGS_EDIT';
  if (matches(/^\/follow-up$/)) return role === 'doctor' ? 'DOCTOR_STUDENTS_VIEW' : 'FINANCIAL_REPORTS_VIEW';

  return null;
}
