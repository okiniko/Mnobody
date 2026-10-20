CREATE TABLE IF NOT EXISTS administrateur (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      identifiant TEXT NOT NULL,
      sel TEXT NOT NULL,
      mot_de_passe TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions_admin (
      jeton TEXT PRIMARY KEY,
      csrf TEXT NOT NULL,
      connectee INTEGER NOT NULL DEFAULT 0,
      expiration INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tentatives_admin (
      cle TEXT PRIMARY KEY,
      nombre INTEGER NOT NULL,
      expiration INTEGER NOT NULL
    );
