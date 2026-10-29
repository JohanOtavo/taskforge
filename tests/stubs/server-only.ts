// `server-only` solo existe para que el bundler falle si un modulo de
// servidor se importa desde el cliente. En los tests no hay bundler, asi que
// se sustituye por un modulo vacio.
export {};
