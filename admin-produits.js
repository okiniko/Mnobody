const express = require("express");
const { imagesDisponibles, lireId, validerVariante, enregistrerVariante } = require("./art");

function routesProduits(db) {
  const router = express.Router();
  const categories = db.prepare("SELECT id, nom FROM categories ORDER BY nom COLLATE NOCASE");
  const chercher = db.prepare("SELECT p.*, v.* FROM produits p LEFT JOIN variantes v ON v.produit_id=p.id WHERE p.id = ?");
  const liste = db.prepare(`SELECT p.*, c.nom AS categorie, o.titre AS oeuvre_titre, v.support FROM produits p
    JOIN categories c ON c.id = p.categorie_id LEFT JOIN variantes v ON v.produit_id=p.id
    LEFT JOIN oeuvres o ON o.id=v.oeuvre_id ORDER BY p.id DESC`);
  const messages = { creation: "Produit créé.", modification: "Produit modifié.", suppression: "Produit supprimé." };

  function formulaire(req, res, { id = null, valeurs = {}, erreurs = [], statut = 200 } = {}) {
    return res.status(statut).render("admin/produit-formulaire", {
      id, valeurs, erreurs, categories: categories.all(), images: imagesDisponibles(),
      oeuvres: db.prepare("SELECT id, titre, statut FROM oeuvres ORDER BY titre COLLATE NOCASE").all(),
      csrf: req.sessionAdmin.csrf
    });
  }
  function introuvable(res) {
    return res.status(404).render("admin/produit-introuvable");
  }
  function valider(body) {
    const valeurs = {};
    for (const champ of ["nom", "description", "prix", "image", "categorie_id"]) {
      valeurs[champ] = typeof body[champ] === "string" ? body[champ].trim() : "";
    }
    valeurs.nom = valeurs.nom.normalize("NFC");
    const erreurs = [];
    if (!valeurs.nom || valeurs.nom.length > 200 || /\p{Cc}/u.test(valeurs.nom)) {
      erreurs.push("Le nom doit contenir entre 1 et 200 caractères, sans caractère de contrôle.");
    }
    if (!valeurs.description || valeurs.description.length > 4000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(valeurs.description)) {
      erreurs.push("La description doit contenir entre 1 et 4 000 caractères.");
    }
    // Conversion décimale exacte : ni notation exponentielle, ni arrondi silencieux.
    const prix = valeurs.prix.replace(",", ".");
    let centimes = null;
    if (/^\d{1,6}(\.\d{1,2})?$/.test(prix)) {
      const [euros, decimales = ""] = prix.split(".");
      centimes = Number(euros) * 100 + Number(decimales.padEnd(2, "0"));
    }
    if (centimes === null) erreurs.push("Le prix doit être compris entre 0 et 999 999,99 €, avec deux décimales au maximum.");
    const categorieId = lireId(valeurs.categorie_id);
    if (!categorieId || !db.prepare("SELECT id FROM categories WHERE id = ?").get(categorieId)) {
      erreurs.push("Choisissez une catégorie existante.");
    }
    if (!imagesDisponibles().includes(valeurs.image)) erreurs.push("Choisissez une image disponible.");
    const art = validerVariante(db, body);
    return { valeurs: { ...valeurs, ...art.valeurs }, erreurs: [...erreurs, ...art.erreurs], centimes, categorieId, variante: art.variante };
  }

  router.get("/", (req, res) => {
    const recherche = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const categorie = typeof req.query.categorie === "string" ? req.query.categorie : "";
    const tris = {
      recent: (a, b) => b.id - a.id,
      nom: (a, b) => a.nom.localeCompare(b.nom, "fr") || a.id - b.id,
      prix_asc: (a, b) => a.prix_centimes - b.prix_centimes || a.id - b.id,
      prix_desc: (a, b) => b.prix_centimes - a.prix_centimes || a.id - b.id
    };
    const tri = typeof req.query.tri === "string" && Object.hasOwn(tris, req.query.tri) ? req.query.tri : "recent";
    const normaliser = texte => texte.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("fr");
    const tous = liste.all();
    const produits = tous.filter(p => (!categorie || String(p.categorie_id) === categorie) &&
      normaliser(`${p.nom} ${p.description}`).includes(normaliser(recherche))).sort(tris[tri]);
    return res.render("admin/produits", {
      produits, total: tous.length, categories: categories.all(), recherche, categorie, tri,
      succes: Object.hasOwn(messages, req.query.succes) ? messages[req.query.succes] : null
    });
  });
  router.get("/nouveau", (req, res) => formulaire(req, res));
  router.post("/", (req, res) => {
    const { valeurs, erreurs, centimes, categorieId, variante } = valider(req.body);
    if (erreurs.length) return formulaire(req, res, { valeurs, erreurs, statut: 400 });
    db.exec("BEGIN IMMEDIATE");
    try {
      const { id } = db.prepare(`UPDATE compteur_produits
        SET dernier_id = max(dernier_id, (SELECT coalesce(max(id), 0) FROM produits)) + 1
        WHERE id = 1 RETURNING dernier_id AS id`).get();
      db.prepare(`INSERT INTO produits (id, nom, description, image, prix_centimes, categorie_id)
        VALUES (?, ?, ?, ?, ?, ?)`).run(id, valeurs.nom, valeurs.description, valeurs.image, centimes, categorieId);
      enregistrerVariante(db, id, variante);
      db.exec("COMMIT");
    } catch (erreur) {
      db.exec("ROLLBACK");
      if (erreur.message.includes("FOREIGN KEY constraint")) {
        return formulaire(req, res, { valeurs, erreurs: ["La catégorie n’existe plus. Choisissez-en une autre."], statut: 409 });
      }
      throw erreur;
    }
    return res.redirect(303, "/admin/produits?succes=creation");
  });
  router.get("/:id/modifier", (req, res) => {
    const id = lireId(req.params.id);
    const produit = id && chercher.get(id);
    if (!produit) return introuvable(res);
    return formulaire(req, res, { id, valeurs: {
      ...produit, prix: (produit.prix_centimes / 100).toFixed(2)
    } });
  });
  router.post("/:id/modifier", (req, res) => {
    const id = lireId(req.params.id);
    if (!id || !chercher.get(id)) return introuvable(res);
    const { valeurs, erreurs, centimes, categorieId, variante } = valider(req.body);
    if (erreurs.length) return formulaire(req, res, { id, valeurs, erreurs, statut: 400 });
    let resultat;
    const lien = db.prepare("SELECT count(*) AS n FROM tirages_editions WHERE produit_id=?").get(id).n;
    const ancienne = chercher.get(id);
    if (lien && (!variante || variante[0] !== ancienne.oeuvre_id || variante[1] !== ancienne.support || variante[2] !== ancienne.largeur_mm || variante[3] !== ancienne.hauteur_mm)) {
      return formulaire(req, res, { id, valeurs, erreurs: ["Ce produit possède des tirages réservés ou vendus. Son œuvre, son support et ses dimensions doivent être conservés."], statut: 409 });
    }
    db.exec("BEGIN IMMEDIATE");
    try {
      resultat = db.prepare(`UPDATE produits SET nom = ?, description = ?, image = ?,
        prix_centimes = ?, categorie_id = ? WHERE id = ?`)
        .run(valeurs.nom, valeurs.description, valeurs.image, centimes, categorieId, id);
      enregistrerVariante(db, id, variante);
      db.exec("COMMIT");
    } catch (erreur) {
      db.exec("ROLLBACK");
      if (erreur.message.includes("FOREIGN KEY constraint")) {
        return formulaire(req, res, { id, valeurs, erreurs: ["La catégorie n’existe plus. Choisissez-en une autre."], statut: 409 });
      }
      throw erreur;
    }
    if (!resultat.changes) return introuvable(res);
    return res.redirect(303, "/admin/produits?succes=modification");
  });
  router.get("/:id/supprimer", (req, res) => {
    const id = lireId(req.params.id);
    const produit = id && chercher.get(id);
    if (!produit) return introuvable(res);
    return res.render("admin/produit-suppression", { produit, csrf: req.sessionAdmin.csrf });
  });
  router.post("/:id/supprimer", (req, res) => {
    const id = lireId(req.params.id);
    if (!id) return introuvable(res);
    if (db.prepare("SELECT count(*) AS n FROM tirages_editions WHERE produit_id=?").get(id).n) {
      return res.status(409).send("Ce produit possède des tirages réservés ou vendus. Marquez-le indisponible plutôt que de le supprimer.");
    }
    const resultat = db.prepare("DELETE FROM produits WHERE id = ?").run(id);
    if (!resultat.changes) return introuvable(res);
    return res.redirect(303, "/admin/produits?succes=suppression");
  });
  return router;
}

module.exports = { routesProduits };
