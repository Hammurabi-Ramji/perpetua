const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');

const db = new sqlite3.Database('./licensevault.db');

bcrypt.hash('R0ninJ@h1984', 10, (err, hash) => {
  if (err) {
    console.error('Hash error:', err);
    return;
  }

  console.log('Generated hash:', hash);
  console.log('Hash length:', hash.length);

  // Delete existing user
  db.run('DELETE FROM users WHERE email = ?', ['hcc@hammurabicodingcompany.com'], (err) => {
    if (err) {
      console.error('Delete error:', err);
      return;
    }

    // Insert new user
    db.run('INSERT INTO users (email, password_hash, created_at) VALUES (?, ?, datetime("now"))',
      ['hcc@hammurabicodingcompany.com', hash], (err) => {
        if (err) {
          console.error('Insert error:', err);
        } else {
          console.log('User recreated successfully');
        }
        db.close();
      });
  });
});