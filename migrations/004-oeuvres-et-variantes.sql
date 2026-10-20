CREATE TABLE oeuvres (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  titre TEXT NOT NULL CHECK (length(trim(titre)) BETWEEN 1 AND 200),
  description TEXT NOT NULL CHECK (length(trim(description)) BETWEEN 1 AND 8000),
  image TEXT NOT NULL,
  serie TEXT NOT NULL DEFAULT '',
  annee INTEGER CHECK (annee BETWEEN 1 AND 9999),
  edition TEXT NOT NULL DEFAULT 'ouverte' CHECK (edition IN ('ouverte', 'limitee')),
  tirage INTEGER CHECK (tirage > 0),
  statut TEXT NOT NULL DEFAULT 'brouillon' CHECK (statut IN ('brouillon', 'publiee', 'archivee')),
  CHECK ((edition = 'ouverte' AND tirage IS NULL) OR (edition = 'limitee' AND tirage IS NOT NULL))
);
CREATE TABLE oeuvre_images (
  oeuvre_id INTEGER NOT NULL REFERENCES oeuvres(id) ON DELETE CASCADE,
  image TEXT NOT NULL,
  ordre INTEGER NOT NULL CHECK (ordre >= 0),
  PRIMARY KEY (oeuvre_id, ordre),
  UNIQUE (oeuvre_id, image)
);
-- Un produit conserve son identifiant et son prix ; il devient une variante en étant rattaché.
CREATE TABLE variantes (
  produit_id INTEGER PRIMARY KEY REFERENCES produits(id) ON DELETE CASCADE,
  oeuvre_id INTEGER NOT NULL REFERENCES oeuvres(id) ON DELETE RESTRICT,
  support TEXT NOT NULL CHECK (support IN ('dibond', 'textile')),
  largeur_mm INTEGER,
  hauteur_mm INTEGER,
  finition TEXT NOT NULL DEFAULT '',
  taille TEXT NOT NULL DEFAULT '',
  couleur TEXT NOT NULL DEFAULT '',
  disponible INTEGER NOT NULL DEFAULT 1 CHECK (disponible IN (0, 1)),
  fournisseur TEXT NOT NULL DEFAULT '' CHECK (fournisseur IN ('', 'pixartprinting', 'spreadconnect')),
  reference_fournisseur TEXT NOT NULL DEFAULT '',
  CHECK (
    (support = 'dibond' AND largeur_mm BETWEEN 1 AND 10000 AND hauteur_mm BETWEEN 1 AND 10000
      AND largeur_mm IS NOT NULL AND hauteur_mm IS NOT NULL AND taille = '' AND couleur = '')
    OR (support = 'textile' AND largeur_mm IS NULL AND hauteur_mm IS NULL AND length(trim(taille)) > 0)
  )
);
CREATE INDEX variantes_oeuvre ON variantes(oeuvre_id);
