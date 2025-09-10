const { txGuard } = require('../middleware/txGuard');
const { mevGuard } = require('../middleware/mevGuard');

module.exports = (app, env) => {
  require('./dex')(app, env);
  require('./0x')(app, env);
  require('./plugins')(app, env);

  app.use('/api/relay', require('./relay'));
  app.use('/api/apeswap', require('./apeswap'));
  app.use('/api/wallet', require('./wallet'));
  app.use('/api/swap', mevGuard, txGuard, require('./swap'));
  app.use('/api', require('./price.cjs'));
};
