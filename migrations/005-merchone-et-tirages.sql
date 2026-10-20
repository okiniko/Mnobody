-- Étendre les fournisseurs sans modifier les produits ou leurs prix.
CREATE TABLE variantes_merchone (
  produit_id INTEGER PRIMARY KEY REFERENCES produits(id) ON DELETE CASCADE,
  oeuvre_id INTEGER NOT NULL REFERENCES oeuvres(id) ON DELETE RESTRICT,
  support TEXT NOT NULL CHECK (support IN ('dibond', 'textile')),
  largeur_mm INTEGER,
  hauteur_mm INTEGER,
  finition TEXT NOT NULL DEFAULT '',
  taille TEXT NOT NULL DEFAULT '',
  couleur TEXT NOT NULL DEFAULT '',
  disponible INTEGER NOT NULL DEFAULT 1 CHECK (disponible IN (0, 1)),
  fournisseur TEXT NOT NULL DEFAULT '' CHECK (fournisseur IN ('', 'merchone', 'pixartprinting', 'spreadconnect')),
  reference_fournisseur TEXT NOT NULL DEFAULT '',
  CHECK (
    (support = 'dibond' AND largeur_mm BETWEEN 1 AND 10000 AND hauteur_mm BETWEEN 1 AND 10000
      AND largeur_mm IS NOT NULL AND hauteur_mm IS NOT NULL AND taille = '' AND couleur = '')
    OR (support = 'textile' AND largeur_mm IS NULL AND hauteur_mm IS NULL AND length(trim(taille)) > 0)
  )
);
INSERT INTO variantes_merchone SELECT * FROM variantes;
DROP TABLE variantes;
ALTER TABLE variantes_merchone RENAME TO variantes;
CREATE INDEX variantes_oeuvre ON variantes(oeuvre_id);

-- Ces clients devront provenir de l'authentification vérifiée du futur parcours de commande.
CREATE TABLE clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (length(trim(email)) > 0),
  email_verifie INTEGER NOT NULL DEFAULT 0 CHECK (email_verifie IN (0, 1))
);
CREATE TABLE commandes_editions (
  cle TEXT PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  etat TEXT NOT NULL CHECK (etat IN ('reservee', 'vendue', 'expiree', 'annulee')),
  expiration INTEGER NOT NULL
);
CREATE INDEX commandes_editions_client ON commandes_editions(client_id);
CREATE TABLE tirages_editions (
  oeuvre_id INTEGER NOT NULL REFERENCES oeuvres(id) ON DELETE RESTRICT,
  numero INTEGER NOT NULL CHECK (numero BETWEEN 1 AND 49),
  produit_id INTEGER NOT NULL REFERENCES produits(id) ON DELETE RESTRICT,
  commande_cle TEXT NOT NULL REFERENCES commandes_editions(cle) ON DELETE RESTRICT,
  prix_centimes INTEGER NOT NULL CHECK (prix_centimes >= 0),
  PRIMARY KEY (oeuvre_id, numero)
);
CREATE INDEX tirages_editions_commande ON tirages_editions(commande_cle);
-- L'identité du tirage et son rattachement ne changent plus après réservation.
CREATE TRIGGER variante_avec_tirages_modification BEFORE UPDATE ON variantes
WHEN EXISTS (SELECT 1 FROM tirages_editions WHERE produit_id=OLD.produit_id)
  AND (NEW.oeuvre_id != OLD.oeuvre_id OR NEW.support != OLD.support
    OR NEW.largeur_mm IS NOT OLD.largeur_mm OR NEW.hauteur_mm IS NOT OLD.hauteur_mm)
BEGIN SELECT RAISE(ABORT, 'Cette déclinaison possède déjà des tirages réservés ou vendus.'); END;
CREATE TRIGGER variante_avec_tirages_suppression BEFORE DELETE ON variantes
WHEN EXISTS (SELECT 1 FROM tirages_editions WHERE produit_id=OLD.produit_id)
BEGIN SELECT RAISE(ABORT, 'Cette déclinaison possède déjà des tirages réservés ou vendus.'); END;
CREATE TRIGGER edition_avec_tirages BEFORE UPDATE OF edition, tirage ON oeuvres
WHEN EXISTS (SELECT 1 FROM tirages_editions WHERE oeuvre_id=OLD.id)
  AND (NEW.edition != 'limitee' OR NEW.tirage IS NOT 49)
BEGIN SELECT RAISE(ABORT, 'L’édition de 49 exemplaires possède déjà des tirages.'); END;
