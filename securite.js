function installerSecurite(app) {
  app.disable("x-powered-by");
  // Ne pas approuver un nombre de sauts : les chemins réseau peuvent différer.
  const proxies = (process.env.TRUST_PROXY || "").split(",").map(v => v.trim()).filter(Boolean);
  app.set("trust proxy", proxies.length ? proxies : false);
  app.use((req, res, next) => {
    res.set("X-Content-Type-Options", "nosniff");
    res.set("Referrer-Policy", "same-origin");
    res.set("X-Frame-Options", "DENY");
    // Les styles dynamiques du panier restent autorisés ; aucun script inline.
    res.set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    next();
  });
}
module.exports = { installerSecurite };
