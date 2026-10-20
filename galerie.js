const express = require("express");
const { lireId } = require("./art");
const { disponibiliteEdition } = require("./editions");
const champsProduit = `SELECT p.id, p.nom, p.description, p.image, p.prix_centimes / 100.0 AS prix,
  p.categorie_id, c.nom AS categorie, v.oeuvre_id, o.titre AS oeuvre_titre,
  v.support, v.largeur_mm, v.hauteur_mm, v.finition, v.taille, v.couleur, o.edition, o.tirage,
  CASE WHEN v.support='dibond' THEN 3 ELSE NULL END AS limite_client,
  CASE WHEN v.support='dibond' AND o.edition='limitee' THEN max(0, o.tirage -
    (SELECT count(*) FROM tirages_editions t JOIN commandes_editions ce ON ce.cle=t.commande_cle
     WHERE t.oeuvre_id=o.id AND (ce.etat='vendue' OR (ce.etat='reservee' AND ce.expiration>CAST(strftime('%s','now') AS INTEGER)*1000))))
    ELSE NULL END AS exemplaires_restants
  FROM produits p JOIN categories c ON c.id=p.categorie_id
  LEFT JOIN variantes v ON v.produit_id=p.id LEFT JOIN oeuvres o ON o.id=v.oeuvre_id
  WHERE v.produit_id IS NOT NULL AND v.disponible=1 AND o.statut='publiee'`;
function routesGalerie(db) {
  const router = express.Router();
  const exposition = db.prepare("SELECT o.id, o.titre, o.description, o.image, (SELECT v.finition FROM variantes v WHERE v.oeuvre_id=o.id AND v.support='dibond' ORDER BY v.produit_id LIMIT 1) AS finition FROM oeuvres o WHERE o.statut='publiee' ORDER BY o.id LIMIT 15");
  router.get('/musee', (req, res) => res.render('musee', { oeuvres: exposition.all() }));
  router.get('/api/musee', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(exposition.all());
  });
  router.get("/galerie", (req, res) => {
    const oeuvres = db.prepare(`SELECT o.*, (SELECT min(p.prix_centimes) FROM produits p
      JOIN variantes v ON v.produit_id=p.id WHERE v.oeuvre_id=o.id AND v.support='dibond') AS prix_dibond,
      (SELECT count(*) FROM variantes v WHERE v.oeuvre_id=o.id AND v.support='dibond' AND v.disponible=1) AS formats_disponibles
      FROM oeuvres o WHERE o.statut='publiee' ORDER BY o.id DESC`).all();
    res.render("galerie", { oeuvres });
  });
  router.get("/oeuvre/:id", (req, res) => {
    const id = lireId(req.params.id);
    const oeuvre = id && db.prepare("SELECT * FROM oeuvres WHERE id=? AND statut='publiee'").get(id);
    if (!oeuvre) return res.status(404).send("Œuvre introuvable");
    const variantes = db.prepare(`SELECT p.id, p.nom, p.prix_centimes / 100.0 AS prix,
      v.support, v.largeur_mm, v.hauteur_mm, v.finition, v.taille, v.couleur, v.disponible
      FROM produits p JOIN variantes v ON v.produit_id=p.id WHERE v.oeuvre_id=?
      ORDER BY CASE v.support WHEN 'dibond' THEN 0 ELSE 1 END, p.prix_centimes, p.id`).all(id);
    const images = db.prepare("SELECT image FROM oeuvre_images WHERE oeuvre_id=? ORDER BY ordre").all(id);
    const restants = oeuvre.edition === "limitee" ? disponibiliteEdition(db, id) : null;
    res.render("oeuvre", { oeuvre, variantes, images, restants });
  });
  return router;
}
module.exports = { champsProduit, routesGalerie };
