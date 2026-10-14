import { openDatabase, passwordHash, token } from '../server/db.js';

const db = openDatabase();
try {
  const result = await db.query(`
    SELECT s.id, s.name, s.code, u.username, u.id user_id 
    FROM students s 
    JOIN users u ON u.id = s.user_id 
    WHERE s.active = 1 
    LIMIT 1
  `);
  
  const student = result.rows[0];
  if (!student) {
    console.log('No active students found');
    process.exit(0);
  }
  
  const pwd = token().slice(0, 20);
  await db.query('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash(pwd), student.user_id]);
  
  console.log(`Student: ${student.name} (code ${student.code})`);
  console.log(`Username: ${student.username}`);
  console.log(`Password: ${pwd}`);
} finally {
  await db.close();
}
