const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { cheminBase } = require("../database");

function sauvegarder(source, destination) {
  if (!destination) throw new Error("Indiquez un fichier de destination hors du répertoire public.");
  // L'ouverture en lecture seule évite de créer une base vide si la source manque.
  const db = new DatabaseSync(source, { readOnly: true });
  let reserve = false;
  try {
    fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
    fs.closeSync(fs.openSync(destination, "wx", 0o600));
    reserve = true;
    // VACUUM INTO produit un instantané cohérent, même si l'application est active.
    db.prepare("VACUUM INTO ?").run(path.resolve(destination));
    const copie = new DatabaseSync(destination, { readOnly: true });
    try {
      if (copie.prepare("PRAGMA integrity_check").get().integrity_check !== "ok") {
        throw new Error("La sauvegarde ne passe pas le contrôle d’intégrité.");
      }
    } finally { copie.close(); }
    return destination;
  } catch (erreur) {
    if (reserve) fs.unlinkSync(destination);
    throw erreur;
  } finally { db.close(); }
}
if (require.main === module) {
  try { console.log("Sauvegarde vérifiée :", sauvegarder(cheminBase(), process.argv[2])); }
  catch (erreur) { console.error(erreur.message); process.exitCode = 1; }
}
module.exports = { sauvegarder };
