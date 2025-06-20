module.exports = (path, options) => {
  // Jest resolver to handle .js imports for .ts files
  return options.defaultResolver(path, {
    ...options,
    packageFilter: pkg => {
      if (pkg.type === 'module') {
        return pkg;
      }
      return {
        ...pkg,
        main: pkg.module || pkg.main,
      };
    },
  });
};