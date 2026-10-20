const express = require("express");
const { ouvrirBase } = require("./database");
const { installerAdmin } = require("./admin");
const path = require("path");

const app = express();
require("./securite").installerSecurite(app);

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));
const db = ouvrirBase();
app.use((req, res, next) => { res.locals.chemin = req.path; next(); });
installerAdmin(app, db);
const { champsProduit, routesGalerie } = require("./galerie");
app.use(routesGalerie(db));
const listerProduits = db.prepare(`${champsProduit} ORDER BY p.id`);
const chercherProduit = db.prepare(`${champsProduit} AND p.id = ?`);

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
  res.redirect(301, "/galerie");
});
app.get("/", (req, res) => {
  res.render("index", {
    titre: "IAMNOBODY — Des regards, des mondes",
    oeuvresAccueil: db.prepare("SELECT id, titre, image FROM oeuvres WHERE statut='publiee' ORDER BY id LIMIT 6").all()
  });
});
app.get("/panier", (req, res) => {
  res.render("panier", {
    titre: "Panier"
  });
});
app.get("/healthz", (req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    db.prepare("SELECT 1").get();
    res.json({ statut: "ok" });
  } catch {
    res.status(503).json({ statut: "indisponible" });
  }
});
app.use((req, res) => res.status(404).send("Page introuvable"));
app.use((erreur, req, res, next) => {
  console.error("Erreur serveur :", erreur);
  if (res.headersSent) return next(erreur);
  res.status(500).send("Erreur serveur");
});
app.listen(process.env.PORT || 3000);
