CREATE TABLE IF NOT EXISTS compteur_produits (
    id INTEGER PRIMARY KEY CHECK (id = 1), dernier_id INTEGER NOT NULL
  );
  INSERT INTO compteur_produits SELECT 1, coalesce(max(id), 0) FROM produits WHERE true
  ON CONFLICT(id) DO UPDATE SET dernier_id = max(dernier_id, excluded.dernier_id);
