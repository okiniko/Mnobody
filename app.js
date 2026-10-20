const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

const cheminProduits = path.join(__dirname, "produits.json");

app.get("/api/produits", (req, res) => {
  fs.readFile(cheminProduits, "utf8", (erreur, data) => {

    if (erreur) {
      console.error(erreur);

      return res.status(500).json({
        erreur: "Impossible de charger les produits"
      });
    }

    const produits = JSON.parse(data);

    res.json(produits);
  });
});
app.get("/api/produits/:id", (req, res) => {
  fs.readFile(cheminProduits, "utf8", (erreur, data) => {

    if (erreur) {
      return res.status(500).json({
        erreur: "Impossible de charger les produits"
      });
    }

    const produits = JSON.parse(data);

    const id = Number(req.params.id);

    const produit = produits.find(produit => produit.id === id);

    if (!produit) {
      return res.status(404).json({
        erreur: "Produit introuvable"
      });
    }

    res.json(produit);
  });
});
app.get("/produit/:id", (req, res) => {
  fs.readFile(cheminProduits, "utf8", (erreur, data) => {
    if (erreur) {
      return res.status(500).send("Erreur serveur");
    }

    const produits = JSON.parse(data);
    const id = Number(req.params.id);

    const produit = produits.find(p => p.id === id);

    if (!produit) {
      return res.status(404).send("Produit introuvable");
    }

    res.render("produit", {
      titre: produit.nom,
      produit
    });
  });
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