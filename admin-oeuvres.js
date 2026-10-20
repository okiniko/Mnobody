const express = require("express");
const { imagesDisponibles, lireId, texte, valideTexte } = require("./art");

function routesOeuvres(db) {
  const router = express.Router();
  const chercher = db.prepare("SELECT * FROM oeuvres WHERE id = ?");
  const liste = db.prepare(`SELECT o.*, count(v.produit_id) AS nombre_variantes
    FROM oeuvres o LEFT JOIN variantes v ON v.oeuvre_id=o.id GROUP BY o.id ORDER BY o.id DESC`);
  function formulaire(req, res, id = null, valeurs = {}, erreurs = [], statut = 200) {
    return res.status(statut).render("admin/oeuvre-formulaire", { id, valeurs, erreurs,
      images: imagesDisponibles(), csrf: req.sessionAdmin.csrf });
  }
  function valider(body) {
    const valeurs = Object.fromEntries(["titre", "description", "image", "serie", "annee", "edition", "tirage", "statut"]
      .map(champ => [champ, texte(body[champ])]));
    const erreurs = [];
    if (!valideTexte(valeurs.titre, 200, true) || /\p{Cc}/u.test(valeurs.titre)) erreurs.push("Le titre doit contenir de 1 à 200 caractères sans caractère de contrôle.");
    if (!valideTexte(valeurs.description, 8000, true)) erreurs.push("La description doit contenir de 1 à 8 000 caractères.");
    if (!valideTexte(valeurs.serie, 200) || /\p{Cc}/u.test(valeurs.serie)) erreurs.push("La série doit contenir au maximum 200 caractères sans caractère de contrôle.");
    const disponibles = imagesDisponibles();
    if (!disponibles.includes(valeurs.image)) erreurs.push("Choisissez une image principale disponible.");
    let images = body.images === undefined ? [] : Array.isArray(body.images) ? body.images : [body.images];
    if (images.some(image => typeof image !== "string" || !disponibles.includes(image)) || images.length > 8) {
      erreurs.push("Choisissez au maximum 8 images complémentaires disponibles."); images = [];
    }
    valeurs.images = [...new Set(images)].filter(image => image !== valeurs.image);
    const annee = valeurs.annee ? lireId(valeurs.annee) : null;
    if (valeurs.annee && (!annee || annee > 9999)) erreurs.push("L’année doit être un entier entre 1 et 9999, ou rester vide.");
    if (valeurs.edition !== "limitee" || valeurs.tirage !== "49") erreurs.push("Les œuvres sont limitées à 49 tirages Dibond, tous formats confondus.");
    const tirage = 49;
    if (!["brouillon", "publiee", "archivee"].includes(valeurs.statut)) erreurs.push("Statut invalide.");
    return { valeurs, erreurs, champs: [valeurs.titre, valeurs.description, valeurs.image, valeurs.serie, annee, valeurs.edition, tirage, valeurs.statut] };
  }
  router.get("/", (req, res) => res.render("admin/oeuvres", { oeuvres: liste.all(),
    succes: req.query.succes === "enregistrement" ? "Œuvre enregistrée." : null }));
  router.get("/nouvelle", (req, res) => formulaire(req, res));
  router.get("/:id/modifier", (req, res) => {
    const id = lireId(req.params.id), oeuvre = id && chercher.get(id);
    if (!oeuvre) return res.status(404).send("Œuvre introuvable");
    oeuvre.images = db.prepare("SELECT image FROM oeuvre_images WHERE oeuvre_id = ? ORDER BY ordre").all(id).map(l => l.image);
    return formulaire(req, res, id, oeuvre);
  });
  function enregistrer(req, res, id) {
    const { valeurs, erreurs, champs } = valider(req.body);
    if (erreurs.length) return formulaire(req, res, id, valeurs, erreurs, 400);
    db.exec("BEGIN IMMEDIATE");
    try {
      if (id) {
        const resultat = db.prepare(`UPDATE oeuvres SET titre=?, description=?, image=?, serie=?, annee=?, edition=?, tirage=?, statut=? WHERE id=?`).run(...champs, id);
        if (!resultat.changes) { db.exec("ROLLBACK"); return res.status(404).send("Œuvre introuvable"); }
      } else {
        id = Number(db.prepare(`INSERT INTO oeuvres (titre, description, image, serie, annee, edition, tirage, statut) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(...champs).lastInsertRowid);
      }
      db.prepare("DELETE FROM oeuvre_images WHERE oeuvre_id=?").run(id);
      valeurs.images.forEach((image, ordre) => db.prepare("INSERT INTO oeuvre_images VALUES (?, ?, ?)").run(id, image, ordre));
      db.exec("COMMIT");
    } catch (erreur) { db.exec("ROLLBACK"); throw erreur; }
    return res.redirect(303, "/admin/oeuvres?succes=enregistrement");
  }
  router.post("/", (req, res) => enregistrer(req, res, null));
  router.post("/:id/modifier", (req, res) => {
    const id = lireId(req.params.id);
    if (!id || !chercher.get(id)) return res.status(404).send("Œuvre introuvable");
    return enregistrer(req, res, id);
  });
  return router;
}
module.exports = { routesOeuvres };
