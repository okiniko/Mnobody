const express = require("express");

function routesCategories(db) {
  const router = express.Router();
  const liste = db.prepare(`
    SELECT c.id, c.nom, count(p.id) AS nombre_produits
    FROM categories c LEFT JOIN produits p ON p.categorie_id = c.id
    GROUP BY c.id ORDER BY c.nom COLLATE NOCASE, c.id
  `);
  const chercher = db.prepare(`
    SELECT c.id, c.nom, count(p.id) AS nombre_produits
    FROM categories c LEFT JOIN produits p ON p.categorie_id = c.id
    WHERE c.id = ? GROUP BY c.id
  `);
  const messages = {
    creation: "Catégorie créée.",
    renommage: "Catégorie renommée.",
    suppression: "Catégorie supprimée."
  };
  function afficher(req, res, statut = 200, erreur = null, valeurs = {}) {
    const recherche = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const etat = ["vides", "avec-produits"].includes(req.query.etat) ? req.query.etat : "";
    const normaliser = texte => texte.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("fr");
    const toutes = liste.all();
    const categories = toutes.filter(c => normaliser(c.nom).includes(normaliser(recherche)) &&
      (!etat || (etat === "vides" ? c.nombre_produits === 0 : c.nombre_produits > 0)));
    return res.status(statut).render("admin/categories", {
      categories, total: toutes.length, recherche, etat, csrf: req.sessionAdmin.csrf, erreur,
      succes: Object.hasOwn(messages, req.query.succes) ? messages[req.query.succes] : null,
      nomCreation: "", idModification: null, nomModification: "", ...valeurs
    });
  }
  function lireId(valeur) {
    if (!/^[1-9]\d*$/.test(valeur)) return null;
    const id = Number(valeur);
    return Number.isSafeInteger(id) ? id : null;
  }
  function lireNom(valeur) {
    if (typeof valeur !== "string") return null;
    const nom = valeur.normalize("NFC").trim().replace(/\s+/gu, " ");
    return nom.length > 0 && nom.length <= 100 && !/\p{Cc}/u.test(nom) ? nom : null;
  }
  function doublon(nom, idIgnore = null) {
    const cle = nom.toLocaleLowerCase("fr");
    return db.prepare("SELECT id, nom FROM categories").all()
      .some(c => c.id !== idIgnore && c.nom.normalize("NFC").toLocaleLowerCase("fr") === cle);
  }

  router.get("/", (req, res) => afficher(req, res));
  router.post("/", (req, res) => {
    const nom = lireNom(req.body.nom);
    if (!nom) return afficher(req, res, 400, "Le nom doit contenir entre 1 et 100 caractères.");
    db.exec("BEGIN IMMEDIATE");
    try {
      if (doublon(nom)) {
        db.exec("ROLLBACK");
        return afficher(req, res, 409, "Une catégorie porte déjà ce nom.", { nomCreation: nom });
      }
      db.prepare("INSERT INTO categories (nom) VALUES (?)").run(nom);
      db.exec("COMMIT");
    } catch (erreur) {
      db.exec("ROLLBACK");
      throw erreur;
    }
    return res.redirect(303, "/admin/categories?succes=creation");
  });

  router.post("/:id/renommer", (req, res) => {
    const id = lireId(req.params.id);
    if (!id || !chercher.get(id)) return afficher(req, res, 404, "Catégorie introuvable.");
    const nom = lireNom(req.body.nom);
    if (!nom) return afficher(req, res, 400, "Le nom doit contenir entre 1 et 100 caractères.");
    db.exec("BEGIN IMMEDIATE");
    try {
      if (doublon(nom, id)) {
        db.exec("ROLLBACK");
        return afficher(req, res, 409, "Une catégorie porte déjà ce nom.", {
          idModification: id, nomModification: nom
        });
      }
      const resultat = db.prepare("UPDATE categories SET nom = ? WHERE id = ?").run(nom, id);
      db.exec("COMMIT");
      if (!resultat.changes) return afficher(req, res, 404, "Catégorie introuvable.");
    } catch (erreur) {
      db.exec("ROLLBACK");
      throw erreur;
    }
    return res.redirect(303, "/admin/categories?succes=renommage");
  });

  router.get("/:id/supprimer", (req, res) => {
    const id = lireId(req.params.id);
    const categorie = id && chercher.get(id);
    if (!categorie) return afficher(req, res, 404, "Catégorie introuvable.");
    return res.render("admin/categorie-suppression", {
      categorie, csrf: req.sessionAdmin.csrf
    });
  });
  router.post("/:id/supprimer", (req, res) => {
    const id = lireId(req.params.id);
    if (!id) return afficher(req, res, 404, "Catégorie introuvable.");
    const resultat = db.prepare(`DELETE FROM categories WHERE id = ?
      AND NOT EXISTS (SELECT 1 FROM produits WHERE categorie_id = categories.id)`).run(id);
    if (!resultat.changes) {
      if (!chercher.get(id)) return afficher(req, res, 404, "Catégorie introuvable.");
      return afficher(req, res, 409, "Cette catégorie contient des produits. Réaffectez-les avant de la supprimer.");
    }
    return res.redirect(303, "/admin/categories?succes=suppression");
  });
  return router;
}

module.exports = { routesCategories };
