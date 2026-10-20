CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY,
      nom TEXT NOT NULL UNIQUE CHECK (length(trim(nom)) > 0)
    );
    CREATE TABLE IF NOT EXISTS produits (
      id INTEGER PRIMARY KEY,
      nom TEXT NOT NULL CHECK (length(trim(nom)) > 0),
      description TEXT NOT NULL,
      image TEXT NOT NULL,
      prix_centimes INTEGER NOT NULL
        CHECK (typeof(prix_centimes) = 'integer' AND prix_centimes >= 0),
      categorie_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT
    );
    CREATE INDEX IF NOT EXISTS produits_categorie ON produits(categorie_id);
