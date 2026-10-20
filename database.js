const path = require("node:path");
const fs = require("node:fs");
const { DatabaseSync } = require("node:sqlite");

function cheminBase() {
  return process.env.DATABASE_PATH || path.join(__dirname, "data", "boutique.sqlite");
}

function migrer(db) {
  const dossier = path.join(__dirname, "migrations");
  const fichiers = fs.readdirSync(dossier).filter(nom => /^\d{3}-.*\.sql$/.test(nom)).sort();
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS migrations (
      nom TEXT PRIMARY KEY, appliquee_le TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    const appliquees = db.prepare("SELECT nom FROM migrations").all().map(ligne => ligne.nom);
    if (appliquees.some(nom => !fichiers.includes(nom))) {
      throw new Error("Base plus récente que le code : retour arrière refusé.");
    }
    for (const nom of fichiers) {
      if (appliquees.includes(nom)) continue;
      db.exec(fs.readFileSync(path.join(dossier, nom), "utf8"));
      db.prepare("INSERT INTO migrations (nom) VALUES (?)").run(nom);
    }
    db.exec("COMMIT");
  } catch (erreur) {
    db.exec("ROLLBACK");
    throw erreur;
  }
}

function ouvrirBase(fichier = cheminBase()) {
  if (fichier !== ":memory:") fs.mkdirSync(path.dirname(fichier), { recursive: true });
  const db = new DatabaseSync(fichier);
  try {
    db.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
    migrer(db);
    return db;
  } catch (erreur) {
    db.close();
    throw erreur;
  }
}

module.exports = { ouvrirBase, cheminBase, migrer };
