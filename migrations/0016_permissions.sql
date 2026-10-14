CREATE TABLE permission_catalog (
  permission_key TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  description TEXT NOT NULL
);

CREATE TABLE user_permissions (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission_key TEXT NOT NULL REFERENCES permission_catalog(permission_key) ON DELETE CASCADE,
  granted BOOLEAN NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  PRIMARY KEY (user_id, permission_key)
);

CREATE INDEX user_permissions_key_granted_idx
  ON user_permissions(permission_key, granted);

INSERT INTO permission_catalog(permission_key, category, description) VALUES
  ('STUDENTS_VIEW', 'الطلاب', 'عرض بيانات الطلاب والبحث فيها'),
  ('STUDENTS_CREATE', 'الطلاب', 'إضافة طالب جديد'),
  ('STUDENTS_EDIT', 'الطلاب', 'تعديل بيانات الطالب'),
  ('STUDENTS_DISABLE', 'الطلاب', 'إيقاف أو إعادة تفعيل حساب الطالب'),
  ('STUDENTS_DELETE', 'الطلاب', 'حذف طالب عند عدم وجود سجلات تاريخية مرتبطة'),
  ('ATTENDANCE_VIEW', 'الحضور', 'عرض سجلات الحضور والغياب'),
  ('ATTENDANCE_CREATE', 'الحضور', 'تسجيل حضور الطالب'),
  ('ATTENDANCE_EDIT', 'الحضور', 'تصحيح سجل الحضور'),
  ('ATTENDANCE_DELETE', 'الحضور', 'حذف سجل حضور'),
  ('PAYMENTS_VIEW', 'المدفوعات', 'عرض الدفعات والأرصدة المالية'),
  ('PAYMENTS_CREATE', 'المدفوعات', 'تسجيل دفعة مالية'),
  ('PAYMENTS_EDIT', 'المدفوعات', 'تعديل سجل دفعة'),
  ('PAYMENTS_DELETE', 'المدفوعات', 'إلغاء دفعة مع الاحتفاظ بسجلها'),
  ('LECTURES_VIEW', 'المحاضرات', 'عرض المحاضرات والمواد'),
  ('LECTURES_CREATE', 'المحاضرات', 'إضافة محاضرة أو مادة'),
  ('LECTURES_EDIT', 'المحاضرات', 'تعديل محاضرة أو مادة'),
  ('LECTURES_DELETE', 'المحاضرات', 'حذف محاضرة أو مادة'),
  ('EXAMS_VIEW', 'الاختبارات', 'عرض الاختبارات'),
  ('EXAMS_CREATE', 'الاختبارات', 'إنشاء اختبار وإضافة أسئلته'),
  ('EXAMS_EDIT', 'الاختبارات', 'تعديل اختبار وأسئلته'),
  ('EXAMS_DELETE', 'الاختبارات', 'حذف اختبار أو سؤال'),
  ('EXAM_RESULTS_VIEW', 'الاختبارات', 'عرض نتائج الاختبارات ومحاولات الطلاب'),
  ('REPORTS_VIEW', 'التقارير', 'عرض تقارير الطلاب والحضور'),
  ('FINANCIAL_REPORTS_VIEW', 'التقارير', 'عرض التقارير المالية والأرصدة'),
  ('USERS_VIEW', 'المستخدمون', 'عرض حسابات المستخدمين وسجل نشاطهم'),
  ('USERS_CREATE', 'المستخدمون', 'إنشاء حساب مستخدم'),
  ('USERS_EDIT', 'المستخدمون', 'تعديل اسم المستخدم ونوع الحساب'),
  ('USERS_DISABLE', 'المستخدمون', 'تعطيل حساب أو إعادة تفعيله'),
  ('USERS_DELETE', 'المستخدمون', 'حذف حساب بلا سجلات تاريخية مرتبطة'),
  ('PERMISSIONS_VIEW', 'الصلاحيات', 'عرض صلاحيات الحساب'),
  ('PERMISSIONS_EDIT', 'الصلاحيات', 'تعديل صلاحيات الحساب'),
  ('SETTINGS_VIEW', 'الإعدادات', 'عرض إعدادات النظام والكورس'),
  ('SETTINGS_EDIT', 'الإعدادات', 'تعديل إعدادات النظام والكورس'),
  ('ACTIVITY_LOG_VIEW', 'سجل النشاط', 'عرض سجل العمليات والتغييرات'),
  ('LIBRARY_VIEW', 'المكتبة', 'عرض مواد مكتبة المحاضرات'),
  ('LIBRARY_CREATE', 'المكتبة', 'إضافة مادة إلى مكتبة المحاضرات'),
  ('LIBRARY_EDIT', 'المكتبة', 'تعديل مادة في مكتبة المحاضرات'),
  ('LIBRARY_DELETE', 'المكتبة', 'حذف مادة من مكتبة المحاضرات');

INSERT INTO user_permissions(user_id, permission_key, granted)
SELECT id, permission_key, TRUE
FROM users
CROSS JOIN (VALUES
  ('STUDENTS_VIEW'), ('STUDENTS_CREATE'), ('STUDENTS_EDIT'), ('STUDENTS_DISABLE'), ('STUDENTS_DELETE'),
  ('ATTENDANCE_VIEW'), ('ATTENDANCE_CREATE'), ('ATTENDANCE_EDIT'), ('ATTENDANCE_DELETE'),
  ('PAYMENTS_VIEW'), ('PAYMENTS_CREATE'), ('PAYMENTS_EDIT'), ('PAYMENTS_DELETE'),
  ('LECTURES_VIEW'), ('LECTURES_CREATE'), ('LECTURES_EDIT'), ('LECTURES_DELETE'),
  ('REPORTS_VIEW'), ('FINANCIAL_REPORTS_VIEW'), ('SETTINGS_VIEW'), ('SETTINGS_EDIT'), ('LIBRARY_VIEW')
) AS legacy(permission_key)
WHERE users.role='assistant';
