import _ from 'lodash';
export function convertToType<Type>(
  source: Record<string, unknown>,
  dest: Record<string, unknown>,
  mapping?: Record<string, string>,
  appendMappingToSource = false
): Type {
  let fields = _.mapValues(dest, (val, key) => {
    return key;
  });
  if (appendMappingToSource) {
    fields = _.merge(fields, mapping);
  } else {
    // make the mapping optional
    fields = _.isUndefined(mapping) ? fields : mapping;
  }
  // force to enumerable string keyed only, transforming at the root level
  _.forOwn(fields, (destKey, srcKey) => {
    _.set(dest, destKey, source[srcKey]);
  });
  return dest as Type;
}
