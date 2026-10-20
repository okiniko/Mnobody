const readline = require("node:readline/promises");
const { Writable } = require("node:stream");
const { ouvrirBase } = require("../database");
const { definirAdministrateur } = require("../admin");

async function main() {
  if (!process.stdin.isTTY) throw new Error("Lancez cette commande depuis un terminal interactif.");
  let masquer = false;
  const sortie = new Writable({
    write(chunk, encodage, suite) {
      if (!masquer) process.stdout.write(chunk);
      suite();
    }
  });
  const rl = readline.createInterface({ input: process.stdin, output: sortie, terminal: true });
  let db;
  try {
    const identifiant = (await rl.question("Identifiant administrateur : ")).trim();
    process.stdout.write("Mot de passe (14 caractères minimum, saisie masquée) : ");
    masquer = true;
    const motDePasse = await rl.question("");
    process.stdout.write("\nConfirmez le mot de passe : ");
    const confirmation = await rl.question("");
    masquer = false;
    process.stdout.write("\n");
    if (motDePasse !== confirmation) throw new Error("Les mots de passe ne correspondent pas.");
    db = ouvrirBase();
    await definirAdministrateur(db, identifiant, motDePasse);
    console.log("Compte administrateur enregistré. Les anciennes sessions ont été révoquées.");
  } finally {
    rl.close();
    if (db) db.close();
  }
}
main().catch(erreur => {
  console.error(erreur.message);
  process.exitCode = 1;
});
