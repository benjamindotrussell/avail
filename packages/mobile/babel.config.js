module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module-resolver',
        {
          alias: {
            '@avail/shared': '../../shared/src/index.ts',
          },
        },
      ],
    ],
  };
};
