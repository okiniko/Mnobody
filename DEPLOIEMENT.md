# Exploitation de Mnobody

## Environnement

Utiliser Node 22.23.3, actuellement disponible dans Plesk et défini dans `.nvmrc`.
`package.json` accepte Node 22 à partir de 22.23.3 ainsi que Node 24 ; les deux
branches sont couvertes par la configuration de tests GitHub. Installer les dépendances
avec `npm ci --omit=dev`. `node_modules` n'est plus versionné. Lancer les vérifications
avec `npm test`, puis l'application avec `npm start` (ou `app.js` dans Passenger).
Le port local par défaut est 3000 ; l'hébergement peut fournir `PORT`.

Configurer les variables dans Plesk/Passenger ou dans l'environnement du processus.
`.env.example` est un aide-mémoire : l'application ne charge pas automatiquement `.env`.
Définir `NODE_ENV=production` et, de préférence, `DATABASE_PATH` vers un chemin absolu
persistant privé, indépendant du dossier de livraison. Sinon la base reste dans
`data/boutique.sqlite`, comme auparavant. Ne jamais remplacer cette base par celle
d'un poste de développement. Garder le répertoire public de l'hébergement sur `public/`,
jamais sur la racine du projet. La base et les sauvegardes ne doivent pas être accessibles
via nginx, Apache ou un alias de fichiers.

## Proxy et HTTPS

Conserver la redirection HTTP vers HTTPS et HSTS dans l'hébergement. L'application
ajoute CSP, nosniff, anti-iframe et Referrer-Policy. Elle supprime son propre en-tête
X-Powered-By ; les en-têtes Passenger/Plesk se règlent dans l'hébergement.

`TRUST_PROXY` est vide par défaut. Le renseigner uniquement après vérification de la
chaîne réseau et de l'écrasement des en-têtes X-Forwarded-* par le proxy d'entrée.
Il accepte une liste d'adresses ou CIDR séparés par des virgules. Ne pas utiliser
`true` ni un nombre de sauts. Par exemple, `127.0.0.1/32,::1/128` n'est pertinent que
si ces adresses sont réellement celles du proxy et si le serveur n'est pas contournable.
Vérifier que deux clients externes produisent des IP distinctes côté Express avant
de considérer la limite par IP comme opérationnelle.
Les cookies admin restent Secure, y compris en développement : tester la connexion
avec HTTPS local ou un environnement de préproduction HTTPS.

## Sauvegarde avant livraison

Depuis le projet et avec le même DATABASE_PATH que l'application :

```sh
npm run db:backup -- /chemin/prive/sauvegardes/avant-livraison.sqlite
```

La source doit exister. La commande crée un instantané cohérent, contrôle son intégrité,
refuse d'écraser un fichier et crée la copie avec des permissions 0600. Le répertoire
des sauvegardes doit rester privé, hors du dossier servi et hors du dossier de livraison.
Prévoir une sauvegarde quotidienne, une copie hors du serveur et une rétention adaptée
avec les outils de l'hébergeur. Aucune tâche planifiée n'est installée par ce changement.

## Livraison

1. Sauvegarder la base et relever le commit actuellement déployé.
2. Préparer le nouveau code sans écraser `data/`, les sauvegardes ou les images ajoutées
   directement sur le serveur. Installer ses dépendances avec la version Node retenue.
3. Vérifier `npm test` sur une copie isolée. Arrêter l'application pour la bascule.
4. Exécuter `npm run db:migrate` avec le DATABASE_PATH de production, puis redémarrer
   via Plesk/Passenger. Les migrations s'appliquent aussi automatiquement à l'ouverture
   de la base ; leur exécution est transactionnelle et enregistrée dans `migrations`.
5. Vérifier `/healthz` (HTTP 200 et statut ok), l'accueil, le catalogue, une fiche,
   le panier et la connexion admin en HTTPS. Comparer le nombre de produits avant/après.

Les trois premières migrations adoptent les tables existantes sans réimporter le JSON,
sans changer les identifiants ni supprimer les comptes, produits ou sessions.
Ne jamais automatiser `scripts/importer-produits.js` au démarrage ou au déploiement.
Une migration déjà publiée ne doit plus être éditée : ajouter un fichier numéroté.

## Restauration et retour arrière

Tester régulièrement vers un nouveau fichier :

```sh
npm run db:restore -- /chemin/prive/sauvegardes/avant-livraison.sqlite /chemin/prive/test-restauration.sqlite
```

La restauration vérifie l'intégrité et refuse toute destination existante. Vérifier le
catalogue et la connexion dans un environnement isolé utilisant cette copie. Une copie
contient aussi les sessions : révoquer celles-ci avant une remise en production après
incident. Conserver un historique des sauvegardes et des essais de restauration.

Pour revenir en arrière : arrêter l'application, conserver une sauvegarde de l'état
courant, restaurer la sauvegarde choisie vers un nouveau fichier, pointer DATABASE_PATH
vers ce fichier et remettre le code correspondant avant de redémarrer. Une restauration
ancienne perd les modifications intervenues depuis sa création : les examiner avant la
bascule. Ne pas copier un fichier SQLite par-dessus une base ouverte ni oublier ses
fichiers WAL/SHM. Les migrations refusent une base portant des migrations inconnues du
code exécuté. Ce garde-fou n'existe pas dans les anciennes versions du site.

## Hébergement mnobody.fr vérifié le 20 octobre 2026

Le processus Passenger utilise `/opt/plesk/node/22/bin/node` (22.23.3). Le terminal
SSH non interactif ne l'ajoute pas au PATH. Pour les commandes de maintenance :

```sh
export PATH="/opt/plesk/node/22/bin:$PATH"
```

Le projet se trouve dans `/var/www/vhosts/mnobody.fr/httpdocs/mnobody`.
Les sauvegardes et la préparation sont placées sous
`/var/www/vhosts/mnobody.fr/mnobody-maintenance/`, hors de `httpdocs`, avec un
répertoire privé. La configuration effective du proxy reste à confirmer avant
d'activer TRUST_PROXY ; ne pas la déduire de la seule présence de nginx.
