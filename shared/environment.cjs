/** OMF settings take precedence; existing Flecten and Liquid launchers keep working. */
exports.productEnv = function productEnv(suffix, environment = process.env) {
  return environment[`OMF_${suffix}`] ?? environment[`FLECTEN_${suffix}`] ?? environment[`LIQUID_${suffix}`];
};
