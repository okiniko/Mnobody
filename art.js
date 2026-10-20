const fs = require("node:fs");
const path = require("node:path");

function imagesDisponibles() {
  return fs.readdirSync(path.join(__dirname, "public", "images"), { withFileTypes: true })
    .filter(f => f.isFile() && /^[a-zA-Z0-9_.-]+\.(png|jpe?g|webp|avif|gif)$/i.test(f.name))
    .map(f => `images/${f.name}`).sort((a, b) => a.localeCompare(b, "fr"));
}
function lireId(valeur) {
  if (typeof valeur !== "string" || !/^[1-9]\d*$/.test(valeur)) return null;
  const id = Number(valeur);
  return Number.isSafeInteger(id) ? id : null;
}
function texte(valeur) {
  return typeof valeur === "string" ? valeur.trim().normalize("NFC") : "";
}
function valideTexte(valeur, max, requis = false) {
  return (!requis || valeur.length > 0) && valeur.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(valeur);
}
function validerVariante(db, body) {
  const champs = ["oeuvre_id", "support", "largeur_mm", "hauteur_mm", "finition", "taille", "couleur", "fournisseur", "reference_fournisseur"];
  const valeurs = Object.fromEntries(champs.map(champ => [champ, texte(body[champ])]));
  valeurs.disponible = body.disponible === "0" ? "0" : "1";
  const erreurs = [];
  if (!valeurs.oeuvre_id) {
    if (champs.slice(1).some(champ => valeurs[champ])) erreurs.push("Choisissez une œuvre pour renseigner une déclinaison.");
    return { valeurs, erreurs, variante: null };
  }
  if (!valeurs.fournisseur) valeurs.fournisseur = "merchone";
  const oeuvreId = lireId(valeurs.oeuvre_id);
  if (!oeuvreId || !db.prepare("SELECT id FROM oeuvres WHERE id = ?").get(oeuvreId)) erreurs.push("Choisissez une œuvre existante.");
  if (!["dibond", "textile"].includes(valeurs.support)) erreurs.push("Choisissez le support Dibond ou textile.");
  let largeur = null, hauteur = null;
  if (valeurs.support === "dibond") {
    largeur = lireId(valeurs.largeur_mm); hauteur = lireId(valeurs.hauteur_mm);
    if (!largeur || largeur > 10000 || !hauteur || hauteur > 10000) erreurs.push("Renseignez largeur et hauteur en millimètres entiers, entre 1 et 10 000.");
    if (valeurs.taille || valeurs.couleur) erreurs.push("La taille et la couleur concernent uniquement les textiles.");
  } else if (valeurs.support === "textile") {
    if (!valeurs.taille) erreurs.push("Renseignez la taille du textile.");
    if (valeurs.largeur_mm || valeurs.hauteur_mm) erreurs.push("Les dimensions en millimètres concernent uniquement le Dibond.");
  }
  for (const champ of ["finition", "taille", "couleur", "reference_fournisseur"]) {
    if (!valideTexte(valeurs[champ], champ === "taille" ? 40 : 200)) erreurs.push(`Le champ ${champ} est trop long ou contient des caractères interdits.`);
  }
  if (!["", "merchone", "pixartprinting", "spreadconnect"].includes(valeurs.fournisseur)) erreurs.push("Fournisseur invalide.");
  if (valeurs.reference_fournisseur && !valeurs.fournisseur) erreurs.push("Choisissez un fournisseur pour sa référence.");
  if (valeurs.fournisseur === "pixartprinting" && valeurs.support !== "dibond" || valeurs.fournisseur === "spreadconnect" && valeurs.support !== "textile") erreurs.push("Le fournisseur doit correspondre au support choisi.");
  if (body.disponible !== undefined && !["0", "1"].includes(body.disponible)) erreurs.push("Disponibilité invalide.");
  return { valeurs, erreurs, variante: [oeuvreId, valeurs.support, largeur, hauteur, valeurs.finition, valeurs.taille, valeurs.couleur, Number(valeurs.disponible), valeurs.fournisseur, valeurs.reference_fournisseur] };
}
function enregistrerVariante(db, produitId, variante) {
  if (!variante) { db.prepare("DELETE FROM variantes WHERE produit_id = ?").run(produitId); return; }
  db.prepare(`INSERT INTO variantes VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(produit_id) DO UPDATE SET oeuvre_id=excluded.oeuvre_id, support=excluded.support,
    largeur_mm=excluded.largeur_mm, hauteur_mm=excluded.hauteur_mm, finition=excluded.finition,
    taille=excluded.taille, couleur=excluded.couleur, disponible=excluded.disponible,
    fournisseur=excluded.fournisseur, reference_fournisseur=excluded.reference_fournisseur`).run(produitId, ...variante);
}
module.exports = { imagesDisponibles, lireId, texte, valideTexte, validerVariante, enregistrerVariante };
