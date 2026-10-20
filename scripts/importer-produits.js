const fs = require("node:fs");
const path = require("node:path");
const { ouvrirBase } = require("../database");

const familles = [
  ["Sweat zippé", "Sweats zippés"],
  ["T-shirt", "T-shirts"],
  ["Sweat", "Sweats"],
  ["Hoodie", "Hoodies"],
  ["Poster", "Posters"],
  ["Mug", "Mugs"],
  ["Totebag", "Totebags"],
  ["Casquette", "Casquettes"],
  ["Sticker", "Stickers"],
  ["Print", "Prints"],
  ["Badge", "Badges"],
  ["Tapis de souris", "Tapis de souris"]
];

function importerProduits(db, produits) {
  if (!Array.isArray(produits)) throw new Error("Le catalogue doit être un tableau");
  const categorie = db.prepare("INSERT INTO categories (nom) VALUES (?) ON CONFLICT(nom) DO NOTHING");
  const trouverCategorie = db.prepare("SELECT id FROM categories WHERE nom = ?");
  const inserer = db.prepare(`
    INSERT INTO produits (id, nom, description, image, prix_centimes, categorie_id)
    VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING
  `);
  const ids = new Set();
  let ajoutes = 0;
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const produit of produits) {
      if (!produit || !Number.isSafeInteger(produit.id) || produit.id <= 0 ||
          ids.has(produit.id) || typeof produit.nom !== "string" || !produit.nom.trim() ||
          typeof produit.description !== "string" || typeof produit.image !== "string" ||
          !produit.image.trim() || !Number.isFinite(produit.prix) || produit.prix < 0 ||
          !Number.isSafeInteger(Math.round(produit.prix * 100))) {
        throw new Error("Produit invalide ou identifiant dupliqué dans le catalogue");
      }
      ids.add(produit.id);
      const famille = familles.find(([prefixe]) => produit.nom.startsWith(prefixe + " "));
      if (!famille) throw new Error(`Catégorie inconnue : ${produit.nom}`);
      categorie.run(famille[1]);
      const { id } = trouverCategorie.get(famille[1]);
      ajoutes += Number(inserer.run(produit.id, produit.nom, produit.description,
        produit.image, Math.round(produit.prix * 100), id).changes);
    }
    db.exec("COMMIT");
    return ajoutes;
  } catch (erreur) {
    db.exec("ROLLBACK");
    throw erreur;
  }
}

if (require.main === module) {
  const produits = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "produits.json"), "utf8"));
  const db = ouvrirBase();
  try {
    console.log(`${importerProduits(db, produits)} produit(s) ajouté(s).`);
    console.log(db.prepare("SELECT count(*) AS produits FROM produits").get());
    console.log(db.prepare("SELECT count(*) AS categories FROM categories").get());
  } finally {
    db.close();
  }
}

module.exports = { importerProduits };
