const express = require("express");
const fs = require("node:fs");
const path = require("node:path");

function routesProduits(db) {
  const router = express.Router();
  // Ne jamais réattribuer l’identifiant d’un produit supprimé, notamment à cause des paniers sauvegardés.
  db.exec(`CREATE TABLE IF NOT EXISTS compteur_produits (
    id INTEGER PRIMARY KEY CHECK (id = 1), dernier_id INTEGER NOT NULL
  );
  INSERT INTO compteur_produits SELECT 1, coalesce(max(id), 0) FROM produits WHERE true
  ON CONFLICT(id) DO UPDATE SET dernier_id = max(dernier_id, excluded.dernier_id);`);
  const categories = db.prepare("SELECT id, nom FROM categories ORDER BY nom COLLATE NOCASE");
  const chercher = db.prepare("SELECT * FROM produits WHERE id = ?");
  const liste = db.prepare(`SELECT p.*, c.nom AS categorie FROM produits p
    JOIN categories c ON c.id = p.categorie_id ORDER BY p.id DESC`);
  const messages = { creation: "Produit créé.", modification: "Produit modifié.", suppression: "Produit supprimé." };

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
  function formulaire(req, res, { id = null, valeurs = {}, erreurs = [], statut = 200 } = {}) {
    return res.status(statut).render("admin/produit-formulaire", {
      id, valeurs, erreurs, categories: categories.all(), images: imagesDisponibles(),
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
    return { valeurs, erreurs, centimes, categorieId };
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
    const { valeurs, erreurs, centimes, categorieId } = valider(req.body);
    if (erreurs.length) return formulaire(req, res, { valeurs, erreurs, statut: 400 });
    db.exec("BEGIN IMMEDIATE");
    try {
      const { id } = db.prepare(`UPDATE compteur_produits
        SET dernier_id = max(dernier_id, (SELECT coalesce(max(id), 0) FROM produits)) + 1
        WHERE id = 1 RETURNING dernier_id AS id`).get();
      db.prepare(`INSERT INTO produits (id, nom, description, image, prix_centimes, categorie_id)
        VALUES (?, ?, ?, ?, ?, ?)`).run(id, valeurs.nom, valeurs.description, valeurs.image, centimes, categorieId);
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
    const { valeurs, erreurs, centimes, categorieId } = valider(req.body);
    if (erreurs.length) return formulaire(req, res, { id, valeurs, erreurs, statut: 400 });
    let resultat;
    try {
      resultat = db.prepare(`UPDATE produits SET nom = ?, description = ?, image = ?,
        prix_centimes = ?, categorie_id = ? WHERE id = ?`)
        .run(valeurs.nom, valeurs.description, valeurs.image, centimes, categorieId, id);
    } catch (erreur) {
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
    const resultat = db.prepare("DELETE FROM produits WHERE id = ?").run(id);
    if (!resultat.changes) return introuvable(res);
    return res.redirect(303, "/admin/produits?succes=suppression");
  });
  return router;
}

module.exports = { routesProduits };
