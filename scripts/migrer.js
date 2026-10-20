const { ouvrirBase } = require("../database");
const db = ouvrirBase();
try {
  console.log(db.prepare("SELECT nom, appliquee_le FROM migrations ORDER BY nom").all());
} finally {
  db.close();
}
