const express = require("express");
const { ouvrirBase } = require("./database");
const { installerAdmin } = require("./admin");
const path = require("path");

const app = express();

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));
const db = ouvrirBase();
installerAdmin(app, db);
const champsProduit = `
  SELECT id, nom, description, image, prix_centimes / 100.0 AS prix,
    categorie_id, (SELECT nom FROM categories WHERE categories.id = produits.categorie_id) AS categorie
  FROM produits
`;
const listerProduits = db.prepare(`${champsProduit} ORDER BY id`);
const chercherProduit = db.prepare(`${champsProduit} WHERE id = ?`);

function trouverProduit(parametre) {
  const id = Number(parametre);
  if (!Number.isSafeInteger(id) || id <= 0) return undefined;
  return chercherProduit.get(id);
}

app.get("/api/produits", (req, res) => {
  try {
    return res.json(listerProduits.all());
  } catch (erreur) {
    console.error(erreur);
    return res.status(500).json({
      erreur: "Impossible de charger les produits"
    });
  }
});

app.get("/api/produits/:id", (req, res) => {
  try {
    const produit = trouverProduit(req.params.id);
    if (!produit) {
      return res.status(404).json({ erreur: "Produit introuvable" });
    }
    return res.json(produit);
  } catch (erreur) {
    console.error(erreur);
    return res.status(500).json({
      erreur: "Impossible de charger les produits"
    });
  }
});

app.get("/produit/:id", (req, res) => {
  try {
    const produit = trouverProduit(req.params.id);
    if (!produit) {
      return res.status(404).send("Produit introuvable");
    }
    return res.render("produit", {
      titre: produit.nom,
      produit
    });
  } catch (erreur) {
    console.error(erreur);
    return res.status(500).send("Erreur serveur");
  }
});

app.get("/boutique", (req, res) => {
  res.render("boutique");
});
app.get("/", (req, res) => {
  res.render("index", {
    titre: "Accueil"
  });
});
app.get("/panier", (req, res) => {
  res.render("panier", {
    titre: "Panier"
  });
});
app.listen(process.env.PORT);
