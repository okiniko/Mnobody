const { sauvegarder } = require("./sauvegarder");
// Restauration vers un nouveau fichier uniquement, jamais sur une base en service.
if (require.main === module) {
  try {
    if (!process.argv[2] || !process.argv[3]) throw new Error("Usage : npm run db:restore -- sauvegarde.sqlite nouvelle-base.sqlite");
    console.log("Copie restaurée et vérifiée :", sauvegarder(process.argv[2], process.argv[3]));
  } catch (erreur) { console.error(erreur.message); process.exitCode = 1; }
}
