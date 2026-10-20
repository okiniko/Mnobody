const fs = require('node:fs');
const path = require('node:path');
const destination = path.join(__dirname, '..', 'public', 'vendor', 'three');
fs.mkdirSync(destination, { recursive: true });
const paquet = path.join(__dirname, '..', 'node_modules', 'three');
for (const fichier of ['three.module.js', 'three.core.js']) {
  fs.copyFileSync(path.join(paquet, 'build', fichier), path.join(destination, fichier));
}
fs.copyFileSync(path.join(paquet, 'LICENSE'), path.join(destination, 'LICENSE'));
console.log('Three.js copié pour le musée, sans dépendance CDN.');
