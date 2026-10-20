const path = require("node:path");
const fs = require("node:fs");
const { DatabaseSync } = require("node:sqlite");

function ouvrirBase(fichier = path.join(__dirname, "data", "boutique.sqlite")) {
  fs.mkdirSync(path.dirname(fichier), { recursive: true });
  const db = new DatabaseSync(fichier);
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY,
      nom TEXT NOT NULL UNIQUE CHECK (length(trim(nom)) > 0)
    );
    CREATE TABLE IF NOT EXISTS produits (
      id INTEGER PRIMARY KEY,
      nom TEXT NOT NULL CHECK (length(trim(nom)) > 0),
      description TEXT NOT NULL,
      image TEXT NOT NULL,
      prix_centimes INTEGER NOT NULL
        CHECK (typeof(prix_centimes) = 'integer' AND prix_centimes >= 0),
      categorie_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT
    );
    CREATE INDEX IF NOT EXISTS produits_categorie ON produits(categorie_id);
  `);
  return db;
}

module.exports = { ouvrirBase };
